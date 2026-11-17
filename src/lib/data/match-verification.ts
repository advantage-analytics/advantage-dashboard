/**
 * Verified by Advantage (docs/plans/advantage-review.md): someone at
 * Advantage checked every point of the match against the video. Granted only
 * by Advantage — `verify_match`, service role only, from the label console's
 * Mark complete. A Reopen keeps it (the published points stay until the next
 * publish). That publish takes it off (`unverify_match`) just before it
 * replaces the points, and `verify_match` puts it back once they are in, so a
 * publish that stops part-way leaves the match unverified. The console has no
 * control that removes it on its own.
 *
 * The one reading of `matches.verified` / `verified_at` for display: every
 * loader maps its row through `verificationFor`, and every surface prints
 * `VERIFIED_BY_ADVANTAGE`, so no loader carries copy of its own. "Verified"
 * is the word for this status only; a player's or coach's own fixes say
 * "edited" (step 2).
 */

import { pointScoreLabel } from "@/lib/ui/score-format";
import {
  isInFlight,
  isStatsUnavailable,
  type MatchAnalysis,
} from "@/lib/data/match-analysis";

export const VERIFIED_BY_ADVANTAGE = "Verified by Advantage";

/** What a re-analysis says to the owner of a verified match, and to an admin. */
export const VERIFIED_MATCH_REFUSAL = `This match is ${VERIFIED_BY_ADVANTAGE}, so it can't be analysed again.`;

/** The longest "Something still wrong?" note, read by the form and the action. */
export const MATCH_ISSUE_MAX_LENGTH = 2000;

/**
 * The point a "Tell us" report is about, in the chip's three parts: its
 * number, where it fell ("Set 2 · 4-4 · 30-40" — the point's own scores,
 * server-first as the umpire calls them; one the vendor never read is left
 * out, not zeroed), and how it reads now ("Forehand winner by Lee").
 */
export interface ReportPoint {
  id: string;
  number: number;
  where: string;
  reading: string;
}

export function reportPointOf(
  point: {
    id: string;
    pointNumber: number;
    setNumber: number;
    gameScoreRaw?: string | null;
    pointScoreRaw?: string | null;
  },
  reading: string,
): ReportPoint {
  return {
    id: point.id,
    number: point.pointNumber,
    where: [
      `Set ${point.setNumber}`,
      point.gameScoreRaw,
      point.pointScoreRaw && pointScoreLabel(point.pointScoreRaw),
    ]
      .filter(Boolean)
      .join(" · "),
    reading,
  };
}

/** The chip as one line — what `program_requests.point_label` stores. */
export function reportPointLabel(point: ReportPoint): string {
  return `${point.number} · ${point.where} · ${point.reading}`;
}

/** What the report's popover says was checked (decision D2: points only). */
export const VERIFIED_SCOPE =
  "We checked every point against the video: who won and how it ended.";

/**
 * The report's status while a match waits on a labeller
 * (`showsVerificationPending`), and the two sentences its popover says. No
 * time: the owner decided (2026-11-14) the customer is promised none.
 */
export const VERIFICATION_PENDING = "Verification pending";

export const VERIFICATION_PENDING_SCOPE =
  "We are checking every point against the video: who won and how it ended.";

export const VERIFICATION_PENDING_UNTIL =
  "Until then, your statistics come from the automatic analysis and may change.";

export interface MatchVerification {
  /** When Advantage verified it, ISO (`matches.verified_at`) — a moment. */
  verifiedAt: string;
}

/**
 * The row's status, or null when it is not Verified by Advantage. The check
 * constraint (`matches_verified_provenance`) holds the two columns together;
 * a row read without `verified_at` reads as not verified rather than as a
 * status with no date.
 */
export function verificationFor(row: {
  verified?: boolean | null;
  verified_at?: string | null;
}): MatchVerification | null {
  if (!row.verified || !row.verified_at) return null;
  return { verifiedAt: row.verified_at };
}

/**
 * "Verified Oct 26", on the VIEWER's calendar: `verified_at` is a real
 * moment, and a match verified at 8pm Pacific was verified on the 26th for a
 * player in California, though UTC has reached the 27th.
 *
 * Local time is only safe where the server never renders it, or the server
 * (UTC) and the browser would disagree and React would refuse to hydrate.
 * Its one caller is the report's popover, whose content Radix mounts on
 * click, in the browser. A server-rendered surface wants `shortDate`.
 */
export function verifiedOnLabel(verification: MatchVerification): string {
  const day = new Date(verification.verifiedAt).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
  return `Verified ${day}`;
}

/**
 * One row of `match_label_states()` (migration `20261114205508`): what the
 * customer may know about an unverified match's way to verification. Four
 * columns and no more — no labeller, session id or due time ever reaches a
 * customer type.
 */
export interface MatchLabelState {
  match_id: string;
  /** `processing_jobs.completed_at` of the latest completed job — a moment. */
  results_at: string | null;
  /** Whether that job covers any video (`jobVideoSeconds() > 0`). */
  has_video: boolean;
  /**
   * Whether the match is waiting on a labeller: one holds it, or an admin
   * put it in the labellers' To do (`label_todo`, migration
   * `20261117182112`).
   */
  labelling: boolean;
}

/**
 * "Verification pending": an unverified match that is waiting on a labeller.
 *
 * True only for a match with video that a labeller holds or an admin put in
 * the labellers' To do — the queue's own rule, so the customer is never
 * promised a check nobody chose to do. A missing state — the RPC returned no
 * row, or could not be read — is never pending.
 */
export function verificationPendingFor(
  state:
    | Pick<MatchLabelState, "results_at" | "has_video" | "labelling">
    | null
    | undefined,
): boolean {
  if (!state || !state.has_video) return false;
  return state.labelling;
}

/**
 * Whether a row shows "Verification pending", given what its loader knows.
 *
 * Never on a verified match, never while analysis is in flight (a reprocess
 * can sit in front of an older completed job), and never on a match whose
 * statistics our derivation refused (`isStatsUnavailable`) — there is
 * nothing for a labeller to check against. `analysis` is optional because
 * not every loader can read the job (`processing_jobs` RLS is per-creator);
 * without it, `results_at` being null until a job completes is the guard.
 */
export function showsVerificationPending({
  verification,
  pending,
  analysis,
}: {
  verification: MatchVerification | null | undefined;
  pending: boolean;
  analysis?: Pick<MatchAnalysis, "status" | "recovery"> | null;
}): boolean {
  if (verification || !pending) return false;
  if (
    analysis &&
    (isInFlight(analysis.status) || isStatsUnavailable(analysis))
  ) {
    return false;
  }
  return true;
}
