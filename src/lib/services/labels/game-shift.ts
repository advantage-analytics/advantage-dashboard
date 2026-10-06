/**
 * Shift the points left over past a game's end into the next game — the
 * labelling console's answer to a "Game–30" score.
 *
 * A game boundary is stored per point (`set_number`, `game_number`, `server`
 * and `game_type` on each `label_points` row; see score.ts's header), and
 * nothing re-derives it. So when the labeller adds a point the vendor missed
 * at the top of a game, the game is decided one row early and its last rows
 * read "Game–30", "Game–40": the scoreboard's tell that they belong to the
 * NEXT game. This module plans that move as a pure rule over the console's
 * rows, like operations.ts: the admin-gated service
 * (game-shift-session.ts) writes what it plans, and the `"use client"`
 * console runs the same plan for its optimistic rows.
 *
 * ── The cascade ─────────────────────────────────────────────────────────────
 * The leftovers of a game are its live rows after the row that decided it
 * (`gameDecided`, score.ts's own rule — ad or no-ad) in `point_index` order.
 * A replayed let, a row marked `not_a_point` and a point with no winner yet
 * are leftovers too when they sit past that row: they are rows of a game
 * that is over. They move, all of them, into the NEXT game — the game of
 * the first live point after them that is not theirs — keeping their
 * `point_index`, so they open that game in point order. They take its
 * `set_number`, `game_number`, `game_type` and first server
 * (`gameFirstServer`). That game is then read again with the moved points
 * in front: if it now runs over, ITS leftovers move on to the game after
 * it, and so on, until a game does not. Each step's anchor — the point after
 * the moved rows — sits strictly later than the last, so the cascade cannot
 * revisit a game and is bounded by the number of live points besides.
 *
 * With no game after the leftovers they open a NEW one: the same set, the
 * session's highest `game_number` plus one, served by the other side from
 * the overflowing game's server, an ordinary `game`. A tiebreak (or match
 * tiebreak) takes the moved points but is never split — raw counts have no
 * "already won" row the way an ordinary game does — so the cascade stops at
 * it. Its serve rotation is NOT re-rotated: the moved points take the
 * tiebreak's first server, and the band's server menu is the labeller's way
 * to re-rotate if the tiebreak had already begun.
 *
 * A moved point's status is a move's: `labelPointStatusAfterChange` measured
 * against its seed, exactly as `planPointMove` does it, so a point shifted
 * back into the game it was seeded in reads `unchanged` again. Nothing here
 * touches `point_index` or a tombstone.
 *
 * ── Players switch with the server ──────────────────────────────────────────
 * A moved point whose server changes, and whose own strokes say the OLD
 * server served it, switches players as a whole (player-swap.ts
 * `planPlayerSwap`, the same rule as the point menu's move): its `winner`
 * and `ended_by` flip on the write, and every stroke's hitter comes out in
 * the plan's `shots`. A point whose rows already agree with its new server
 * takes the server alone. Each point is read ONCE for this, against where it
 * ends up — a point carried through two games along the cascade is compared
 * with the last — so a cascade over games with alternating servers swaps
 * exactly the points whose rows contradict their final game.
 */

import { labelPointFields, labelPointStatusAfterChange } from "./edit";
import { gameFirstServer, type GamePoint } from "./game-operations";
import {
  planPlayerSwap,
  type PlayerSwap,
  type ShotSwapWrite,
  type SwapShot,
} from "./player-swap";
import { gameDecided, gameKey, isCountedPoint, labelScores } from "./score";
import {
  opponent,
  type LabelGameType,
  type LabelPoint,
  type LabelSide,
} from "./session";

type LivePointStatus = Exclude<GamePoint["status"], "deleted">;

/** A point as the shift reads it: a game point with its strokes. */
export type ShiftPoint = GamePoint & { shots: readonly SwapShot[] };

/**
 * One ordinary game with rows sitting past the row that decided it. The
 * shift reads a `GamePoint` of each row; a `LabelPoint` satisfies it.
 */
export interface GameOverflow {
  setNumber: number;
  gameNumber: number;
  /** Who the game was decided for. */
  decidedBy: LabelSide;
  /** The live rows after the deciding one, in `point_index` order. */
  leftovers: GamePoint[];
}

/** The columns one moved point is written with. Nothing else. */
export interface GameShiftWrite {
  id: string;
  set_number: number;
  game_number: number;
  /** The destination's first server; the point's own when it names none. */
  server: LabelSide | null;
  game_type: LabelGameType;
  status: LivePointStatus;
  /** Present only when the point's players switch (player-swap.ts). */
  winner?: LabelSide | null;
  ended_by?: LabelSide | null;
}

/** A game as the console names it: its set and its rank within the set. */
export interface GameShiftGameRef {
  set: number;
  gameInSet: number;
}

export interface GameShiftSummary {
  /** Distinct points moved. */
  points: number;
  /** Games the moved points went INTO — the cascade's length. */
  games: number;
  /** The first game the leftovers move into — the button's name. */
  nextGame: GameShiftGameRef;
  /** Moved points whose players switch — the tooltip's warning. */
  swapped: number;
}

export type PlannedGameShift =
  | {
      ok: true;
      writes: GameShiftWrite[];
      /** The strokes flipped with their points' players; empty when none. */
      shots: ShotSwapWrite[];
      summary: GameShiftSummary;
    }
  | { error: string };

interface Accumulator {
  setNumber: number;
  gameNumber: number;
  /** The game's first live point's type speaks for the whole game. */
  gameType: LabelGameType;
  points: Record<LabelSide, number>;
  decidedBy: LabelSide | null;
  leftovers: GamePoint[];
}

/**
 * Every ordinary game with rows past the row that decided it, in the order
 * the games first appear. A tiebreak never overflows; a game decided on its
 * last row is not listed.
 */
export function gameOverflow(
  points: readonly GamePoint[],
  adScoring: boolean,
): GameOverflow[] {
  const games: Accumulator[] = [];
  const byKey = new Map<string, Accumulator>();
  const live = [...points]
    .filter((p) => p.status !== "deleted")
    .sort((a, b) => a.pointIndex - b.pointIndex);
  for (const point of live) {
    if (point.setNumber === null || point.gameNumber === null) continue;
    const key = gameKey(point);
    let game = byKey.get(key);
    if (!game) {
      game = {
        setNumber: point.setNumber,
        gameNumber: point.gameNumber,
        gameType: point.gameType ?? "game",
        points: { p1: 0, p2: 0 },
        decidedBy: null,
        leftovers: [],
      };
      byKey.set(key, game);
      games.push(game);
    }
    if (game.gameType !== "game") continue;
    if (game.decidedBy) {
      game.leftovers.push(point);
      continue;
    }
    if (isCountedPoint(point)) {
      game.points[point.winner] += 1;
      if (gameDecided(game.points, adScoring)) game.decidedBy = point.winner;
    }
  }
  return games
    .filter((game) => game.decidedBy !== null && game.leftovers.length > 0)
    .map((game) => ({
      setNumber: game.setNumber,
      gameNumber: game.gameNumber,
      decidedBy: game.decidedBy as LabelSide,
      leftovers: game.leftovers,
    }));
}

/** The ids of every leftover row, across every overflowing game. */
export function leftoverIds(
  points: readonly GamePoint[],
  adScoring: boolean,
): ReadonlySet<string> {
  const ids = new Set<string>();
  for (const game of gameOverflow(points, adScoring)) {
    for (const point of game.leftovers) ids.add(point.id);
  }
  return ids;
}

/** Where the destination is, and what the moved points take from it. */
interface Destination {
  setNumber: number;
  gameNumber: number;
  gameType: LabelGameType;
  server: LabelSide | null;
  /** True when no game followed and this one is being opened. */
  opened: boolean;
}

/**
 * The game after `leftovers`: that of the first live point past the last of
 * them whose game is not `from`. Null when nothing follows.
 */
function gameAfter(
  live: readonly GamePoint[],
  from: { setNumber: number; gameNumber: number },
  leftovers: readonly GamePoint[],
): Destination | null {
  const lastIndex = leftovers[leftovers.length - 1].pointIndex;
  const fromKey = gameKey(from);
  for (const point of live) {
    if (point.pointIndex <= lastIndex) continue;
    if (point.setNumber === null || point.gameNumber === null) continue;
    if (gameKey(point) === fromKey) continue;
    const members = live.filter((p) => gameKey(p) === gameKey(point));
    return {
      setNumber: point.setNumber,
      gameNumber: point.gameNumber,
      gameType: members[0]?.gameType ?? "game",
      server: gameFirstServer(members),
      opened: false,
    };
  }
  return null;
}

/** A new game after `from`: same set, the next number, the other server. */
function openGameAfter(
  points: readonly GamePoint[],
  live: readonly GamePoint[],
  from: { setNumber: number; gameNumber: number },
  leftovers: readonly GamePoint[],
): Destination {
  let highest = 0;
  for (const point of points) {
    if (point.gameNumber !== null && point.gameNumber > highest) {
      highest = point.gameNumber;
    }
  }
  const server =
    gameFirstServer(live.filter((p) => gameKey(p) === gameKey(from))) ??
    gameFirstServer(leftovers);
  return {
    setNumber: from.setNumber,
    gameNumber: highest + 1,
    gameType: "game",
    server: server ? opponent(server) : null,
    opened: true,
  };
}

/**
 * One moved point's write, measured from its ORIGINAL row: the destination's
 * server (its own when the destination names none), the players' swap when
 * that server is new and the rows contradict it, and the status the whole
 * change implies.
 */
function shiftWrite(
  point: ShiftPoint,
  to: Destination,
): { write: GameShiftWrite; swap: PlayerSwap | null } {
  const server = to.server ?? point.server;
  const swap = planPlayerSwap(point, server);
  const change = {
    set_number: to.setNumber,
    game_number: to.gameNumber,
    server,
    ...(swap ? swap.point : {}),
  };
  const status = labelPointStatusAfterChange(
    { ...labelPointFields(point), status: point.status, seed: point.seed },
    change,
  );
  const write: GameShiftWrite = {
    id: point.id,
    set_number: to.setNumber,
    game_number: to.gameNumber,
    server,
    game_type: to.gameType,
    // Only live points are ever moved, so the rule never hands back `deleted`.
    status: status as LivePointStatus,
  };
  if (swap) {
    write.winner = swap.point.winner;
    write.ended_by = swap.point.ended_by;
  }
  return { write, swap };
}

/**
 * Plan the cascade from the game that holds `fromPointId`, which must be one
 * of that game's leftovers (see the file comment). Returns one write per
 * moved point — a point moved twice along the cascade appears once, with
 * where it ends up — the strokes flipped with any point whose players
 * switch, and a summary for the button and its tooltip.
 */
export function planGameShift(
  points: readonly ShiftPoint[],
  adScoring: boolean,
  fromPointId: string,
): PlannedGameShift {
  const from = points.find((point) => point.id === fromPointId);
  if (!from) return { error: "That point is not a point of this session." };
  if (from.status === "deleted") {
    return { error: "Restore this point before moving it." };
  }
  if (from.setNumber === null || from.gameNumber === null) {
    return { error: "Put this point in a game before moving it on." };
  }
  const overflow = gameOverflow(points, adScoring).find((game) =>
    game.leftovers.some((point) => point.id === fromPointId),
  );
  if (!overflow) {
    return {
      error: "That point sits inside its game — there is nothing to move on.",
    };
  }

  // The game ranks the console names games by, on the rows as they stand.
  const rank = new Map<string, number>();
  const gamesInSet = new Map<number, number>();
  for (const band of labelScores(points, adScoring).games) {
    rank.set(gameKey(band), band.gameInSet);
    gamesInSet.set(band.setNumber, band.gameInSet);
  }
  const ref = (game: {
    setNumber: number;
    gameNumber: number;
  }): GameShiftGameRef => ({
    set: game.setNumber,
    gameInSet:
      rank.get(gameKey(game)) ?? (gamesInSet.get(game.setNumber) ?? 0) + 1,
  });

  // The rows the cascade reads from after each step: the originals, with
  // the writes so far applied. A point's status is always measured from its
  // ORIGINAL state, as one move would.
  const original = new Map(points.map((point) => [point.id, point]));
  let working: ShiftPoint[] = [...points];
  const writes = new Map<string, GameShiftWrite>();
  const swaps = new Map<string, PlayerSwap | null>();
  let current: GameOverflow = overflow;
  /** The game each step moved into, in order. */
  const steps: GameShiftGameRef[] = [];

  // Bounded for safety; the anchor rule already guarantees an end.
  const bound = working.filter((p) => p.status !== "deleted").length + 1;
  for (let step = 0; step < bound; step += 1) {
    const live = working
      .filter((p) => p.status !== "deleted")
      .sort((a, b) => a.pointIndex - b.pointIndex);
    const to =
      gameAfter(live, current, current.leftovers) ??
      openGameAfter(working, live, current, current.leftovers);
    steps.push(ref(to));

    for (const point of current.leftovers) {
      // Every leftover is one of `points`, read back by id.
      const base = original.get(point.id);
      if (!base) continue;
      const { write, swap } = shiftWrite(base, to);
      writes.set(point.id, write);
      swaps.set(point.id, swap);
    }
    working = applyGameShift(working, [...writes.values()]);

    // A tiebreak takes the points and is never split; a game just opened
    // has nothing before the moved points to be decided by.
    if (to.gameType !== "game" || to.opened) break;
    const next = gameOverflow(working, adScoring).find(
      (game) =>
        game.setNumber === to.setNumber && game.gameNumber === to.gameNumber,
    );
    if (!next) break;
    current = next;
  }

  const shots: ShotSwapWrite[] = [];
  let swapped = 0;
  for (const id of writes.keys()) {
    const swap = swaps.get(id);
    if (!swap) continue;
    swapped += 1;
    shots.push(...swap.shots);
  }
  return {
    ok: true,
    writes: [...writes.values()],
    shots,
    summary: {
      points: writes.size,
      games: steps.length,
      nextGame: steps[0],
      swapped,
    },
  };
}

/**
 * The console's rows with `writes` applied — the optimistic update of the
 * points' own columns; the flipped strokes go on through player-swap.ts
 * `applyShotSwaps`. A row no write names is returned as it is; order is
 * kept, since no index moves.
 */
export function applyGameShift<
  T extends Pick<
    LabelPoint,
    | "id"
    | "setNumber"
    | "gameNumber"
    | "server"
    | "gameType"
    | "status"
    | "winner"
    | "endedBy"
  >,
>(points: readonly T[], writes: readonly GameShiftWrite[]): T[] {
  const byId = new Map(writes.map((write) => [write.id, write]));
  return points.map((point) => {
    const write = byId.get(point.id);
    if (!write) return point;
    return {
      ...point,
      setNumber: write.set_number,
      gameNumber: write.game_number,
      server: write.server,
      gameType: write.game_type,
      status: write.status,
      winner: "winner" in write ? (write.winner ?? null) : point.winner,
      endedBy: "ended_by" in write ? (write.ended_by ?? null) : point.endedBy,
    };
  });
}
