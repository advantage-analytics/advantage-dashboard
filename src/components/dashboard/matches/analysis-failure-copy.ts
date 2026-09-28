/**
 * What a failed analysis says, per failure status.
 *
 * The two statuses are different failures and must not share copy:
 *
 * - `failed` — the video provider could not analyze the video. A retry
 *   resubmits the same upload, and a new recording is a real way out.
 * - `derivation_failed` — the video was analyzed fine, but the rallies it
 *   found could not be reconciled with the final score the player entered.
 *   Retrying the video or re-shooting it would not help, so this copy offers
 *   neither.
 *
 * Customer-facing strings only: never name the vendor here (guardrails §2).
 */
export const ANALYSIS_FAILURE_COPY = {
  derivation_failed: {
    title: "Analyzed, but the score couldn't be read cleanly",
    body: "The rallies found in your video couldn't be matched point by point to the final score you entered, so no statistics were saved for this match.",
  },
  failed: {
    /** Headline when the job carries no end-user message of its own. */
    title: "Analysis stopped",
    /** The match page's progress card. */
    body: "Retrying uses the video you already uploaded — nothing needs uploading again. If it keeps failing, trim to a window where the camera stays fixed, or upload a new recording.",
    uploadLink: "Upload a new recording",
    /** The matches drawer: with a retry available, and without. */
    drawer: {
      retry:
        "Retrying uses the video you already uploaded. Nothing needs uploading again.",
      details: "The match page has the details.",
    },
    /**
     * `failed` jobs where the video itself didn't meet a recording
     * requirement (bad fps, resolution, etc). Retrying would resubmit the
     * same unusable video and fail the same way, so this offers no retry —
     * only a new recording.
     */
    inputRejected: {
      body: "This video didn't meet one of the recording requirements, so analyzing it again would stop the same way. Upload a new recording that meets them.",
      drawer:
        "This video didn't meet one of the recording requirements. Upload a new recording that meets them.",
    },
  },
} as const;
