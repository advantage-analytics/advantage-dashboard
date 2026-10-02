/**
 * Whether a picked video gets cut before upload, and what the job row says
 * afterwards. Pure, so the rules are testable without a browser.
 *
 * ── Why we cut it ourselves ─────────────────────────────────────────────────
 * The vendor's "trimmed" video is a 2.2 Mbps re-encode that arrived with no
 * audio track on the first real match, and the pipeline used to swap our
 * original for it. Now the browser cuts the selected window out of the
 * athlete's own file WITHOUT re-encoding (a remux: same frames, same audio,
 * same resolution and frame rate), and that file is the one we store, send to
 * the vendor, and play back.
 *
 * ── When we don't ───────────────────────────────────────────────────────────
 * Every "skip" uploads the original untouched and sends the vendor the window
 * as before, which is exactly the pre-trim behaviour. A skip is never an
 * error: the upload still happens, it is just larger.
 */

/** Handles this close to either end of the clip count as "not trimmed". */
export const WHOLE_CLIP_TOLERANCE_SECONDS = 0.5;

export type TrimSkipReason =
  /** The window is the whole clip; a remux would copy every byte for nothing. */
  | "whole-clip"
  /** No Origin Private File System (or no sync access handles in workers). */
  | "no-opfs"
  /** Not enough browser storage quota to hold the cut copy. */
  | "no-quota"
  /** The container can't be read, or a video/audio track can't be copied into MP4. */
  | "unsupported"
  /** Anything else the remux threw. Logged; the original is uploaded. */
  | "failed";

export type TrimDecision =
  | { kind: "remux"; startSeconds: number; endSeconds: number }
  | { kind: "skip"; reason: TrimSkipReason };

export interface TrimInputs {
  startSeconds: number;
  endSeconds: number;
  /** The clip's own duration, as the remuxer measured it. */
  sourceDurationSeconds: number;
  fileSizeBytes: number;
  opfsAvailable: boolean;
  /** Free quota in bytes, or null when the browser won't say. */
  quotaFreeBytes: number | null;
}

export function decideTrim(input: TrimInputs): TrimDecision {
  const start = Math.max(0, input.startSeconds);
  const end = Math.min(input.sourceDurationSeconds, input.endSeconds);

  const wholeClip =
    start <= WHOLE_CLIP_TOLERANCE_SECONDS &&
    end >= input.sourceDurationSeconds - WHOLE_CLIP_TOLERANCE_SECONDS;
  if (!(end > start) || wholeClip)
    return { kind: "skip", reason: "whole-clip" };

  if (!input.opfsAvailable) return { kind: "skip", reason: "no-opfs" };

  // The cut copy is at most the kept share of the file, plus container slack.
  // Unknown quota is allowed through: the write fails cleanly if it's short,
  // and that failure falls back to the original like any other.
  const share = (end - start) / input.sourceDurationSeconds;
  const needed = input.fileSizeBytes * share * 1.05;
  if (input.quotaFreeBytes !== null && input.quotaFreeBytes < needed) {
    return { kind: "skip", reason: "no-quota" };
  }

  return { kind: "remux", startSeconds: start, endSeconds: end };
}

/**
 * The window the job row must carry once the file IS the cut.
 *
 * The vendor now receives a file that starts at the selected moment, so the
 * window it analyses is the whole file: StartTime 0, EndTime = its length. The
 * point timestamps it returns are then seconds into THIS file, which is also
 * the file the film room plays — so the playback offset is 0.
 */
export function remuxedJobWindow(durationSeconds: number): {
  start_time_seconds: number;
  end_time_seconds: number;
  billable_seconds: number;
} {
  const duration = Math.max(0, durationSeconds);
  return {
    start_time_seconds: 0,
    end_time_seconds: duration,
    billable_seconds: Math.ceil(duration),
  };
}

/** "match.mov" → "match.trimmed.mp4": the cut is always MP4. */
export function remuxedFileName(originalName: string): string {
  const base = originalName.replace(/\.[^./\\]+$/, "");
  return `${base || "video"}.trimmed.mp4`;
}
