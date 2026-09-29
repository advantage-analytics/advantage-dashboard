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
 * A point's rally, numbered the way the match was played rather than the way
 * the rows were stored.
 *
 * - {@link RallyNumbering.numbers}: shot id → its number. Every serve row
 *   ({@link isServeRow}) is 1 — a faulted first serve and the serve that
 *   was played both start the point — and every shot after the LAST serve
 *   counts on from it: the return is 2, the next shot 3. A non-serve row
 *   stored ahead of the last serve (a Feed, an untyped row) belongs to the
 *   serve, not the rally, and is 1 as well. With no serve row at all the
 *   shots are 1..n in the order given.
 * - {@link RallyNumbering.count}: the shots from the last serve on — the
 *   rally's length, the total a "shot 2 of 4" readout is out of. Every shot
 *   when there is no serve.
 * - {@link RallyNumbering.openerId}: the shot that opened the rally — the last
 *   serve (the one that was played: a second serve when there is one, else
 *   the last serve row), or with no serve the first shot. It is
 *   the one "shot 1" the "This point" card draws in the darker ink.
 *
 * Works from the point's FULL `shots` (`MatchPoint.shots`, already in
 * `shot_number` order), never the timed-only feed ({@link shotStops}): an
 * untimed serve still decides where the rally starts. Look a displayed shot
 * up by id. `shot_number` itself is never read — Advantage Intelligence
 * stores a faulted serve at 0 and older SwingVision Feed rows are 0 too — and
 * neither is `rally_length`, which is 0 when the source never recorded it.
 */
export interface RallyNumbering {
  numbers: ReadonlyMap<string, number>;
  count: number;
  openerId: string | null;
}

export function rallyNumbering(
  shots: readonly MatchShot[] | undefined,
): RallyNumbering {
  const list = shots ?? [];
  const lastServe = list.findLastIndex((s) =>
    isServeRow(s.shotType?.trim() ?? ""),
  );
  // No serve: the rally is every shot, and it starts at the first one.
  const start = Math.max(lastServe, 0);
  const numbers = new Map<string, number>();
  list.forEach((s, i) => {
    numbers.set(s.id, Math.max(i - start, 0) + 1);
  });
  // The opener is the played serve: a row typed second, when there is one.
  // SwingVision stores both serves at shot_number 1 and the loader breaks
  // that tie by uuid, so "the last serve row" is the faulted one about half
  // the time. Stored order is only the fallback (one serve, or bare "Serve").
  const secondServe = list.find((s) => {
    const type = s.shotType?.trim() ?? "";
    return isServeRow(type) && /second|2nd/i.test(type);
  });
  return {
    numbers,
    count: list.length - start,
    openerId: secondServe?.id ?? list[start]?.id ?? null,
  };
}

/**
 * A shot row's accessible name. Two serves can both read "1", so a serve row
 * names which one it was — "Shot 1, first serve" / "Shot 1, second serve" —
 * and the two rows never share a name; any other row names its stroke.
 */
export function shotRowAriaLabel(cells: ShotRowCells): string {
  const what =
    cells.stroke === "Serve"
      ? `${cells.type.toLowerCase()} serve`
      : cells.stroke;
  return `Shot ${cells.order}, ${what}, ${cells.player}, ${cells.placement}, ${cells.result} — jump to this shot`;
}

/**
 * The "This point" card's Stroke ink: the darker ink marks the shot that
 * opened the rally ({@link RallyNumbering.openerId}) — the deciding serve —
 * and never a faulted first serve that also reads "1".
 */
export function isRallyOpener(
  shotId: string,
  numbering: RallyNumbering,
): boolean {
  return shotId === numbering.openerId;
}

/**
 * The point's return: its first TYPED shot that is neither a serve nor a
 * Feed — `pickReturnShot`'s rule (`serve-return-shots.ts`), widened by the
 * same bare `Serve` fallback as {@link isServeRow}, and narrowed to shots the
 * source typed: an untyped row may be the serve itself (a point whose every
 * shot is untyped exists live), so calling it the Return is a guess the
 * table would print as fact. `shots` in `shot_number` order, as
 * `MatchPoint.shots` already is. Null when the point has no such shot (an
 * ace, a double fault, or shots the source never typed).
 */
export function pointReturnShotId(
  shots: readonly MatchShot[] | undefined,
): string | null {
  const found = shots?.find((s) => {
    const type = s.shotType?.trim() ?? "";
    return type !== "" && !isServeRow(type) && !isFeedShotType(type);
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
  /** The shot's number in the rally ({@link rallyNumbering}) — the row
   * number only. Both serves of a faulted first serve are 1. */
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
// row 9 — so a long rally still finishes arriving inside 200ms. `order` is
// the row's place in the LIST, not its rally number, which two serves share.
// Used as the mount-driven `animationDelay` for `film-shot-row-in`
// (`film-this-point.tsx`, `point-list.tsx`); its cap and reduced-motion
// opt-out live in globals.css.
export function shotRowRevealDelay(order: number): number {
  return Math.min(order - 1, 8) * 25;
}
