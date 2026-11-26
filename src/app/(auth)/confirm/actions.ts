"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { rememberPlanIntent } from "@/lib/billing/plan-intent-server";
import { toAuthError } from "@/lib/auth/error-messages";
import {
  MISSING_TOKEN_ERROR,
  errorHref,
  parseConfirmLink,
} from "@/lib/auth/confirm-link";

/**
 * The POST half of `/confirm` — the only thing that spends an auth token.
 *
 * A Server Action, reachable over POST with a live action id and never by
 * fetching a URL. That is the whole point: the GET page renders a button and
 * nothing else, so a mail scanner, a Safe Links check, a messaging app's
 * link preview or a mail client's prefetch — all of which open emailed links
 * before the person does — find a page, not a one-time token being spent on
 * their behalf. See `page.tsx` for the incident that made this a page.
 *
 * The link is re-read from the form here, through the same `parseConfirmLink`
 * the page used, so the two cannot disagree about what was in it. Nothing
 * carries over from the render except the fields themselves.
 */
export async function confirmLinkForm(formData: FormData): Promise<void> {
  const link = parseConfirmLink(formData);
  if (link.kind === "missing") redirect(errorHref(MISSING_TOKEN_ERROR));

  const supabase = await createClient();
  const { error } =
    link.kind === "code"
      ? await supabase.auth.exchangeCodeForSession(link.code)
      : await supabase.auth.verifyOtp({
          type: link.type,
          token_hash: link.tokenHash,
        });

  if (error) {
    // A spent sign-in link opened by someone who is already signed in. On
    // 2026-11-15 a new coach confirmed his account, went back to the email
    // a minute later, tapped the same link and pressed Continue again: the
    // token was gone, and "That link has expired" told a signed-in person
    // that something had failed. For a link whose only job is to sign you in,
    // a live session means it already did — so carry on to where it was going.
    // Recovery, invite and email-change links do more than sign in, so they
    // still report the failure. Only a spent link qualifies: a rate limit or
    // an outage on a fresh link must still say so, session or not.
    if (
      link.kind === "token_hash" &&
      SIGN_IN_ONLY.has(link.type) &&
      isSpentLink(error)
    ) {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        await rememberPlanIntent(link.next);
        redirect(link.next);
      }
    }

    // Translated here — the error page renders whatever it is handed, and raw
    // Supabase text is exactly what the auth rebuild set out to stop showing.
    redirect(errorHref(toAuthError(error).message));
  }

  // A plan picked on the landing site rides `next` this far; a new account is
  // about to be sent through onboarding, which drops it, so leave it a note.
  await rememberPlanIntent(link.next);
  redirect(link.next);
}

/**
 * GoTrue answers a used or timed-out token with `otp_expired` ("Email link is
 * invalid or has expired"). The code is checked first; the phrase is the
 * fallback, matched the way `toAuthError` matches it, since the wire format
 * has changed between releases.
 */
function isSpentLink(error: { message: string; code?: string }): boolean {
  return error.code === "otp_expired" || /expired/i.test(error.message);
}

/** Link types whose whole effect is a session — see the spent-link branch. */
const SIGN_IN_ONLY: ReadonlySet<string> = new Set([
  "email",
  "signup",
  "magiclink",
]);
