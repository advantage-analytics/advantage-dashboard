"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  MAX_VOUCHER_NOTE,
  hashVerificationToken,
  normalizeVoucherNote,
  verificationIsUsable,
} from "@/lib/services/programs/claim-verification";

/**
 * The confirmation half of `/claim/verify-identity`.
 *
 * ── POST only, and that is the whole point of this file ─────────────────────
 * This is a Server Action, so it is reachable only over POST with a live
 * action id — never by fetching a URL. That matters more here than it usually
 * does: the GET page is an emailed link, and emailed links are fetched by
 * things that are not people. Outlook's Safe Links, Gmail's image proxy, a
 * corporate mail scanner and the browser's own prefetcher will all open it
 * unasked. If confirming were a GET side effect, a mail filter would vouch for
 * a coach's identity before the coach had read the sentence.
 *
 * So the page stamps `verification_opened_at` and stops. The only thing that
 * writes `verified_at` is a person pressing the button, which is this.
 *
 * ── The token is re-validated here, not trusted from the page ───────────────
 * The page that rendered the form already looked the claim up, but between
 * that render and this submit the link may have expired or been rotated by an
 * admin pressing Resend. Nothing carries over from the render except the token
 * itself, and every check runs again against the row as it is now.
 *
 * The token is also the ONLY identifier: there is no claim id in the form. A
 * hand-edited field cannot aim this at a different claim, because the claim it
 * hits is whichever row's stored hash the presented token hashes to.
 */

export type ConfirmOutcome = { ok: true } | { ok: false; error: string };

export async function confirmClaimIdentity(
  token: string,
  note?: string,
): Promise<ConfirmOutcome> {
  const presented = token?.trim();
  if (!presented) return { ok: false, error: "That link is no longer valid." };

  // Refused before the lookup, so an over-long note is a sentence rather than
  // a raw `program_claims_voucher_note_len` violation. The CHECK constraint is
  // still the authority — this is the friendlier half of the same rule.
  const voucher = normalizeVoucherNote(note);
  if (!voucher.ok) return voucher;

  const db = createAdminClient();

  // By hash equality, never by an id in the URL. The row the token hashes to
  // decided which claim this is when the admin issued it.
  const { data: claim } = await db
    .from("program_claims")
    .select("id, verification_sent_at, verified_at")
    .eq("verification_token_hash", hashVerificationToken(presented))
    .maybeSingle();

  // Unknown and expired are one answer, exactly as they are on the page:
  // telling a stranger holding a bad token which kind of bad it is tells them
  // something about a row.
  if (
    !claim ||
    !verificationIsUsable({
      verificationSentAt: claim.verification_sent_at as string | null,
    })
  ) {
    return { ok: false, error: "That link is no longer valid." };
  }

  // Already confirmed. Idempotent rather than an error: a double submit, a
  // back-button re-post or a second click on the same emailed link is the same
  // person answering the same question the same way. The first answer stands —
  // re-writing `verified_at` would move a timestamp that is evidence.
  if (claim.verified_at) return { ok: true };

  const { error } = await db
    .from("program_claims")
    .update({
      verified_at: new Date().toISOString(),
      voucher_note: voucher.value,
      updated_at: new Date().toISOString(),
    })
    .eq("id", claim.id)
    // Guards the gap between the read above and this write: two submits
    // racing, only the first lands.
    .is("verified_at", null);

  if (error) {
    console.error("[claim] identity confirmation failed", {
      error: error.message,
    });
    return { ok: false, error: "Something went wrong on our side." };
  }

  // The admin queue shows this claim's Email check column, which just changed.
  revalidatePath("/admin", "layout");
  return { ok: true };
}

/**
 * The `<form action>` wrapper.
 *
 * Exists so the page needs no client component: a plain `<form>` posting to a
 * Server Action works with JavaScript disabled, in a mail client's embedded
 * browser, and on the slow school network this email is most likely to be read
 * on. `confirmClaimIdentity` keeps its own typed `(token, note?)` signature for
 * every other caller — this only unpacks the FormData and decides where the
 * browser lands.
 *
 * It redirects back to the same page rather than to a screen of its own. The
 * page already renders the confirmed state from `verified_at`, so there is one
 * source of truth for "this is done" and a refresh after confirming shows the
 * same thing as opening the link a week later.
 */
export async function confirmClaimIdentityForm(
  formData: FormData,
): Promise<void> {
  const token = String(formData.get("token") ?? "");
  const note = String(formData.get("note") ?? "");

  const result = await confirmClaimIdentity(token, note);

  const params = new URLSearchParams({ token });
  // A code, never the copy — the same rule `/claim/verify/failed` follows. The
  // screen owns the wording, so a hand-edited `?error=` renders ours or
  // nothing, never the sender's. Two codes, because the two failures ask for
  // different things: shorten what you wrote, versus the link is gone.
  if (!result.ok) {
    params.set(
      "error",
      note.trim().length > MAX_VOUCHER_NOTE ? "note" : "link",
    );
  }

  redirect(`/claim/verify-identity?${params}`);
}
