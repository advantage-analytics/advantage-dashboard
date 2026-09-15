import type { MatchPoint } from "@/lib/data/match-points-server";
import type { ScoreLineSet } from "@/lib/ui/score-format";

/**
 * The scoreboard's numbers, oriented you-first.
 *
 * `points.set_score` / `game_score` / `point_score` are SERVER-FIRST strings
 * ("30-40" is server 30, returner 40 — `process-match/index.ts` for imports,
 * `derivation/scores.ts` for video). The board has a fixed row order (you on
 * top, opponent below), so every string is absolutized through
 * `serverIsPlayer1` first and oriented through `youIsPlayer1` second. Neither
 * step may be skipped or merged: skipping the first makes a change of server
 * look like a change of score, and skipping the second is guardrails §4.
 *
 * Settled sets come from the ENTERED score (`sides.sets`, already you-first),
 * because a set that is over has a final that the vendor's running count may
 * disagree with. Only the set in play reads from the running `game_score`.
 */

export interface ScorePair {
  player1: string;
  player2: string;
}

/** "30-40" with the server as player1 → { player1: "30", player2: "40" }. */
export function absolutize(
  serverFirst: string | null | undefined,
  serverIsPlayer1: boolean,
): ScorePair | null {
  if (!serverFirst) return null;
  const parts = serverFirst.split("-").map((p) => p.trim());
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  const [server, returner] = parts;
  return serverIsPlayer1
    ? { player1: server, player2: returner }
    : { player1: returner, player2: server };
}

/**
 * A point score read the way the umpire calls it: the server's number first,
 * whoever is serving. "30-40" stays "30–40" when either player serves — the
 * stored string is already server-first, so this only validates and dashes it.
 * Rows and board cells that sit under a player's name are the ones that
 * orient by player; a lone score string never does.
 */
export function serverFirstScore(
  serverFirst: string | null | undefined,
): string | null {
  const pair = absolutize(serverFirst, true);
  return pair ? `${pair.player1}\u2013${pair.player2}` : null;
}

/** "Giacomo Revelli" → "G. Revelli"; a single word is left alone. */
export function initialSurname(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length < 2) return name.trim();
  return `${parts[0][0].toUpperCase()}. ${parts[parts.length - 1]}`;
}

export interface BoardRow {
  /** "G. Revelli" */
  name: string;
  serving: boolean;
  /** One entry per set column; null renders blank, never 0. */
  sets: (number | null)[];
  /** The live game score cell ("30", "AD"); null renders blank. */
  game: string | null;
}

export interface Board {
  /** You first, then the opponent. */
  rows: [BoardRow, BoardRow];
  /** Index into `sets` of the column currently in play. */
  liveSet: number;
  /** "30–40", SERVER-first like tennis calls it, for the point line; null when unknown. */
  pointLine: string | null;
}

export interface BoardSides {
  youIsPlayer1: boolean;
  youName: string;
  oppName: string;
  /** Entered sets, you-first (`useMatchSides().sets`). */
  sets: ScoreLineSet[];
}

export interface BoardColumns {
  /** Whether the match's `game_score` column carries real values. */
  hasGameScore: boolean;
  /** Whether the match's `point_score` column carries real values. */
  hasPointScore: boolean;
}

function youFirst(pair: ScorePair, youIsPlayer1: boolean): [string, string] {
  return youIsPlayer1
    ? [pair.player1, pair.player2]
    : [pair.player2, pair.player1];
}

function asGames(value: string): number | null {
  const n = Number(value);
  return Number.isInteger(n) && n >= 0 ? n : null;
}

/** The board as it stood when `point` began. */
export function boardAt(
  point: MatchPoint,
  sides: BoardSides,
  columns: BoardColumns,
): Board {
  const liveSet = Math.max(0, point.setNumber - 1);
  const youSets: (number | null)[] = [];
  const oppSets: (number | null)[] = [];

  for (let i = 0; i < liveSet; i += 1) {
    const entered = sides.sets[i];
    youSets.push(entered ? entered.player1 : null);
    oppSets.push(entered ? entered.player2 : null);
  }

  const games = columns.hasGameScore
    ? absolutize(point.gameScore, point.serverIsPlayer1)
    : null;
  if (games) {
    const [you, opp] = youFirst(games, sides.youIsPlayer1);
    youSets.push(asGames(you));
    oppSets.push(asGames(opp));
  } else {
    youSets.push(null);
    oppSets.push(null);
  }

  const pts = columns.hasPointScore
    ? absolutize(point.pointScore, point.serverIsPlayer1)
    : null;
  const [youPts, oppPts] = pts
    ? youFirst(pts, sides.youIsPlayer1)
    : [null, null];

  const youServing = point.serverIsPlayer1 === sides.youIsPlayer1;

  return {
    rows: [
      {
        name: initialSurname(sides.youName),
        serving: youServing,
        sets: youSets,
        game: youPts,
      },
      {
        name: initialSurname(sides.oppName),
        serving: !youServing,
        sets: oppSets,
        game: oppPts,
      },
    ],
    liveSet,
    pointLine: pts ? serverFirstScore(point.pointScore) : null,
  };
}

/**
 * Whether a score column is real on this match.
 *
 * `match-points-server.ts` coerces a null column to "0-0", and a derivation
 * that never wrote the column leaves every row at exactly that. Printing
 * "0-0" on every row would be a fabricated score in the one place a player
 * reads as fact, so a column that is "0-0" from end to end is treated as
 * absent. A real match escapes the test on its second game.
 */
export function scoreColumns(points: MatchPoint[]): BoardColumns {
  const has = (read: (p: MatchPoint) => string) =>
    points.length > 0 && points.some((p) => read(p) !== "0-0");
  return {
    hasGameScore: has((p) => p.gameScore),
    hasPointScore: has((p) => p.pointScore),
  };
}
