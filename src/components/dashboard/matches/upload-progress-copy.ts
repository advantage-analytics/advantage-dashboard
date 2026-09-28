/**
 * The words for "a video is uploading", shared by the two screens that say it.
 *
 * The wizard's success screen (`new-match-wizard/UploadMatchSuccess.tsx`) shows
 * them from the tab doing the transfer; the match page's progress panel
 * (`match-detail/match-analysis-progress.tsx`) shows them from the job row while
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
  notes: {
    /** The instruction — first, in the darker ink. */
    keepTabOpen: "Keep this tab open until the upload finishes.",
    /** The reassurance under it, quieter. */
    keepUsing: "You can keep using the dashboard.",
  },
} as const;
