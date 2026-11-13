/**
 * The pure half of `/api/mcp`'s authentication: reading the bearer token,
 * and the two documents an MCP client needs to find out where to get one.
 *
 * The MCP authorization spec (2025-06-18) makes the MCP server a plain
 * OAuth 2.0 *resource server*. It never issues a token itself; it says who
 * does. A client that calls with no token gets a 401 whose
 * `WWW-Authenticate` names a protected-resource metadata document (RFC
 * 9728) on this host; that document names the authorization server — the
 * project's Supabase Auth, which runs an OAuth 2.1 server with dynamic
 * client registration — and the client takes it from there: discovery at
 * `<supabase>/.well-known/oauth-authorization-server/auth/v1`, registration,
 * the authorization-code flow with PKCE through `/oauth/consent` on this
 * app, and a Supabase access token for the user who approved. That token is
 * what `/api/mcp` then verifies (`src/lib/supabase/bearer.ts`).
 *
 * Pure: no environment, no network, no Next.js. The route hands in the
 * origin and the Supabase URL.
 */

/** Where the MCP server listens on this host. */
export const MCP_PATH = "/api/mcp";

/** The RFC 9728 well-known path; the path-specific form appends `MCP_PATH`. */
export const PROTECTED_RESOURCE_METADATA_PATH =
  "/.well-known/oauth-protected-resource";

/** The scope the connector asks for: Supabase's default when a client names none. */
export const MCP_SCOPES = ["email"] as const;

/**
 * Who is calling, once the token is verified. `session`: a Supabase user
 * access token — `auth.uid()` is set, so every user-side call (the question
 * reservation among them) runs as the user. `token`: a personal access
 * token resolved by the server, with no `auth.uid()` behind it — reserved
 * for the documented follow-up; nothing issues one today. The `ask` tool
 * needs the first kind (`assertAskAllowed`).
 */
export type McpCaller =
  { kind: "session"; userId: string } | { kind: "token"; userId: string };

/** The sentence `ask` refuses a personal-access-token caller with. */
export const ASK_NEEDS_SESSION_MESSAGE =
  "ask needs a sign-in token: connect through the app's sign-in (OAuth) rather than a personal access token, so your monthly questions can be counted.";

export function assertAskAllowed(
  caller: McpCaller,
): { ok: true } | { ok: false; reason: string } {
  return caller.kind === "session"
    ? { ok: true }
    : { ok: false, reason: ASK_NEEDS_SESSION_MESSAGE };
}

/**
 * The token of an `Authorization: Bearer <token>` header, or null. The
 * scheme is case-insensitive (RFC 7235); the token is the rest of the
 * header, trimmed, and must be one run of the characters RFC 6750 allows —
 * a JWT is. Anything else (Basic, an empty bearer, two tokens) is "no
 * token", never an error with a hint in it.
 */
export function readBearerToken(header: string | null): string | null {
  if (!header) return null;
  const match = /^\s*Bearer\s+(\S+)\s*$/i.exec(header);
  if (!match) return null;
  const token = match[1];
  return /^[A-Za-z0-9\-._~+/]+=*$/.test(token) ? token : null;
}

/** The longest bearer token `/api/mcp` will send to Supabase Auth. A Supabase access token is well under 2 KiB. */
export const MAX_BEARER_TOKEN_LENGTH = 8192;

/**
 * Whether a bearer token is shaped like a JWT: three non-empty base64url
 * segments, at most `MAX_BEARER_TOKEN_LENGTH` characters. The route checks
 * this before `verifyBearerUser()`, so junk is a 401 without a round trip
 * to Supabase Auth. Shape only — nothing is decoded or trusted here.
 */
export function isJwtShaped(token: string): boolean {
  return (
    token.length <= MAX_BEARER_TOKEN_LENGTH &&
    /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token)
  );
}

/**
 * Whether a JWT-shaped token's own `exp` is in the past. Decodes only, and
 * trusts nothing: used after Supabase Auth has already refused the token,
 * to tell a routine expiry (every client's cue to refresh) from a token
 * that is refused for another reason. A token with no readable `exp` is not
 * "expired". Pure, and never throws.
 */
export function jwtLooksExpired(token: string, nowMs: number): boolean {
  try {
    const payload: unknown = JSON.parse(
      Buffer.from(token.split(".")[1] ?? "", "base64url").toString("utf8"),
    );
    const exp =
      typeof payload === "object" && payload !== null
        ? (payload as { exp?: unknown }).exp
        : undefined;
    return typeof exp === "number" && exp * 1000 <= nowMs;
  } catch {
    return false;
  }
}

/**
 * The cap on `mcp_auth_failed` events. The 401 path needs no sign-in, so
 * without one a loop of bad tokens is a loop of product events. Two limits
 * per window: a few per caller, so one address cannot spend the allowance
 * and hide every other app's failures, and a total, so many addresses
 * cannot flood either. Per server instance, like the call window
 * (`rate-limit.ts`): soft by construction, which is enough for a report
 * that an app's sign-in is broken. Pure: the clock is the caller's.
 */
export function createAuthFailureGate(
  options: { perCaller?: number; total?: number; windowMs?: number } = {},
): { allow(caller: string, nowMs: number): boolean } {
  const perCaller = options.perCaller ?? 3;
  const total = options.total ?? 60;
  const windowMs = options.windowMs ?? 5 * 60_000;
  let startedAt = 0;
  let sent = 0;
  let byCaller = new Map<string, number>();
  return {
    allow(caller, nowMs) {
      if (nowMs - startedAt >= windowMs) {
        startedAt = nowMs;
        sent = 0;
        byCaller = new Map();
      }
      const mine = byCaller.get(caller) ?? 0;
      if (sent >= total || mine >= perCaller) return false;
      sent += 1;
      byCaller.set(caller, mine + 1);
      return true;
    },
  };
}

/** The URL's origin with no path, or the string as given when it is not a URL. */
function originOf(url: string): string {
  try {
    return new URL(url).origin;
  } catch {
    return url.replace(/\/+$/, "");
  }
}

/** Supabase Auth's issuer: the `iss` of every token it signs. */
export function supabaseAuthIssuer(supabaseUrl: string): string {
  return `${originOf(supabaseUrl)}/auth/v1`;
}

/**
 * Where the authorization server's metadata (RFC 8414) lives for that
 * issuer: the well-known segment is inserted before the issuer's path, as
 * the RFC says and the Supabase docs print it.
 */
export function authorizationServerMetadataUrl(supabaseUrl: string): string {
  return `${originOf(supabaseUrl)}/.well-known/oauth-authorization-server/auth/v1`;
}

/** The resource identifier of this MCP server: its own URL, no trailing slash. */
export function mcpResourceUrl(origin: string): string {
  return `${originOf(origin)}${MCP_PATH}`;
}

/** Where this host's protected-resource metadata is, in the path-specific form. */
export function resourceMetadataUrl(origin: string): string {
  return `${originOf(origin)}${PROTECTED_RESOURCE_METADATA_PATH}${MCP_PATH}`;
}

/**
 * The RFC 9728 document: this server as the resource, Supabase Auth as its
 * one authorization server. `bearer_methods_supported` says the token comes
 * in the header and nowhere else (never a query string — it would land in
 * logs).
 */
export function protectedResourceMetadata(input: {
  origin: string;
  supabaseUrl: string;
}): {
  resource: string;
  authorization_servers: string[];
  bearer_methods_supported: string[];
  scopes_supported: string[];
  resource_name: string;
  resource_documentation: string;
} {
  return {
    resource: mcpResourceUrl(input.origin),
    authorization_servers: [supabaseAuthIssuer(input.supabaseUrl)],
    bearer_methods_supported: ["header"],
    scopes_supported: [...MCP_SCOPES],
    resource_name: "Advantage Ask",
    resource_documentation: `${originOf(input.origin)}/dashboard/help`,
  };
}

/**
 * The `WWW-Authenticate` value of a 401 (RFC 6750 §3, MCP authorization
 * §"Protected resource metadata discovery"). Always carries
 * `resource_metadata`, which is how a client that has no token yet finds
 * the authorization server; `error="invalid_token"` only when a token was
 * sent and refused, so a client knows to re-run its flow rather than retry
 * the same credential. The description is a short, fixed sentence: nothing
 * about *why* a token failed leaves here.
 */
export function wwwAuthenticate(input: {
  origin: string;
  error?: "invalid_token";
}): string {
  const parts = [`Bearer realm="Advantage Ask"`];
  if (input.error) {
    parts.push(
      `error="${input.error}"`,
      `error_description="The access token is missing, expired or not for this app."`,
    );
  }
  parts.push(`resource_metadata="${resourceMetadataUrl(input.origin)}"`);
  return parts.join(", ");
}

/** The apps the connector is set up for, as the `client` property of its product events. */
export type McpClientName =
  | "claude"
  | "claude_code"
  | "chatgpt"
  | "gemini"
  | "cursor"
  | "le_chat"
  | "other";

/** Checked in order: `claude-code` before `claude`. */
const CLIENT_AGENT_MARKS: readonly (readonly [string, McpClientName])[] = [
  ["claude-code", "claude_code"],
  ["claude", "claude"],
  ["anthropic", "claude"],
  ["openai", "chatgpt"],
  ["chatgpt", "chatgpt"],
  ["cursor", "cursor"],
  ["gemini", "gemini"],
  ["mistral", "le_chat"],
];

/**
 * Which app is calling, read from the request's `User-Agent`. A best guess
 * for reporting and nothing else: a caller can send any header, so no
 * decision may rest on it. A stateless request carries no `initialize`
 * `clientInfo`, and the token's `client_id` is a registration id, not a
 * name, so the header is what there is. `agent` is the header's product
 * token (the part before the first `/` or space, at most 40 safe
 * characters) so an app this table does not know yet shows up by name
 * rather than only as `other`.
 */
export function mcpClientFromUserAgent(header: string | null): {
  client: McpClientName;
  agent: string | null;
} {
  const value = (header ?? "").trim();
  if (value === "") return { client: "other", agent: null };
  const lower = value.toLowerCase();
  const mark = CLIENT_AGENT_MARKS.find(([needle]) => lower.includes(needle));
  const product = /^[A-Za-z0-9._-]{1,40}/.exec(value)?.[0] ?? null;
  return { client: mark ? mark[1] : "other", agent: product };
}
