"use client";

import { RetryActionButton } from "./retry-action-button";

/**
 * "Try again", for a submission that never happened.
 *
 * Only rendered when `isSubmitStalled` says so — an `uploaded` job that has sat
 * still long past the seconds auto-submit takes. Until now that state had no
 * exit: the panel told the player their video was stored and nothing else was
 * needed, which was true of the bytes and false about the analysis, and no
 * reaper touches `uploaded` because the bytes really are safe.
 *
 * ── It sends only the job id ────────────────────────────────────────────────
 * Not the orientation, the ad-scoring flag or the fixed-camera flag. The route
 * reads those back from the row now, which is the entire reason this button can
 * exist: re-asking would mean putting the three questions that silently
 * misattribute every statistic in front of somebody whose only intent was to
 * press retry. The row holds the answers the first attempt used, so the retry
 * reproduces that attempt exactly rather than approximating it.
 *
 * ── No re-upload ────────────────────────────────────────────────────────────
 * The bytes are already in Azure and the job still points at them. This costs
 * the wait, not the transfer.
 */
export function RetrySubmission({ jobId }: { jobId: string }) {
  return (
    <RetryActionButton
      label="Try again"
      pendingLabel="Sending…"
      request={() =>
        fetch("/api/splitstep/jobs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          // The whole payload. See the header.
          body: JSON.stringify({ jobId }),
        })
      }
    />
  );
}
