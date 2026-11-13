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
 *
 * A dragged boundary is the labeller's word (Design B, 2026-10-24: in 124
 * unbalanced games a winner was wrong in 103), so the same op LOCKS the game
 * at its new first live point (`label_points.game_start_locked`,
 * `lockPointId`) and the move's writes land in one transaction with it — one
 * `undo_label_op` rewinds both. `lockedGames` lists the games so locked;
 * game-shift.ts's `gameOverflow` / `gameUnderflow` skip them, and
 * `lockedGameImbalance` names the points whose winner is in doubt instead.
 */

import type { LabelGame, Planned } from "./operations";
import {
  gameKey,
  isCountedPoint,
  labelScores,
  type ScorablePoint,
} from "./score";
import {
  isNonPointEnding,
  type LabelPoint,
  type LabelSide,
  type LabelStartScore,
} from "./session";

type BoundaryPoint = Pick<
  LabelPoint,
  "id" | "status" | "setNumber" | "gameNumber"
> &
  Partial<Pick<LabelPoint, "gameStartLocked">>;

export interface GameBoundaryPlan {
  /** The game the points move into. */
  to: LabelGame;
  /** The points to move, in the order to move them. Empty: nothing changes. */
  pointIds: string[];
  /**
   * The dragged game's new first live point, which takes the lock
   * (`game_start_locked: true`) in the same write as the moves. Among
   * `pointIds` when the header moved up: that point's move carries it.
   */
  lockPointId: string;
  /**
   * Points of the dragged game still holding a lock that are no longer its
   * first — the old first point, when the header moved up past it. Cleared in
   * the same write, so the lock reads from one row per game.
   */
  unlockPointIds: string[];
}

/** The lock half of a plan: what the console hands the move's write. */
export type GameBoundaryLock = Pick<
  GameBoundaryPlan,
  "lockPointId" | "unlockPointIds"
>;

/** `value` as a {@link GameBoundaryLock}, or null when it is not one. */
export function isGameBoundaryLock(value: unknown): value is GameBoundaryLock {
  if (typeof value !== "object" || value === null) return false;
  const { lockPointId, unlockPointIds } = value as Record<string, unknown>;
  return (
    typeof lockPointId === "string" &&
    Array.isArray(unlockPointIds) &&
    unlockPointIds.every((id) => typeof id === "string")
  );
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
  // The lock sits on the game's new first live point; any other point of the
  // game still holding one (its old first, passed on the way up) lets go.
  const lock = (run: readonly BoundaryPoint[]) => ({
    lockPointId: beforePointId,
    unlockPointIds: live
      .filter(
        (point) =>
          inGame(point, game) &&
          point.id !== beforePointId &&
          !run.includes(point) &&
          point.gameStartLocked === true,
      )
      .map((point) => point.id),
  });

  if (at === first) {
    return { ok: true, write: { to: game, pointIds: [], ...lock([]) } };
  }

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
      write: {
        to: game,
        pointIds: run.map((point) => point.id).reverse(),
        ...lock(run),
      },
    };
  }

  // The header moves down: this game's first points go back a game.
  const run = live.slice(first, at);
  if (!run.every((point) => inGame(point, game)) || !inGame(live[at], game)) {
    return { error: "A game's start can move only within the game itself." };
  }
  return {
    ok: true,
    write: {
      to: previous,
      pointIds: run.map((point) => point.id),
      ...lock(run),
    },
  };
}

/**
 * The live points game `game`'s header can be dropped above: every one whose
 * plan moves something (`planGameBoundary`). What the rail offers as drop
 * positions while the band is in the air.
 */
export function gameDropPoints(
  points: readonly BoundaryPoint[],
  game: LabelGame,
): Set<string> {
  const drops = new Set<string>();
  for (const point of points) {
    if (point.status === "deleted") continue;
    const plan = planGameBoundary(points, game, point.id);
    if ("ok" in plan && plan.write.pointIds.length > 0) drops.add(point.id);
  }
  return drops;
}

/**
 * Game `game`'s own first live point: where its header already sits. A drop
 * nearest it is the band put back — no move — so the rail measures it beside
 * `gameDropPoints` and treats it as a cancel.
 */
export function gameStartPoint(
  points: readonly BoundaryPoint[],
  game: LabelGame,
): string | null {
  return (
    points.find((point) => point.status !== "deleted" && inGame(point, game))
      ?.id ?? null
  );
}

/**
 * The drop position nearest the cursor: of `gaps` — each a point a header can
 * land above, with the height its drop line is drawn at — the one whose line
 * is closest to `y`, the earlier on a tie. Null with none. The line follows
 * the cursor through a tall open point, the bands and the slots between
 * rows, and holds at the game's last position when the cursor goes past it,
 * where reading the row under the cursor made it jump or vanish.
 */
export function nearestGameDrop(
  gaps: readonly { pointId: string; y: number }[],
  y: number,
): string | null {
  let best: { pointId: string; y: number } | null = null;
  for (const gap of gaps) {
    if (!best || Math.abs(gap.y - y) < Math.abs(best.y - y)) best = gap;
  }
  return best?.pointId ?? null;
}

// ── Locked games ───────────────────────────────────────────────────────────

/** What the lock readings need of a point. A `LabelPoint` satisfies it. */
export type LockablePoint = Pick<
  LabelPoint,
  "id" | "status" | "setNumber" | "gameNumber"
> &
  Partial<Pick<LabelPoint, "gameStartLocked">>;

/**
 * The keys (`gameKey`) of the games whose first live point is locked, in the
 * order the games first appear. `points` are the session's rows in rail
 * order. A lock on any later row of a game says nothing: the boundary it
 * fixed is the game's start.
 */
export function lockedGames(points: readonly LockablePoint[]): Set<string> {
  const seen = new Set<string>();
  const locked = new Set<string>();
  for (const point of points) {
    if (point.status === "deleted") continue;
    if (point.setNumber === null || point.gameNumber === null) continue;
    const key = gameKey(point);
    if (seen.has(key)) continue;
    seen.add(key);
    if (point.gameStartLocked === true) locked.add(key);
  }
  return locked;
}

/** What `lockedGameImbalance` reads of a point. A `LabelPoint` satisfies it. */
export type ImbalancePoint = ScorablePoint &
  Partial<Pick<LabelPoint, "gameStartLocked">>;

/**
 * The points a locked game's winners do not add up on: for each locked game
 * whose outcome is not `decided` on its last row (unfinished, or decided
 * with rows still past the deciding one), the ids of its live points NOT won
 * by the band's `winner` — the winner of its last counted point, which in a
 * game the labeller says ends there is the point that won it — in rail order.
 * A non-point (a replayed let) is no one's to win and is left out; a point
 * with no winner yet is listed, since it is not won by the game's winner
 * either. A locked game decided on its last row, and every unlocked game,
 * contribute nothing. `start` is the session's start score (null: the video
 * starts at the beginning), as `labelScores` reads it.
 */
export function lockedGameImbalance(
  points: readonly ImbalancePoint[],
  adScoring: boolean,
  start: LabelStartScore | null = null,
): string[] {
  return [...lockedGameNeeds(points, adScoring, start).keys()];
}

/**
 * `lockedGameImbalance`'s points, each with the side its locked game needs it
 * won by — the band's `winner` — in rail order. What "Was the last ball
 * out?" reads (marks-state.ts `lastBallAgainstGame`): a doubted point whose
 * last ball, called the other way, would hand it to that side.
 */
export function lockedGameNeeds(
  points: readonly ImbalancePoint[],
  adScoring: boolean,
  start: LabelStartScore | null = null,
): Map<string, LabelSide> {
  const needs = new Map<string, LabelSide>();
  const locked = lockedGames(points);
  if (locked.size === 0) return needs;
  const suspect = new Map<string, LabelSide>();
  for (const band of labelScores(points, adScoring, start).games) {
    const key = gameKey(band);
    if (!locked.has(key) || band.outcome.kind === "decided") continue;
    // No counted point yet: the game is unlabelled, not unbalanced.
    if (band.winner === null) continue;
    suspect.set(key, band.winner);
  }
  if (suspect.size === 0) return needs;
  for (const point of points) {
    if (point.status === "deleted" || isNonPointEnding(point.ending)) continue;
    const winner = suspect.get(gameKey(point));
    if (winner === undefined) continue;
    if (!isCountedPoint(point) || point.winner !== winner) {
      needs.set(point.id, winner);
    }
  }
  return needs;
}
