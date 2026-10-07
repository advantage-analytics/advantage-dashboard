/**
 * Shift the points left over past a game's end into the next game: the
 * console's answer to a "Game–30" score. A game boundary is stored per point
 * and nothing re-derives it, so a point added at the top of a game leaves the
 * game decided one row early. Pure: game-shift-session.ts writes what this
 * plans and the console runs the same plan.
 *
 * - Leftovers are a game's live rows after the row that decided it
 *   (`gameDecided`). They all move into the next game, keeping their
 *   `point_index` and taking its set, game, type and first server
 *   (`gameFirstServer`). That game is then read again, and so on until a game
 *   does not run over.
 * - With no game after, they open a new one: same set, the highest
 *   `game_number` plus one, the other server. A tiebreak takes the moved points
 *   but is never split or re-rotated.
 * - A moved point's status is a move's (`labelPointStatusAfterChange`). When
 *   its server changes and its own strokes say the old server served it, its
 *   players switch as a whole (player-swap.ts), read once against where it ends
 *   up.
 *
 * The other way round is a game that ends short — 30–40 and then the next
 * game's rows (`gameUnderflow`). `planGamePull` takes the next game's leading
 * rows into it one at a time until it is settled, each taking the short
 * game's server, and carries on into the donor when that is left short in
 * turn. It stops with `add_point` instead of a plan when the cascade would
 * read from more than two games or a donor runs out before the game is
 * settled: then the game is more likely missing a point the vendor never
 * saw than holding the next game's.
 */

import { labelPointFields, labelPointStatusAfterChange } from "./edit";
import { gameFirstServer, type GamePoint } from "./game-operations";
import {
  planPlayerSwap,
  type PlayerSwap,
  type ShotSwapWrite,
  type SwapShot,
} from "./player-swap";
import {
  gameDecided,
  gameKey,
  isCountedPoint,
  labelScores,
  type LabelGameBand,
} from "./score";
import {
  opponent,
  type LabelGameType,
  type LabelPoint,
  type LabelSide,
} from "./session";

type LivePointStatus = Exclude<GamePoint["status"], "deleted">;

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

/**
 * One ordinary game whose rows stop short of settling it. Read off the
 * scoreboard's bands, so its score is the call as the band reads it.
 */
export interface GameUnderflow {
  setNumber: number;
  gameNumber: number;
  /** Its rank in its set — the number the band names it by. */
  gameInSet: number;
  /** The call as it stands, the game's server first: "30–40". */
  score: string;
  /** The game's live rows, in `point_index` order; never empty. */
  rows: GamePoint[];
  /** The last live row: the slot sits after it and "Add point" inserts there. */
  lastPointId: string;
}

export interface GamePullSummary {
  /** Rows pulled in. */
  points: number;
  /** Games the rows were pulled FROM — the cascade's length, 1 or 2. */
  games: number;
  /** The first game pulled from — the slot's words. */
  fromGame: GameShiftGameRef;
  /** Pulled rows whose players switch — the tooltip's warning. */
  swapped: number;
}

export type PlannedGamePull =
  | {
      ok: true;
      writes: GameShiftWrite[];
      shots: ShotSwapWrite[];
      summary: GamePullSummary;
    }
  /** No plan: the game is more likely missing a point than holding the next game's. */
  | { kind: "add_point" }
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
  for (const point of liveRows(points)) {
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

  const { shots, swapped } = flippedShots(swaps);
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

/** The strokes the cascade's swaps flip, and how many points switched. */
function flippedShots(swaps: ReadonlyMap<string, PlayerSwap | null>): {
  shots: ShotSwapWrite[];
  swapped: number;
} {
  const shots: ShotSwapWrite[] = [];
  let swapped = 0;
  for (const swap of swaps.values()) {
    if (!swap) continue;
    swapped += 1;
    shots.push(...swap.shots);
  }
  return { shots, swapped };
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

// ── A game that ends short ─────────────────────────────────────────────────

/** The live rows with a set and a game, in `point_index` order. */
function liveRows<T extends GamePoint>(points: readonly T[]): T[] {
  return points
    .filter(
      (p) =>
        p.status !== "deleted" && p.setNumber !== null && p.gameNumber !== null,
    )
    .sort((a, b) => a.pointIndex - b.pointIndex);
}

/** `live` grouped by game, each in `point_index` order. */
function rowsByGame<T extends GamePoint>(live: readonly T[]): Map<string, T[]> {
  const byGame = new Map<string, T[]>();
  for (const point of live) {
    const key = gameKey(point);
    const list = byGame.get(key);
    if (list) list.push(point);
    else byGame.set(key, [point]);
  }
  return byGame;
}

/** Whether a band's game is an ordinary one left short with a point in it. */
function bandIsShort(band: LabelGameBand): boolean {
  return (
    band.gameType === "game" &&
    band.outcome.kind === "unfinished" &&
    band.points.p1 + band.points.p2 > 0
  );
}

/**
 * Every ordinary game with a counted point whose rows stop short of settling
 * it, in the order the games appear — except the last game of each set,
 * which has no game of its own set after it to read from. That takes in the
 * session's last game: the rail reads it as still being played
 * (`bandOutcomeShown`, label-black-rail.tsx) and never says "Unfinished" on
 * it, so no slot asks about it either — the labeller adds its points by the
 * row menu.
 */
export function gameUnderflow(
  points: readonly GamePoint[],
  adScoring: boolean,
): GameUnderflow[] {
  const live = liveRows(points);
  const bands = labelScores(live, adScoring).games;
  if (bands.length === 0) return [];
  const byGame = rowsByGame(live);
  const lastOfSet = new Map<number, string>();
  for (const band of bands) lastOfSet.set(band.setNumber, gameKey(band));
  const out: GameUnderflow[] = [];
  for (const band of bands) {
    if (!bandIsShort(band)) continue;
    const key = gameKey(band);
    if (lastOfSet.get(band.setNumber) === key) continue;
    const rows = byGame.get(key) ?? [];
    out.push({
      setNumber: band.setNumber,
      gameNumber: band.gameNumber,
      gameInSet: band.gameInSet,
      score: band.outcome.kind === "unfinished" ? band.outcome.score : "",
      rows,
      lastPointId: rows[rows.length - 1].id,
    });
  }
  return out;
}

/**
 * Plan the pull into the short game `key` (`"{set}·{game}"`); see
 * `planGamePullFrom`. An error when the game is not short.
 */
export function planGamePull(
  points: readonly ShiftPoint[],
  key: string,
  adScoring: boolean,
): PlannedGamePull {
  const short = gameUnderflow(points, adScoring);
  const from = short.find((game) => gameKey(game) === key);
  if (!from) {
    return { error: "That game is not short — there is nothing to pull in." };
  }
  return planGamePullFrom(points, from, adScoring);
}

/**
 * Plan the pull into the short game `from` (one `gameUnderflow` listed): one
 * write per pulled row with where it ends up, the strokes flipped with any
 * row whose players switch, and a summary for the slot. `add_point` when no
 * plan is sound (see the file comment).
 */
export function planGamePullFrom(
  points: readonly ShiftPoint[],
  from: { setNumber: number; gameNumber: number },
  adScoring: boolean,
): PlannedGamePull {
  // The game ranks the console names games by, on the rows as they stand.
  const rank = new Map<string, number>();
  for (const band of labelScores(points, adScoring).games) {
    rank.set(gameKey(band), band.gameInSet);
  }
  const ref = (game: {
    setNumber: number;
    gameNumber: number;
  }): GameShiftGameRef => ({
    set: game.setNumber,
    gameInSet: rank.get(gameKey(game)) ?? 0,
  });

  // As in `planGameShift`: the cascade reads from the originals with the
  // writes so far applied, and each row's status is measured from its
  // ORIGINAL state.
  const original = new Map(points.map((point) => [point.id, point]));
  let working: ShiftPoint[] = [...points];
  const writes = new Map<string, GameShiftWrite>();
  const swaps = new Map<string, PlayerSwap | null>();
  let current: { setNumber: number; gameNumber: number } = from;
  /** The games pulled from, in order; a game is listed once. */
  const donors: string[] = [];
  let fromGame: GameShiftGameRef | null = null;

  // Bounded for safety: every step either pulls a row or ends the loop.
  const bound = working.filter((p) => p.status !== "deleted").length + 2;
  for (let step = 0; step < bound; step += 1) {
    const live = liveRows(working);
    const bands = labelScores(live, adScoring).games;
    const band = bands.find((b) => gameKey(b) === gameKey(current));
    if (!band) return { kind: "add_point" };
    if (band.outcome.kind !== "unfinished") {
      // Settled. The donor it was read from may be short now in turn: carry
      // on into it, unless it is the last game of its set.
      const last = donors[donors.length - 1];
      const donor = last ? bands.find((b) => gameKey(b) === last) : undefined;
      if (!donor || !bandIsShort(donor)) break;
      const lastOfSet = [...bands]
        .reverse()
        .find((b) => b.setNumber === donor.setNumber);
      if (lastOfSet === donor) break;
      current = donor;
      continue;
    }

    const byGame = rowsByGame(live);
    const rows = byGame.get(gameKey(current)) ?? [];
    const to = gameAfter(live, current, rows);
    // No game after, one in another set, or a tiebreak — never split.
    if (!to || to.setNumber !== current.setNumber || to.gameType !== "game") {
      return { kind: "add_point" };
    }
    const donorKey = gameKey(to);
    if (donors[donors.length - 1] !== donorKey) {
      if (donors.length >= 2) return { kind: "add_point" };
      donors.push(donorKey);
      fromGame ??= ref(to);
    }
    const donorRows = byGame.get(donorKey) ?? [];
    const first = original.get(donorRows[0].id);
    if (!first) return { kind: "add_point" };
    const { write, swap } = shiftWrite(first, {
      setNumber: current.setNumber,
      gameNumber: current.gameNumber,
      gameType: "game",
      server: gameFirstServer(rows),
      opened: false,
    });
    writes.set(first.id, write);
    swaps.set(first.id, swap);
    working = applyGameShift(working, [...writes.values()]);

    // The donor given whole without settling the game: a point is missing,
    // not misplaced.
    if (donorRows.length === 1) {
      const after = labelScores(liveRows(working), adScoring).games.find(
        (b) => gameKey(b) === gameKey(current),
      );
      if (!after || after.outcome.kind === "unfinished") {
        return { kind: "add_point" };
      }
    }
  }
  if (writes.size === 0 || !fromGame) return { kind: "add_point" };

  const { shots, swapped } = flippedShots(swaps);
  return {
    ok: true,
    writes: [...writes.values()],
    shots,
    summary: { points: writes.size, games: donors.length, fromGame, swapped },
  };
}
