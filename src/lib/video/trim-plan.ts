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
 * ── The one re-encode ───────────────────────────────────────────────────────
 * A file that is not H.264, or is above 1080p (`normaliseReason()`), is
 * re-encoded to 1080p H.264 on the way through, at its own frame rate — even
 * when the window is the whole clip. Phones write 4K HEVC by default; the
 * uploader's browser decodes it, a viewer's often cannot, and the vendor's GPU
 * ran out of memory on one (Rhodri v Bao, 2026-10-08). The result is still the
 * one file we store, send and play, so no clock moves. Never below 1080p: that
 * is the vendor's floor.
 *
 * ── When we don't ───────────────────────────────────────────────────────────
 * Every "skip" uploads the original untouched and sends the vendor the window
 * as before, which is exactly the pre-trim behaviour. A skip is never an
 * error: the upload still happens, it is just larger.
 */

import type { NormaliseReason } from "@/lib/match-video/playback-format";
import { MAX_VIDEO_SIZE_BYTES } from "@/lib/services/splitstep/config";

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
  /** The file needs re-encoding and this browser cannot decode or encode it. */
  | "no-encoder"
  /** Anything else the remux threw. Logged; the original is uploaded. */
  | "failed";

export type TrimDecision =
  | { kind: "remux"; startSeconds: number; endSeconds: number }
  | {
      kind: "transcode";
      startSeconds: number;
      endSeconds: number;
      /** Video bitrate to encode at, in bits per second. */
      videoBitrate: number;
    }
  | { kind: "skip"; reason: TrimSkipReason };

/** How a prepared file was made. A transcode is also cut to its window. */
export type PreparedMode = "remux" | "transcode";

/**
 * 1080p H.264 targets: several times what ball tracking has been fine on (most
 * stored matches are ~2 Mbps) and a fraction of a 4K source. A match up to
 * about two hours gets the full rate; a longer one gives some up to stay under
 * the upload limit (`TRANSCODE_MAX_OUTPUT_BYTES`).
 */
export const TRANSCODE_BITRATE_30FPS = 6_000_000;
export const TRANSCODE_BITRATE_60FPS = 8_000_000;
/** Above this a clip is treated as high frame rate (50 and 60 fps footage). */
const HIGH_FRAME_RATE = 40;
/** Audio and container overhead allowed for on top of the video bitrate. */
const TRANSCODE_OVERHEAD_BITRATE = 320_000;
/** The re-encode must still fit the upload limit, with room to spare. */
const TRANSCODE_MAX_OUTPUT_BYTES = MAX_VIDEO_SIZE_BYTES * 0.9;

export function transcodeVideoBitrate(frameRate: number | null): number {
  return frameRate !== null && frameRate > HIGH_FRAME_RATE
    ? TRANSCODE_BITRATE_60FPS
    : TRANSCODE_BITRATE_30FPS;
}

export interface TrimInputs {
  startSeconds: number;
  endSeconds: number;
  /** The clip's own duration, as the remuxer measured it. */
  sourceDurationSeconds: number;
  fileSizeBytes: number;
  opfsAvailable: boolean;
  /** Free quota in bytes, or null when the browser won't say. */
  quotaFreeBytes: number | null;
  /**
   * Why the file must be re-encoded, from `normaliseReason()`; null or absent
   * for a file that is already 1080p-or-less H.264.
   */
  normalise?: NormaliseReason | null;
  /** The source's average frame rate, when the container gives one. */
  frameRate?: number | null;
}

export function decideTrim(input: TrimInputs): TrimDecision {
  const start = Math.max(0, input.startSeconds);
  const end = Math.min(input.sourceDurationSeconds, input.endSeconds);

  const wholeClip =
    start <= WHOLE_CLIP_TOLERANCE_SECONDS &&
    end >= input.sourceDurationSeconds - WHOLE_CLIP_TOLERANCE_SECONDS;

  if (input.normalise && end > start) {
    if (!input.opfsAvailable) return { kind: "skip", reason: "no-opfs" };
    // The window as asked, even when it is the whole clip to within the
    // tolerance: callers place their own clocks from the start they requested
    // (the attachment flow's `marked − start`), so the file must begin there.
    // A very long match gives up bitrate before it gives up the upload.
    const ceiling =
      (TRANSCODE_MAX_OUTPUT_BYTES * 8) / (end - start) -
      TRANSCODE_OVERHEAD_BITRATE;
    const videoBitrate = Math.floor(
      Math.min(transcodeVideoBitrate(input.frameRate ?? null), ceiling),
    );
    // The output's size follows the target bitrate, not the source's.
    const needed =
      ((videoBitrate + TRANSCODE_OVERHEAD_BITRATE) / 8) * (end - start) * 1.05;
    if (input.quotaFreeBytes !== null && input.quotaFreeBytes < needed) {
      return { kind: "skip", reason: "no-quota" };
    }
    return {
      kind: "transcode",
      startSeconds: start,
      endSeconds: end,
      videoBitrate,
    };
  }

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
