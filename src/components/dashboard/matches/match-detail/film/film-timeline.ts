import type { MatchPoint } from "@/lib/data/match-points-server";

/**
 * The film's own clock, and everything that walks it.
 *
 * Two clocks exist and this file is the only place they meet:
 *
 * - **point time** — `points.video_time`, seconds on the analysis clock
 *   (`derivation/parse.ts` adds the job's window start at ingest, by design);
 * - **film time** — `<video>.currentTime` on the file we actually serve. For
 *   our own upload that is the same clock (offset 0); for an older match that
 *   only has the vendor's re-encode, t=0 is the job's `start_time_seconds`.
 *   `MatchVideo.startTimeSeconds` carries whichever applies — see
 *   `lib/data/match-video-choice.ts`.
 *
 * Every seek converts point → film, every playhead reading converts film →
 * point. Nothing else in the film subtree may do the arithmetic, because a
 * second copy is how one of them ends up 15 seconds late again.
 */

/** Fallback window for a point the source never timed, in seconds. */
export const ASSUMED_POINT_SECONDS = 10;

/** Lead-in before a point's serve and run-out after its end, in seconds. */
export const POINT_BUFFER_SECONDS = 1.5;

/** The cushion that makes "previous" go back a point instead of re-seeking. */
const STEP_CUSHION_SECONDS = 0.5;

/**
 * How far before a stop's start still counts as "reached". A `<video>` seek
 * lands on a decodable frame, which can sit a few milliseconds BEFORE the
 * second asked for; without this a point just jumped to reads as not yet
 * started, and the playing row, the position and Save point all go blank.
 */
const REACHED_EPSILON_SECONDS = 0.1;

export function toFilmTime(pointTime: number, offset: number): number {
  return Math.max(0, pointTime - offset);
}

export function toPointTime(filmTime: number, offset: number): number {
  return filmTime + offset;
}

/** A point placed on the film's clock. */
export interface FilmStop {
  point: MatchPoint;
  /** Film seconds where the point's window opens (the serve, less the buffer). */
  start: number;
  /** Film seconds of serve contact — the point's own recorded start. */
  serve: number;
  /** Film seconds where its window ends — see `filmStops` for the rule. */
  end: number;
}

/**
 * Every timed point, in film order, each with its window.
 *
 * The point itself runs from its recorded start to its own `duration` when
 * there is one (the real length of the rally), otherwise to the next point's
 * start (so the progress rule still advances on a source that timed starts
 * but not lengths), otherwise `ASSUMED_POINT_SECONDS`.
 *
 * The window is that span padded by `POINT_BUFFER_SECONDS` on both sides, so a
 * jump lands just before the serve and the point plays out past its last ball.
 * Every consumer — seeks, the playing row, its progress rule, next/previous,
 * dead-time skipping, loop — walks the padded window. The pad never runs past
 * film zero, and a window's end never runs past the next window's start, so
 * windows never overlap.
 *
 * Built from ALL points rather than the filtered cut: the playhead is
 * somewhere in the match whether or not the current filter admits the point
 * it is inside.
 */
export function filmStops(points: MatchPoint[], offset: number): FilmStop[] {
  const timed = points
    .filter((p): p is MatchPoint & { videoTime: number } => p.videoTime != null)
    .slice()
    .sort((a, b) => a.videoTime - b.videoTime);

  const paddedStart = (videoTime: number) =>
    Math.max(0, toFilmTime(videoTime, offset) - POINT_BUFFER_SECONDS);

  return timed.map((point, i) => {
    const serve = toFilmTime(point.videoTime, offset);
    const start = paddedStart(point.videoTime);
    const next = timed[i + 1];
    const nextStart = next ? paddedStart(next.videoTime) : Infinity;
    const end =
      point.duration && point.duration > 0
        ? serve + point.duration + POINT_BUFFER_SECONDS
        : next
          ? nextStart
          : serve + ASSUMED_POINT_SECONDS + POINT_BUFFER_SECONDS;
    return {
      point,
      start,
      serve,
      end: Math.max(Math.min(end, nextStart), start),
    };
  });
}

export interface ActiveStop {
  stop: FilmStop;
  /** 0–1 through the stop's window, clamped. */
  progress: number;
}

/**
 * The point the playhead is inside: the last stop whose start it has passed.
 * Progress is clamped, so the rule sits full through the changeover rather
 * than overrunning into the next row.
 */
export function activeStopAt(
  stops: FilmStop[],
  filmTime: number,
): ActiveStop | null {
  let index = -1;
  for (let i = 0; i < stops.length; i += 1) {
    if (stops[i].start - REACHED_EPSILON_SECONDS <= filmTime) index = i;
    else break;
  }
  if (index === -1) return null;
  const stop = stops[index];
  const span = Math.max(stop.end - stop.start, 0.001);
  return {
    stop,
    progress: Math.min(1, Math.max(0, (filmTime - stop.start) / span)),
  };
}

/** The next stop after the playhead, with the cushion. */
export function nextStop(stops: FilmStop[], filmTime: number): FilmStop | null {
  return stops.find((s) => s.start > filmTime + STEP_CUSHION_SECONDS) ?? null;
}

/** The previous stop before the playhead, with the cushion. */
export function prevStop(stops: FilmStop[], filmTime: number): FilmStop | null {
  for (let i = stops.length - 1; i >= 0; i -= 1) {
    if (stops[i].start < filmTime - STEP_CUSHION_SECONDS) return stops[i];
  }
  return null;
}

/**
 * Where "Skip dead time" should jump to, or null to keep playing.
 *
 * Dead time is the gap between one point's window and the next point's
 * start. Inside a window, or before the first point, nothing is skipped: the
 * walk to the baseline before the first serve is part of the point.
 */
export function deadTimeJump(
  stops: FilmStop[],
  filmTime: number,
): number | null {
  const active = activeStopAt(stops, filmTime);
  if (!active) return null;
  if (filmTime < active.stop.end) return null;
  const next = stops.find((s) => s.start > active.stop.start);
  if (!next || next.start <= filmTime) return null;
  return next.start;
}

/** One run of the scrub track, in film seconds. */
export interface TrackSegment {
  start: number;
  end: number;
}

/**
 * The track split at breaks of serve.
 *
 * A game is a break when the player who won its last point is not the player
 * who served it. The split falls where that game ends — the start of the next
 * game — so each segment reads as "serve held from here to here". A match with
 * no breaks (or no games) is one segment; segments always tile
 * `[0, duration]`, which is what lets the playhead percentage map straight
 * onto them.
 */
export function breakSegments(
  stops: FilmStop[],
  duration: number,
): TrackSegment[] {
  if (!(duration > 0)) return [];

  // Games in film order, each with its first and last stop.
  const games: { first: FilmStop; last: FilmStop }[] = [];
  for (const stop of stops) {
    const current = games[games.length - 1];
    const sameGame =
      current &&
      current.first.point.setNumber === stop.point.setNumber &&
      current.first.point.gameNumber === stop.point.gameNumber;
    if (sameGame) current.last = stop;
    else games.push({ first: stop, last: stop });
  }

  const cuts: number[] = [];
  games.forEach((game, i) => {
    const next = games[i + 1];
    if (!next) return;
    const broke =
      game.last.point.wonByPlayer1 !== game.first.point.serverIsPlayer1;
    // At the next game's serve, not its lead-in: the buffer is playback
    // comfort, the break is a fact about when the game changed hands.
    if (broke) cuts.push(next.first.serve);
  });

  const segments: TrackSegment[] = [];
  let start = 0;
  for (const cut of cuts) {
    if (cut <= start || cut >= duration) continue;
    segments.push({ start, end: cut });
    start = cut;
  }
  segments.push({ start, end: duration });
  return segments;
}
