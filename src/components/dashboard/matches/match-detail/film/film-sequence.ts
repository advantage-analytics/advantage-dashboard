import {
  playingStopAt,
  REACHED_EPSILON_SECONDS,
  type FilmStop,
  type StopPoint,
} from "./film-timeline";

/**
 * "Play these in sequence" (roadmap 6.3): the applied cut's points one after
 * another, with the dead time between them skipped and nothing played that
 * the list does not show.
 *
 * It is the player's own "Skip dead time" over the CUT rather than over every
 * point: `walkStops` is the array the transport's prev/next already step
 * through (`film-tab.tsx`), so a sequence and a step agree about what comes
 * next. Pure: the tab asks on every playhead report and acts on the answer.
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
