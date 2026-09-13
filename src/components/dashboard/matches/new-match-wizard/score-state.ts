import type { FormData } from "./types";

export type ScoreArrayField =
  "playerScores" | "opponentScores" | "playerTiebreaks" | "opponentTiebreaks";

const MAX_SETS = 5;

/**
 * Apply one score-cell edit without assuming the parsed or preset array is
 * already as long as the rendered scorecard.
 *
 * Imported scores contain only the sets found in the file. A later rendered
 * cell can therefore sit beyond the array's current length; Array#map cannot
 * reach that cell. Pad those gaps with null (unanswered), retain zero as an
 * entered value, and activate a newly populated set in the same transition so
 * submission cannot slice the digit back off.
 */
export function updateScoreState<T extends FormData>(
  state: T,
  field: ScoreArrayField,
  index: number,
  value: string,
  max?: number,
): T {
  const bestOf = Number.parseInt(state.bestOf, 10);
  const formatLimit = [1, 3, 5].includes(bestOf) ? bestOf : 3;
  if (!Number.isInteger(index) || index < 0 || index >= formatLimit) {
    return state;
  }

  let parsed: number | null;
  if (value === "") {
    parsed = null;
  } else if (/^\d+$/.test(value)) {
    parsed = max == null ? Number(value) : Math.min(max, Number(value));
  } else {
    return state;
  }

  const scores = state[field].slice();
  while (scores.length <= index && scores.length < MAX_SETS) scores.push(null);
  scores[index] = parsed;

  const defaultSetCount = formatLimit;
  const currentSetCount = state.numberOfSets ?? defaultSetCount;
  const numberOfSets =
    parsed === null
      ? state.numberOfSets
      : Math.min(formatLimit, Math.max(currentSetCount, index + 1));

  return {
    ...state,
    [field]: scores,
    numberOfSets,
  };
}

/**
 * Who took a set, from its games alone — or null while it is still open.
 *
 * A set is over at 6 with a two-game lead, at 7-5, or at 7-6 (the tiebreak's
 * points don't change who took it). 1-0 is a match tiebreak played as a set.
 * Anything else — 5-4, 6-5, one side still blank — is unfinished.
 */
export function setWinner(
  player: number | null | undefined,
  opponent: number | null | undefined,
): "player" | "opponent" | null {
  if (player == null || opponent == null || player === opponent) return null;
  const high = Math.max(player, opponent);
  const low = Math.min(player, opponent);
  const over =
    (high >= 6 && high - low >= 2) ||
    (high === 7 && (low === 5 || low === 6)) ||
    (high === 1 && low === 0);
  if (!over) return null;
  return player > opponent ? "player" : "opponent";
}

/**
 * How many set columns the scorecard shows, and whether it offers another.
 *
 * The match decides: once one side has won `ceil(bestOf / 2)` sets there is
 * nothing left to play, so no new column and no dashed "add a set" column —
 * but a set that already holds a score is never hidden. Until then the card
 * shows two columns, and one more the moment every set so far is finished, so
 * a best-of-3 split 1-1 opens set 3 by itself while 2-0 ends at two.
 */
export function scoreColumns(input: {
  bestOf: number;
  playerScores: readonly (number | null | undefined)[];
  opponentScores: readonly (number | null | undefined)[];
  /** Index of the last set holding any value, plus one. */
  filled: number;
}): { displayed: number; decided: boolean } {
  const { bestOf, playerScores, opponentScores, filled } = input;
  const toWin = Math.ceil(bestOf / 2);
  let player = 0;
  let opponent = 0;
  let finished = 0;
  for (let i = 0; i < bestOf; i++) {
    const winner = setWinner(playerScores[i], opponentScores[i]);
    if (!winner) break;
    finished = i + 1;
    if (winner === "player") player++;
    else opponent++;
    if (player === toWin || opponent === toWin) {
      return {
        displayed: Math.min(bestOf, Math.max(filled, finished)),
        decided: true,
      };
    }
  }
  return {
    displayed: Math.min(bestOf, Math.max(2, filled, finished + 1)),
    decided: false,
  };
}

/**
 * The two ways a match can end without the score deciding it, spelled the way
 * `matches.result` stores them. "Unfinished" is the literal the SwingVision
 * parser already writes, so a typed score and an imported one land on one
 * value; the match pages print the string as the score's context line.
 */
export const STOPPED_RESULTS = ["Retired", "Unfinished"] as const;
export type StoppedResult = (typeof STOPPED_RESULTS)[number];

export function isStoppedResult(result: string): result is StoppedResult {
  return (STOPPED_RESULTS as readonly string[]).includes(result);
}

/**
 * A score with games in it that nobody has won — the case that needs the
 * "did it end early?" answer before the match is saved. An empty score is not
 * this: that one is a missing field, and `collectMatchCompletionRequirements`
 * already asks for it.
 */
export function scoreUndecided({
  bestOf,
  playerScores,
  opponentScores,
}: {
  bestOf: number;
  playerScores: (number | null)[];
  opponentScores: (number | null)[];
}): boolean {
  const anyGames =
    playerScores.some((n) => (n ?? 0) > 0) ||
    opponentScores.some((n) => (n ?? 0) > 0);
  if (!anyGames) return false;
  return !scoreColumns({ bestOf, playerScores, opponentScores, filled: 0 })
    .decided;
}
