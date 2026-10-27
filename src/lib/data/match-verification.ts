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

export const VERIFIED_BY_ADVANTAGE = "Verified by Advantage";

/** The longest "Something still wrong?" note, read by the form and the action. */
export const MATCH_ISSUE_MAX_LENGTH = 2000;

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
