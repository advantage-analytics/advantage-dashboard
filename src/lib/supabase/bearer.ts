import { createClient, type User } from "@supabase/supabase-js";
import { isUuid } from "@/lib/admin/validation";

/**
 * The fourth Supabase client: a user's access token carried in an
 * `Authorization: Bearer` header rather than a cookie.
 *
 * `server.ts` reads the session from cookies, which is what a browser sends;
 * an MCP client (`/api/mcp`) sends the access token Supabase Auth's OAuth
 * 2.1 server issued it, and nothing else. This client puts that token on
 * every PostgREST request, so `.from()` and `.rpc()` run as the user under
 * RLS exactly as the cookie client would — `auth.uid()` is the token's
 * `sub`, and the token's `client_id` claim is readable by a policy that
 * wants to tell an OAuth client from the app. No session is persisted and
 * nothing is refreshed: the token is the caller's to renew.
 *
 * Server-only by construction (the anon key is public, but a bearer token
 * is a credential and never belongs in a browser bundle of this app).
 */
export function createBearerClient(token: string) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
      global: { headers: { Authorization: `Bearer ${token}` } },
    },
  );
}

/** Inferred, as `AdminClient` is: an explicit `SupabaseClient` annotation makes `.rpc()` an infinitely deep type. */
export type BearerClient = ReturnType<typeof createBearerClient>;

/** A verified bearer token: the user Supabase Auth says it names, and a client that runs as them. */
export interface VerifiedBearer {
  client: BearerClient;
  user: User;
}

/**
 * Ask Supabase Auth who a bearer token is. `getUser(token)` sends it to
 * `GET /auth/v1/user`, which checks the signature and expiry and answers
 * with the user — the server's own word, never a decoded claim trusted
 * locally. Null for anything that is not a live user token: an expired or
 * forged one, the anon key, the service key (no `sub`), a token of another
 * project. Never throws: a network failure is "not verified" too, and the
 * caller answers 401 rather than 500 so the client retries its token flow.
 */
export async function verifyBearerUser(
  token: string,
): Promise<VerifiedBearer | null> {
  try {
    const client = createBearerClient(token);
    const { data, error } = await client.auth.getUser(token);
    const user = data?.user;
    if (error || !user || !isUuid(user.id) || user.aud !== "authenticated") {
      return null;
    }
    return { client, user };
  } catch (error) {
    console.warn("[bearer] token could not be verified", {
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}
