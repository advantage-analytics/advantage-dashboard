/**
 * Servers that do not alternate: two games in a row of one set served by the
 * same player — by their game numbers, so a game missing between them (an
 * even gap) is no repeat. Ordinary games only — a tiebreak keeps its own one-then-two
 * order (tiebreak-serve.ts) — and only within a set: who serves a set's first
 * game hangs on the set before it, a tiebreak or a break off the video. The
 * points a tiebreak fold would take are left out too (`skipPointIds`,
 * `foldedPointIds`): the vendor cuts a tiebreak into "games" as the serve
 * changes hands, so its pieces repeat servers by nature, and the fold is
 * their fix.
 *
 * Of the two games, the one flagged is the one whose serving strokes
 * (player-swap.ts `servingShot`) argue more against its stored server — the
 * rows the labeller watched — and, level, the later. The fix is the game's
 * server operation with the other player (`planGameServer`), the same as
 * picking them in the game band: it rewrites every `server` and switches the
 * players on each point whose serve contradicts the new one.
 *
 * A repeat is `autofix` when the strokes settle it on their own
 * (`AUTOFIX_MIN_SERVES`): at least two of the flagged game's serves, and at
 * least half its points, are the other player's, none is the stored server's,
 * and the game beside it has a serve by its own server and none against. The
 * fix then only puts `server` right and switches nobody. The seed applies
 * those when a session is set up (seed.ts `fixSettledServeRepeats`); the
 * console never writes one by itself, so a labeller's own server — set in the
 * band, or put back with ⌘Z — always stands. One that would switch players
 * stays a slot.
 *
 * Pure: the rail draws the slot, the console runs the fix.
 */

import {
  gameFirstServer,
  gameTypeOf,
  planGameServer,
  type GameServerPoint,
} from "./game-operations";
import type { LabelGame } from "./operations";
import { servingShot } from "./player-swap";
import { gameKey } from "./score";
import { opponent, type LabelSide } from "./session";
import type { TiebreakFold } from "./tiebreak-fold";

export interface GameServeRepeat {
  /** The game to give to the other player. */
  game: LabelGame;
  /** The game's place in its set, counting the set's games on the rows. */
  gameInSet: number;
  /** The neighbour it repeats: the game before it, or after it. */
  other: { game: LabelGame; gameInSet: number };
  /** Who the rows have serving both. */
  server: LabelSide;
  /** Who should serve `game`: the other player. */
  expected: LabelSide;
  /** The game's first live point — where the rail draws the slot. */
  pointId: string;
  /** As the rail numbers that point: `pointIndex + 1`. */
  pointNumber: number;
  /** How many points switch players when the fix runs. */
  switched: number;
  /** The strokes settle it and nobody switches: the console fixes it itself. */
  autofix: boolean;
}

interface SetGame {
  game: LabelGame;
  gameInSet: number;
  live: GameServerPoint[];
  server: LabelSide | null;
  ordinary: boolean;
}

/** Every repeat on the rows, in point order. */
export function gameServeRepeats(
  points: readonly GameServerPoint[],
  /** A game with any of these points is not compared (`foldedPointIds`). */
  skipPointIds: ReadonlySet<string> = NO_POINT_IDS,
): GameServeRepeat[] {
  const sets = new Map<number, Map<number, GameServerPoint[]>>();
  for (const point of [...points].sort((a, b) => a.pointIndex - b.pointIndex)) {
    if (point.status === "deleted") continue;
    if (point.setNumber === null || point.gameNumber === null) continue;
    const games = sets.get(point.setNumber) ?? new Map();
    sets.set(point.setNumber, games);
    const rows = games.get(point.gameNumber);
    if (rows) rows.push(point);
    else games.set(point.gameNumber, [point]);
  }

  const repeats: GameServeRepeat[] = [];
  for (const [setNumber, byNumber] of sets) {
    const games: SetGame[] = [...byNumber.entries()]
      .sort(([a], [b]) => a - b)
      .map(([gameNumber, live], i) => ({
        game: { setNumber, gameNumber },
        gameInSet: i + 1,
        live,
        server: gameFirstServer(live),
        ordinary: gameTypeOf(live) === "game",
      }));
    // A game flagged as the later of one pair is not flagged again as the
    // earlier of the next: its fix changes both pairs.
    const flagged = new Set<string>();
    for (let i = 1; i < games.length; i++) {
      const before = games[i - 1];
      const after = games[i];
      if (!before.ordinary || !after.ordinary) continue;
      if (before.live.some((p) => skipPointIds.has(p.id))) continue;
      if (after.live.some((p) => skipPointIds.has(p.id))) continue;
      if (before.server === null || before.server !== after.server) continue;
      // A game missing between them (off the video, or deleted) keeps the
      // turn: games an even number apart have the same server.
      if ((after.game.gameNumber - before.game.gameNumber) % 2 === 0) continue;
      if (flagged.has(gameKey(before.game))) continue;
      const [wrong, right] =
        againstServer(before) > againstServer(after)
          ? [before, after]
          : [after, before];
      flagged.add(gameKey(wrong.game));
      const expected = opponent(before.server);
      const plan = planGameServer(points, wrong.game, expected);
      const switched =
        "error" in plan
          ? 0
          : plan.writes.filter((write) => "winner" in write).length;
      repeats.push({
        game: wrong.game,
        gameInSet: wrong.gameInSet,
        other: { game: right.game, gameInSet: right.gameInSet },
        server: before.server,
        expected,
        pointId: wrong.live[0].id,
        pointNumber: wrong.live[0].pointIndex + 1,
        switched,
        autofix: !("error" in plan) && switched === 0 && settles(wrong, right),
      });
    }
  }
  return repeats.sort((a, b) => a.pointNumber - b.pointNumber);
}

const NO_POINT_IDS: ReadonlySet<string> = new Set();

/** Every point the tiebreak folds take (tiebreak-fold.ts `tiebreakFolds`). */
export function foldedPointIds(
  folds: readonly Pick<TiebreakFold, "pointIds">[],
): ReadonlySet<string> {
  return new Set(folds.flatMap((fold) => fold.pointIds));
}

/** How many of the game's serving strokes name the other player as server. */
function againstServer(game: SetGame): number {
  return game.live.filter((point) => {
    const hitter = servingShot(point.shots)?.hitter ?? null;
    return hitter !== null && hitter !== game.server;
  }).length;
}

/** The fewest serves by the other player that settle a repeat on their own. */
export const AUTOFIX_MIN_SERVES = 2;

/**
 * Whether the strokes alone say `wrong`'s stored server is the mistake: most
 * of its points, and at least `AUTOFIX_MIN_SERVES`, served by the other
 * player and none by the stored one; and `right` served by its own server
 * with nothing against it.
 */
function settles(wrong: SetGame, right: SetGame): boolean {
  const against = againstServer(wrong);
  return (
    against >= AUTOFIX_MIN_SERVES &&
    against * 2 >= wrong.live.length &&
    servedBy(wrong, wrong.server) === 0 &&
    servedBy(right, right.server) > 0 &&
    againstServer(right) === 0
  );
}

/** How many of the game's serving strokes are `side`'s. */
function servedBy(game: SetGame, side: LabelSide | null): number {
  return game.live.filter(
    (point) => (servingShot(point.shots)?.hitter ?? null) === side,
  ).length;
}

/** Each repeat, keyed by its game's first live point — where the rail draws it. */
export function gameServeRepeatBeforePoints(
  repeats: readonly GameServeRepeat[],
): ReadonlyMap<string, GameServeRepeat> {
  return new Map(repeats.map((repeat) => [repeat.pointId, repeat]));
}

/** "Lee serves games 3 and 4" — the slot's reason. */
export function gameServeRepeatReason(
  repeat: GameServeRepeat,
  names: Record<LabelSide, string>,
): string {
  const [a, b] = [repeat.gameInSet, repeat.other.gameInSet].sort(
    (x, y) => x - y,
  );
  return `${names[repeat.server]} serves games ${a} and ${b}`;
}
