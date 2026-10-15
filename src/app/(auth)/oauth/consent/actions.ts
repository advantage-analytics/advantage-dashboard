"use server";

import { redirect } from "next/navigation";
import { errorHref } from "@/lib/auth/confirm-link";
import {
  consentPath,
  decideOAuthAuthorization,
  MISSING_AUTHORIZATION_ERROR,
  readAuthorizationId,
} from "@/lib/auth/oauth-consent";
import { createClient } from "@/lib/supabase/server";

/**
 * The POST half of `/oauth/consent` — the only thing that decides an OAuth
 * request. A Server Action, so it is reachable over POST with a live action
 * id and never by fetching a URL; the page's GET renders two buttons and
 * nothing else.
 *
 * The decision and the id are re-read from the form here. The session is
 * the cookie's, verified again through `getUser()` before its token is
 * sent to Supabase Auth with the decision: whoever presses the button is
 * whoever is signed in on this browser, never anyone the form names.
 * Supabase answers with where to send the person — back to the client with
 * an authorization code (approved) or an `access_denied` error (denied).
 */
export async function decideOAuthConsent(formData: FormData): Promise<void> {
  const authorizationId = readAuthorizationId(formData.get("authorization_id"));
  if (!authorizationId) redirect(errorHref(MISSING_AUTHORIZATION_ERROR));
  const decision = formData.get("decision");
  const action = decision === "approve" ? "approve" : "deny";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!user || !session) {
    redirect(`/login?next=${encodeURIComponent(consentPath(authorizationId))}`);
  }

  const decided = await decideOAuthAuthorization({
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL!,
    anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    accessToken: session.access_token,
    authorizationId,
    action,
  });
  if (!decided.ok) redirect(errorHref(decided.message));
  redirect(decided.value.redirectUrl);
}
