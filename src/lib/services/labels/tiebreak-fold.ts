/**
 * The tiebreak at 6–6: the vendor has no idea a set went to a tiebreak, so it
 * reads the serve changing hands every two points as new games and cuts the
 * tiebreak into several. Once the labelled games reach 6–6 the console offers
 * to put that right in one go (`tiebreakFold`, then `planTiebreakFold`):
 *
 * - the game after 6–6 becomes a `tiebreak`;
 * - the points after it are folded in, game after game, until a player is
 *   first to 7 and two clear — the tiebreak's end, as far as the winners
 *   entered so far can say. With no such point yet, every point left in the
 *   set goes in: the estimate is the end of the set;
 * - who serves follows the tiebreak's order (game-operations.ts
 *   `rotateServers`): the first server serves one point, then two each in
 *   turn. A point whose strokes contradict its new server switches players
 *   as a whole (player-swap.ts `planPlayerSwap`), as a server change does.
 *
 * The players also change ends after every six points of a tiebreak (and at
 * its end). `tiebreakEndsSwapped` says, for a point of the tiebreak, whether
 * the players stand at the other ends from where they started it.
 *
 * Pure: game-operations-session.ts writes the plan, the console runs it.
 */

import { labelPointFields, labelPointStatusAfterChange } from "./edit";
import {
  gameFirstServer,
  rotateServers,
  type GameServerPoint,
} from "./game-operations";
import type { GameShiftWrite } from "./game-shift";
import type { LabelGame } from "./operations";
import { planPlayerSwap, type ShotSwapWrite } from "./player-swap";
import {
  isCountedPoint,
  labelScores,
  tiebreakDecided,
  type ScorablePoint,
} from "./score";
import type { LabelPointStatus, LabelSide } from "./session";

export interface TiebreakFold {
  setNumber: number;
  /** The game the tiebreak takes: the first one after 6–6. */
  game: LabelGame;
  /** Every game it folds, in order, the tiebreak's own first. */
  games: LabelGame[];
  /** The live points it folds, in point order. */
  pointIds: string[];
  /** The count the folded points make, player 1 first. */
  points: Record<LabelSide, number>;
  /** Who those points give the tiebreak to; null when nobody has won it yet. */
  winner: LabelSide | null;
}

type FoldPoint = ScorablePoint & { id: string; pointIndex: number };

/**
 * Each set that has reached 6–6 with its next game still an ordinary one, and
 * the tiebreak the points after it make. A set whose next game is already a
 * tiebreak — the labeller has said so — is not offered again.
 */
export function tiebreakFolds(
  points: readonly FoldPoint[],
  adScoring: boolean,
): TiebreakFold[] {
  const { games } = labelScores(points, adScoring);
  const folds: TiebreakFold[] = [];
  const sets = [...new Set(games.map((game) => game.setNumber))];
  for (const setNumber of sets) {
    const inSet = games.filter((game) => game.setNumber === setNumber);
    const won = { p1: 0, p2: 0 };
    for (let i = 0; i < inSet.length; i += 1) {
      const { outcome } = inSet[i];
      if (outcome.kind !== "unfinished") won[outcome.winner] += 1;
      if (won.p1 !== 6 || won.p2 !== 6) continue;
      const next = inSet[i + 1];
      if (next && next.gameType === "game") {
        folds.push(foldFrom(points, setNumber, next.gameNumber));
      }
      break;
    }
  }
  return folds;
}

/** The fold that starts at game `gameNumber` of set `setNumber`. */
function foldFrom(
  points: readonly FoldPoint[],
  setNumber: number,
  gameNumber: number,
): TiebreakFold {
  const after = points
    .filter(
      (point) =>
        point.status !== "deleted" &&
        point.setNumber === setNumber &&
        point.gameNumber !== null &&
        point.gameNumber >= gameNumber,
    )
    .sort((a, b) => a.pointIndex - b.pointIndex);
  const count = { p1: 0, p2: 0 };
  let winner: LabelSide | null = null;
  const folded: FoldPoint[] = [];
  for (const point of after) {
    folded.push(point);
    if (!isCountedPoint(point)) continue;
    count[point.winner] += 1;
    if (tiebreakDecided(count, "tiebreak")) {
      winner = count.p1 > count.p2 ? "p1" : "p2";
      break;
    }
  }
  const games = [...new Set(folded.map((point) => point.gameNumber!))].map(
    (number) => ({ setNumber, gameNumber: number }),
  );
  return {
    setNumber,
    game: { setNumber, gameNumber },
    games,
    pointIds: folded.map((point) => point.id),
    points: count,
    winner,
  };
}

/**
 * The writes that make `fold` a tiebreak: every folded point moves to the
 * tiebreak's game, takes `game_type: "tiebreak"` and the server the
 * tiebreak's order gives it from the first folded point's server; a point
 * whose strokes contradict that server switches players. Refused when no
 * folded point names a server — there is no one to start the order from.
 */
export type PlannedTiebreakFold =
  | { ok: true; writes: GameShiftWrite[]; shots: ShotSwapWrite[] }
  | { error: string };

export function planTiebreakFold(
  points: readonly GameServerPoint[],
  fold: Pick<TiebreakFold, "game" | "pointIds">,
): PlannedTiebreakFold {
  const ids = new Set(fold.pointIds);
  const live = points
    .filter((point) => ids.has(point.id) && point.status !== "deleted")
    .sort((a, b) => a.pointIndex - b.pointIndex);
  if (live.length === 0) return { error: "The tiebreak has no live points." };
  const first = gameFirstServer(live);
  if (!first) {
    return { error: "Set who serves the tiebreak's first point first." };
  }
  const servers = rotateServers(live, "tiebreak", first);
  const shots: ShotSwapWrite[] = [];
  const writes = live.map((point, i): GameShiftWrite => {
    const server = servers[i];
    const swap = planPlayerSwap(point, server);
    if (swap) shots.push(...swap.shots);
    const moves = point.gameNumber !== fold.game.gameNumber;
    const change = {
      server,
      ...(moves ? { game_number: fold.game.gameNumber } : {}),
      ...swap?.point,
    };
    const status = labelPointStatusAfterChange(
      { ...labelPointFields(point), status: point.status, seed: point.seed },
      change,
    ) as Exclude<LabelPointStatus, "deleted">;
    return {
      id: point.id,
      set_number: fold.game.setNumber,
      game_number: fold.game.gameNumber,
      server,
      game_type: "tiebreak",
      status,
      ...(swap
        ? { winner: swap.point.winner, ended_by: swap.point.ended_by }
        : {}),
    };
  });
  return { ok: true, writes, shots };
}

/**
 * Whether, at a tiebreak point with `played` points before it, the players
 * stand at the other ends from where the tiebreak began: they change after
 * every six points, so at 3–3, 6–6, 9–9 … the ends have just swapped.
 */
export function tiebreakEndsSwapped(played: number): boolean {
  return Math.floor(played / 6) % 2 === 1;
}
