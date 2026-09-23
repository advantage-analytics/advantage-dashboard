import type { MatchPoint, MatchShot } from "@/lib/data/match-points-server";
import { isFeedShotType, isServeShotType } from "@/lib/data/serve-return-shots";

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
  /**
   * Film seconds of the ball's landing, when the row carries a measured one.
   *
   * `shots.bounce_video_time` is written on the SOURCE clock, the same one
   * `video_time` is on, so it converts through the same {@link FilmClock} here
   * — the room never sees a second clock. A landing recorded before its own
   * strike is nonsense rather than a reading, so it is dropped to null and the
   * court falls back to its estimate.
   */
  bounce: number | null;
}

/** A row's stored landing on the film clock, or null when there is no reading. */
function bounceFilmTime(
  bounceVideoTime: number | null,
  start: number,
  clock: FilmClock,
): number | null {
  if (bounceVideoTime == null || !Number.isFinite(bounceVideoTime)) return null;
  const at = toFilmTime(bounceVideoTime, clock);
  return at >= start ? at : null;
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
      out.push({
        shot,
        point: stop.point,
        start,
        end: Math.max(end, start),
        bounce: bounceFilmTime(shot.bounceVideoTime, start, clock),
      });
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
 * A serve row, by what the source wrote rather than where it sits. Both
 * sources store `First Serve`/`Second Serve` (`isServeShotType`); a bare
 * `Serve` (older imports, the harness fixture) still counts, as it always did.
 */
function isServeRow(shotType: string): boolean {
  return isServeShotType(shotType) || /serve/i.test(shotType);
}

/**
 * The point's return: its first shot that is neither a serve nor a Feed —
 * `pickReturnShot`'s rule (`serve-return-shots.ts`), widened by the same bare
 * `Serve` fallback as {@link isServeRow}. `shots` in `shot_number` order, as
 * `MatchPoint.shots` already is. Null when the point has no such shot (an ace,
 * a double fault, or shots the source never typed).
 */
export function pointReturnShotId(
  shots: readonly MatchShot[] | undefined,
): string | null {
  const found = shots?.find((s) => {
    const type = s.shotType?.trim() ?? "";
    return !isServeRow(type) && !isFeedShotType(type);
  });
  return found?.id ?? null;
}

/**
 * The shot's "Type" cell: its ROLE in the point — First · Second · Return ·
 * Rally — keyed on `shotType` and the point's return, never on the row's
 * position. Position lied twice: a faulted first serve pushes the real return
 * to row 3, and a SwingVision Feed row sits at row 1.
 *
 * Role only, on purpose: WHAT was hit (Forehand, Volley, Overhead…) is the
 * Stroke column's job, as the vendor keeps it (`stroke_type`/`stroke_side`,
 * no role field). A volleyed return is "Return" here and "Volley" there.
 * A Feed, or an untyped shot that is not the return, is {@link UNMEASURED}.
 */
export function shotTypeLabel(
  shot: MatchShot,
  returnShotId: string | null,
): string {
  const shotType = shot.shotType?.trim() ?? "";
  if (isServeRow(shotType)) {
    return /second|2nd/i.test(shotType) ? "Second" : "First";
  }
  if (returnShotId !== null && shot.id === returnShotId) return "Return";
  if (!shotType || isFeedShotType(shotType)) return UNMEASURED;
  return "Rally";
}

/**
 * A shot's eight cells (handoff H1 §B, frame `E-route-P1-P2.html`).
 *
 * `MatchShot` carries only `shotType`, `spinType`, `speedMph`, `zone` and
 * `result`, so two columns are derived rather than read: Stroke reads "Serve"
 * for either serve row, and "Type" is {@link shotTypeLabel} — the shot's job
 * in the rally, keyed on `shotType` plus the point's return
 * ({@link pointReturnShotId}), never on `order`.
 *
 * Nothing unmeasured is ever rendered as `0` or as an empty cell — a null
 * speed, spin, placement, stroke or result is {@link UNMEASURED}, because a
 * missing reading and a reading of zero are different claims about the match.
 * `playerName` is passed in: attribution comes from `useMatchSides()`
 * upstream (guardrails §4), never from player1/player2 order down here.
 */
export function shotRowCells(
  shot: MatchShot,
  /** 1-based place in the rally — the row number only. */
  order: number,
  playerName: string,
  /** The point's return ({@link pointReturnShotId}); callers that never draw
   * the Type cell may leave it out. */
  returnShotId: string | null = null,
): ShotRowCells {
  const shotType = shot.shotType?.trim() ?? "";
  const isServe = isServeRow(shotType);

  return {
    order: String(order),
    player: playerName || UNMEASURED,
    spin: shot.spinType ? sentenceCase(shot.spinType) : UNMEASURED,
    stroke: isServe ? "Serve" : shotType ? sentenceCase(shotType) : UNMEASURED,
    type: shotTypeLabel(shot, returnShotId),
    placement: shot.zone ? shot.zone : UNMEASURED,
    mph: shot.speedMph == null ? UNMEASURED : String(Math.round(shot.speedMph)),
    result: shot.result ? shot.result : UNMEASURED,
  };
}

// T9: row 1 arrives with no delay, each row after it 25ms later, capped at
// row 9 — so a long rally still finishes arriving inside 200ms. Used as the
// mount-driven `animationDelay` for `film-shot-row-in` (`film-this-point.tsx`,
// `point-list.tsx`); its cap and reduced-motion opt-out live in globals.css.
export function shotRowRevealDelay(order: number): number {
  return Math.min(order - 1, 8) * 25;
}
