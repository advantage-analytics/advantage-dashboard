/**
 * Games that put their own boundaries right, once their points are checked.
 *
 * Where who won each point is right, where a game ends is arithmetic: walked
 * over the 25 finished hand-label sessions on 2026-11-11 with their labelled
 * winners, the score reproduced the labelled game and set boundaries on 3,013
 * of 3,015 joins. So a game whose rows run past the point that decided it, or
 * stop short of deciding it, is one the console can fix by itself — with the
 * same two operations the rail's slots offer (game-shift.ts `planGameShift`,
 * `planGamePullFrom`).
 *
 * But only on checked points. A pre-filled winner is wrong about one time in
 * four, and on unchecked rows a game that does not add up is far more often a
 * wrong winner than a wrong boundary (103 of 124, measured 2026-11-05): moving
 * the boundary there would hide the error the slot exists to show. So a fix
 * runs only when every live row of every game it touches — the game it moves
 * rows out of, each game it moves them into, down the whole cascade — is
 * checked. Anything else stays a slot, as before.
 *
 * It is per game, not per point: an unchecked point in a game that adds up
 * holds nothing back. (A walk from the top to the first
 * unchecked point was tried first: on the finished sessions that point came
 * within the first 15 rows on 19 of 25, so it would almost never have run.)
 *
 * One fix at a time, and only the first game in rail order that does not add
 * up: a later game is never touched while an earlier one waits on a check.
 * The console runs it again on the rows it leaves, so a run of checked games
 * settles one after another. Locked games, tiebreaks and the match-tiebreak
 * set are never listed (`gameOverflow`, `gameUnderflow`), and a short game
 * that reads as missing a point (`add_point`) is left for "Add point". Pure.
 */

import {
  gameOverflow,
  gameUnderflow,
  planGamePullFrom,
  planGameShift,
  type GameShiftWrite,
  type ShiftPoint,
} from "./game-shift";
import { gameKey } from "./score";
import type { LabelPoint, LabelStartScore } from "./session";

/** What the gate reads beside a move's fields. A `LabelPoint` satisfies it. */
export type AutoShiftPoint = ShiftPoint & Pick<LabelPoint, "checkedAt">;

export type AutoGameFix =
  | { kind: "shift"; fromPointId: string; writes: GameShiftWrite[] }
  | { kind: "pull"; gameKey: string; writes: GameShiftWrite[] };

/** Whether every live row of every game `writes` touches is checked. */
function allChecked(
  points: readonly AutoShiftPoint[],
  writes: readonly GameShiftWrite[],
): boolean {
  const byId = new Map(points.map((point) => [point.id, point]));
  const games = new Set<string>();
  for (const write of writes) {
    const from = byId.get(write.id);
    if (from) games.add(gameKey(from));
    games.add(
      gameKey({ setNumber: write.set_number, gameNumber: write.game_number }),
    );
  }
  return points.every(
    (point) =>
      point.status === "deleted" ||
      point.checkedAt !== null ||
      !games.has(gameKey(point)),
  );
}

/** The first game the console may fix by itself, or null. */
export function autoGameFix(
  points: readonly AutoShiftPoint[],
  adScoring: boolean,
  matchTiebreakSet: number | null,
  start: LabelStartScore | null,
): AutoGameFix | null {
  // Only the first game that does not add up, in rail order: a game is
  // often short because its points sit in the game before it, so a later one
  // is never fixed while an earlier one is still waiting on a check.
  const at = (id: string | undefined) =>
    points.find((point) => point.id === id)?.pointIndex ?? Infinity;
  const over = gameOverflow(points, adScoring, matchTiebreakSet, start)[0];
  const short = gameUnderflow(points, adScoring, matchTiebreakSet, start)[0];
  const overAt = at(over?.leftovers[0]?.id);
  const shortAt = at(short?.rows[0]?.id);
  if (over && overAt <= shortAt) {
    const fromPointId = over.leftovers[0].id;
    const plan = planGameShift(
      points,
      adScoring,
      fromPointId,
      matchTiebreakSet,
      start,
    );
    if ("error" in plan || !allChecked(points, plan.writes)) return null;
    return { kind: "shift", fromPointId, writes: plan.writes };
  }
  if (short) {
    const plan = planGamePullFrom(points, short, adScoring, start);
    if (!("ok" in plan) || !allChecked(points, plan.writes)) return null;
    return { kind: "pull", gameKey: gameKey(short), writes: plan.writes };
  }
  return null;
}

/** What identifies a fix, so the console never runs the same one twice. */
export function autoGameFixKey(fix: AutoGameFix): string {
  const what = fix.kind === "shift" ? fix.fromPointId : fix.gameKey;
  return `${fix.kind}:${what}:${fix.writes.length}`;
}
