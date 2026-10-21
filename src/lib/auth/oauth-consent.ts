/**
 * The consent step of Supabase Auth's OAuth 2.1 server, as this app serves
 * it at `/oauth/consent` (docs/ask-mcp-connector.md).
 *
 * When a third-party client — Claude, ChatGPT or Cursor connecting to
 * `/api/mcp` — starts the
 * authorization-code flow, Supabase Auth sends the user to this app's
 * authorization path with an `authorization_id`, and the app asks
 * Supabase what the request is and tells it the decision. The installed
 * `@supabase/supabase-js` (2.57) predates `auth.oauth.getAuthorizationDetails()`
 * and friends, so the two calls are made here against the same endpoints
 * those helpers wrap (`GET /auth/v1/oauth/authorizations/{id}` and
 * `POST …/consent` with `{ action }`), with the user's own access token as
 * the bearer and the anon key as the API key.
 *
 * Pure apart from `fetch`, which is injectable: the parsing of what comes
 * back is its own function so a spec can hold it.
 */

export interface OAuthConsentRequest {
  kind: "consent";
  authorizationId: string;
  client: { name: string; uri: string | null };
  /** The scopes asked for, split from the space-separated string. */
  scopes: string[];
  redirectUri: string | null;
}

export type OAuthAuthorizationDetails =
  | OAuthConsentRequest
  /** Consent was given before: send the user straight back to the client. */
  | { kind: "redirect"; redirectUrl: string };

export type OAuthConsentResult<T> =
  { ok: true; value: T } | { ok: false; status: number; message: string };

/** The sentence a link with no usable id is turned away with. */
export const MISSING_AUTHORIZATION_ERROR =
  "This connection link is missing its authorization id. Start again from the app you are connecting.";

/**
 * Where an approved client may be sent back to — the apps Advantage
 * connects to. Supabase's dynamic client registration lets any client
 * register, and an approved client holds a sign-in token for the person's
 * account, so the consent step only offers Allow to a client whose callback
 * is one of these:
 *
 *   - the claude.ai and claude.com callbacks (claude.ai and Claude Desktop
 *     share custom connectors);
 *   - ChatGPT's connector callback — the fixed legacy one here, and the
 *     per-app `https://chatgpt.com/connector/oauth/{callback_id}` its
 *     current apps register, matched by `CHATGPT_APP_CALLBACK` below;
 *   - Cursor Cloud's callback. Cursor desktop listens on a loopback
 *     address (`http://localhost:8787/callback` by default), which the
 *     loopback rule covers. Its older `cursor://anysphere.cursor-mcp/…`
 *     custom-scheme callback is NOT allowed: it is not http(s), and a code
 *     sent to a custom scheme can be claimed by any app that registers the
 *     scheme (RFC 8252 §8.6);
 *   - a loopback address on any port and path, for Claude Code, Cursor
 *     desktop and any other local client (RFC 8252 §7.3 — a code sent there
 *     never leaves the person's machine).
 *
 * Connecting another app means adding its callback here.
 */
export const CONNECTOR_REDIRECT_URIS: readonly string[] = [
  "https://claude.ai/api/mcp/auth_callback",
  "https://claude.com/api/mcp/auth_callback",
  "https://chatgpt.com/connector_platform_oauth_redirect",
  "https://www.cursor.com/agents/mcp/oauth/callback",
];

/**
 * ChatGPT's per-app callback: one path segment of URL-safe characters after
 * a fixed prefix, nothing else — no query, no fragment, no dot segments, and
 * only that host.
 */
const CHATGPT_APP_CALLBACK =
  /^https:\/\/chatgpt\.com\/connector\/oauth\/[A-Za-z0-9_-]+$/;

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

/** True when `uri` is one of `CONNECTOR_REDIRECT_URIS`, ChatGPT's per-app callback, or a loopback http callback. */
export function isConnectorRedirectUri(uri: string | null): boolean {
  if (!uri) return false;
  if (CONNECTOR_REDIRECT_URIS.includes(uri)) return true;
  if (CHATGPT_APP_CALLBACK.test(uri)) return true;
  let url: URL;
  try {
    url = new URL(uri);
  } catch {
    return false;
  }
  return (
    url.protocol === "http:" &&
    LOOPBACK_HOSTS.has(url.hostname) &&
    url.username === "" &&
    url.password === ""
  );
}

/**
 * Whether a read authorization goes back to an app Advantage connects to: a
 * consent request by its registered callback, an already-consented one by
 * where Supabase would send the code (its origin and path, without the
 * query that carries the code).
 */
export function goesToConnector(details: OAuthAuthorizationDetails): boolean {
  if (details.kind === "consent") {
    return isConnectorRedirectUri(details.redirectUri);
  }
  try {
    const url = new URL(details.redirectUrl);
    return isConnectorRedirectUri(`${url.origin}${url.pathname}`);
  } catch {
    return false;
  }
}

/** The sentence a client outside the allow-list is turned away with. */
export const UNKNOWN_CLIENT_ERROR =
  "This app can't connect to Advantage. Advantage connects to Claude (claude.ai, Claude Desktop and Claude Code), ChatGPT and Cursor.";

/** The consent page's own path with the id, for the sign-in round trip. */
export function consentPath(authorizationId: string): string {
  return `/oauth/consent?authorization_id=${encodeURIComponent(authorizationId)}`;
}

/** `authorization_id` is opaque text; it goes into a URL path, so it is held to URL-safe characters. */
export function readAuthorizationId(value: unknown): string | null {
  return typeof value === "string" && /^[A-Za-z0-9_-]{8,256}$/.test(value)
    ? value
    : null;
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

/** What `GET …/oauth/authorizations/{id}` answered, as one of the two shapes, or null for neither. */
export function parseAuthorizationDetails(
  data: unknown,
): OAuthAuthorizationDetails | null {
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    return null;
  }
  const record = data as Record<string, unknown>;
  if (typeof record.authorization_id !== "string") {
    const redirectUrl = stringOrNull(record.redirect_url);
    return redirectUrl ? { kind: "redirect", redirectUrl } : null;
  }
  const client =
    typeof record.client === "object" && record.client !== null
      ? (record.client as Record<string, unknown>)
      : {};
  const scope = stringOrNull(record.scope) ?? "";
  return {
    kind: "consent",
    authorizationId: record.authorization_id,
    client: {
      name: stringOrNull(client.name) ?? "An application",
      uri: stringOrNull(client.uri) ?? stringOrNull(client.client_uri),
    },
    scopes: scope.split(/\s+/).filter((item) => item !== ""),
    redirectUri: stringOrNull(record.redirect_uri),
  };
}

interface ConsentCall {
  supabaseUrl: string;
  anonKey: string;
  accessToken: string;
  authorizationId: string;
  fetch?: typeof fetch;
}

const UNAVAILABLE =
  "This connection request could not be read. Start again from the app you are connecting.";

/** A request Supabase no longer knows: an id that expired, was used, or never was. */
export const EXPIRED_AUTHORIZATION_ERROR =
  "This connection link has expired or was already used. Start again from the app you are connecting.";

/** Supabase's OAuth server is switched off or failing: nothing the person can fix but wait. */
export const OAUTH_UNAVAILABLE_ERROR =
  "Connecting apps to Advantage is not available right now. Try again later from the app you are connecting.";

function authorizationUrl(input: ConsentCall): string {
  return `${input.supabaseUrl.replace(/\/+$/, "")}/auth/v1/oauth/authorizations/${encodeURIComponent(input.authorizationId)}`;
}

function headersFor(input: ConsentCall): Record<string, string> {
  return {
    apikey: input.anonKey,
    Authorization: `Bearer ${input.accessToken}`,
    Accept: "application/json",
  };
}

/**
 * A failure as one of the written sentences. GoTrue's own text ("OAuth
 * server is disabled", "authorization not found") is read only to choose
 * between them and is never shown: it is written for developers, and it
 * names nothing the person can do.
 */
async function failure(
  response: Response,
): Promise<{ ok: false; status: number; message: string }> {
  let said = "";
  try {
    const body = (await response.json()) as Record<string, unknown>;
    said = [body.error_code, body.error, body.msg, body.message]
      .filter((part): part is string => typeof part === "string")
      .join(" ")
      .toLowerCase();
  } catch {
    // Not JSON: judged on the status alone.
  }
  const status = response.status;
  let message = UNAVAILABLE;
  if (status >= 500 || /disabled|not enabled/.test(said)) {
    message = OAUTH_UNAVAILABLE_ERROR;
  } else if (status === 400 || status === 404 || status === 410) {
    message = EXPIRED_AUTHORIZATION_ERROR;
  }
  return { ok: false, status, message };
}

export async function getOAuthAuthorizationDetails(
  input: ConsentCall,
): Promise<OAuthConsentResult<OAuthAuthorizationDetails>> {
  const call = input.fetch ?? fetch;
  const response = await call(authorizationUrl(input), {
    headers: headersFor(input),
    cache: "no-store",
  });
  if (!response.ok) return failure(response);
  const details = parseAuthorizationDetails(await response.json());
  return details
    ? { ok: true, value: details }
    : { ok: false, status: 502, message: UNAVAILABLE };
}

export async function decideOAuthAuthorization(
  input: ConsentCall & { action: "approve" | "deny" },
): Promise<OAuthConsentResult<{ redirectUrl: string }>> {
  const call = input.fetch ?? fetch;
  const response = await call(`${authorizationUrl(input)}/consent`, {
    method: "POST",
    headers: { ...headersFor(input), "Content-Type": "application/json" },
    body: JSON.stringify({ action: input.action }),
    cache: "no-store",
  });
  if (!response.ok) return failure(response);
  const body = (await response.json()) as Record<string, unknown>;
  const redirectUrl = stringOrNull(body.redirect_url);
  return redirectUrl
    ? { ok: true, value: { redirectUrl } }
    : { ok: false, status: 502, message: UNAVAILABLE };
}
