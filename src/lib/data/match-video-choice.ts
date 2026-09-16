/**
 * Which stored file a match plays, and where points land in it.
 *
 * Pure (the blob existence check is injected) so the rule can be tested
 * without Azure. The server loader is `match-video-server.ts`.
 *
 * ── The two kinds of file ───────────────────────────────────────────────────
 * - `video_object_key` — OUR file: the athlete's upload, which since September
 *   2026 is cut to the selected window in the browser before upload. It keeps
 *   the original bitrate and the audio. Preferred whenever the blob exists.
 * - `trimmed_object_key` — the vendor's re-encode of the window, copied in by
 *   the webhook until that was retired. Only older matches whose original was
 *   deleted by the (also retired) reclaim have nothing else. It can be silent.
 *
 * ── The clock ───────────────────────────────────────────────────────────────
 * `points.video_time` is seconds into the file the vendor analysed, plus the
 * job's `start_time_seconds` (added at ingest). So:
 * - our file starts where the vendor's analysis clock starts from — for a cut
 *   upload the window is [0, length] and for an uncut original the window is
 *   original-relative like `video_time` — so the offset is 0;
 * - the vendor's re-encode starts at `start_time_seconds`, so that is the
 *   offset to subtract.
 */

export interface PlaybackJobRow {
  video_object_key: string | null;
  trimmed_object_key: string | null;
  start_time_seconds: number | string | null;
}

export interface PlaybackChoice {
  blobName: string;
  /** Seconds to subtract from `points.video_time` to seek in this file. */
  startTimeSeconds: number;
  source: "upload" | "vendor-copy";
}

/**
 * @param jobs The match's jobs, NEWEST FIRST — a resubmitted match's newest
 *   job is the analysis the page is showing.
 */
export async function choosePlaybackFile(
  jobs: PlaybackJobRow[],
  blobExists: (blobName: string) => Promise<boolean>,
): Promise<PlaybackChoice | null> {
  for (const job of jobs) {
    if (job.video_object_key && (await blobExists(job.video_object_key))) {
      return {
        blobName: job.video_object_key,
        startTimeSeconds: 0,
        source: "upload",
      };
    }
    if (job.trimmed_object_key) {
      const start = Number(job.start_time_seconds ?? 0);
      return {
        blobName: job.trimmed_object_key,
        startTimeSeconds: Number.isFinite(start) && start > 0 ? start : 0,
        source: "vendor-copy",
      };
    }
  }
  return null;
}
