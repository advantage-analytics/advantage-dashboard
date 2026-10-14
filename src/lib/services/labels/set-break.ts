/**
 * A set break the rows do not have: read off the clock, not the score.
 *
 * Players sit down between games, and for longer between sets. The vendor's
 * games are cut into sets from the ENTERED score, so a wrong entered score
 * (6–4 typed for a 6–0) files the next set's first games under the old set,
 * and every score-based check downstream then argues with the labeller. The
 * gap before a game says where the set really ended, whatever was typed.
 *
 * A gap is a suspect when all of these hold:
 * - it is at least `SET_BREAK_MIN_GAP` seconds, and at least
 *   `SET_BREAK_RATIO` times the match's median sit-down (the gaps of a minute
 *   or more), so an ordinary changeover never fires;
 * - the set has already played `SET_BREAK_MIN_GAMES` games before it — a
 *   medical timeout at 1–1 is not a set ending;
 * - the rows keep the game after it in the same set.
 *
 * Pure. Read off live rows and their live strokes alone, so it is there on a
 * session labelled without marks too, and it closes the moment the games
 * after the gap are moved to the next set.
 */

import type { LabelPoint } from "./session";

/** Seconds: under this, no gap is a set break, however quick the match. */
export const SET_BREAK_MIN_GAP = 180;
/** Times the median sit-down a gap must be. */
export const SET_BREAK_RATIO = 1.7;
/** Games the set must have played before the gap. */
export const SET_BREAK_MIN_GAMES = 6;
/** Seconds: a gap this long is a sit-down, counted toward the median. */
const SIT_DOWN_MIN_GAP = 60;

export interface SetBreakSuspect {
  /** The first live point after the gap, where the rail lands. */
  pointId: string;
  pointNumber: number;
  setNumber: number;
  /** Games of `setNumber` played before the gap. */
  gamesBefore: number;
  /** The gap, in whole seconds. */
  gap: number;
}

type BreakPoint = Pick<
  LabelPoint,
  "id" | "pointIndex" | "status" | "setNumber" | "gameNumber"
> & {
  shots: readonly Pick<LabelPoint["shots"][number], "status" | "videoTime">[];
};

interface GameSpan {
  setNumber: number;
  gameNumber: number;
  firstPointId: string;
  firstPointNumber: number;
  start: number;
  end: number;
}

function gameSpans(points: readonly BreakPoint[]): GameSpan[] {
  const spans = new Map<string, GameSpan>();
  for (const point of points) {
    if (point.status === "deleted") continue;
    if (point.setNumber === null || point.gameNumber === null) continue;
    const times = point.shots
      .filter((shot) => shot.status !== "deleted" && shot.videoTime !== null)
      .map((shot) => shot.videoTime as number);
    if (times.length === 0) continue;
    const start = Math.min(...times);
    const end = Math.max(...times);
    const key = `${point.setNumber}:${point.gameNumber}`;
    const span = spans.get(key);
    if (!span) {
      spans.set(key, {
        setNumber: point.setNumber,
        gameNumber: point.gameNumber,
        firstPointId: point.id,
        firstPointNumber: point.pointIndex + 1,
        start,
        end,
      });
      continue;
    }
    if (start < span.start) {
      span.start = start;
      span.firstPointId = point.id;
      span.firstPointNumber = point.pointIndex + 1;
    }
    if (end > span.end) span.end = end;
  }
  return [...spans.values()].sort((a, b) => a.start - b.start);
}

function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** Every gap that reads as a set break the rows do not have, in video order. */
export function setBreakSuspects(
  points: readonly BreakPoint[],
): SetBreakSuspect[] {
  const games = gameSpans(points);
  const gaps = games.slice(1).map((game, i) => game.start - games[i].end);
  const sitDown = median(gaps.filter((gap) => gap >= SIT_DOWN_MIN_GAP));
  if (sitDown === null) return [];
  const floor = Math.max(SET_BREAK_MIN_GAP, sitDown * SET_BREAK_RATIO);

  const suspects: SetBreakSuspect[] = [];
  let gamesInSet = 0;
  for (const [i, game] of games.entries()) {
    const previous = i === 0 ? null : games[i - 1];
    if (!previous || previous.setNumber !== game.setNumber) {
      gamesInSet = 1;
      continue;
    }
    const gap = gaps[i - 1];
    if (gap >= floor && gamesInSet >= SET_BREAK_MIN_GAMES) {
      suspects.push({
        pointId: game.firstPointId,
        pointNumber: game.firstPointNumber,
        setNumber: game.setNumber,
        gamesBefore: gamesInSet,
        gap: Math.round(gap),
      });
    }
    gamesInSet += 1;
  }
  return suspects;
}

/** "4:45" — a gap as minutes and seconds. */
function clock(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

/** The stop's words in the header's list and on `]`. */
export function setBreakLabel(suspect: SetBreakSuspect): string {
  return `Set break here? ${clock(suspect.gap)} gap after ${suspect.gamesBefore} games of set ${suspect.setNumber}`;
}

/** The same, as "Mark complete" lists it. */
export function setBreakWarning(suspect: SetBreakSuspect): string {
  return `A ${clock(suspect.gap)} break before point ${suspect.pointNumber} looks like the end of set ${suspect.setNumber}, but the games after it are still in that set`;
}
