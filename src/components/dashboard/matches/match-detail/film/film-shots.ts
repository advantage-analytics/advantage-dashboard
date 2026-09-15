import type { MatchPoint, MatchShot } from "@/lib/data/match-points-server";

import { toFilmTime, type FilmStop } from "./film-timeline";

/**
 * The shot feed's clock: every timed shot placed on the film.
 *
 * Shots share the points' clock (`shots.video_time` is written by the same
 * ingest as `points.video_time`), so they convert with the same offset. A
 * shot's window runs to the next shot in its point, and the last shot's to the
 * point's own end — so the playing shot goes quiet in the dead time between
 * points instead of staying lit until the next serve.
 */

export interface ShotStop {
  shot: MatchShot;
  point: MatchPoint;
  /** Film seconds. */
  start: number;
  end: number;
}

export function shotStops(pointStops: FilmStop[], offset: number): ShotStop[] {
  const out: ShotStop[] = [];
  for (const stop of pointStops) {
    const timed = (stop.point.shots ?? [])
      .filter(
        (s): s is MatchShot & { videoTime: number } => s.videoTime != null,
      )
      .slice()
      .sort((a, b) => a.videoTime - b.videoTime);

    timed.forEach((shot, i) => {
      const start = toFilmTime(shot.videoTime, offset);
      const next = timed[i + 1];
      const end = next
        ? toFilmTime(next.videoTime, offset)
        : Math.max(stop.end, start);
      out.push({ shot, point: stop.point, start, end: Math.max(end, start) });
    });
  }
  return out.sort((a, b) => a.start - b.start);
}

/** Same early-seek tolerance as `activeStopAt`. */
const REACHED_EPSILON_SECONDS = 0.1;

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
