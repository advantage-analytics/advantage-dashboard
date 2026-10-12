import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Is this upload's job still the one the tab should be finishing?
 *
 * Its own module, and pure — no `window`, no `fetch` — for the reason
 * `mark-job-uploaded.ts` is: `submit-match-video.ts` is stubbed wholesale by
 * the wizard's hook fixture, so nothing inside it can be exercised offline.
 *
 * ── Why a running upload has to ask ─────────────────────────────────────────
 * An upload's job can be failed underneath a tab that is still holding the
 * file: the person chose "Upload the video again" for a paused upload on
 * another screen or device, or the upload sat quiet for six hours and
 * `reap_stalled_uploads()` ended it. When that tab's computer wakes, it would
 * simply carry on.
 *
 * Beside a second upload that is destructive. A blob is named per MATCH and
 * its block ids per index, so two uploads of one match write into the same
 * staging area: a resumed tab overwrites the newer upload's blocks, and
 * whichever commits its block list last publishes a mix of both files. The
 * person who just chose to upload again is exactly the one with a second
 * upload running.
 *
 * So once its job is `failed`, an upload is over, whatever the tab still
 * holds. It asks before it requests an upload URL, before a block goes out
 * after any pause, and before the commit — and stops.
 *
 * A job that is merely quiet is NOT failed. It stays `uploading` and reads as
 * paused (`isUploadPaused()`), precisely so that a tab which wakes up can
 * finish what it started.
 *
 * There is deliberately no taking a failed job back. Whether that is safe
 * depends on whether ANY other upload touched the match's blob in the
 * meantime, including one that has since finished or failed, and a client
 * cannot see another member's job through RLS to find out.
 */

export type JobLiveness =
  /** Go on. Includes a job past `uploading` — nothing here to protect. */
  | "live"
  /** The job has failed, or no longer exists: stop, and do not commit. */
  | "superseded"
  /** The read failed. Not evidence either way; a blip must not kill an upload. */
  | "unknown";

export async function ensureJobLive(
  supabase: Pick<SupabaseClient, "from">,
  jobId: string,
): Promise<JobLiveness> {
  const { data, error } = await supabase
    .from("processing_jobs")
    .select("status")
    .eq("id", jobId)
    .maybeSingle();
  if (error) return "unknown";
  // No row and no error: the job is gone — the match was deleted, and its
  // jobs with it. There is nothing left to upload a video for.
  if (!data) return "superseded";
  return data.status === "failed" ? "superseded" : "live";
}

/** What the tab says when it stops for this reason. */
export const SUPERSEDED_UPLOAD_MESSAGE =
  "This upload was ended while its tab was away. Upload the video again from the match page.";
