/**
 * Which stored file a match plays, and where points land in it.
 *
 * Pure (the blob existence check is injected) so the rule can be tested
 * without Azure. The server loader is `match-video-server.ts`.
 *
 * ── The three kinds of file ─────────────────────────────────────────────────
 * - `playback_object_key` — the playback copy the Azure worker makes of OUR
 *   file (`playback-copy.ts`): the upload with its index moved to the front,
 *   or re-encoded to H.264 ≤1080p with a keyframe every 2 s. Same timeline as
 *   the upload, with its audio. Preferred by every player once `ready`.
 * - `video_object_key` — OUR file: the athlete's upload, which since September
 *   2026 is cut to the selected window in the browser before upload. It keeps
 *   the original bitrate and the audio. Preferred whenever the blob exists.
 * - `trimmed_object_key` — the vendor's re-encode of the window, about 2 Mbps,
 *   copied into our container by the webhook (`vendor-archive.ts`) before the
 *   vendor's 7-day link expires. Older jobs, and any whose copy missed, have
 *   none. It can be silent.
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
  /** Absent on a loader that does not read them: no copy. */
  playback_object_key?: string | null;
  playback_status?: string | null;
}

/** The columns `choosePlaybackFile` reads, for a loader's select. */
export const PLAYBACK_JOB_COLUMNS =
  "video_object_key, trimmed_object_key, start_time_seconds, playback_object_key, playback_status";

export interface PlaybackChoice {
  blobName: string;
  /** Seconds to subtract from `points.video_time` to seek in this file. */
  startTimeSeconds: number;
  source: "playback" | "upload" | "vendor-copy";
}

/**
 * @param jobs The match's jobs, NEWEST FIRST — a resubmitted match's newest
 *   job is the analysis the page is showing.
 * @param prefer Which file to try after a ready playback copy, which always
 *   wins. `"upload"` (the default) is the rule above. `"vendor-copy"` is the
 *   admin labelling console's while a job has no copy yet: an upload that
 *   skipped the browser re-encode can run 8–20 Mbps, more than a link to the
 *   Canada East container carries, where the vendor's runs near 2. The vendor
 *   copy is checked for existence too, since older jobs and missed copies have
 *   no blob, and our upload is the fallback.
 */
export async function choosePlaybackFile(
  jobs: PlaybackJobRow[],
  blobExists: (blobName: string) => Promise<boolean>,
  prefer: PlaybackChoice["source"] = "upload",
): Promise<PlaybackChoice | null> {
  for (const job of jobs) {
    const copyKey = playbackCopyFor(job, jobs);
    if (copyKey && (await blobExists(copyKey))) {
      return {
        blobName: copyKey,
        startTimeSeconds: 0,
        source: "playback",
      };
    }
    const vendorCopy = job.trimmed_object_key
      ? vendorCopyChoice(job.trimmed_object_key, job.start_time_seconds)
      : null;
    if (
      prefer === "vendor-copy" &&
      vendorCopy &&
      (await blobExists(vendorCopy.blobName))
    ) {
      return vendorCopy;
    }
    if (job.video_object_key && (await blobExists(job.video_object_key))) {
      return {
        blobName: job.video_object_key,
        startTimeSeconds: 0,
        source: "upload",
      };
    }
    if (prefer === "upload" && vendorCopy) return vendorCopy;
  }
  return null;
}

/**
 * The ready playback copy of this job's upload: its own, or else one another
 * job made of the SAME upload. The worker copies an upload once, onto the job
 * that uploaded it; a resubmission reuses `video_object_key` and never gets a
 * copy of its own. Without this, Cj v Summer's newest job fell through to the
 * raw upload — index at the end of a 614 MB file — while an identical copy sat
 * on the job before it. Same bytes, same timeline, so the offset is still 0.
 */
function playbackCopyFor(
  job: PlaybackJobRow,
  jobs: PlaybackJobRow[],
): string | null {
  const ready = (row: PlaybackJobRow) =>
    row.playback_status === "ready" && row.playback_object_key
      ? row.playback_object_key
      : null;
  const own = ready(job);
  if (own || !job.video_object_key) return own;
  for (const other of jobs) {
    if (other.video_object_key !== job.video_object_key) continue;
    const shared = ready(other);
    if (shared) return shared;
  }
  return null;
}

function vendorCopyChoice(
  blobName: string,
  startTimeSeconds: PlaybackJobRow["start_time_seconds"],
): PlaybackChoice {
  const start = Number(startTimeSeconds ?? 0);
  return {
    blobName,
    startTimeSeconds: Number.isFinite(start) && start > 0 ? start : 0,
    source: "vendor-copy",
  };
}

/** The two columns `analysedWindowSeconds` reads off a job row. */
export interface AnalysedWindowJobRow {
  start_time_seconds: number | string | null;
  end_time_seconds: number | string | null;
}

/**
 * How long the analysed stretch of a video match lasted, in whole seconds, or
 * `null` when no job says.
 *
 * The upload wizard stores `matches.duration` for a SwingVision export (read
 * from the file) but writes 0 for a video match, so the report's scoreboard
 * had no clock. The job's window — the part of the video the player marked as
 * the match, from `start_time_seconds` to `end_time_seconds` — is that length:
 * where a video match does carry a stored duration, it equals this window.
 *
 * @param jobs The match's COMPLETED jobs, NEWEST FIRST. The first one with a
 *   positive window answers; a zero or unreadable window is skipped.
 */
export function analysedWindowSeconds(
  jobs: AnalysedWindowJobRow[],
): number | null {
  for (const job of jobs) {
    const start = Number(job.start_time_seconds ?? Number.NaN);
    const end = Number(job.end_time_seconds ?? Number.NaN);
    if (!Number.isFinite(start) || !Number.isFinite(end)) continue;
    const seconds = Math.round(end - Math.max(start, 0));
    if (seconds > 0) return seconds;
  }
  return null;
}
