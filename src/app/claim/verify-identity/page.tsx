import Link from "next/link";
import { Check } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import { programDisplayName } from "@/lib/data/programs-server";
import { claimRoleLabel } from "@/lib/services/programs/claim-roles";
import {
  MAX_VOUCHER_NOTE,
  hashVerificationToken,
  verificationIsUsable,
} from "@/lib/services/programs/claim-verification";
import { advField } from "@/lib/ui/adv-field";
import {
  ClaimShell,
  ClaimHeading,
  ClaimActions,
  CLAIM_BUTTON,
  CLAIM_LABEL,
  CLAIM_LINK,
  CLAIM_MICRO,
} from "@/components/claim/claim-shell";
import { confirmClaimIdentityForm } from "./actions";

export const metadata = { title: "Confirm it's you" };

/**
 * "Are you this program's head coach?" — the page the verification email opens.
 *
 * Reached only from a link an admin sent by hand from the review queue, when a
 * claim carried nothing decidable: no domain match, no recorded staff contact.
 * `sendClaimVerification()` (`services/programs/admin-actions.ts`) is the other
 * end of this.
 *
 * ── What this GET is allowed to do ──────────────────────────────────────────
 * Stamp `verification_opened_at`, once, if it is null. Nothing else. The
 * confirmation itself is a Server Action — POST only — for the reason written
 * out in `actions.ts`: this URL arrives in an inbox, and inboxes are full of
 * things that fetch links without a person involved. Safe Links, mail
 * scanners, the browser's prefetcher. A GET that could vouch for someone's
 * identity would be vouched for by a spam filter.
 *
 * That leaves `verification_opened_at` itself somewhat generous — a scanner
 * can stamp it — which is exactly why it is a signal for the admin's queue and
 * never a permission. `verified_at` is the one that means anything.
 *
 * ── The service-role client, on an unauthenticated page ─────────────────────
 * Deliberate, and the same shape as `/claim/verify`. The recipient has no
 * account here and may never have one — that is the point of asking THEM
 * rather than the claimant. The token is the whole authorization, so RLS has
 * no session to scope by; the lookup is by hash equality, selects five
 * columns, and nothing about the row reaches the page that the email did not
 * already say out loud.
 *
 * ── Three states, one route ─────────────────────────────────────────────────
 *   confirmed   `verified_at` is set. The ending, and what a re-visit shows.
 *   expired     no token, no row, or past the seventh day — one answer, in the
 *               register of `/claim/verify/failed`.
 *   asking      the question, with an optional note.
 */
export default async function VerifyIdentityPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; error?: string }>;
}) {
  const { token, error } = await searchParams;
  const presented = token?.trim();

  if (!presented) return <LinkIsDead />;

  const db = createAdminClient();
  const { data: claim } = await db
    .from("program_claims")
    .select(
      "id, program_id, claimant_role, verification_sent_at, verification_opened_at, verified_at",
    )
    .eq("verification_token_hash", hashVerificationToken(presented))
    .maybeSingle();

  // Unknown token and expired token render identically. Distinguishing them
  // would answer "does this token exist" for anyone who asks.
  if (
    !claim ||
    !verificationIsUsable({
      verificationSentAt: claim.verification_sent_at as string | null,
    })
  ) {
    return <LinkIsDead />;
  }

  const { data: program } = await db
    .from("programs")
    .select("school_name, team")
    .eq("id", claim.program_id)
    .maybeSingle();

  const programName = program
    ? programDisplayName(
        program.school_name as string,
        (program.team as string | null) ?? null,
      )
    : "this program";
  const claimantTitle = claimRoleLabel(claim.claimant_role as string);

  // Once, if null — and guarded in the WHERE clause rather than by the read
  // above, so a second tab opening the same link a moment later cannot move a
  // timestamp that is meant to record the FIRST open. A failure here is
  // swallowed on purpose: this is a signal for the admin's queue, and losing
  // it is not a reason to refuse somebody the question they came to answer.
  if (!claim.verification_opened_at) {
    await db
      .from("program_claims")
      .update({ verification_opened_at: new Date().toISOString() })
      .eq("id", claim.id)
      .is("verification_opened_at", null);
  }

  if (claim.verified_at) {
    return (
      <ClaimShell width={720} gap={20} exitHref="/" exitLabel="Close">
        <Check
          className="size-5 text-[var(--viz-good)]"
          strokeWidth={1.5}
          aria-hidden="true"
        />
        <ClaimHeading
          gap={6}
          eyebrow={programName}
          title="Thanks — that's confirmed"
          titlePadTop={4}
          body={`We've recorded that you're ${programName}'s ${claimantTitle.toLowerCase()}. There's nothing else to do, and we won't write to you about this again.`}
          bodyMax="58ch"
        />
        <span className={CLAIM_MICRO}>
          You can close this page. If something about this looks wrong, reply to
          the email we sent — a person reads it.
        </span>
      </ClaimShell>
    );
  }

  return (
    <ClaimShell width={720} gap={20} exitHref="/" exitLabel="Close">
      <ClaimHeading
        gap={6}
        eyebrow={programName}
        title={`Are you ${programName}'s ${claimantTitle}?`}
        titlePadTop={4}
        body={`Someone is setting up ${programName} on Advantage Analytics — a match analysis tool for collegiate programs — as its ${claimantTitle.toLowerCase()}, using this address. Confirming is the whole check.`}
        bodyMax="58ch"
      />

      <form action={confirmClaimIdentityForm} className="flex flex-col gap-5">
        <input type="hidden" name="token" value={presented} />

        <div>
          <label htmlFor="note" className={CLAIM_LABEL}>
            Anything we should know? (optional)
          </label>
          {/* The underline field, not the boxed one: this screen asks one
              question and the field is an aside to it. `data-focus-ring="none"`
              is added by hand for the reason `adv-field.ts` spells out — this
              control's own rule thickens and turns blue on focus, which IS the
              indicator, and a ring on top would be decoration. */}
          <textarea
            id="note"
            name="note"
            rows={2}
            maxLength={MAX_VOUCHER_NOTE}
            data-focus-ring="none"
            placeholder="I'm the head coach — happy for them to run it."
            className={`${advField("underline")} h-auto w-full resize-none py-1.5 leading-[1.55]`}
          />
        </div>

        {error && (
          <p className="rounded-[var(--radius-button)] bg-[rgba(229,24,55,0.08)] px-3 py-2 text-[12px] text-[#E51837]">
            {error === "note"
              ? `That note is too long — please keep it under ${MAX_VOUCHER_NOTE} characters.`
              : "That link is no longer valid. It may have expired, or a newer one was sent."}
          </p>
        )}

        <ClaimActions>
          <button type="submit" className={CLAIM_BUTTON}>
            Confirm it&apos;s me
          </button>
          <span className={CLAIM_MICRO}>
            Not expecting this? Close the page — nothing happens unless you
            confirm.
          </span>
        </ClaimActions>
      </form>
    </ClaimShell>
  );
}

/**
 * Expired, unknown, or no token at all — one screen, in the register of
 * `/claim/verify/failed`: what happened, whether anything was lost, and the
 * one thing that moves it forward. It is a sibling of that page rather than a
 * redirect into it, because every `ClaimFailure` code there is about finishing
 * a claim of your own, and this reader is not the claimant.
 */
function LinkIsDead() {
  return (
    <ClaimShell width={720} gap={20} exitHref="/" exitLabel="Close">
      <ClaimHeading
        gap={6}
        title="That link is no longer valid"
        body="These links last seven days, and a newer one replaces an older one. Nothing was recorded, and nothing is waiting on you."
        bodyMax="58ch"
      />
      <ClaimActions>
        <Link href="/" className={CLAIM_BUTTON}>
          Go to Advantage
        </Link>
        <Link href="/claim/program" className={CLAIM_LINK}>
          Find your program
        </Link>
      </ClaimActions>
      <span className={CLAIM_MICRO}>
        If you were asked to confirm something and still need to, reply to the
        email we sent you and we&apos;ll send a fresh link.
      </span>
    </ClaimShell>
  );
}
