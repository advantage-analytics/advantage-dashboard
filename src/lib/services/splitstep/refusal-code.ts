/**
 * Maps a `/api/splitstep/jobs` submit-refusal HTTP status to the
 * `processing_jobs.error_code` worth recording for it.
 *
 * Split out of `submit-match-video.ts` (which re-exports this) so a spec can
 * import a pure function without dragging in that file's browser-only
 * dependencies (`azure-block-upload`, `lib/video/trim`).
 *
 * The codes line up with `classifyFailure()`'s rule 1 in
 * `src/lib/data/match-analysis.ts`: a stalled `uploaded` row with one of
 * `SUBMIT_WAIT_CODES` (`QUOTA_EXCEEDED`, `NOT_ELIGIBLE`, ...) classifies as
 * `wait_or_ask` — a refusal that clears on its own — while any other code,
 * including `INVALID_METADATA` and `NOT_CONFIGURED` below, classifies as a
 * free `retry`. Any status not listed here (409, 500, 502, 200, ...) returns
 * `null` and leaves `error_code` untouched.
 */
export function refusalCodeFor(status: number): string | null {
  switch (status) {
    case 429:
      return "QUOTA_EXCEEDED";
    case 403:
      return "NOT_ELIGIBLE";
    case 422:
      return "INVALID_METADATA";
    case 503:
      return "NOT_CONFIGURED";
    default:
      return null;
  }
}
