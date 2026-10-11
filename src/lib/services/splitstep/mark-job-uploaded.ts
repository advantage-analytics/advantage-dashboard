import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * The terminal `uploaded` write for one `processing_jobs` row.
 *
 * Its own module, and pure — no `window`, no `fetch`, no Next imports — because
 * `submit-match-video.ts` touches both and is stubbed wholesale by
 * `tests/fixtures/upload-wizard-hook.ts`, so nothing inside it can be exercised
 * by an offline spec. This can: `tests/splitstep-mark-uploaded.spec.ts`.
 *
 * Why the result is checked at all: this write used to be fire-and-check-never.
 * When it failed the row stayed `uploading` with the bytes already in Azure,
 * `/api/splitstep/jobs` answered 409 ("still uploading") to the auto-submit,
 * and nothing moved until `reap_stalled_uploads()` failed the job
 * later. One retry covers a transient blip; anything longer is the caller's to
 * report.
 *
 * Keyed on the job id — never `match_id`, which touches every job a
 * resubmitted match has ever had (`docs/ui-revamp-guardrails.md` §3.1).
 */

export type MarkJobUploadedResult = { ok: true } | { ok: false; error: string };

export interface MarkJobUploadedInput {
  /** `processing_jobs.id` — the row the wizard inserted. */
  jobId: string;
  /** The blob name `/api/splitstep/upload-url` handed back. */
  videoObjectKey: string;
}

/** One initial attempt plus one retry. */
const ATTEMPTS = 2;

export async function markJobUploaded(
  supabase: Pick<SupabaseClient, "from">,
  { jobId, videoObjectKey }: MarkJobUploadedInput,
): Promise<MarkJobUploadedResult> {
  let lastError = "Could not mark the video as uploaded";

  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    const { data, error } = await supabase
      .from("processing_jobs")
      .update({
        video_object_key: videoObjectKey,
        status: "uploaded",
        // Explicitly 100. The progress throttle skips the final write — 99→100
        // is a 1-point move and the last block rarely takes 60 seconds — so
        // without this the bar sits at 99 forever.
        upload_progress_percent: 100,
        updated_at: new Date().toISOString(),
      })
      .eq("id", jobId)
      // Only a job that is still uploading. A row the reaper failed while the
      // tab slept, and that a second upload has since replaced, must not be
      // flipped back to `uploaded` — `job-liveness.ts` is where a reaped job
      // is taken back, before the commit, and only when nothing replaced it.
      .in("status", ["pending", "uploading"])
      .select("id");

    if (!error && (data?.length ?? 0) > 0) return { ok: true };
    if (error) {
      lastError = error.message || lastError;
      continue;
    }
    // No row matched. Either the job is no longer uploading, or an earlier
    // attempt landed and only its response was lost — in which case the row
    // already says `uploaded`, and reporting a failure would have the caller
    // mark a committed video failed.
    const { data: now } = await supabase
      .from("processing_jobs")
      .select("status")
      .eq("id", jobId)
      .maybeSingle();
    if (now?.status === "uploaded") return { ok: true };
    lastError = "This upload is no longer the match's current one";
  }

  return { ok: false, error: lastError };
}
