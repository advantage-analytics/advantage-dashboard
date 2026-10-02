import type {
  BallPathSample,
  BallPathsFile,
} from "@/lib/services/splitstep/derivation/ball-paths";

import type { FilmClock } from "./film-timeline";

/**
 * The derived ball paths, moved onto the film's clock — pure, no React, no
 * `fetch`. `use-ball-paths.ts` does the I/O; this file does the arithmetic.
 *
 * ── Two clocks, which is the whole point of this module ──────────────────────
 *
 * The file's times are SOURCE-video seconds: `BallPathStroke.contactTime` is
 * the stroke's own `videoTime` untouched, so it equals `shots.video_time`
 * exactly (see the derivation's header). Everything the film room compares
 * against — `ShotStop.start`, `<video>.currentTime`, `markOpacity`'s
 * `filmTime` — is FILM seconds. The conversion happens once, in
 * {@link filmBallPaths}, and nothing downstream converts again.
 *
 * ── What is left of the ball (author decision, 2026-09-22) ───────────────────
 *
 * The white dot that travelled the court was removed, and with it `ballAt`,
 * its `BallAt`/`BallPoint` types and the trail window they carried. The paths
 * are still parsed and still put on the film clock, because the one thing they
 * now feed is {@link bounceTimesByShot}: the vendor's measured landing behind
 * each shot's bounce mark.
 */

/**
 * How near a path's contact has to fall to a shot's own film time for the two
 * to be the same stroke.
 *
 * Both numbers come from the same `videoTime` by different routes (the shot
 * row directly, the path through the derivation), so a real pair differs only
 * by rounding. Strokes in a rally are seconds apart, which is two orders of
 * magnitude more than this, so the window cannot reach a neighbour's path.
 */
export const BALL_MATCH_TOLERANCE_SECONDS = 0.15;

/** Absorbs float error when a delta lands exactly on the tolerance. */
const TOLERANCE_EPSILON = 1e-9;

/**
 * One stroke's flight, on the FILM clock.
 *
 * Structurally the file's `BallPathStroke`, deliberately named apart: the
 * numbers mean a different clock, and a value of this type has already been
 * through {@link filmBallPaths}.
 */
export interface FilmBallPath {
  /** Film seconds of the strike. */
  contactTime: number;
  /** Film seconds of the bounce, or null when the vendor saw none. */
  bounceTime: number | null;
  /** Samples with `t` in film seconds; court-frame metres and height. */
  path: BallPathSample[];
}

/**
 * The parsed file, or null for anything that is not one.
 *
 * Deliberately shallow: version and shape only. Every caller is a client that
 * has to stay silent on a bad body, so this never throws and never logs, and
 * {@link filmBallPaths} drops the individual strokes it cannot use.
 */
export function parseBallPathsFile(json: unknown): BallPathsFile | null {
  if (typeof json !== "object" || json === null) return null;
  const candidate = json as { version?: unknown; strokes?: unknown };
  if (candidate.version !== 1) return null;
  if (!Array.isArray(candidate.strokes)) return null;
  return { version: 1, strokes: candidate.strokes };
}

const finite = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

/**
 * Every stroke of `file`, with `contactTime`, `bounceTime` and every sample's
 * `t` moved onto the film clock by subtracting `clock.offset`.
 *
 * The subtraction is UNCLAMPED, and is the one place in the film subtree that
 * does not go through `toFilmTime`. That function floors at 0 and caps at
 * the film's duration, which is right for a seek target but wrong here: a path
 * that starts before frame one would have its leading samples all clamped to 0,
 * collapsing a flight into a stack of points at the same instant — and the
 * flat run would then read as a ball frozen at t=0 rather than as footage the
 * trim cut away. A path outside the film is better left outside it: nothing
 * draws it, because no playhead reading ever reaches it.
 *
 * A stroke whose times or samples are not numbers is dropped rather than
 * carried through as NaN.
 */
export function filmBallPaths(
  file: BallPathsFile,
  clock: FilmClock,
): FilmBallPath[] {
  const out: FilmBallPath[] = [];
  for (const raw of file.strokes) {
    if (typeof raw !== "object" || raw === null) continue;
    const stroke = raw as {
      contactTime?: unknown;
      bounceTime?: unknown;
      path?: unknown;
    };
    if (!finite(stroke.contactTime)) continue;
    if (!Array.isArray(stroke.path)) continue;

    const path: BallPathSample[] = [];
    for (const sample of stroke.path) {
      if (!Array.isArray(sample) || sample.length < 4) continue;
      const [t, x, y, z] = sample as BallPathSample;
      if (!finite(t) || !finite(x) || !finite(y) || !finite(z)) continue;
      path.push([t - clock.offset, x, y, z]);
    }

    out.push({
      contactTime: stroke.contactTime - clock.offset,
      bounceTime: finite(stroke.bounceTime)
        ? stroke.bounceTime - clock.offset
        : null,
      path,
    });
  }
  return out;
}

/**
 * Measured bounce times, keyed by shot id — what `TimedShot.bounceTime` takes.
 *
 * Both sides are already on the film clock: `shots` carries `ShotStop.start`
 * and `paths` has been through {@link filmBallPaths}. Each shot takes the path
 * whose `contactTime` is nearest its `start`, and only within
 * {@link BALL_MATCH_TOLERANCE_SECONDS}; a path is claimed by at most one shot,
 * and where two shots reach the same path the nearer one wins. A shot with no
 * match is simply absent, so the court falls back to `estimatedBounceTime`.
 *
 * A path whose `bounceTime` is null is left out before any of that: it has
 * nothing to contribute, and the tolerance is far smaller than the gap between
 * strokes, so removing it cannot hand its shot a neighbour's path.
 */
export function bounceTimesByShot(
  shots: readonly { id: string; start: number }[],
  paths: readonly FilmBallPath[],
): Map<string, number> {
  const usable = paths.filter(
    (p): p is FilmBallPath & { bounceTime: number } => p.bounceTime !== null,
  );

  // Every pair inside the window, nearest first. Ties keep the earlier shot and
  // then the earlier path, so the result never depends on sort stability.
  const pairs: { shotIndex: number; pathIndex: number; delta: number }[] = [];
  shots.forEach((shot, shotIndex) => {
    if (!finite(shot.start)) return;
    usable.forEach((path, pathIndex) => {
      const delta = Math.abs(path.contactTime - shot.start);
      if (delta > BALL_MATCH_TOLERANCE_SECONDS + TOLERANCE_EPSILON) return;
      pairs.push({ shotIndex, pathIndex, delta });
    });
  });
  pairs.sort(
    (a, b) =>
      a.delta - b.delta ||
      a.shotIndex - b.shotIndex ||
      a.pathIndex - b.pathIndex,
  );

  const out = new Map<string, number>();
  const takenPaths = new Set<number>();
  for (const pair of pairs) {
    const shot = shots[pair.shotIndex];
    if (out.has(shot.id) || takenPaths.has(pair.pathIndex)) continue;
    takenPaths.add(pair.pathIndex);
    out.set(shot.id, usable[pair.pathIndex].bounceTime);
  }
  return out;
}
