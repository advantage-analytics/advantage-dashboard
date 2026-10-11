/**
 * The words for "a video is uploading", shared by the two screens that say it.
 *
 * The wizard's success screen (`new-match-wizard/UploadMatchSuccess.tsx`) shows
 * them from the tab doing the transfer; the match page's analysis column
 * (`match-detail/analysis-steps-column.tsx`) shows them from the job row while
 * its status is `uploading`. A player who follows "View match" mid-upload lands
 * on the second after reading the first, so the two must read the same — and
 * the only way they cannot drift is one copy both import.
 *
 * Only the uploading wording lives here. The wizard's "Preparing your video" /
 * "Trimming video" variant is client-local (the trim runs in that tab and never
 * reaches the database), so the match page can never show it.
 */
export const UPLOADING_COPY = {
  title: "Uploading your video",
  steps: {
    saved: "Match saved",
    video: "Uploading video",
    analysis: "Analysis",
  },
  /** The progress bar's accessible name. */
  trackLabel: "Video upload",
  /**
   * One strip, drawn by `UploadKeepOpenNote`: the instruction leads in medium
   * weight, then what ignoring it costs, then the reassurance.
   */
  notes: {
    /** The instruction — the strip's lead sentence. */
    keepTabOpen:
      "Keep this tab open and your computer awake until the upload finishes.",
    /** What it costs when either happens. */
    ifItStops:
      "If the tab closes or the computer sleeps, the video stops and has to be uploaded again.",
    /** The reassurance — only where leaving the screen is safe. */
    keepUsing: "You can keep using the dashboard.",
  },
} as const;
