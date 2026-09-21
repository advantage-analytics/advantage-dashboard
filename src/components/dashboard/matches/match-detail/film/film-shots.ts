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

/** The em dash the Current point widget draws for anything unmeasured. */
export const UNMEASURED = "—";

function sentenceCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
}

/** One shot's row in the "Current point" widget, one string per column. */
export interface ShotRowCells {
  order: string;
  player: string;
  spin: string;
  stroke: string;
  type: string;
  placement: string;
  mph: string;
  result: string;
}

/**
 * A shot's eight cells (handoff H1 §B, frame `E-route-P1-P2.html`).
 *
 * `MatchShot` carries only `shotType`, `spinType`, `speedMph`, `zone` and
 * `result`, so two columns are derived rather than read: the first shot of a
 * rally is the serve whatever its `shotType` says, and "Type" is the shot's
 * job in the rally (serve → return → rally) rather than a stored field.
 *
 * Nothing unmeasured is ever rendered as `0` or as an empty cell — a null
 * speed, spin, placement, stroke or result is {@link UNMEASURED}, because a
 * missing reading and a reading of zero are different claims about the match.
 * `playerName` is passed in: attribution comes from `useMatchSides()`
 * upstream (guardrails §4), never from player1/player2 order down here.
 */
export function shotRowCells(
  shot: MatchShot,
  /** 1-based place in the rally. */
  order: number,
  playerName: string,
): ShotRowCells {
  const shotType = shot.shotType?.trim() ?? "";
  const isServe = order === 1 || /serve/i.test(shotType);

  return {
    order: String(order),
    player: playerName || UNMEASURED,
    spin: shot.spinType ? sentenceCase(shot.spinType) : UNMEASURED,
    stroke: isServe ? "Serve" : shotType ? sentenceCase(shotType) : UNMEASURED,
    type: isServe
      ? /second|2nd/i.test(shotType)
        ? "2nd serve"
        : "1st serve"
      : order === 2
        ? "Return"
        : "Rally",
    placement: shot.zone ? shot.zone : UNMEASURED,
    mph: shot.speedMph == null ? UNMEASURED : String(Math.round(shot.speedMph)),
    result: shot.result ? shot.result : UNMEASURED,
  };
}
