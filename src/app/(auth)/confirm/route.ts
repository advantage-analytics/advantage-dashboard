import { createClient } from "@/lib/supabase/server";
import { type EmailOtpType } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { type NextRequest } from "next/server";
import { safeNext } from "@/lib/auth/safe-next";
import { toAuthError } from "@/lib/auth/error-messages";

/**
 * Email link landing route — confirmation, recovery, invite, magic link and
 * email change all point here (see supabase/email-templates/).
 *
 * Two token shapes arrive: the current flow sends `code`, older links send
 * `token_hash` + `type`. Both establish the session the same way, so they share
 * one exit path rather than the two duplicated branches this route used to run.
 *
 * Profile rows are no longer created here. The `on_auth_user_created` trigger
 * writes public.users atomically with the auth user, which covers the flows that
 * never reach this route at all.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  // Attacker-controlled: this route is reachable by anyone with a link.
  const next = safeNext(searchParams.get("next"));

  // Checked before building the Supabase client, so a bot or a truncated link
  // doesn't pay for a cookie read and a client construction to be turned away.
  if (!code && !(token_hash && type)) {
    redirect(`/error?error=${encodeURIComponent("That link is missing its token.")}`);
  }

  const supabase = await createClient();
  const { error } = code
    ? await supabase.auth.exchangeCodeForSession(code)
    : await supabase.auth.verifyOtp({
        type: type as EmailOtpType,
        token_hash: token_hash as string,
      });

  if (error) {
    // Translated here too — the error page renders whatever it is handed, and
    // raw Supabase text is exactly what the rebuild set out to stop showing.
    redirect(`/error?error=${encodeURIComponent(toAuthError(error).message)}`);
  }

  redirect(next);
}
