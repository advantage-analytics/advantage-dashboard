/**
 * The labelling console's scoreboard (the score before each point and the games
 * before each game) as a pure derivation over the session's points. Nothing
 * here is stored: everything is read off each point's `set_number`,
 * `game_number`, `server` and `winner` in `point_index` order, so a corrected
 * winner or a moved point redraws the whole column at once.
 *
 * - `game_number` is match-cumulative in the vendor's data, so each game also
 *   gets `gameInSet`, its rank among the set's distinct games in point order.
 * - Not every row is a point: a replayed let, a `not_a_point` row, a tombstone
 *   and a point whose winner is still blank do not move the score.
 */

import {
  LABEL_GAME_TYPES,
  isLabelGameType,
  opponent,
  type LabelEnding,
  type LabelGameType,
  type LabelPointStatus,
  type LabelSide,
} from "./session";

// `label_points.game_type`'s vocabulary lives in session.ts with the row
// types (this module imports from there, so it cannot be the home); re-exported
// here because the scoreboard is where the type is read.
export { LABEL_GAME_TYPES, isLabelGameType };
export type { LabelGameType };

/** What the scoreboard reads of a point. A `LabelPoint` satisfies it. */
export interface ScorablePoint {
  id: string;
  status: LabelPointStatus;
  setNumber: number | null;
  gameNumber: number | null;
  server: LabelSide | null;
  winner: LabelSide | null;
  ending: LabelEnding | null;
  /** Missing or null means an ordinary `game`. */
  gameType?: LabelGameType | null;
}

export interface LabelPointScore {
  /** 1-based rank of the point's game in its set; null with no set or game. */
  gameInSet: number | null;
  /**
   * The score before the point, the point's server first: "30–15",
   * "40–Ad"; raw counts in a tiebreak ("3–2"). "Game–30" once the game is
   * already decided by the points before it — the tell that a game boundary
   * is in the wrong place. Null when the point has no game.
   */
  scoreBefore: string | null;
}

export interface LabelGameBand {
  setNumber: number;
  gameNumber: number;
  gameInSet: number;
  /** Games already won in this set before this one, p1 first: "2–0". */
  gamesBefore: string;
  /**
   * Who won the game: the winner of its last counted point, or null while
   * no point of it counts. What `set-scores.ts` tallies a set from.
   */
  winner: LabelSide | null;
}

export interface LabelScores {
  /** Every live point, by id. */
  points: Map<string, LabelPointScore>;
  /** One per distinct `(set_number, game_number)` with a live point, in point order. */
  games: LabelGameBand[];
}

/** The endings that are not points: the score stands. */
const UNCOUNTED_ENDINGS: ReadonlySet<LabelEnding> = new Set<LabelEnding>([
  "let_replayed",
  "not_a_point",
]);

export function isCountedPoint(
  point: Pick<ScorablePoint, "status" | "winner" | "ending">,
): point is typeof point & { winner: LabelSide } {
  return (
    point.status !== "deleted" &&
    point.winner !== null &&
    !(point.ending !== null && UNCOUNTED_ENDINGS.has(point.ending))
  );
}

interface GameAccumulator {
  setNumber: number;
  gameNumber: number;
  /** The game's first live point's type speaks for the whole game. */
  gameType: LabelGameType;
  points: Record<LabelSide, number>;
  /** Who won the game: the winner of its last counted point so far. */
  winner: LabelSide | null;
  /**
   * Who the points so far have already settled an ordinary game for, once
   * they have. Sticky: a stray point after that keeps reading "Game".
   */
  decidedBy: LabelSide | null;
}

/**
 * Score the session. `points` are the session's rows in `point_index`
 * order; `adScoring` is whether a game at 40–40 goes to Ad (true) or ends on
 * the next point (false, "no-ad").
 */
/** `"{set}·{game}"`: the one key a point's game goes by in every map. */
export function gameKey(point: {
  setNumber: number | null;
  gameNumber: number | null;
}): string {
  return `${point.setNumber}·${point.gameNumber}`;
}

/**
 * Each game's band, keyed by the id of the first live point of that game in
 * `points` — where the console draws it, once: a point moved out of order
 * never repeats it, and a tombstone never carries one.
 */
export function bandsBeforePoints(
  points: readonly ScorablePoint[],
  games: readonly LabelGameBand[],
): ReadonlyMap<string, LabelGameBand> {
  const bandByGame = new Map(games.map((band) => [gameKey(band), band]));
  const bandBefore = new Map<string, LabelGameBand>();
  for (const point of points) {
    if (point.status === "deleted") continue;
    const key = gameKey(point);
    const band = bandByGame.get(key);
    if (!band) continue;
    bandBefore.set(point.id, band);
    bandByGame.delete(key);
  }
  return bandBefore;
}

export function labelScores(
  points: readonly ScorablePoint[],
  adScoring: boolean,
): LabelScores {
  const games: GameAccumulator[] = [];
  const gameByKey = new Map<string, GameAccumulator>();
  const rows: {
    id: string;
    game: GameAccumulator | null;
    scoreBefore: string | null;
  }[] = [];

  for (const point of points) {
    if (point.status === "deleted") continue;
    if (point.setNumber === null || point.gameNumber === null) {
      rows.push({ id: point.id, game: null, scoreBefore: null });
      continue;
    }
    const key = gameKey(point);
    let game = gameByKey.get(key);
    if (!game) {
      game = {
        setNumber: point.setNumber,
        gameNumber: point.gameNumber,
        gameType: point.gameType ?? "game",
        points: { p1: 0, p2: 0 },
        winner: null,
        decidedBy: null,
      };
      gameByKey.set(key, game);
      games.push(game);
    }
    rows.push({
      id: point.id,
      game,
      scoreBefore: formatScore(game, point.server ?? "p1"),
    });
    if (isCountedPoint(point)) {
      game.points[point.winner] += 1;
      game.winner = point.winner;
      if (
        game.gameType === "game" &&
        game.decidedBy === null &&
        gameDecided(game.points, adScoring)
      ) {
        game.decidedBy = point.winner;
      }
    }
  }

  // Rank each set's games and tally the games won before each, in the order
  // the games first appear. Winners are known only now, after every point.
  const gameInSet = new Map<GameAccumulator, number>();
  const bands: LabelGameBand[] = [];
  const perSet = new Map<
    number,
    { rank: number; won: Record<LabelSide, number> }
  >();
  for (const game of games) {
    let set = perSet.get(game.setNumber);
    if (!set) {
      set = { rank: 0, won: { p1: 0, p2: 0 } };
      perSet.set(game.setNumber, set);
    }
    set.rank += 1;
    gameInSet.set(game, set.rank);
    bands.push({
      setNumber: game.setNumber,
      gameNumber: game.gameNumber,
      gameInSet: set.rank,
      gamesBefore: `${set.won.p1}–${set.won.p2}`,
      winner: game.winner,
    });
    if (game.winner) set.won[game.winner] += 1;
  }

  const pointScores = new Map<string, LabelPointScore>();
  for (const row of rows) {
    pointScores.set(row.id, {
      gameInSet: row.game ? (gameInSet.get(row.game) ?? null) : null,
      scoreBefore: row.scoreBefore,
    });
  }
  return { points: pointScores, games: bands };
}

// ── Formatting ──────────────────────────────────────────────────────────────

const CALLS = ["0", "15", "30", "40"] as const;

function formatScore(game: GameAccumulator, server: LabelSide): string {
  const receiver = opponent(server);
  const s = game.points[server];
  const r = game.points[receiver];
  if (game.gameType !== "game") return `${s}–${r}`;
  if (game.decidedBy) {
    const call = (side: LabelSide) =>
      side === game.decidedBy ? "Game" : CALLS[Math.min(game.points[side], 3)];
    return `${call(server)}–${call(receiver)}`;
  }
  return gameCall(s, r);
}

/**
 * An ordinary, still-open game's call, server's points first. Past 40–40 the
 * leader has Ad, or the score is back to 40–40. A decided game is handled
 * before this is reached: the winner's side reads "Game", because a point
 * still sitting in a decided game is the labeller's cue, not the
 * scoreboard's to hide.
 */
function gameCall(s: number, r: number): string {
  if (s >= 3 && r >= 3) {
    if (s === r) return "40–40";
    return s > r ? "Ad–40" : "40–Ad";
  }
  return `${CALLS[Math.min(s, 3)]}–${CALLS[Math.min(r, 3)]}`;
}

/**
 * Whether the points so far have settled an ordinary game: four points and
 * two clear with ad scoring; four points at all without it, since the point
 * at 40–40 decides. Exported for `game-shift.ts`, which finds the points
 * sitting past a game's end by the same rule the "Game–30" call reads by.
 */
export function gameDecided(
  points: Record<LabelSide, number>,
  adScoring: boolean,
): boolean {
  const { p1, p2 } = points;
  if (Math.max(p1, p2) < 4) return false;
  return adScoring ? Math.abs(p1 - p2) >= 2 : true;
}
