/**
 * The consent step of Supabase Auth's OAuth 2.1 server, as this app serves
 * it at `/oauth/consent` (docs/ask-mcp-connector.md).
 *
 * When a third-party client — a Claude connecting to `/api/mcp` — starts the
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

/** A failure's sentence: GoTrue's `msg`/`error_description` when it has one, else the fixed line. */
async function failure(
  response: Response,
): Promise<{ ok: false; status: number; message: string }> {
  let message = UNAVAILABLE;
  try {
    const body = (await response.json()) as Record<string, unknown>;
    const said =
      stringOrNull(body.msg) ??
      stringOrNull(body.error_description) ??
      stringOrNull(body.message);
    if (said) message = said;
  } catch {
    // Not JSON: the fixed sentence.
  }
  return { ok: false, status: response.status, message };
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
