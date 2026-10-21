import { expect, test } from "@playwright/test";
import { readdirSync, readFileSync } from "node:fs";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  consentPath,
  EXPIRED_AUTHORIZATION_ERROR,
  getOAuthAuthorizationDetails,
  goesToConnector,
  isConnectorRedirectUri,
  OAUTH_UNAVAILABLE_ERROR,
  parseAuthorizationDetails,
  readAuthorizationId,
} from "@/lib/auth/oauth-consent";
import {
  ASK_SIDE_REQUIRED_REASON,
  ASK_VIEWS,
} from "@/lib/services/ask/sql-guard";
import {
  ASK_NEEDS_SESSION_MESSAGE,
  assertAskAllowed,
  authorizationServerMetadataUrl,
  isJwtShaped,
  MAX_BEARER_TOKEN_LENGTH,
  mcpResourceUrl,
  protectedResourceMetadata,
  readBearerToken,
  resourceMetadataUrl,
  supabaseAuthIssuer,
  wwwAuthenticate,
} from "@/lib/services/mcp/auth";
import {
  describeAskViews,
  MCP_QUERY_ROW_CAP,
} from "@/lib/services/mcp/describe";
import { ASK_SERVICE_ROLE_CALLS } from "@/lib/services/ask/database";
import { createRateLimiter } from "@/lib/services/mcp/rate-limit";
import { createMcpUserReads } from "@/lib/services/mcp/user-reads";
import { jwtClientId } from "@/lib/supabase/bearer";

/**
 * The pure pieces of the Ask MCP connector (docs/ask-mcp-connector.md): the
 * bearer header, the two OAuth discovery documents, the rate limiter, the
 * `describe_views` text, the consent page's parsing and the two user-side
 * reads over a faked PostgREST chain. No network, no Next.js.
 */

const SUPABASE_URL = "https://proj.supabase.co";
const ORIGIN = "https://app.example.com";
const USER_ID = "11111111-0000-4000-8000-000000000001";
const PROGRAM_ID = "eeeeeeee-0000-4000-8000-000000000005";
const CONVERSATION_ID = "bbbbbbbb-0000-4000-8000-000000000002";

// ── The bearer header ───────────────────────────────────────────────────────

test.describe("readBearerToken", () => {
  test("reads a bearer token, case-insensitively, trimmed", () => {
    expect(readBearerToken("Bearer abc.def-ghi_jkl")).toBe("abc.def-ghi_jkl");
    expect(readBearerToken("bearer  abc ")).toBe("abc");
    expect(readBearerToken("BEARER a=")).toBe("a=");
  });

  test("answers null for no header, another scheme, an empty or doubled token, or stray characters", () => {
    expect(readBearerToken(null)).toBeNull();
    expect(readBearerToken("")).toBeNull();
    expect(readBearerToken("Basic abc")).toBeNull();
    expect(readBearerToken("Bearer")).toBeNull();
    expect(readBearerToken("Bearer ")).toBeNull();
    expect(readBearerToken("Bearer one two")).toBeNull();
    expect(readBearerToken('Bearer a"b')).toBeNull();
  });
});

// ── The discovery documents ────────────────────────────────────────────────

test.describe("isJwtShaped", () => {
  test("three non-empty base64url segments, within the length cap", () => {
    expect(isJwtShaped("eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ4In0.c2ln-_")).toBe(
      true,
    );
    for (const token of [
      "",
      "junk",
      "a.b",
      "a.b.c.d",
      "a..c",
      "a.b.",
      "a+b.c.d",
      "a/b.c.d",
      "a.b.c=",
    ]) {
      expect(isJwtShaped(token)).toBe(false);
    }
    const third = MAX_BEARER_TOKEN_LENGTH - 4;
    expect(isJwtShaped(`a.b.${"c".repeat(third)}`)).toBe(true);
    expect(isJwtShaped(`a.b.${"c".repeat(third + 1)}`)).toBe(false);
  });
});

function jwt(payload: unknown): string {
  const part = (value: unknown) =>
    Buffer.from(
      typeof value === "string" ? value : JSON.stringify(value),
    ).toString("base64url");
  return `${part({ alg: "HS256" })}.${part(payload)}.sig`;
}

test.describe("jwtClientId", () => {
  test("reads a non-empty client_id claim from an OAuth-issued token", () => {
    expect(jwtClientId(jwt({ sub: USER_ID, client_id: "claude-ai" }))).toBe(
      "claude-ai",
    );
  });

  test("answers null for a session token, a blank or non-string claim, or an undecodable payload", () => {
    expect(jwtClientId(jwt({ sub: USER_ID, aud: "authenticated" }))).toBeNull();
    expect(jwtClientId(jwt({ client_id: "" }))).toBeNull();
    expect(jwtClientId(jwt({ client_id: "  " }))).toBeNull();
    expect(jwtClientId(jwt({ client_id: 42 }))).toBeNull();
    expect(jwtClientId(jwt(null))).toBeNull();
    expect(jwtClientId(jwt("not json"))).toBeNull();
    expect(jwtClientId("junk")).toBeNull();
    expect(jwtClientId("")).toBeNull();
  });
});

test.describe("the OAuth discovery documents", () => {
  test("the issuer and its metadata URL follow Supabase's layout", () => {
    expect(supabaseAuthIssuer(SUPABASE_URL)).toBe(`${SUPABASE_URL}/auth/v1`);
    expect(supabaseAuthIssuer(`${SUPABASE_URL}/`)).toBe(
      `${SUPABASE_URL}/auth/v1`,
    );
    expect(authorizationServerMetadataUrl(SUPABASE_URL)).toBe(
      `${SUPABASE_URL}/.well-known/oauth-authorization-server/auth/v1`,
    );
  });

  test("the protected-resource document names this server and Supabase Auth", () => {
    const document = protectedResourceMetadata({
      origin: `${ORIGIN}/`,
      supabaseUrl: SUPABASE_URL,
    });
    expect(document).toEqual({
      resource: `${ORIGIN}/api/mcp`,
      authorization_servers: [`${SUPABASE_URL}/auth/v1`],
      bearer_methods_supported: ["header"],
      scopes_supported: ["email"],
      resource_name: "Advantage Ask",
      resource_documentation: `${ORIGIN}/dashboard/help`,
    });
    expect(mcpResourceUrl(ORIGIN)).toBe(`${ORIGIN}/api/mcp`);
    expect(resourceMetadataUrl(ORIGIN)).toBe(
      `${ORIGIN}/.well-known/oauth-protected-resource/api/mcp`,
    );
  });

  test("WWW-Authenticate always points at the resource metadata, and names invalid_token only for a refused token", () => {
    const missing = wwwAuthenticate({ origin: ORIGIN });
    expect(missing).toBe(
      `Bearer realm="Advantage Ask", resource_metadata="${ORIGIN}/.well-known/oauth-protected-resource/api/mcp"`,
    );
    const refused = wwwAuthenticate({ origin: ORIGIN, error: "invalid_token" });
    expect(
      refused.startsWith(
        `Bearer realm="Advantage Ask", error="invalid_token", error_description="`,
      ),
    ).toBe(true);
    expect(refused).toContain(
      `resource_metadata="${ORIGIN}/.well-known/oauth-protected-resource/api/mcp"`,
    );
  });

  test("ask is allowed to a session caller and refused to a personal-access-token caller", () => {
    expect(assertAskAllowed({ kind: "session", userId: USER_ID })).toEqual({
      ok: true,
    });
    expect(assertAskAllowed({ kind: "token", userId: USER_ID })).toEqual({
      ok: false,
      reason: ASK_NEEDS_SESSION_MESSAGE,
    });
  });
});

// ── The rate limiter ───────────────────────────────────────────────────────

test.describe("createRateLimiter", () => {
  test("allows `limit` calls in a window, refuses the next with a retry time, and forgets after the window", () => {
    let at = 1_000_000;
    const limiter = createRateLimiter({
      limit: 2,
      windowMs: 10_000,
      now: () => at,
    });
    expect(limiter.check("u1")).toEqual({ ok: true, remaining: 1 });
    at += 1_000;
    expect(limiter.check("u1")).toEqual({ ok: true, remaining: 0 });
    at += 1_000;
    expect(limiter.check("u1")).toEqual({ ok: false, retryAfterSeconds: 8 });
    // Another key has its own window.
    expect(limiter.check("u2")).toEqual({ ok: true, remaining: 1 });
    // The first call falls out of the window; one slot opens.
    at += 8_000;
    expect(limiter.check("u1")).toEqual({ ok: true, remaining: 0 });
    expect(limiter.check("u1").ok).toBe(false);
  });

  test("a refused call does not count against the window", () => {
    let at = 0;
    const limiter = createRateLimiter({
      limit: 1,
      windowMs: 1_000,
      now: () => at,
    });
    expect(limiter.check("u").ok).toBe(true);
    expect(limiter.check("u").ok).toBe(false);
    expect(limiter.check("u").ok).toBe(false);
    at = 1_001;
    expect(limiter.check("u").ok).toBe(true);
  });
});

// ── describe_views ─────────────────────────────────────────────────────────

test.describe("describeAskViews", () => {
  test("names every view, the side rule, the row cap and the scope CTE, and hides what the prompt hides", () => {
    const personal = describeAskViews();
    for (const view of ASK_VIEWS) expect(personal).toContain(`ask.${view}`);
    expect(personal).toContain(ASK_SIDE_REQUIRED_REASON);
    expect(personal).toContain(`${MCP_QUERY_ROW_CAP} rows`);
    expect(personal).toContain("select match_id from ask.matches");
    expect(personal).not.toContain("video_time");
    expect(personal).not.toContain("player_name");
    expect(personal).toBe(describeAskViews("personal"));
  });

  test("the team text carries the program scope's extra column", () => {
    const team = describeAskViews("team");
    expect(team).toContain("program scope");
    expect(team).toContain("player_name");
    expect(team).not.toContain("video_time");
  });
});

// ── The consent page's parsing ─────────────────────────────────────────────

test.describe("the consent page", () => {
  test("offers Allow only to Claude's, ChatGPT's and Cursor's callbacks and a loopback one", () => {
    expect(
      isConnectorRedirectUri("https://claude.ai/api/mcp/auth_callback"),
    ).toBe(true);
    expect(
      isConnectorRedirectUri("https://claude.com/api/mcp/auth_callback"),
    ).toBe(true);
    expect(
      isConnectorRedirectUri(
        "https://chatgpt.com/connector_platform_oauth_redirect",
      ),
    ).toBe(true);
    expect(
      isConnectorRedirectUri("https://chatgpt.com/connector/oauth/abc_12-XY"),
    ).toBe(true);
    expect(
      isConnectorRedirectUri(
        "https://www.cursor.com/agents/mcp/oauth/callback",
      ),
    ).toBe(true);
    // Cursor desktop: a loopback callback, like Claude Code's.
    expect(isConnectorRedirectUri("http://localhost:8787/callback")).toBe(true);
    expect(isConnectorRedirectUri("http://localhost:54321/callback")).toBe(
      true,
    );
    expect(isConnectorRedirectUri("http://127.0.0.1:8080/callback")).toBe(true);
    expect(isConnectorRedirectUri("http://[::1]:8080/callback")).toBe(true);

    expect(isConnectorRedirectUri(null)).toBe(false);
    expect(isConnectorRedirectUri("not a url")).toBe(false);
    expect(
      isConnectorRedirectUri("https://claude.ai/api/mcp/auth_callback/x"),
    ).toBe(false);
    expect(
      isConnectorRedirectUri("https://evil.example/api/mcp/auth_callback"),
    ).toBe(false);
    expect(isConnectorRedirectUri("https://localhost/callback")).toBe(false);
    expect(isConnectorRedirectUri("http://localhost.evil.example/cb")).toBe(
      false,
    );
    expect(isConnectorRedirectUri("http://user:pw@localhost:1/cb")).toBe(false);
    // ChatGPT's per-app path: one segment, this host, nothing after it.
    expect(
      isConnectorRedirectUri("https://chatgpt.com/connector/oauth/../x"),
    ).toBe(false);
    expect(
      isConnectorRedirectUri("https://chatgpt.com/connector/oauth/abc?x=1"),
    ).toBe(false);
    expect(
      isConnectorRedirectUri("https://chatgpt.com/connector/oauth/abc/def"),
    ).toBe(false);
    expect(
      isConnectorRedirectUri("https://evil.chatgpt.com/connector/oauth/abc"),
    ).toBe(false);
    expect(
      isConnectorRedirectUri(
        "https://chatgpt.com.evil.example/connector/oauth/abc",
      ),
    ).toBe(false);
    expect(isConnectorRedirectUri("https://chatgpt.com/connector/oauth/")).toBe(
      false,
    );
    // Cursor's custom scheme is refused on purpose — see CONNECTOR_REDIRECT_URIS.
    expect(
      isConnectorRedirectUri("cursor://anysphere.cursor-mcp/oauth/callback"),
    ).toBe(false);
    expect(
      isConnectorRedirectUri("https://cursor.com/agents/mcp/oauth/callback"),
    ).toBe(false);
  });

  test("reads a URL-safe authorization id and nothing else", () => {
    expect(readAuthorizationId("abc123-XYZ_789")).toBe("abc123-XYZ_789");
    expect(readAuthorizationId("short")).toBeNull();
    expect(readAuthorizationId("has/slash-and-more")).toBeNull();
    expect(readAuthorizationId(["an", "array"])).toBeNull();
    expect(readAuthorizationId(undefined)).toBeNull();
    expect(consentPath("abc123-XYZ_789")).toBe(
      "/oauth/consent?authorization_id=abc123-XYZ_789",
    );
  });

  test("follows an earlier consent only back to a connector", () => {
    expect(
      goesToConnector({
        kind: "redirect",
        redirectUrl: "https://claude.ai/api/mcp/auth_callback?code=abc&state=s",
      }),
    ).toBe(true);
    expect(
      goesToConnector({
        kind: "redirect",
        redirectUrl: "http://localhost:4312/callback?code=abc",
      }),
    ).toBe(true);
    expect(
      goesToConnector({
        kind: "redirect",
        redirectUrl: "https://evil.example/cb?code=abc",
      }),
    ).toBe(false);
    expect(goesToConnector({ kind: "redirect", redirectUrl: "nonsense" })).toBe(
      false,
    );
    expect(
      goesToConnector({
        kind: "consent",
        authorizationId: "abc123-XYZ_789",
        client: { name: "Other", uri: null },
        scopes: [],
        redirectUri: "https://evil.example/cb",
      }),
    ).toBe(false);
  });

  test("tells a consent request from an already-consented redirect, and garbage from both", () => {
    expect(
      parseAuthorizationDetails({
        authorization_id: "abc123-XYZ_789",
        client: { name: "Claude", uri: "https://claude.ai" },
        scope: "openid email",
        redirect_uri: "https://claude.ai/api/mcp/auth_callback",
      }),
    ).toEqual({
      kind: "consent",
      authorizationId: "abc123-XYZ_789",
      client: { name: "Claude", uri: "https://claude.ai" },
      scopes: ["openid", "email"],
      redirectUri: "https://claude.ai/api/mcp/auth_callback",
    });
    expect(
      parseAuthorizationDetails({ authorization_id: "x", client: null }),
    ).toEqual({
      kind: "consent",
      authorizationId: "x",
      client: { name: "An application", uri: null },
      scopes: [],
      redirectUri: null,
    });
    expect(
      parseAuthorizationDetails({
        redirect_url: "https://claude.ai/cb?code=1",
      }),
    ).toEqual({ kind: "redirect", redirectUrl: "https://claude.ai/cb?code=1" });
    expect(parseAuthorizationDetails({})).toBeNull();
    expect(parseAuthorizationDetails("nope")).toBeNull();
    expect(parseAuthorizationDetails(null)).toBeNull();
  });

  test("an upstream refusal becomes a written sentence, never Supabase's own text", async () => {
    const read = (status: number, body: unknown) =>
      getOAuthAuthorizationDetails({
        supabaseUrl: "https://proj.supabase.co",
        anonKey: "anon",
        accessToken: "token",
        authorizationId: "abc123-XYZ_789",
        fetch: async () =>
          new Response(typeof body === "string" ? body : JSON.stringify(body), {
            status,
          }),
      });
    const cases: [number, unknown, string][] = [
      [
        404,
        {
          code: 404,
          error_code: "feature_disabled",
          msg: "OAuth server is disabled",
        },
        OAUTH_UNAVAILABLE_ERROR,
      ],
      [503, "<html>bad gateway</html>", OAUTH_UNAVAILABLE_ERROR],
      [404, { msg: "authorization not found" }, EXPIRED_AUTHORIZATION_ERROR],
      [
        400,
        { msg: "authorization request has expired" },
        EXPIRED_AUTHORIZATION_ERROR,
      ],
    ];
    for (const [status, body, sentence] of cases) {
      expect(await read(status, body)).toEqual({
        ok: false,
        status,
        message: sentence,
      });
    }
    const other = await read(403, { msg: "forbidden by policy" });
    expect(other.ok).toBe(false);
    expect(!other.ok && other.message).not.toContain("forbidden by policy");
    expect(!other.ok && other.message).toContain(
      "Start again from the app you are connecting.",
    );
  });
});

// ── The user-side reads ────────────────────────────────────────────────────

/** A PostgREST chain that records its filters and answers what the test says. */
function fakeClient(
  answers: Record<string, { data: unknown; error: unknown }>,
) {
  const filters: { table: string; op: string; args: unknown[] }[] = [];
  const chain = (table: string) => {
    const self: Record<string, unknown> = {};
    const record =
      (op: string) =>
      (...args: unknown[]) => {
        filters.push({ table, op, args });
        return self;
      };
    self.eq = record("eq");
    self.is = record("is");
    self.order = record("order");
    self.limit = async () => answers[table];
    self.maybeSingle = async () => answers[table];
    self.then = (resolve: (value: unknown) => unknown) =>
      Promise.resolve(answers[table]).then(resolve);
    return self;
  };
  const client = {
    from: (table: string) => ({ select: () => chain(table) }),
  } as unknown as SupabaseClient;
  return { client, filters };
}

test.describe("createMcpUserReads", () => {
  test("program(): the caller's own membership row names the program; none is null; a malformed id reads nothing", async () => {
    const { client, filters } = fakeClient({
      program_members: {
        data: [
          {
            program_id: PROGRAM_ID,
            programs: { id: PROGRAM_ID, school_name: "Westbrook" },
          },
        ],
        error: null,
      },
    });
    const reads = createMcpUserReads(client, USER_ID);
    expect(await reads.program(PROGRAM_ID)).toEqual({
      id: PROGRAM_ID,
      name: "Westbrook",
    });
    expect(filters.map((f) => `${f.op}:${f.args[0]}=${f.args[1]}`)).toEqual([
      `eq:user_id=${USER_ID}`,
      `eq:program_id=${PROGRAM_ID}`,
    ]);

    const empty = fakeClient({ program_members: { data: [], error: null } });
    expect(
      await createMcpUserReads(empty.client, USER_ID).program(PROGRAM_ID),
    ).toBeNull();
    expect(await reads.program("not-a-uuid")).toBeNull();
  });

  test("program(): a failed read throws rather than answering 'not a member'", async () => {
    const { client } = fakeClient({
      program_members: { data: null, error: { message: "timeout" } },
    });
    await expect(
      createMcpUserReads(client, USER_ID).program(PROGRAM_ID),
    ).rejects.toThrow("Could not read the caller's programs");
  });

  test("conversation(): the caller's own conversation with its messages in order, scoped to the workspace", async () => {
    const { client, filters } = fakeClient({
      ask_conversations: { data: { id: CONVERSATION_ID }, error: null },
      ask_messages: {
        data: [
          { role: "user", content: { text: "How is my serve?" } },
          { role: "assistant", content: { headline: "Fine." } },
          { role: "system", content: "dropped" },
        ],
        error: null,
      },
    });
    const reads = createMcpUserReads(client, USER_ID);
    expect(await reads.conversation(CONVERSATION_ID, PROGRAM_ID)).toEqual({
      id: CONVERSATION_ID,
      messages: [
        { role: "user", content: { text: "How is my serve?" } },
        { role: "assistant", content: { headline: "Fine." } },
      ],
    });
    const conversationFilters = filters
      .filter((f) => f.table === "ask_conversations")
      .map((f) => `${f.op}:${f.args[0]}=${f.args[1]}`);
    expect(conversationFilters).toEqual([
      `eq:id=${CONVERSATION_ID}`,
      `eq:user_id=${USER_ID}`,
      `eq:program_id=${PROGRAM_ID}`,
    ]);
    const messageFilters = filters
      .filter((f) => f.table === "ask_messages" && f.op === "eq")
      .map((f) => `${f.args[0]}=${f.args[1]}`);
    expect(messageFilters).toEqual([
      `conversation_id=${CONVERSATION_ID}`,
      `user_id=${USER_ID}`,
    ]);

    // A personal conversation is read with program_id is null.
    const personal = fakeClient({
      ask_conversations: { data: null, error: null },
      ask_messages: { data: [], error: null },
    });
    expect(
      await createMcpUserReads(personal.client, USER_ID).conversation(
        CONVERSATION_ID,
        null,
      ),
    ).toBeNull();
    expect(
      personal.filters.find(
        (f) => f.table === "ask_conversations" && f.op === "is",
      )?.args,
    ).toEqual(["program_id", null]);
    expect(await reads.conversation("nope", null)).toBeNull();
  });
});

/**
 * `public.oauth_client_request_guard()` refuses every non-read request from
 * a connector token except the `ask_*` functions `/api/mcp` calls on the
 * user's client. Those calls live in the MCP server and the Ask modules it
 * runs; a new one there that the migration does not list would be refused
 * only for a live connector, so the two lists are held equal here.
 */
test.describe("the connector's read-only guard", () => {
  const migration = readFileSync(
    "supabase/migrations/20261016050115_oauth_client_read_only.sql",
    "utf8",
  );

  test("allows exactly the user-side ask_* calls the MCP path makes", () => {
    const listed = migration.match(/\/rpc\/\(([a-z_|]+)\)\$/)?.[1];
    expect(listed).toBeTruthy();
    const allowed = new Set(listed!.split("|"));

    const files = [
      ...readdirSync("src/lib/services/mcp")
        .filter((name) => name.endsWith(".ts"))
        .map((name) => `src/lib/services/mcp/${name}`),
      "src/lib/services/ask/ask.ts",
      "src/lib/services/ask/cache.ts",
      "src/lib/services/ask/runs.ts",
    ];
    const called = new Set<string>();
    for (const file of files) {
      const source = readFileSync(file, "utf8");
      for (const match of source.matchAll(
        /rpc\((?:\s*[A-Za-z.]+,\s*)?"(ask_[a-z_]+)"/g,
      )) {
        if (!Object.hasOwn(ASK_SERVICE_ROLE_CALLS, match[1])) {
          called.add(match[1]);
        }
      }
    }
    expect([...called].sort()).toEqual([...allowed].sort());
  });

  test("runs for every request, signed out included", () => {
    expect(migration).toMatch(
      /grant execute on function public\.oauth_client_request_guard\(\) to anon, authenticated, service_role/,
    );
    expect(migration).toMatch(
      /alter role authenticator set pgrst\.db_pre_request = 'public\.oauth_client_request_guard'/,
    );
  });

  test("every Edge Function refuses a connector token", () => {
    for (const name of readdirSync("supabase/functions")) {
      const source = readFileSync(
        `supabase/functions/${name}/index.ts`,
        "utf8",
      );
      expect(source, name).toMatch(
        /if \(jwtClientId\(token\) !== null\) \{\s*return \{\s*status: 403,/,
      );
    }
  });
});
