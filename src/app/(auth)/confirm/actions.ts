"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
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

  // Translated here — the error page renders whatever it is handed, and raw
  // Supabase text is exactly what the auth rebuild set out to stop showing.
  if (error) redirect(errorHref(toAuthError(error).message));

  redirect(link.next);
}
