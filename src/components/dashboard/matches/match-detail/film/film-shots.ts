import type { MatchPoint, MatchShot } from "@/lib/data/match-points-server";

import {
  REACHED_EPSILON_SECONDS,
  toFilmTime,
  type FilmClock,
  type FilmStop,
} from "./film-timeline";

/**
 * The shot feed's clock: every timed shot placed on the film.
 *
 * Shots share the points' clock (`shots.video_time` is written by the same
 * ingest, or the same import, as `points.video_time`), so they convert through
 * the same {@link FilmClock} — the caller passes the clock the point stops were
 * built from, never a second one. A shot's window runs to the next shot in its
 * point, and the last shot's to the point's own end — so the playing shot goes
 * quiet in the dead time between points instead of staying lit until the next
 * serve.
 *
 * An untimed shot is dropped, for the same reason an untimed point is: it has
 * no position on the film and therefore no seek target.
 */

export interface ShotStop {
  shot: MatchShot;
  point: MatchPoint;
  /** Film seconds. */
  start: number;
  end: number;
}

export function shotStops(
  pointStops: FilmStop[],
  clock: FilmClock,
): ShotStop[] {
  const out: ShotStop[] = [];
  for (const stop of pointStops) {
    const timed = (stop.point.shots ?? [])
      .filter(
        (s): s is MatchShot & { videoTime: number } => s.videoTime != null,
      )
      .slice()
      .sort((a, b) => a.videoTime - b.videoTime);

    timed.forEach((shot, i) => {
      const start = toFilmTime(shot.videoTime, clock);
      const next = timed[i + 1];
      const end = next
        ? toFilmTime(next.videoTime, clock)
        : Math.max(stop.end, start);
      out.push({ shot, point: stop.point, start, end: Math.max(end, start) });
    });
  }
  return out.sort((a, b) => a.start - b.start);
}

export interface ActiveShot {
  stop: ShotStop;
  progress: number;
}

/** The shot being played, or null between points and before the first serve. */
export function activeShotAt(
  stops: ShotStop[],
  filmTime: number,
): ActiveShot | null {
  let index = -1;
  for (let i = 0; i < stops.length; i += 1) {
    if (stops[i].start - REACHED_EPSILON_SECONDS <= filmTime) index = i;
    else break;
  }
  if (index === -1) return null;
  const stop = stops[index];
  if (filmTime > stop.end) return null;
  const span = Math.max(stop.end - stop.start, 0.001);
  return {
    stop,
    progress: Math.min(1, Math.max(0, (filmTime - stop.start) / span)),
  };
}

/** "First Serve" + "topspin" → "First serve · topspin". */
export function shotLabel(shot: MatchShot): string {
  const type = shot.shotType
    ? shot.shotType.charAt(0) + shot.shotType.slice(1).toLowerCase()
    : "Shot";
  return shot.spinType ? `${type} · ${shot.spinType.toLowerCase()}` : type;
}
