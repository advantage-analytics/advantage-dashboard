/**
 * Whether a match's errors are split into unforced and forced — the one
 * reading of that question, for every surface that prints an error count.
 *
 * - A SwingVision match is always judged: the export calls every error itself,
 *   and `match_stats.forced_errors` carries its count.
 * - A video (Advantage Intelligence) match is judged only once Advantage has
 *   verified it AND judged its errors (`matches.errors_judged_at`). Both, not
 *   the marker alone: Reopen (`unverify_match`) clears `verified` but leaves
 *   the marker, and a reopened match must drop back to plain "Errors" until it
 *   is verified again.
 * - Everything else — an unverified video match, or one verified before error
 *   judging existed (marker null) — is not judged: its "unforced" count is
 *   every error, and the report says "Errors".
 *
 * `verified` is the caller's reading of `verificationFor(row) != null`
 * (`match-verification.ts`), so a row with `verified` but no `verified_at`
 * reads as not verified here too. Provider values are `"swing-vision"`
 * (process-match) and `"splitstep"` (`services/splitstep/config.ts`) — never
 * `"swingvision"`.
 */
export function errorSplitJudged(row: {
  sourceProvider?: string | null;
  verified?: boolean | null;
  errorsJudgedAt?: string | null;
}): boolean {
  if (row.sourceProvider === "swing-vision") return true;
  return row.verified === true && row.errorsJudgedAt != null;
}
