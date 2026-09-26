/**
 * The frame clock: trimmed-video frame indices → seconds on the original
 * video's clock.
 *
 * The vendor's rows carry frame indices in the TRIMMED video, and types.ts
 * warns never to seek against a frame: the vendor re-encodes, so a framerate
 * cannot be assumed. Every stroke, though, carries both a `trimmedFrame` and a
 * `videoTime` that already includes the trim offset, so a least-squares line
 * through those pairs turns any frame into seconds on the same clock as
 * `shots.video_time`. Both the trajectories file (ball-paths.ts) and the
 * strokes' own `bounce_frame` (transcript.ts) go through this one fit.
 *
 * Pure: no I/O.
 */

import type { SplitStepStroke } from "./types";

type ClockPair = Pick<SplitStepStroke, "trimmedFrame" | "videoTime">;

/**
 * Least-squares line frame → seconds, or null when fewer than two distinct
 * frames are available to fit through.
 */
export function fitFrameToTime(
  strokes: readonly ClockPair[],
): ((frame: number) => number) | null {
  const pairs = strokes.filter(
    (s) =>
      Number.isFinite(s.trimmedFrame) &&
      Number.isFinite(s.videoTime) &&
      s.trimmedFrame >= 0,
  );
  if (new Set(pairs.map((s) => s.trimmedFrame)).size < 2) return null;

  const n = pairs.length;
  const meanFrame = pairs.reduce((sum, s) => sum + s.trimmedFrame, 0) / n;
  const meanTime = pairs.reduce((sum, s) => sum + s.videoTime, 0) / n;

  let covariance = 0;
  let variance = 0;
  for (const s of pairs) {
    const df = s.trimmedFrame - meanFrame;
    covariance += df * (s.videoTime - meanTime);
    variance += df * df;
  }
  const slope = covariance / variance;

  return (frame) => meanTime + slope * (frame - meanFrame);
}

/**
 * A bounce before its contact frame is not a bounce — the vendor's frame
 * numbers are trustworthy relative to each other even when the sentinel
 * handling upstream is not, and a bounce that supposedly preceded the stroke
 * that produced it is nulled rather than kept. `null` in either argument (no
 * candidate, or no contact frame to order it against) also nulls the result.
 */
export function orderedBounceFrame(
  candidate: number | null,
  contactFrame: number | null,
): number | null {
  if (candidate === null || contactFrame === null) return null;
  return candidate < contactFrame ? null : candidate;
}

/**
 * Per stroke, in input order: the fitted seconds of its `bounceFrame` on the
 * same clock as `videoTime` (trim offset included), or null when the stroke
 * has no bounce frame or the match has too few distinct frames to fit a
 * clock through.
 */
export function bounceVideoTimes(
  strokes: readonly (ClockPair & Pick<SplitStepStroke, "bounceFrame">)[],
): (number | null)[] {
  const timeOf = fitFrameToTime(strokes);
  return strokes.map((s) =>
    timeOf && s.bounceFrame !== null && Number.isFinite(s.bounceFrame)
      ? timeOf(s.bounceFrame)
      : null,
  );
}
