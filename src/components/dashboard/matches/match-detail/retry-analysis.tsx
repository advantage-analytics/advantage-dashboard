"use client";

import { RetryActionButton } from "./retry-action-button";

/**
 * "Retry analysis", for a job the provider FAILED.
 *
 * The sibling of RetrySubmission, for the other recovery class: that one
 * re-submits a job whose hand-off never happened (same row, still `uploaded`);
 * this one asks the resubmit endpoint for a fresh attempt at a job the vendor
 * accepted and then failed. The endpoint creates a new job row linked to this
 * one and re-runs the submission from the stored video — nothing needs
 * uploading again, and none of the three silently-misattributing questions
 * get re-asked, because the failed row already holds the answers.
 *
 * Refusals — the attempt ceiling, an analysis already in progress, a video no
 * longer stored, an exhausted monthly allowance — surface verbatim through
 * the shared button.
 */
export function RetryAnalysis({ jobId }: { jobId: string }) {
  return (
    <RetryActionButton
      label="Retry analysis"
      pendingLabel="Retrying…"
      request={() =>
        fetch(`/api/splitstep/jobs/${jobId}/resubmit`, { method: "POST" })
      }
    />
  );
}
