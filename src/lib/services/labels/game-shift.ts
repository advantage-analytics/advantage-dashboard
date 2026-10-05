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
 * touches `point_index`, `winner` or a tombstone.
 */

import { labelPointFields, labelPointStatusAfterChange } from "./edit";
import { gameFirstServer, type GamePoint } from "./game-operations";
import { gameDecided, isCountedPoint, labelScores } from "./score";
import type { LabelGameType, LabelPoint, LabelSide } from "./session";

type LivePointStatus = Exclude<GamePoint["status"], "deleted">;

/** What the shift reads of a point: a `LabelPoint` satisfies it. */
export type ShiftablePoint = GamePoint;

/** One ordinary game with rows sitting past the row that decided it. */
export interface GameOverflow<T extends ShiftablePoint = ShiftablePoint> {
  setNumber: number;
  gameNumber: number;
  /** Who the game was decided for. */
  decidedBy: LabelSide;
  /** The live rows after the deciding one, in `point_index` order. */
  leftovers: T[];
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
  /** The game the shift started from. */
  fromGame: GameShiftGameRef;
  /** The first game the leftovers move into — the button's name. */
  nextGame: GameShiftGameRef;
  /** The last game the cascade reached. `nextGame` when it is one step. */
  toGame: GameShiftGameRef;
}

export type PlannedGameShift =
  | { ok: true; writes: GameShiftWrite[]; summary: GameShiftSummary }
  | { error: string };

interface Accumulator<T extends ShiftablePoint> {
  setNumber: number;
  gameNumber: number;
  /** The game's first live point's type speaks for the whole game. */
  gameType: LabelGameType;
  points: Record<LabelSide, number>;
  decidedBy: LabelSide | null;
  leftovers: T[];
}

function keyOf(point: { setNumber: number | null; gameNumber: number | null }) {
  return `${point.setNumber}·${point.gameNumber}`;
}

function opponent(side: LabelSide): LabelSide {
  return side === "p1" ? "p2" : "p1";
}

/**
 * Every ordinary game with rows past the row that decided it, in the order
 * the games first appear. A tiebreak never overflows; a game decided on its
 * last row is not listed.
 */
export function gameOverflow<T extends ShiftablePoint>(
  points: readonly T[],
  adScoring: boolean,
): GameOverflow<T>[] {
  const games: Accumulator<T>[] = [];
  const byKey = new Map<string, Accumulator<T>>();
  const live = [...points]
    .filter((p) => p.status !== "deleted")
    .sort((a, b) => a.pointIndex - b.pointIndex);
  for (const point of live) {
    if (point.setNumber === null || point.gameNumber === null) continue;
    const key = keyOf(point);
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
  points: readonly ShiftablePoint[],
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
function gameAfter<T extends ShiftablePoint>(
  live: readonly T[],
  from: { setNumber: number; gameNumber: number },
  leftovers: readonly T[],
): Destination | null {
  const lastIndex = leftovers[leftovers.length - 1].pointIndex;
  const fromKey = keyOf(from);
  for (const point of live) {
    if (point.pointIndex <= lastIndex) continue;
    if (point.setNumber === null || point.gameNumber === null) continue;
    if (keyOf(point) === fromKey) continue;
    const members = live.filter((p) => keyOf(p) === keyOf(point));
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
  points: readonly ShiftablePoint[],
  live: readonly ShiftablePoint[],
  from: { setNumber: number; gameNumber: number },
  leftovers: readonly ShiftablePoint[],
): Destination {
  let highest = 0;
  for (const point of points) {
    if (point.gameNumber !== null && point.gameNumber > highest) {
      highest = point.gameNumber;
    }
  }
  const server =
    gameFirstServer(live.filter((p) => keyOf(p) === keyOf(from))) ??
    gameFirstServer(leftovers);
  return {
    setNumber: from.setNumber,
    gameNumber: highest + 1,
    gameType: "game",
    server: server ? opponent(server) : null,
    opened: true,
  };
}

function statusAfterShift(
  point: ShiftablePoint,
  to: Destination,
): LivePointStatus {
  const server = to.server ?? point.server;
  const status = labelPointStatusAfterChange(
    { ...labelPointFields(point), status: point.status, seed: point.seed },
    { set_number: to.setNumber, game_number: to.gameNumber, server },
  );
  // Only live points are ever moved, so the rule never hands back `deleted`.
  return status as LivePointStatus;
}

/**
 * Plan the cascade from the game that holds `fromPointId`, which must be one
 * of that game's leftovers (see the file comment). Returns one write per
 * moved point — a point moved twice along the cascade appears once, with
 * where it ends up — and a summary for the button and its tooltip.
 */
export function planGameShift<T extends ShiftablePoint>(
  points: readonly T[],
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
    rank.set(keyOf(band), band.gameInSet);
    gamesInSet.set(band.setNumber, band.gameInSet);
  }
  const ref = (game: {
    setNumber: number;
    gameNumber: number;
  }): GameShiftGameRef => ({
    set: game.setNumber,
    gameInSet:
      rank.get(keyOf(game)) ?? (gamesInSet.get(game.setNumber) ?? 0) + 1,
  });

  // The rows the cascade reads from after each step: the originals, with
  // the writes so far applied. A point's status is always measured from its
  // ORIGINAL state, as one move would.
  const original = new Map(points.map((point) => [point.id, point]));
  let working: T[] = [...points];
  const writes = new Map<string, GameShiftWrite>();
  let current: GameOverflow<T> = overflow;
  let games = 0;
  let nextGame: GameShiftGameRef | null = null;
  let toGame: GameShiftGameRef = ref(overflow);

  // Bounded for safety; the anchor rule already guarantees an end.
  const bound = working.filter((p) => p.status !== "deleted").length + 1;
  for (let step = 0; step < bound; step += 1) {
    const live = working
      .filter((p) => p.status !== "deleted")
      .sort((a, b) => a.pointIndex - b.pointIndex);
    const to =
      gameAfter(live, current, current.leftovers) ??
      openGameAfter(working, live, current, current.leftovers);
    games += 1;
    const toRef = ref(to);
    if (!nextGame) nextGame = toRef;
    toGame = toRef;

    for (const point of current.leftovers) {
      const base = original.get(point.id) ?? point;
      writes.set(point.id, {
        id: point.id,
        set_number: to.setNumber,
        game_number: to.gameNumber,
        server: to.server ?? base.server,
        game_type: to.gameType,
        status: statusAfterShift(base, to),
      });
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

  return {
    ok: true,
    writes: [...writes.values()],
    summary: {
      points: writes.size,
      games,
      fromGame: ref(overflow),
      nextGame: nextGame ?? toGame,
      toGame,
    },
  };
}

/**
 * The console's rows with `writes` applied — the optimistic update. A row no
 * write names is returned as it is; order is kept, since no index moves.
 */
export function applyGameShift<
  T extends Pick<
    LabelPoint,
    "id" | "setNumber" | "gameNumber" | "server" | "gameType" | "status"
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
    };
  });
}
