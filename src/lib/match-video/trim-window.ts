/**
 * The window a SwingVision attachment is cut to before it uploads.
 *
 * A phone recording of a match usually carries minutes of warm-up before the
 * first serve and minutes of packing up after the last point. None of it can
 * ever be seeked to — every seek is derived from the imported points — so the
 * browser keeps only the match plus `ATTACHMENT_TRIM_PAD_SECONDS` either side
 * and uploads that.
 *
 * ── Why the server needs no change ───────────────────────────────────────
 *
 * The cut is a remux with `shiftTolerance: 0` (`src/lib/video/trim.worker.ts`),
 * so the cut's t=0 is exactly the window start. The first serve therefore sits
 * at `marked − start` in the uploaded file, and that is the only number the
 * completion carries. The server derives `offset = anchorSource − confirmed`
 * and repeats the coverage check against the uploaded file's verified
 * duration, exactly as it does for an uncut file.
 *
 * ── Why the coverage check is re-run here ────────────────────────────────
 *
 * The default window always covers the match it was derived from, but T2 lets
 * a person move it, and a window that clips the last rally would upload a file
 * the server then refuses. `planTrimmedAlignment` runs the same `planAlignment`
 * the server runs, against the clip the window WOULD produce, so a bad window
 * is refused in the tab before any bytes are cut or moved.
 *
 * Pure module: no Azure, no Supabase, no Next.js, no DOM.
 */

import {
  planAlignment,
  type Alignment,
  type SourcePoint,
  type SourceShot,
  type SourceTimingSummary,
} from "./alignment";
import { ATTACHMENT_TRIM_PAD_SECONDS, CONFIRMED_TIME_DECIMALS } from "./limits";
import { fail, type MatchVideoResult } from "./types";

/** A span of the ORIGINAL file, in seconds from its start. */
export interface AttachmentTrimWindow {
  startSeconds: number;
  endSeconds: number;
}

/** Millisecond quantisation, the same precision the confirmed time is stored at. */
function toMilliseconds(seconds: number): number {
  const factor = 10 ** CONFIRMED_TIME_DECIMALS;
  return Math.round(seconds * factor) / factor;
}

export interface DefaultAttachmentTrimWindowInput {
  /** Where the person marked the first point's serve, in the ORIGINAL file. */
  markedSeconds: number;
  /** The source timing the alignment was validated against. */
  timing: Pick<
    SourceTimingSummary,
    "anchorSourceSeconds" | "requiredSourceEndSeconds"
  >;
  /** The original file's measured duration. */
  videoDurationSeconds: number;
  /** Test seam; production uses `ATTACHMENT_TRIM_PAD_SECONDS`. */
  padSeconds?: number;
}

/**
 * The window kept by default: pad before the marked first point, pad after the
 * last instant the match needs, clamped to the file.
 *
 * "The last instant" is `requiredSourceEndSeconds`, not the final point's
 * serve — it already covers the final point's duration and any shot recorded
 * after it. Translated onto the file's clock it sits
 * `requiredSourceEnd − anchorSource` seconds after the marked serve.
 *
 * Bounds are rounded to milliseconds so `marked − start` is exactly the
 * millisecond value the completion stores, with no float residue.
 */
export function defaultAttachmentTrimWindow({
  markedSeconds,
  timing,
  videoDurationSeconds,
  padSeconds = ATTACHMENT_TRIM_PAD_SECONDS,
}: DefaultAttachmentTrimWindowInput): AttachmentTrimWindow {
  const matchSpan =
    timing.requiredSourceEndSeconds - timing.anchorSourceSeconds;
  return {
    startSeconds: toMilliseconds(Math.max(0, markedSeconds - padSeconds)),
    endSeconds: toMilliseconds(
      Math.min(videoDurationSeconds, markedSeconds + matchSpan + padSeconds),
    ),
  };
}

/** Where the marked first point sits in the CUT file. */
export function markedTimeInTrimmedClip(
  markedSeconds: number,
  window: AttachmentTrimWindow,
): number {
  return toMilliseconds(markedSeconds - window.startSeconds);
}

export interface TrimmedAlignmentInput {
  points: readonly SourcePoint[];
  shots: readonly SourceShot[];
  /** The marked first point, in the ORIGINAL file. */
  markedSeconds: number;
  window: AttachmentTrimWindow;
}

/**
 * Would the cut still cover the match? The server's own check, run early.
 *
 * `planAlignment` is given the clip the window produces: the first point at
 * `marked − start`, a duration of `end − start`. Its answer — including the
 * offset — is what the server will compute from the uploaded file.
 *
 * A window that starts after the marked serve, or ends before it, is refused
 * as `insufficient_coverage` here rather than letting `planAlignment` call it
 * a bad time entry: the time was fine, the cut is what leaves the match out.
 */
export function planTrimmedAlignment({
  points,
  shots,
  markedSeconds,
  window,
}: TrimmedAlignmentInput): MatchVideoResult<Alignment> {
  const { startSeconds, endSeconds } = window;
  if (
    !Number.isFinite(startSeconds) ||
    !Number.isFinite(endSeconds) ||
    startSeconds < 0 ||
    endSeconds <= startSeconds
  ) {
    return fail("insufficient_coverage", "trim_window_empty");
  }
  if (startSeconds > markedSeconds) {
    return fail("insufficient_coverage", "trim_starts_after_first_point");
  }
  if (endSeconds < markedSeconds) {
    return fail("insufficient_coverage", "trim_ends_before_first_point");
  }
  return planAlignment({
    points,
    shots,
    confirmedVideoTime: markedTimeInTrimmedClip(markedSeconds, window),
    videoDurationSeconds: endSeconds - startSeconds,
  });
}
