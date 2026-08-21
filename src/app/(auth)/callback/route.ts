import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { safeNext } from "@/lib/auth/safe-next";
import { toAuthError } from "@/lib/auth/error-messages";

/**
 * OAuth landing route (Google).
 *
 * Profile rows are no longer created here — the `on_auth_user_created` trigger
 * writes public.users atomically with the auth user, and reads the name out of
 * the provider's metadata, which this route used to discard by inserting null.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = safeNext(searchParams.get("next"));

  if (!code) {
    return NextResponse.redirect(`${origin}/error`);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    // Translated: /error renders what it is handed, and raw Supabase text is
    // what the rebuild set out to stop showing users.
    return NextResponse.redirect(
      `${origin}/error?error=${encodeURIComponent(toAuthError(error).message)}`,
    );
  }

  // Behind a load balancer the request origin is the internal host, so the
  // forwarded host is the only one the browser can follow back.
  const forwardedHost = request.headers.get("x-forwarded-host");
  const isLocalEnv = process.env.NODE_ENV === "development";
  if (!isLocalEnv && forwardedHost) {
    return NextResponse.redirect(`https://${forwardedHost}${next}`);
  }
  return NextResponse.redirect(`${origin}${next}`);
}
