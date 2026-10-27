/**
 * Verified by Advantage (docs/plans/advantage-review.md): someone at
 * Advantage checked every point of the match against the video. Granted only
 * by Advantage — `verify_match`, service role only, from the label console's
 * Mark complete — and removed by its Reopen (`unverify_match`).
 *
 * The one reading of `matches.verified` / `verified_at` for display: every
 * loader maps its row through `verificationFor`, and every surface prints
 * `VERIFIED_BY_ADVANTAGE`, so no loader carries copy of its own. "Verified"
 * is the word for this status only; a player's or coach's own fixes say
 * "edited" (step 2).
 */

import { shortDate } from "@/lib/data/match-utils";

export const VERIFIED_BY_ADVANTAGE = "Verified by Advantage";

/** What the report's popover says was checked (decision D2: points only). */
export const VERIFIED_SCOPE =
  "We checked every point against the video: who won and how it ended.";

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
 * "Verified Oct 26". `verified_at` is a real moment, so `shortDate` — pinned
 * to UTC, so the server's render and the browser's agree.
 */
export function verifiedOnLabel(verification: MatchVerification): string {
  return `Verified ${shortDate(verification.verifiedAt)}`;
}
