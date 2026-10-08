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
 * - Each game's band carries its `outcome` once every point is in: settled,
 *   left unfinished, or settled with rows still past its end. The set totals
 *   (`set-scores.ts`) and the game band read it; `winner` stays the last
 *   counted point's for the readers that name a game by it.
 */

import {
  LABEL_GAME_TYPES,
  isLabelGameType,
  isNonPointEnding,
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

/**
 * How a game's points leave it. `decided`: the points settle it, the score
 * the winner's points first ("4–2"; raw counts in a tiebreak, "7–5").
 * `unfinished`: they stop short of settling it, the score the server's
 * points first as the call reads ("30–40", "5–4") — or no counted point at
 * all ("0–0"). `overflow`: settled, with `extra` live rows still sitting
 * past the row that settled it (the "Game–30" case `game-shift.ts` moves on).
 */
export type LabelGameOutcome =
  | { kind: "decided"; winner: LabelSide; score: string }
  | { kind: "unfinished"; score: string }
  | { kind: "overflow"; winner: LabelSide; score: string; extra: number };

export interface LabelGameBand {
  setNumber: number;
  gameNumber: number;
  gameInSet: number;
  /** The game's first live point's type speaks for the whole game. */
  gameType: LabelGameType;
  /** Games already won in this set before this one, p1 first: "2–0". */
  gamesBefore: string;
  /**
   * Who won the game: the winner of its last counted point, or null while
   * no point of it counts. Kept for the readers that name a game by its
   * last point; `set-scores.ts` tallies a set from `outcome`.
   */
  winner: LabelSide | null;
  /** Every counted point of the game, by who won it — leftovers included. */
  points: Record<LabelSide, number>;
  /**
   * Who the points settled an ordinary game for, once they have; null for a
   * game they have not, and always for a tiebreak (whose "Game" call is not
   * drawn).
   */
  decidedBy: LabelSide | null;
  outcome: LabelGameOutcome;
}

export interface LabelScores {
  /** Every live point, by id. */
  points: Map<string, LabelPointScore>;
  /** One per distinct `(set_number, game_number)` with a live point, in point order. */
  games: LabelGameBand[];
}

export function isCountedPoint(
  point: Pick<ScorablePoint, "status" | "winner" | "ending">,
): point is typeof point & { winner: LabelSide } {
  return (
    point.status !== "deleted" &&
    point.winner !== null &&
    !isNonPointEnding(point.ending)
  );
}

interface GameAccumulator {
  setNumber: number;
  gameNumber: number;
  /** The game's first live point's type speaks for the whole game. */
  gameType: LabelGameType;
  points: Record<LabelSide, number>;
  /** The game's first server: its first live point's that names one. */
  server: LabelSide | null;
  /** Who won the game: the winner of its last counted point so far. */
  winner: LabelSide | null;
  /**
   * Who the points settled the game for, by its own rule — an ordinary
   * game's or a tiebreak's — and the tally as it stood then. Sticky: a stray
   * point after that keeps reading "Game". What `outcome` reads; `extra`
   * counts the live rows after that one.
   */
  won: { by: LabelSide; points: Record<LabelSide, number> } | null;
  extra: number;
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
        server: null,
        points: { p1: 0, p2: 0 },
        winner: null,
        won: null,
        extra: 0,
      };
      gameByKey.set(key, game);
      games.push(game);
    }
    if (game.server === null && point.server) game.server = point.server;
    rows.push({
      id: point.id,
      game,
      scoreBefore: formatScore(game, point.server ?? "p1"),
    });
    // A live row past the settling one is an extra, counted or not — the
    // same rows `game-shift.ts` lists as leftovers.
    if (game.won) game.extra += 1;
    if (isCountedPoint(point)) {
      game.points[point.winner] += 1;
      game.winner = point.winner;
      if (game.won === null && settled(game, adScoring)) {
        game.won = { by: point.winner, points: { ...game.points } };
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
      gameType: game.gameType,
      gamesBefore: `${set.won.p1}–${set.won.p2}`,
      winner: game.winner,
      points: { ...game.points },
      decidedBy: decidedBy(game),
      outcome: gameOutcome(game),
    });
    // The band's running count credits a game only once it is settled, as
    // the set totals do (`set-scores.ts`): an unfinished game is nobody's.
    if (game.won) set.won[game.won.by] += 1;
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

/**
 * Who the points have already settled an ordinary game for; null for a game
 * they have not, and always for a tiebreak (whose "Game" call is not drawn).
 */
function decidedBy(game: GameAccumulator): LabelSide | null {
  return game.gameType === "game" ? (game.won?.by ?? null) : null;
}

function formatScore(game: GameAccumulator, server: LabelSide): string {
  const receiver = opponent(server);
  const s = game.points[server];
  const r = game.points[receiver];
  if (game.gameType !== "game") return `${s}–${r}`;
  return ordinaryGameScore(game.points, decidedBy(game), server);
}

/**
 * An ordinary game's score as the scoreboard calls it, `server` first: the
 * decided side says "Game", an open game its call. Exported for the scorecard,
 * which names the games that end undecided or run past their end.
 */
export function ordinaryGameScore(
  points: Record<LabelSide, number>,
  decidedBy: LabelSide | null,
  server: LabelSide,
): string {
  const receiver = opponent(server);
  if (decidedBy) {
    const call = (side: LabelSide) =>
      side === decidedBy ? "Game" : CALLS[Math.min(points[side], 3)];
    return `${call(server)}–${call(receiver)}`;
  }
  return gameCall(points[server], points[receiver]);
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

/** A tiebreak's target: first to 7, a match tiebreak's first to 10. */
const TIEBREAK_TARGET: Record<Exclude<LabelGameType, "game">, number> = {
  tiebreak: 7,
  match_tiebreak: 10,
};

/**
 * Whether the points so far have settled a tiebreak: its target reached and
 * two clear.
 */
function tiebreakDecided(
  points: Record<LabelSide, number>,
  type: Exclude<LabelGameType, "game">,
): boolean {
  const { p1, p2 } = points;
  return Math.max(p1, p2) >= TIEBREAK_TARGET[type] && Math.abs(p1 - p2) >= 2;
}

/** Whether the game's points settle it, by its own type's rule. */
function settled(game: GameAccumulator, adScoring: boolean): boolean {
  return game.gameType === "game"
    ? gameDecided(game.points, adScoring)
    : tiebreakDecided(game.points, game.gameType);
}

/**
 * The game's outcome once every point is in. A settled game's score is the
 * tally when it was settled, the winner's points first; an unfinished one's
 * is the call as it stands, the game's first server's points first (p1's
 * when no row names a server).
 */
function gameOutcome(game: GameAccumulator): LabelGameOutcome {
  if (game.won === null) {
    return {
      kind: "unfinished",
      score: formatScore(game, game.server ?? "p1"),
    };
  }
  const { by, points } = game.won;
  const score = `${points[by]}–${points[opponent(by)]}`;
  if (game.extra > 0) {
    return { kind: "overflow", winner: by, score, extra: game.extra };
  }
  return { kind: "decided", winner: by, score };
}
