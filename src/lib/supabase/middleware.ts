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
  await supabase.auth.getClaims();

  // You *must* return this exact object. If you build a different response,
  // copy the cookies onto it first (`res.cookies.setAll(...)`) or the browser
  // and server fall out of sync and the session terminates early.
  return supabaseResponse;
}
