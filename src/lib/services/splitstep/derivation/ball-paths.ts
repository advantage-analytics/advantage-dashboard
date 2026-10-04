/**
 * Vendor ball trajectories → one compact flight path per stroke.
 *
 * The trajectories JSON is a flat array of per-frame rows — confirmed by
 * opening a real file (job d3bff342…), whose rows carry exactly
 * `stroke_frame, bounce_frame, frame, ball_x_px, ball_y_px, ball_x_m,
 * ball_y_m, ball_z_m`. Anything that is not an array throws, as `parseStrokes`
 * does. The `_px` columns are ignored.
 *
 * Three decisions a reader should not have to rediscover:
 *
 *   - Time. Rows carry only frame indices in the TRIMMED video, and
 *     types.ts warns never to seek against a frame. The strokes carry both a
 *     `trimmedFrame` and a `videoTime` that already includes the trim offset,
 *     so a least-squares line through those pairs (`fitFrameToTime` in
 *     frame-clock.ts) turns any frame into seconds on the same clock as
 *     `shots.video_time`, with no framerate assumed.
 *   - Identity. A path is keyed by its stroke's `contactTime`, which is the
 *     stroke's own `videoTime` untouched — NOT the fitted value — so it equals
 *     `shots.video_time` exactly. Never a shot id: re-derivation rewrites shot
 *     rows.
 *   - Size. A real match is ~26,000 rows and 4 MB. Paths are thinned to about
 *     10 Hz and rounded to 2 dp to land well under 1 MB; the first row, the
 *     last row and the bounce row always survive the thinning, because those
 *     are the three a drawing cannot interpolate its way back to.
 *
 * Pure: no I/O. Geometry goes through court.ts like everything else.
 */

import { isPlausibleCourtPosition, metersToCourtFrame } from "./court";
import { fitFrameToTime } from "./frame-clock";
import { flightSamples, groupTrajectories } from "./trajectory";
import type { SplitStepStroke } from "./types";

export const BALL_PATHS_VERSION = 1;

/** Seconds on the original video's clock, then court-frame metres and height. */
export type BallPathSample = [t: number, x: number, y: number, z: number];

export type BallPathStroke = {
  /** The stroke's own `videoTime`, unchanged. Equals `shots.video_time`. */
  contactTime: number;
  /** Fitted time of the bounce frame; null when the vendor saw no bounce. */
  bounceTime: number | null;
  path: BallPathSample[];
};

export type BallPathsFile = { version: 1; strokes: BallPathStroke[] };

/** Minimum gap between kept samples: about 10 Hz. */
const MIN_SAMPLE_GAP_S = 0.1;
/** Absorbs float error when comparing 2 dp times against the gap. */
const GAP_EPSILON = 1e-9;

/** Round to 2 dp, never returning -0. */
function round2(value: number): number {
  return Math.round(value * 100) / 100 + 0;
}

export function deriveBallPaths(
  rawTrajectories: unknown,
  strokes: readonly Pick<SplitStepStroke, "trimmedFrame" | "videoTime">[],
): BallPathsFile {
  // Negative frames are the sentinel, never a real contact; the first stroke
  // wins if the vendor ever repeats a frame.
  const strokeByFrame = new Map<number, number>();
  for (const stroke of strokes) {
    if (!Number.isFinite(stroke.trimmedFrame) || stroke.trimmedFrame < 0) {
      continue;
    }
    if (!strokeByFrame.has(stroke.trimmedFrame)) {
      strokeByFrame.set(stroke.trimmedFrame, stroke.videoTime);
    }
  }

  // Grouped before the clock check, so a non-array throws either way.
  const flights = groupTrajectories(
    rawTrajectories,
    new Set(strokeByFrame.keys()),
  );

  const timeOf = fitFrameToTime(strokes);
  if (!timeOf) return { version: BALL_PATHS_VERSION, strokes: [] };

  const result: BallPathStroke[] = [];

  for (const [strokeFrame, flight] of flights) {
    const { bounceFrame } = flight;
    const samples: { frame: number; sample: BallPathSample }[] = [];
    for (const { frame, x, y, z } of flightSamples(flight)) {
      if (!isPlausibleCourtPosition(x, y)) continue;
      const court = metersToCourtFrame(x, y);
      samples.push({
        frame,
        sample: [
          round2(timeOf(frame)),
          round2(court.x),
          round2(court.y),
          round2(z ?? 0),
        ],
      });
    }
    if (samples.length === 0) continue;

    samples.sort((a, b) => a.sample[0] - b.sample[0] || a.frame - b.frame);

    const path: BallPathSample[] = [];
    let lastKeptTime = Number.NEGATIVE_INFINITY;
    samples.forEach(({ frame, sample }, index) => {
      const forced =
        index === 0 || index === samples.length - 1 || frame === bounceFrame;
      if (
        forced ||
        sample[0] - lastKeptTime >= MIN_SAMPLE_GAP_S - GAP_EPSILON
      ) {
        path.push(sample);
        lastKeptTime = sample[0];
      }
    });

    result.push({
      contactTime: strokeByFrame.get(strokeFrame) as number,
      bounceTime: bounceFrame === null ? null : round2(timeOf(bounceFrame)),
      path,
    });
  }

  result.sort((a, b) => a.contactTime - b.contactTime);
  return { version: BALL_PATHS_VERSION, strokes: result };
}
