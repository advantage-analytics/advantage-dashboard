/**
 * The apps a person has approved through Supabase Auth's OAuth 2.1 server
 * (the Ask MCP connector, docs/ask-mcp-connector.md), as Settings ›
 * Connections lists them.
 *
 * The installed `@supabase/supabase-js` predates `auth.oauth.listGrants()`
 * and `revokeGrant()`, so these call the endpoints those helpers wrap —
 * `GET /auth/v1/user/oauth/grants` and `DELETE …?client_id=` — with the
 * person's own access token, as `oauth-consent.ts` does for the consent
 * step. Revoking marks the consent revoked and ends that client's sessions.
 *
 * Pure apart from `fetch`, which is injectable, and the parsing is its own
 * function so a spec can hold it.
 */

export interface OAuthGrant {
  clientId: string;
  name: string;
  /** ISO timestamp of the approval. */
  grantedAt: string | null;
  scopes: string[];
}

export type OAuthGrantsResult<T> =
  { ok: true; value: T } | { ok: false; message: string };

interface GrantsCall {
  supabaseUrl: string;
  anonKey: string;
  accessToken: string;
  fetch?: typeof fetch;
}

export const GRANTS_UNAVAILABLE_ERROR =
  "Connected apps could not be loaded. Refresh to try again.";
export const REVOKE_FAILED_ERROR =
  "That app could not be disconnected. Try again.";

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

/** What `GET /user/oauth/grants` answered, keeping only rows with a client id. */
export function parseOAuthGrants(data: unknown): OAuthGrant[] | null {
  if (!Array.isArray(data)) return null;
  const grants: OAuthGrant[] = [];
  for (const row of data) {
    if (typeof row !== "object" || row === null) continue;
    const record = row as Record<string, unknown>;
    const client =
      typeof record.client === "object" && record.client !== null
        ? (record.client as Record<string, unknown>)
        : {};
    const clientId = stringOrNull(client.id) ?? stringOrNull(client.client_id);
    if (!clientId) continue;
    grants.push({
      clientId,
      name:
        stringOrNull(client.name) ??
        stringOrNull(client.client_name) ??
        "An application",
      grantedAt: stringOrNull(record.granted_at),
      scopes: Array.isArray(record.scopes)
        ? record.scopes.filter(
            (scope): scope is string => typeof scope === "string",
          )
        : [],
    });
  }
  return grants;
}

function grantsUrl(supabaseUrl: string): string {
  return `${supabaseUrl.replace(/\/+$/, "")}/auth/v1/user/oauth/grants`;
}

function headersFor(input: GrantsCall): Record<string, string> {
  return {
    apikey: input.anonKey,
    Authorization: `Bearer ${input.accessToken}`,
    Accept: "application/json",
  };
}

export async function listOAuthGrants(
  input: GrantsCall,
): Promise<OAuthGrantsResult<OAuthGrant[]>> {
  const call = input.fetch ?? fetch;
  try {
    const response = await call(grantsUrl(input.supabaseUrl), {
      headers: headersFor(input),
      cache: "no-store",
    });
    if (!response.ok) return { ok: false, message: GRANTS_UNAVAILABLE_ERROR };
    const grants = parseOAuthGrants(await response.json());
    return grants
      ? { ok: true, value: grants }
      : { ok: false, message: GRANTS_UNAVAILABLE_ERROR };
  } catch {
    return { ok: false, message: GRANTS_UNAVAILABLE_ERROR };
  }
}

export async function revokeOAuthGrant(
  input: GrantsCall & { clientId: string },
): Promise<OAuthGrantsResult<null>> {
  const call = input.fetch ?? fetch;
  try {
    const url = `${grantsUrl(input.supabaseUrl)}?client_id=${encodeURIComponent(input.clientId)}`;
    const response = await call(url, {
      method: "DELETE",
      headers: headersFor(input),
      cache: "no-store",
    });
    return response.ok
      ? { ok: true, value: null }
      : { ok: false, message: REVOKE_FAILED_ERROR };
  } catch {
    return { ok: false, message: REVOKE_FAILED_ERROR };
  }
}
