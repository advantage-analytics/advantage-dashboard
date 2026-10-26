import {
  playingStopAt,
  REACHED_EPSILON_SECONDS,
  type FilmStop,
  type StopPoint,
} from "./film-timeline";

/**
 * Skip dead time: the applied cut's points one after another, with the dead
 * time between them skipped and nothing played that the list does not show.
 *
 * It walks the CUT, not every point: `walkStops` is the array the
 * transport's prev/next already step through (`film-tab.tsx`), so a skip and
 * a step agree about what comes next. With no filter the cut is every point
 * and this is plain dead-time skipping; with one, the unlisted points are
 * dead time too. (It began as a separate "Play in sequence" glyph, roadmap
 * 6.3 — folded into Skip dead time once that was on by default, since two
 * toggles for "skip to the next point" differed only in which array they
 * read.) Pure: a surface asks on every playhead report and acts on the
 * answer.
 */

/** How a playhead report ends: keep playing, jump to this stop, or stop. */
export type SequenceStep<S extends FilmStop<StopPoint> = FilmStop> =
  { kind: "playing" } | { kind: "jump"; stop: S } | { kind: "end" };

/**
 * What the sequence does at `filmTime` over `walkStops` (film order):
 *
 * - inside one of the cut's windows → `playing`, nothing to do;
 * - before the first window, or in the dead time after one → `jump` to the
 *   next window's start (the one after `filmTime`, with the same lead-in
 *   tolerance a seek lands with);
 * - past the last window, or with no window at all → `end`.
 */
export function sequenceStep<S extends FilmStop<StopPoint>>(
  walkStops: readonly S[],
  filmTime: number,
): SequenceStep<S> {
  if (walkStops.length === 0) return { kind: "end" };
  if (playingStopAt(walkStops, filmTime)) return { kind: "playing" };
  const next = walkStops.find(
    (stop) => stop.start - REACHED_EPSILON_SECONDS > filmTime,
  );
  return next ? { kind: "jump", stop: next } : { kind: "end" };
}

/** What a playhead report asks of the film: seek, pause, or nothing. */
export type SkipDeadAction = { kind: "seek"; to: number } | { kind: "pause" };

/**
 * What one surface remembers between reports, so a jump is issued once and
 * the end of the cut pauses once. `inside` is the listed stop the film was
 * in at the last report; `lastJump` the start last seeked to.
 */
export interface SkipDeadMemo<S extends FilmStop<StopPoint> = FilmStop> {
  inside: S | null;
  lastJump: number | null;
}

/**
 * Skip dead time at `filmTime` over `walkStops`, updating `memo` in place:
 *
 * - inside a listed window → nothing;
 * - in the dead time, an unlisted point, or before the first window →
 *   `seek` to the next window's start — once: a seek that lands a hair
 *   before its window (a keyframe, up to a second early) is not re-issued
 *   every tick, the lead-in plays into the window on its own;
 * - crossing the end of the LAST listed window during playback → `pause`,
 *   once: the cut has played. Past it with play pressed again the film runs
 *   on; the next report finds no listed stop behind it and asks nothing.
 *
 * Callers ask only while the film is playing: a paused scrub into the dead
 * time is someone looking at a frame, and the old dead-time jump never
 * moved a paused film either.
 */
export function skipDeadAction<S extends FilmStop<StopPoint>>(
  walkStops: readonly S[],
  filmTime: number,
  memo: SkipDeadMemo<S>,
): SkipDeadAction | null {
  const previous = memo.inside;
  memo.inside = playingStopAt(walkStops, filmTime);
  const last = walkStops[walkStops.length - 1];
  if (
    previous &&
    previous === last &&
    memo.inside === null &&
    filmTime >= last.end - REACHED_EPSILON_SECONDS &&
    filmTime < last.end + 1
  ) {
    return { kind: "pause" };
  }
  const step = sequenceStep(walkStops, filmTime);
  if (step.kind !== "jump") return null;
  if (memo.lastJump === step.stop.start && filmTime >= step.stop.start - 1) {
    return null;
  }
  memo.lastJump = step.stop.start;
  return { kind: "seek", to: step.stop.start };
}

/**
 * The stop whose point carries `pointNumber`, or null. `?pn=` names points
 * by number (`lib/match-video/point-set.ts`), so this is how a queued point
 * finds its place on the film.
 */
export function stopForPointNumber<
  S extends FilmStop<{
    id: string;
    setNumber: number | null;
    pointNumber: number;
  }>,
>(stops: readonly S[], pointNumber: number): S | null {
  return stops.find((stop) => stop.point.pointNumber === pointNumber) ?? null;
}
