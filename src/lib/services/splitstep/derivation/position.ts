/**
 * Who stands at each end of the court, from the changeover schedule alone.
 *
 * The vendor's player labels drift with its score stream, and froze with it on
 * job ac56ef8b (frozen.ts), so a label is not a witness for who served. The
 * end a serve was struck from is: the sign of the deciding serve's `playerY`
 * (+y = top of frame) is measured from the video, not inferred, and the rules
 * of tennis fix who stands at that end. Given who started at the top (the
 * wizard's `initial_top_player_is_player1`), ends swap
 *
 *   - after games 1, 3, 5, … of every set;
 *   - after a set whose game total is odd — the set break is the changeover
 *     the odd last game would have had, so a 6-3 set swaps there and a 6-4 set
 *     does not (it already swapped after game 9);
 *   - every 6 points inside a tiebreak.
 *
 * Read against the three labelled matches, this schedule named the player at
 * each end on every labelled game. Within a set the server's end then follows
 * same, switch, same, switch… game to game, so a switch of end is a game
 * boundary visible on its own.
 *
 * It closes the gap server-witness.ts records: that study swaps ends on a
 * serve-to-serve gap and caps the gap to keep stoppages out, so it misses the
 * set-break swap. Here the set boundary comes from the caller — the score, not
 * the clock — and no timing is read at all.
 *
 * A tiebreak counts as one game of its set (game 13 after 6-6): the six
 * swaps before it put the players back on the set's starting ends, and the
 * 13-game set swaps at the break like any odd set. Swaps inside a tiebreak
 * are counted only for its own points; they do not carry into the next set.
 *
 * Pure: no I/O.
 */

import { lastServeIndex } from "./result-type";
import type { SplitStepRally } from "./types";

export type CourtEnd = "top" | "bottom";

export interface EndSchedule {
  /** The player at the top of the frame at the first point of the match. */
  topAtStart: string;
  /** The player at the bottom of the frame at the first point of the match. */
  bottomAtStart: string;
  /** Total games (both players') of each finished set, in order. */
  completedSets: readonly number[];
  /** Games already finished in the current set. 12 during a tiebreak. */
  gamesBeforeInSet: number;
  /** The end asked about. */
  end: CourtEnd;
  /** Points already played in the current tiebreak. Omit outside one. */
  tiebreakPointsBefore?: number;
}

/** Changeovers after games 1, 3, 5, … of `games` finished games. */
function swapsAfterGames(games: number): number {
  return Math.ceil(games / 2);
}

/** The player standing at `end` at the next point. */
export function playerAtEnd({
  topAtStart,
  bottomAtStart,
  completedSets,
  gamesBeforeInSet,
  end,
  tiebreakPointsBefore = 0,
}: EndSchedule): string {
  // A finished set of n games swapped after each odd game, its last one
  // included when n is odd — that last swap is the set break.
  const swaps =
    completedSets.reduce((sum, games) => sum + swapsAfterGames(games), 0) +
    swapsAfterGames(gamesBeforeInSet) +
    Math.floor(tiebreakPointsBefore / 6);
  const swapped = swaps % 2 === 1;
  const topNow = swapped ? bottomAtStart : topAtStart;
  const bottomNow = swapped ? topAtStart : bottomAtStart;
  return end === "top" ? topNow : bottomNow;
}

/**
 * The end the rally's deciding serve was struck from, by the sign of its
 * `playerY`. Null when the serve has no position or sits on the net line.
 */
export function serveEnd(rally: SplitStepRally): CourtEnd | null {
  const serve = rally.strokes[lastServeIndex(rally)] ?? rally.strokes[0];
  const y = serve?.playerY ?? null;
  if (y === null || y === 0) return null;
  return y > 0 ? "top" : "bottom";
}
