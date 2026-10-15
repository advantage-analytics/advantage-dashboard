/**
 * `POST /api/mcp` — the Ask MCP server over the Streamable HTTP transport,
 * stateless: one `McpServer` and one transport per request, no session id,
 * the reply as JSON (docs/ask-mcp-connector.md).
 *
 * The HTTP shell around `src/lib/services/mcp/server.ts`. The ladder, in
 * order, each rung answering before the next reads anything:
 *
 *   401 unauthenticated    no `Authorization: Bearer` token, or one Supabase
 *                          Auth does not recognise as a live user token. The
 *                          `WWW-Authenticate` header names this host's
 *                          protected-resource metadata, which is how an MCP
 *                          client finds the authorization server
 *                          (`/.well-known/oauth-protected-resource`).
 *   500 internal_error     the service key is not configured
 *   JSON-RPC               everything after: the SDK parses the body, lists
 *                          the tools and runs them; a tool's refusal is an
 *                          `isError` result the SDK shapes from the
 *                          `McpError` the tool threw (`server.ts`).
 *
 * No same-origin check, on purpose: this is not a browser mutation but an
 * API for a non-browser client, and the bearer token is the credential. A
 * cookie is never read here, so a cross-site page cannot ride a session.
 *
 * The token is verified with Supabase Auth on every request
 * (`verifyBearerUser`): the user it names is the viewer `createAskDatabase()`
 * pins, the one the service-role query functions run for, and the one every
 * user-side call runs as on the bearer client. Nothing in the JSON-RPC body
 * can name another. The service-role client is built for `.rpc()` and
 * nothing else, exactly as `POST /api/ask` builds it.
 *
 * GET and DELETE are 405: with no session there is no stream to resume and
 * nothing to end.
 */

import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";

import {
  flushPostHogAfterResponse,
  getPostHogServerClient,
} from "@/lib/llm/adapter";
import {
  createAskDatabase,
  type AskRpcClient,
} from "@/lib/services/ask/database";
import { askAdapterModel, askStageModels } from "@/lib/services/ask/model";
import {
  MCP_SCOPES,
  readBearerToken,
  wwwAuthenticate,
} from "@/lib/services/mcp/auth";
import { sharedRateLimiter } from "@/lib/services/mcp/rate-limit";
import {
  createAskMcpServer,
  type AskMcpContext,
} from "@/lib/services/mcp/server";
import { createMcpUserReads } from "@/lib/services/mcp/user-reads";
import { countMcpCall } from "@/lib/services/mcp/usage";
import {
  errorResponse,
  jsonResponse,
  transportError,
  type MatchVideoHttpError,
} from "@/lib/services/match-video/http";
import { originFromHeaders } from "@/lib/site-url";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyBearerUser } from "@/lib/supabase/bearer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** The `ask` tool is a whole question: `POST /api/ask`'s budget, for the same reason. */
export const maxDuration = 60;

/** A JSON-RPC request with a question and a query in it is a few KiB; the transport's 4 MiB default is for file-shaped tools. */
const MAX_BODY_BYTES = 64 * 1024;

const NO_STORE = "private, no-store";

/**
 * The 401. `errorResponse()`'s body shape, so the sentence is where every
 * client of this app's routes looks, plus the header the MCP spec wants.
 * `detail` tells a log a missing token from a refused one; the header's
 * `error` is set only for the second, so a client with no token yet is not
 * told its (absent) token is invalid.
 */
function unauthorized(origin: string, refused: boolean): Response {
  const error = {
    code: "unauthenticated",
    status: 401,
    message: "Sign in to use the Advantage connector.",
    detail: refused ? "invalid_token" : "no_token",
  } as unknown as MatchVideoHttpError;
  const response = errorResponse(error);
  response.headers.set(
    "WWW-Authenticate",
    wwwAuthenticate({ origin, error: refused ? "invalid_token" : undefined }),
  );
  return response;
}

function methodNotAllowed(): Response {
  const response = jsonResponse(
    {
      error: "This connector answers POST only.",
      code: "method_not_allowed",
    },
    405,
  );
  response.headers.set("Allow", "POST");
  return response;
}

export async function POST(request: Request): Promise<Response> {
  const origin = originFromHeaders(request.headers);

  const token = readBearerToken(request.headers.get("authorization"));
  if (!token) return unauthorized(origin, false);
  const verified = await verifyBearerUser(token);
  if (!verified) return unauthorized(origin, true);
  const { client, user } = verified;

  // The three server-only functions need the service role (`database.ts`).
  // `createAdminClient()` throws when the key is unset: this deployment's
  // fault, answered as a 500 before any tool runs.
  let service: AskRpcClient;
  try {
    const admin = createAdminClient();
    service = { rpc: (fn, args) => admin.rpc(fn, args) };
  } catch (error) {
    console.error("[mcp] the service-role client could not be built", {
      error: error instanceof Error ? error.message : String(error),
    });
    return errorResponse(
      transportError("internal_error", "service_role_unavailable"),
    );
  }

  // The viewer is `user.id` from this request's own token verification.
  const userRpc: AskRpcClient = { rpc: (fn, args) => client.rpc(fn, args) };
  const db = createAskDatabase({ user: userRpc, service, viewerId: user.id });

  const posthog = getPostHogServerClient();
  const context: AskMcpContext = {
    caller: { kind: "session", userId: user.id },
    db,
    reads: createMcpUserReads(client, user.id),
    // One trace per request, a model per stage, and the client going away
    // aborting the provider request too (`model.ts`).
    model: askAdapterModel({ userId: user.id, signal: request.signal }),
    stageModels: askStageModels(),
    limiter: sharedRateLimiter(),
    countCall: () => countMcpCall(userRpc),
    capture: posthog
      ? (event, properties) => {
          posthog.capture({ distinctId: user.id, event, properties });
          flushPostHogAfterResponse(posthog);
        }
      : undefined,
  };

  const server = createAskMcpServer(context);
  const transport = new WebStandardStreamableHTTPServerTransport({
    // Stateless: no session id, so every request stands alone and any
    // instance can answer it.
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
    maxRequestBodySize: MAX_BODY_BYTES,
  });
  await server.connect(transport);
  try {
    const answered = await transport.handleRequest(request, {
      authInfo: {
        token,
        clientId: "supabase-oauth",
        scopes: [...MCP_SCOPES],
        extra: { userId: user.id },
      },
    });
    // Per-caller, like every refusal above. The transport's response is
    // rebuilt rather than mutated: its headers may be read-only.
    const headers = new Headers(answered.headers);
    headers.set("Cache-Control", NO_STORE);
    return new Response(answered.body, {
      status: answered.status,
      statusText: answered.statusText,
      headers,
    });
  } finally {
    await transport.close().catch(() => undefined);
  }
}

export async function GET(): Promise<Response> {
  return methodNotAllowed();
}

export async function DELETE(): Promise<Response> {
  return methodNotAllowed();
}
