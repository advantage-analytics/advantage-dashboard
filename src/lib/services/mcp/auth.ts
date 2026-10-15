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
