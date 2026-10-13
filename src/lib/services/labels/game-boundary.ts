/**
 * A game's header dragged to where the game really starts. Dropped above a
 * point of the game before it, that point and every one after it in that game
 * join this game; dropped lower, in its own game, the points now above the
 * header go back to the game before. Either way it is a run of single point
 * moves into the neighbouring game (operations.ts `planPointMove`), listed
 * nearest the boundary first so each point moves to a game it sits beside.
 *
 * Only the one boundary moves: a drop past either game is refused, and so is
 * one that would leave a game with no point. Pure — the rail asks it where a
 * drop may land, the console runs the moves.
 */

import type { LabelGame, Planned } from "./operations";
import type { LabelPoint } from "./session";

type BoundaryPoint = Pick<
  LabelPoint,
  "id" | "status" | "setNumber" | "gameNumber"
>;

export interface GameBoundaryPlan {
  /** The game the points move into. */
  to: LabelGame;
  /** The points to move, in the order to move them. Empty: nothing changes. */
  pointIds: string[];
}

const inGame = (point: BoundaryPoint, game: LabelGame) =>
  point.setNumber === game.setNumber && point.gameNumber === game.gameNumber;

/**
 * Plan game `game`'s header dropped just above `beforePointId`. `points` are
 * the session's rows in rail order.
 */
export function planGameBoundary(
  points: readonly BoundaryPoint[],
  game: LabelGame,
  beforePointId: string,
): Planned<GameBoundaryPlan> {
  const live = points.filter((point) => point.status !== "deleted");
  const first = live.findIndex((point) => inGame(point, game));
  const at = live.findIndex((point) => point.id === beforePointId);
  if (first === -1 || at === -1) {
    return { error: "That game or point is not in this session." };
  }
  if (at === first) return { ok: true, write: { to: game, pointIds: [] } };

  const before = live[first - 1];
  if (
    !before ||
    before.setNumber === null ||
    before.gameNumber === null ||
    inGame(before, game)
  ) {
    return { error: "There is no game before this one to trade points with." };
  }
  const previous = {
    setNumber: before.setNumber,
    gameNumber: before.gameNumber,
  };

  if (at < first) {
    // The header moves up: the end of the game before joins this one.
    const run = live.slice(at, first);
    if (!run.every((point) => inGame(point, previous))) {
      return { error: "A game's start can move only into the game before it." };
    }
    const staying = live.filter(
      (point) => inGame(point, previous) && !run.includes(point),
    );
    if (staying.length === 0) {
      return { error: "That would leave the game before with no points." };
    }
    return {
      ok: true,
      write: { to: game, pointIds: run.map((point) => point.id).reverse() },
    };
  }

  // The header moves down: this game's first points go back a game.
  const run = live.slice(first, at);
  if (!run.every((point) => inGame(point, game)) || !inGame(live[at], game)) {
    return { error: "A game's start can move only within the game itself." };
  }
  return {
    ok: true,
    write: { to: previous, pointIds: run.map((point) => point.id) },
  };
}

/**
 * The point a drop at `pointId`'s row lands above: the row itself for its
 * upper half, the next live row for its lower. Null below the last row.
 */
export function dropBeforePoint(
  points: readonly BoundaryPoint[],
  pointId: string,
  upperHalf: boolean,
): string | null {
  if (upperHalf) return pointId;
  const live = points.filter((point) => point.status !== "deleted");
  const at = live.findIndex((point) => point.id === pointId);
  return at === -1 ? null : (live[at + 1]?.id ?? null);
}
