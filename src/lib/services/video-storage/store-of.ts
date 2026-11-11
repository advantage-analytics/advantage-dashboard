/**
 * The store a video is read from, as a pure rule: no SDK, no I/O, so the
 * chooser (`match-video-choice.ts`) can use it and stay testable.
 *
 * `VIDEO_READ_STORE` is the kill switch. `auto` (or unset) reads each copy
 * from the store its row names. `azure` reads everything from Azure: a copy
 * marked as in R2 is looked for in Azure under the same key (a backfilled
 * copy is still there), and where it is not, the player falls through to the
 * upload or the vendor copy as if there were no copy at all.
 * Flip it in Vercel if R2 misbehaves; no redeploy of the worker is needed.
 */

export type VideoStore = "azure" | "r2";

/** True when `VIDEO_READ_STORE=azure` has turned R2 reads off. */
export function r2ReadsDisabled(): boolean {
  return process.env.VIDEO_READ_STORE === "azure";
}

/**
 * `processing_jobs.playback_store` as read: only `r2` is R2, and only while
 * the kill switch is off. Null, `azure` and anything else are Azure.
 */
export function storeOf(value: string | null | undefined): VideoStore {
  return value === "r2" && !r2ReadsDisabled() ? "r2" : "azure";
}
