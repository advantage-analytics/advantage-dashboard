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
 *     so a least-squares line through those pairs turns any frame into seconds
 *     on the same clock as `shots.video_time`, with no framerate assumed.
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
import { num } from "./parse";
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

interface TrajectoryRow {
  stroke_frame?: unknown;
  bounce_frame?: unknown;
  frame?: unknown;
  ball_x_m?: unknown;
  ball_y_m?: unknown;
  ball_z_m?: unknown;
}

/** Round to 2 dp, never returning -0. */
function round2(value: number): number {
  return Math.round(value * 100) / 100 + 0;
}

/**
 * Least-squares line frame → seconds, or null when fewer than two distinct
 * frames are available to fit through.
 */
function fitFrameToTime(
  strokes: readonly Pick<SplitStepStroke, "trimmedFrame" | "videoTime">[],
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

export function deriveBallPaths(
  rawTrajectories: unknown,
  strokes: readonly Pick<SplitStepStroke, "trimmedFrame" | "videoTime">[],
): BallPathsFile {
  if (!Array.isArray(rawTrajectories)) {
    throw new Error(
      "SplitStep trajectories must be a JSON array of per-frame row objects",
    );
  }

  const timeOf = fitFrameToTime(strokes);
  if (!timeOf) return { version: BALL_PATHS_VERSION, strokes: [] };

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

  const groups = new Map<number, TrajectoryRow[]>();
  for (const entry of rawTrajectories) {
    if (typeof entry !== "object" || entry === null) continue;
    const row = entry as TrajectoryRow;
    const strokeFrame = num(row.stroke_frame);
    if (strokeFrame === null || !strokeByFrame.has(strokeFrame)) continue;
    const group = groups.get(strokeFrame);
    if (group) group.push(row);
    else groups.set(strokeFrame, [row]);
  }

  const result: BallPathStroke[] = [];

  for (const [strokeFrame, rows] of groups) {
    let bounceFrame: number | null = null;
    for (const row of rows) {
      const candidate = num(row.bounce_frame);
      if (candidate !== null) {
        bounceFrame = candidate;
        break;
      }
    }
    if (bounceFrame !== null && bounceFrame < strokeFrame) bounceFrame = null;

    const samples: { frame: number; sample: BallPathSample }[] = [];
    for (const row of rows) {
      const frame = num(row.frame);
      const x = row.ball_x_m;
      const y = row.ball_y_m;
      if (frame === null) continue;
      if (typeof x !== "number" || typeof y !== "number") continue;
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      if (!isPlausibleCourtPosition(x, y)) continue;

      const court = metersToCourtFrame(x, y);
      const z =
        typeof row.ball_z_m === "number" && Number.isFinite(row.ball_z_m)
          ? row.ball_z_m
          : 0;
      samples.push({
        frame,
        sample: [
          round2(timeOf(frame)),
          round2(court.x),
          round2(court.y),
          round2(z),
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
