import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { safeNext } from "@/lib/auth/safe-next";
import { AUTH_NEXT_COOKIE } from "@/lib/auth/auth-next-cookie";
import { rememberPlanIntent } from "@/lib/billing/plan-intent-server";
import { toAuthError } from "@/lib/auth/error-messages";
import { trackServer } from "@/lib/analytics-server";
import { loginDestination } from "@/lib/auth/next-area";

/**
 * OAuth landing route (Google).
 *
 * Profile rows are no longer created here — the `on_auth_user_created` trigger
 * writes public.users atomically with the auth user, and reads the name out of
 * the provider's metadata, which this route used to discard by inserting null.
 *
 * Where to land comes from two places, and the cookie wins. `?next=` is what
 * the login form always sends and it only ever says `/dashboard`; a
 * destination worth carrying — an invitation's `/join/<token>` — travels in
 * the `AUTH_NEXT_COOKIE` instead, so it never rides in the authorize URL that
 * Supabase's auth server logs. Both are clamped by `safeNext`, and the cookie
 * is cleared on every way out of this route, the failures included, so it
 * cannot steer a later sign-in.
 *
 * A successful exchange captures `login_completed { method: "google" }`
 * server-side, keyed on the user id, with where it is headed as an area
 * only (`loginDestination`) — never the path, which can carry a token. The method is fixed rather than read
 * from `user.app_metadata.provider`, which names the provider the account
 * was FIRST created with (an email account that later signs in with Google
 * still says "email"): the Google button is the only flow whose `redirectTo`
 * is this route — email confirmations land on `/confirm` and password
 * recovery on `/update-password`.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const carried = request.cookies.get(AUTH_NEXT_COOKIE)?.value ?? null;
  const next = safeNext(carried ?? searchParams.get("next"));

  const leave = (url: string) => {
    const response = NextResponse.redirect(url);
    if (carried !== null) {
      response.cookies.set(AUTH_NEXT_COOKIE, "", { path: "/", maxAge: 0 });
    }
    return response;
  };

  if (!code) {
    return leave(`${origin}/error`);
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    // Translated: /error renders what it is handed, and raw Supabase text is
    // what the rebuild set out to stop showing users.
    return leave(
      `${origin}/error?error=${encodeURIComponent(toAuthError(error).message)}`,
    );
  }

  const user = data.user ?? data.session?.user ?? null;
  if (user) {
    trackServer(user.id, "login_completed", {
      method: "google",
      ...loginDestination(next),
    });
  }

  // A plan picked on the landing site: onboarding drops `next`, so a new
  // account's choice is remembered for it to take back when it finishes.
  await rememberPlanIntent(next);

  // Behind a load balancer the request origin is the internal host, so the
  // forwarded host is the only one the browser can follow back.
  const forwardedHost = request.headers.get("x-forwarded-host");
  const isLocalEnv = process.env.NODE_ENV === "development";
  return leave(
    !isLocalEnv && forwardedHost
      ? `https://${forwardedHost}${next}`
      : `${origin}${next}`,
  );
}
