/**
 * A serve given to the other player says more than one row: the rally behind
 * it was hit the other way round, and — when the point's `server` names the
 * old hitter — so was the game. `planServeHitterFollow` reads what follows
 * from that one edit, for the console to ask about before it writes anything:
 *
 * - `point`: the point's rows agree with the old hitter serving (its serving
 *   stroke is theirs and the first rally ball is not), so the rest of the
 *   point changes hands with the serve — every stroke, the winner and ended
 *   by. A point whose rows already disagree (the serve alone was wrong) has
 *   nothing to follow.
 * - `game`: the point's `server` is not the new hitter, so the game's server
 *   changes (game-operations.ts `planGameServer`): every point of an ordinary
 *   game, and in a tiebreak the whole 1-2-2 order, rebuilt so this point is
 *   the new hitter's to serve.
 *
 * Nothing new is written by it: `run` names which of the console's existing
 * operations carries the answer. Null when the edit is only itself. Pure.
 */

import {
  gameTypeOf,
  livePointsOfGame,
  planGameServer,
  rotateServers,
  type GameServerPoint,
} from "./game-operations";
import type { LabelGame } from "./operations";
import { servingShot } from "./player-swap";
import {
  isServeStroke,
  orderLabelShots,
  type LabelGameType,
  type LabelSide,
} from "./session";

export interface ServeHitterFollow {
  pointId: string;
  /** Who the serve is given to. */
  hitter: LabelSide;
  /**
   * What of the point follows the serve: its other strokes, and the winner
   * too when the point has one — the winner alone on a point that is only
   * its serve. Null when its rows already disagree with the
   * old hitter, or there is nothing else on it to change.
   */
  point: "shots" | "shots-and-winner" | "winner" | null;
  /** The game whose server changes; null when the point's already is `hitter`. */
  game: {
    game: LabelGame;
    type: LabelGameType;
    /** Who serves the game's first point for this one to be `hitter`'s. */
    first: LabelSide;
    /** The game's live points. */
    points: number;
    /** The other points of the game whose players switch with their server. */
    switched: number;
  } | null;
  /**
   * How a yes is written: the whole-point switch ("Switch players"), the
   * game's server, or — when only the serve was wrong on this point — the
   * serve's own edit and then the game's server.
   */
  run: "switch-point" | "game-server" | "patch-then-game-server";
}

export function planServeHitterFollow(
  points: readonly GameServerPoint[],
  shotId: string,
  hitter: LabelSide | null,
): ServeHitterFollow | null {
  if (hitter === null) return null;
  const point = points.find((p) => p.shots.some((s) => s.id === shotId));
  if (!point || point.status === "deleted") return null;
  const shot = point.shots.find((s) => s.id === shotId);
  if (!shot || shot.status === "deleted" || !isServeStroke(shot.stroke)) {
    return null;
  }
  const old = shot.hitter;
  if (old === null || old === hitter) return null;

  const live = orderLabelShots(point.shots).filter(
    (s) => s.status !== "deleted",
  );
  const firstRally = live.find(
    (s) => !isServeStroke(s.stroke) && s.hitter !== null,
  );
  // The rows read as `old` serving: a whole-point switch is this edit and
  // everything that follows from it.
  const agrees =
    servingShot(point.shots)?.hitter === old && firstRally?.hitter !== old;
  const hasWinner = point.winner !== null || point.endedBy !== null;
  const hasOthers = point.shots.some(
    (s) => s.id !== shotId && s.hitter !== null,
  );
  const follows = !agrees
    ? null
    : hasWinner
      ? hasOthers
        ? "shots-and-winner"
        : "winner"
      : hasOthers
        ? "shots"
        : null;

  const game = point.server === hitter ? null : gameChange(points, point);
  if (game) {
    // With the rows disagreeing, the serve is edited on its own first; the
    // game's server follows only if the point then reads as `hitter` serving.
    if (!agrees) {
      const after = point.shots.map((s) =>
        s.id === shotId ? { ...s, hitter } : s,
      );
      if (servingShot(after)?.hitter !== hitter) return null;
    }
    return {
      pointId: point.id,
      hitter,
      point: follows,
      game: gameFor(points, game, point.id, hitter),
      run: agrees ? "game-server" : "patch-then-game-server",
    };
  }
  if (follows === null) return null;
  return {
    pointId: point.id,
    hitter,
    point: follows,
    game: null,
    run: "switch-point",
  };
}

/** The point's game, when it sits in one. */
function gameChange(
  points: readonly GameServerPoint[],
  point: GameServerPoint,
): LabelGame | null {
  if (point.setNumber === null || point.gameNumber === null) return null;
  const game = { setNumber: point.setNumber, gameNumber: point.gameNumber };
  return livePointsOfGame(points, game).length > 0 ? game : null;
}

function gameFor(
  points: readonly GameServerPoint[],
  game: LabelGame,
  pointId: string,
  hitter: LabelSide,
): NonNullable<ServeHitterFollow["game"]> {
  const live = livePointsOfGame(points, game);
  const type = gameTypeOf(live);
  const first = firstServerFor(live, type, pointId, hitter);
  const plan = planGameServer(points, game, first);
  const switched =
    "error" in plan
      ? 0
      : plan.writes.filter((w) => w.id !== pointId && "winner" in w).length;
  return { game, type, first, points: live.length, switched };
}

/**
 * Who has to serve the game's first point for `pointId` to be `hitter`'s: the
 * hitter in an ordinary game; in a tiebreak, whichever start of the 1-2-2
 * order lands on them.
 */
function firstServerFor(
  live: readonly GameServerPoint[],
  type: LabelGameType,
  pointId: string,
  hitter: LabelSide,
): LabelSide {
  if (type === "game") return hitter;
  const at = live.findIndex((p) => p.id === pointId);
  const order = rotateServers(live, type, "p1");
  return at < 0 || order[at] === hitter ? "p1" : "p2";
}
