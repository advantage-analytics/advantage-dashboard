/**
 * Break, set and match points.
 *
 * These were previously left unset, which meant they defaulted to `false` on
 * every derived row — so a 6-4 6-4 match, which contains at least two breaks of
 * serve, reported zero break points. That is not a missing statistic, it is a
 * fabricated one: `calculate_match_stats` counts break points by filtering on
 * the flag, so the whole break-point family read a confident 0.
 *
 * They are derivable, and from the half of the data we trust. A break point is
 * not an observation about the rally — it is an arithmetic fact about the score
 * *before* the point is played, and the score stream is the part that
 * reproduces the player's entered result exactly.
 *
 * Deliberately computed from the score BEFORE the point, not after. "Was this a
 * break point" asks what was at stake when it started.
 */

import type { SplitStepRally } from './types';

/** Rungs of a game. AD only appears when the vendor emits it, which it never has. */
const LADDER: Record<string, number> = { '0': 0, '15': 1, '30': 2, '40': 3, AD: 4 };

export interface PressureFlags {
  isBreakPoint: boolean;
  isSetPoint: boolean;
  isMatchPoint: boolean;
}

export interface PressureInput {
  rally: SplitStepRally;
  /** Player labels, exactly two. */
  labels: string[];
  /** Games won so far in the current set, per label, BEFORE this point. */
  gamesThisSet: Record<string, number>;
  /** Sets won so far, per label, BEFORE this point. */
  setsWon: Record<string, number>;
  /** From matches.format.ad_scoring. */
  adScoring: boolean;
  /** From matches.format.best_of. */
  bestOf: number;
}

/** Server-relative score string → rungs per label. */
function rungs(
  score: string | null,
  server: string,
  returner: string
): Record<string, number> | null {
  if (!score) return null;
  const parts = score.split('-');
  if (parts.length !== 2) return null;
  const s = LADDER[parts[0].trim().toUpperCase()];
  const r = LADDER[parts[1].trim().toUpperCase()];
  if (s === undefined || r === undefined) return null;
  return { [server]: s, [returner]: r };
}

/**
 * Would winning this point win the game for `player`?
 *
 * Under no-ad, 40-40 is a deciding point, so BOTH players hold game point —
 * which is exactly why the ad_scoring flag has to be threaded this far down. A
 * no-ad deciding point is the most pressured point in tennis and reporting it
 * as neither player's break point would be the same failure this module exists
 * to fix, one level subtler.
 */
function winsGame(
  mine: number,
  theirs: number,
  adScoring: boolean
): boolean {
  if (mine < 3) return false;
  if (mine > theirs) return true;
  return !adScoring && mine === 3 && theirs === 3;
}

/** Would winning this game win the set? Standard sets only; tiebreaks are refused upstream. */
function winsSet(mine: number, theirs: number): boolean {
  const after = mine + 1;
  if (after < 6) return false;
  if (after === 6) return theirs <= 4;
  // 7-5 closes a set; 7-6 is a tiebreak we do not derive.
  return after === 7 && theirs === 5;
}

/**
 * Flags for one point.
 *
 * Returns all false when the point score cannot be read, which is honest: an
 * unparseable score means we do not know what was at stake, and `false` here
 * feeds a count of "points that were break points", where an unknown one simply
 * is not counted. That is different from the bug this replaced, where every
 * point was silently declared not-a-break-point.
 */
export function pressureFor(input: PressureInput): PressureFlags {
  const { rally, labels, gamesThisSet, setsWon, adScoring, bestOf } = input;
  const none: PressureFlags = {
    isBreakPoint: false,
    isSetPoint: false,
    isMatchPoint: false,
  };

  const server = rally.server;
  const returner = labels.find((l) => l !== server);
  if (!returner || labels.length !== 2) return none;

  const before = rungs(rally.strokes[0]?.predPointScore ?? null, server, returner);
  if (!before) return none;

  const setsToWin = Math.floor(bestOf / 2) + 1;

  let isBreakPoint = false;
  let isSetPoint = false;
  let isMatchPoint = false;

  for (const player of labels) {
    const other = player === server ? returner : server;
    if (!winsGame(before[player], before[other], adScoring)) continue;

    // Only the RETURNER converting is a break.
    if (player === returner) isBreakPoint = true;

    const myGames = gamesThisSet[player] ?? 0;
    const theirGames = gamesThisSet[other] ?? 0;
    if (!winsSet(myGames, theirGames)) continue;

    isSetPoint = true;
    if ((setsWon[player] ?? 0) + 1 >= setsToWin) isMatchPoint = true;
  }

  return { isBreakPoint, isSetPoint, isMatchPoint };
}
