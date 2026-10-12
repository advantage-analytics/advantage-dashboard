/**
 * A tiebreak's serve order, held to while the rows are edited: the first
 * server serves one point, then two each in turn (game-operations.ts
 * `rotateServers`). Setting a game's type or folding the tiebreak at 6–6
 * writes that order once; a point added, deleted, moved in or called a let
 * afterwards shifts every turn behind it, and a serve given to the other
 * player contradicts it — and nothing rewrites the rest.
 *
 * `tiebreakServeOrders` reads each tiebreak game against the order and lists
 * the live points off it: a `server` that is not the order's, or a serving
 * stroke (player-swap.ts `servingShot`) hit by the other player. The order
 * starts from whoever the serving strokes say more often — the rows the
 * labeller watched — and, level or with none, from the game's stored first
 * server. The fix is the game's server operation with that first server
 * (`planGameServer`), which rewrites every `server` and switches the players
 * on each point that contradicts its new one — and, for a point whose
 * `server` was right all along, the players' switch by hand
 * (`servedRightHitWrong`).
 *
 * Pure: the rail draws the slot, the console runs the fix.
 */

import {
  gameFirstServer,
  gameTypeOf,
  planGameServer,
  rotateServers,
  type GameServerPoint,
} from "./game-operations";
import type { LabelGame } from "./operations";
import { servingShot } from "./player-swap";
import { gameKey } from "./score";
import { opponent, type LabelGameType, type LabelSide } from "./session";

export interface TiebreakServeOff {
  pointId: string;
  /** As the rail numbers the point: `pointIndex + 1`. */
  pointNumber: number;
  /** Who the order says serves it. */
  expected: LabelSide;
  /** The point's stored server. */
  server: LabelSide | null;
  /** Who its serving stroke is hit by; null with none that names a hitter. */
  serve: LabelSide | null;
}

export interface TiebreakServeOrder {
  game: LabelGame;
  type: Exclude<LabelGameType, "game">;
  /** Who the order has serving the first point. */
  first: LabelSide;
  /** The points off the order, in point order. Never empty. */
  off: TiebreakServeOff[];
  /** How many points switch players when the order is put right. */
  switched: number;
}

/** Every tiebreak game with a point off its serve order, in point order. */
export function tiebreakServeOrders(
  points: readonly GameServerPoint[],
): TiebreakServeOrder[] {
  const games = new Map<string, GameServerPoint[]>();
  for (const point of [...points].sort((a, b) => a.pointIndex - b.pointIndex)) {
    if (point.status === "deleted") continue;
    if (point.setNumber === null || point.gameNumber === null) continue;
    const key = gameKey(point);
    const rows = games.get(key);
    if (rows) rows.push(point);
    else games.set(key, [point]);
  }
  const orders: TiebreakServeOrder[] = [];
  for (const live of games.values()) {
    const type = gameTypeOf(live);
    if (type === "game") continue;
    const first = orderFirstServer(live, type);
    if (first === null) continue;
    const off = offOrder(live, type, first);
    if (off.length === 0) continue;
    const game = {
      setNumber: live[0].setNumber!,
      gameNumber: live[0].gameNumber!,
    };
    const plan = planGameServer(points, game, first);
    orders.push({
      game,
      type,
      first,
      off,
      switched:
        off.filter(servedRightHitWrong).length +
        ("error" in plan ? 0 : plan.writes.filter((w) => "winner" in w).length),
    });
  }
  return orders;
}

/**
 * Who the tiebreak's order starts from: the first server under which fewer
 * serving strokes are off; level, the game's stored first server. Null when
 * neither a stroke nor a row says.
 */
function orderFirstServer(
  live: readonly GameServerPoint[],
  type: LabelGameType,
): LabelSide | null {
  const stored = gameFirstServer(live);
  const serves = live.map((point) => servingShot(point.shots)?.hitter ?? null);
  const misses = (first: LabelSide) => {
    const order = rotateServers(live, type, first);
    return serves.filter((serve, i) => serve !== null && serve !== order[i])
      .length;
  };
  const p1 = misses("p1");
  const p2 = misses("p2");
  if (p1 !== p2) return p1 < p2 ? "p1" : "p2";
  return stored;
}

function offOrder(
  live: readonly GameServerPoint[],
  type: LabelGameType,
  first: LabelSide,
): TiebreakServeOff[] {
  const order = rotateServers(live, type, first);
  const off: TiebreakServeOff[] = [];
  live.forEach((point, i) => {
    const expected = order[i];
    const serve = servingShot(point.shots)?.hitter ?? null;
    if (point.server === expected && (serve === null || serve === expected)) {
      return;
    }
    off.push({
      pointId: point.id,
      pointNumber: point.pointIndex + 1,
      expected,
      server: point.server,
      serve,
    });
  });
  return off;
}

/**
 * A point the order already has the right `server` on, whose serving stroke
 * is the other player's: the game's server operation leaves it alone (its
 * server does not change), so the fix switches its players by hand
 * (player-swap.ts `planPlayerSwitch`).
 */
export function servedRightHitWrong(off: TiebreakServeOff): boolean {
  return (
    off.server === off.expected &&
    off.serve !== null &&
    off.serve !== off.expected
  );
}

/** Whether any point's `server` is off the order — the game operation's part. */
export function serversOffOrder(order: TiebreakServeOrder): boolean {
  return order.off.some((off) => off.server !== off.expected);
}

/** Each order off, keyed by its first off point — where the rail draws it. */
export function tiebreakServeBeforePoints(
  orders: readonly TiebreakServeOrder[],
): ReadonlyMap<string, TiebreakServeOrder> {
  return new Map(orders.map((order) => [order.off[0].pointId, order]));
}

/** "Lee serves point 88, not Kim" — one off point, in the slot's words. */
export function tiebreakServeReason(
  order: TiebreakServeOrder,
  names: Record<LabelSide, string>,
): string {
  if (order.off.length > 1) {
    return `${order.off.length} points are off the one-then-two-each order`;
  }
  const [only] = order.off;
  return `${names[only.expected]} serves point ${only.pointNumber}, not ${names[opponent(only.expected)]}`;
}
