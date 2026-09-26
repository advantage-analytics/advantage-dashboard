import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Refreshes the Supabase session cookie on every matched request.
 *
 * This exists because Server Components can *read* cookies but cannot write
 * them. `@supabase/ssr` rotates a refresh token by setting a new cookie, so
 * without a middleware doing it, the session never slides — it simply expires
 * and the user is bounced to /login mid-visit.
 *
 * It deliberately does NOT redirect. Route protection already lives in the
 * Server Component layouts that own each area — `dashboard/layout.tsx`,
 * `dashboard/team/layout.tsx` and `admin/layout.tsx` — where the guard sits
 * next to the workspace/role lookup it depends on. Duplicating that policy
 * here would mean two places encoding who may see what, kept in agreement by
 * remembering. An earlier version of this file did redirect, and its path
 * allowlist had already drifted: it would have bounced the Stripe and vendor
 * webhooks, the cron endpoint and the whole anonymous /claim funnel to /login.
 */
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  // With Fluid compute, don't put this client in a global environment
  // variable. Always create a new one on each request.
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // Do not run code between createServerClient and supabase.auth.getClaims().
  // A simple mistake could make it very hard to debug issues with users being
  // randomly logged out.
  //
  // The call looks unused — its return value is discarded on purpose. Reading
  // the claims is what triggers the refresh-and-set-cookie path above, so
  // removing it would turn this middleware into an expensive no-op.
  //
  // `getClaims()` reports every `AuthError` (network, expired, bad signature)
  // as a `{ data: null, error }` return, which is why the result is not
  // checked. What it *throws* is narrower: `validateExp` raises a plain
  // `Error("Missing exp claim")` / `Error("JWT has expired")` while decoding
  // the cookie's access token, before any network call, and `getClaims`
  // rethrows anything that is not an `AuthError`. So this catch is reached only
  // by a cookie whose token cannot be validated — a stale, foreign-project or
  // hand-made one — never by a valid session. Without it that one cookie took
  // down every route in `src/proxy.ts`'s matcher with a 500 until it was gone.
  //
  // Deliberately no cookie clearing here and no redirect. Downstream
  // `getUser()` in the owning layouts already rejects the bad token and sends
  // the browser to /login; clearing here would add a second place that decides
  // session validity. Log the message and path only — never a cookie value.
  try {
    await supabase.auth.getClaims();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(
      `[updateSession] auth cookie could not be validated (${message}) on ${request.nextUrl.pathname}; leaving it for the layout's getUser() to reject`,
    );
  }

  // You *must* return this exact object. If you build a different response,
  // copy the cookies onto it first (`res.cookies.setAll(...)`) or the browser
  // and server fall out of sync and the session terminates early.
  return supabaseResponse;
}
