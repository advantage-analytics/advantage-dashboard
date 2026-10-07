/**
 * The labelling console's game operations (set who serves a game, set what kind
 * of game it is) as pure rules over the console's rows:
 * game-operations-session.ts writes what they plan and the console runs the
 * same ones.
 *
 * A game is the stored `(set_number, game_number)` within a session. Both
 * operations touch every live point of the game and nothing else, naming only
 * `server`, `game_type` (the type operation) and the `status` the server change
 * implies.
 *
 * In a tiebreak the serve rotates 1-2-2. Only a point that was actually served
 * takes a turn: a replayed let or a `not_a_point` row takes the server of the
 * next served point (the last one, when nothing follows it). A point whose
 * winner is still blank is a served point all the same, which is why this is
 * not score.ts's `isCountedPoint`: the labeller sets a game's type before the
 * winners are in.
 */

import {
  opponent,
  type LabelGameType,
  type LabelPoint,
  type LabelPointStatus,
  type LabelSide,
} from "./session";
import { labelPointFields, labelPointStatusAfterChange } from "./edit";
import type { LabelGame } from "./operations";

type LivePointStatus = Exclude<LabelPointStatus, "deleted">;

/** What a game operation reads of a point. A `LabelPoint` satisfies it. */
export type GamePoint = Pick<
  LabelPoint,
  | "id"
  | "pointIndex"
  | "status"
  | "server"
  | "setNumber"
  | "gameNumber"
  | "serveSide"
  | "winner"
  | "ending"
  | "endedBy"
  | "gameType"
  | "seed"
>;

/** The columns one point of the game is written with. Nothing else. */
export interface GamePointWrite {
  id: string;
  server: LabelSide;
  /** Present only when the game's type is being set. */
  game_type?: LabelGameType;
  status: LivePointStatus;
}

export type PlannedGameWrites =
  { ok: true; writes: GamePointWrite[] } | { error: string };

/** The endings that are not served points: the rotation does not move. */
const UNSERVED_ENDINGS: ReadonlySet<NonNullable<LabelPoint["ending"]>> =
  new Set(["let_replayed", "not_a_point"]);

/** Whether a live point takes a serve turn: not a let or `not_a_point`. */
export function takesServeTurn(
  point: Pick<GamePoint, "status" | "ending">,
): boolean {
  return (
    point.status !== "deleted" &&
    !(point.ending !== null && UNSERVED_ENDINGS.has(point.ending))
  );
}

export function livePointsOfGame<T extends GamePoint>(
  points: readonly T[],
  game: LabelGame,
): T[] {
  return points
    .filter(
      (p) =>
        p.status !== "deleted" &&
        p.setNumber === game.setNumber &&
        p.gameNumber === game.gameNumber,
    )
    .sort((a, b) => a.pointIndex - b.pointIndex);
}

/**
 * The game's first server as its rows have it: the server of its first live
 * point that has one, in point order. Null when no live point names one.
 */
export function gameFirstServer(
  live: readonly Pick<GamePoint, "server">[],
): LabelSide | null {
  for (const point of live) if (point.server) return point.server;
  return null;
}

/**
 * The type of the game as its rows have it: its first live point's, the same
 * rule the scoreboard reads by. `game` when there is no live point.
 */
export function gameTypeOf(
  live: readonly Pick<GamePoint, "gameType">[],
): LabelGameType {
  return live[0]?.gameType ?? "game";
}

/**
 * Who serves each of `live` (in point order) when `first` serves the game.
 * An ordinary game: `first` throughout. A tiebreak: the 1-2-2 rotation over
 * the served points, an unserved row taking the next served point's server.
 */
export function rotateServers(
  live: readonly Pick<GamePoint, "status" | "ending">[],
  type: LabelGameType,
  first: LabelSide,
): LabelSide[] {
  if (type === "game") return live.map(() => first);

  const servers: (LabelSide | null)[] = [];
  let turn = 0;
  for (const point of live) {
    if (!takesServeTurn(point)) {
      servers.push(null);
      continue;
    }
    // Point 1 is the first server's; after that, pairs alternate sides.
    const pair = turn === 0 ? 0 : Math.floor((turn - 1) / 2) + 1;
    servers.push(pair % 2 === 0 ? first : opponent(first));
    turn += 1;
  }
  // An unserved row borrows from the next served point, else the last one,
  // else — a game of nothing but lets — the first server.
  let next: LabelSide | null = null;
  for (let i = servers.length - 1; i >= 0; i -= 1) {
    const server = servers[i];
    if (server) next = server;
    else servers[i] = next;
  }
  let last: LabelSide = first;
  for (let i = 0; i < servers.length; i += 1) {
    const server = servers[i];
    if (server) last = server;
    else servers[i] = last;
  }
  return servers as LabelSide[];
}

function statusAfterServer(
  point: GamePoint,
  server: LabelSide,
): LivePointStatus {
  const status = labelPointStatusAfterChange(
    { ...labelPointFields(point), status: point.status, seed: point.seed },
    { server },
  );
  // Only live points reach here, so the rule never hands back `deleted`.
  return status as LivePointStatus;
}

/**
 * Give game `game` the server `server`: one write per live point. In an
 * ordinary game every point gets `server`; in a tiebreak `server` is who serves
 * point 1 and the rest follow the rotation. Each status comes from
 * `labelPointStatusAfterChange` against the point's seed.
 */
export function planGameServer(
  points: readonly GamePoint[],
  game: LabelGame,
  server: LabelSide,
): PlannedGameWrites {
  const live = livePointsOfGame(points, game);
  if (live.length === 0) return { error: "That game has no live points." };
  const servers = rotateServers(live, gameTypeOf(live), server);
  return {
    ok: true,
    writes: live.map((point, i) => ({
      id: point.id,
      server: servers[i],
      status: statusAfterServer(point, servers[i]),
    })),
  };
}

/**
 * Make game `game` a `type`: one write per live point, each with `game_type`
 * and the server the type implies. Switching to a tiebreak type applies the
 * rotation from the game's current first server; switching back to `game`
 * gives every point that first server. Refused when no live point of the
 * game names a server — there is no one to rotate from.
 */
export function planGameType(
  points: readonly GamePoint[],
  game: LabelGame,
  type: LabelGameType,
): PlannedGameWrites {
  const live = livePointsOfGame(points, game);
  if (live.length === 0) return { error: "That game has no live points." };
  const first = gameFirstServer(live);
  if (!first) {
    return { error: "Set who serves this game before changing its type." };
  }
  const servers = rotateServers(live, type, first);
  return {
    ok: true,
    writes: live.map((point, i) => ({
      id: point.id,
      server: servers[i],
      game_type: type,
      status: statusAfterServer(point, servers[i]),
    })),
  };
}

/** The console's rows with `writes` applied; order is kept. */
export function applyGameWrites<T extends LabelPoint>(
  points: readonly T[],
  writes: readonly GamePointWrite[],
): T[] {
  const byId = new Map(writes.map((write) => [write.id, write]));
  return points.map((point) => {
    const write = byId.get(point.id);
    if (!write) return point;
    return {
      ...point,
      server: write.server,
      status: write.status,
      gameType: write.game_type ?? point.gameType,
    };
  });
}
