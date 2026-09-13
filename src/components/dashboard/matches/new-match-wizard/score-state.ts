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

type Cells = readonly (number | null | undefined)[];

/** The games per set, and how many sets the format plays. */
export interface ScoreGames {
  bestOf: number;
  playerScores: Cells;
  opponentScores: Cells;
}

/** The form's score, read the one way: an unparseable format is best of 3. */
export function scoreGames(
  formData: Pick<FormData, "bestOf" | "playerScores" | "opponentScores">,
): ScoreGames {
  return {
    bestOf: parseInt(formData.bestOf, 10) || 3,
    playerScores: formData.playerScores,
    opponentScores: formData.opponentScores,
  };
}

/**
 * Who took a set, from its games alone — or null while it is still open.
 *
 * A set is over at 6 with a two-game lead, at 7-5, or at 7-6 (the tiebreak's
 * points don't change who took it). Anything else — 5-4, 6-5, one side still
 * blank — is unfinished.
 *
 * 1-0 is a match tiebreak played as a set, and counts as finished without its
 * points. That is how every score source spells one: a line scored courtside
 * arrives with games and no tiebreak points at all (`EventPreset.score`), the
 * scorecard itself opens the TB column and moves focus there the moment 1-0 is
 * typed (`isTiebreakSet`), and stored matches keep only the losing side's
 * points, which for a 10-0 is a zero.
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
 * The match so far, in play order: sets finished before the first open one,
 * and whether someone has already won. The one walk over the sets that
 * `scoreColumns`, `firstOpenSet` and `scoreUndecided` all read, so they cannot
 * disagree about where the match stands.
 */
function progress({ bestOf, playerScores, opponentScores }: ScoreGames): {
  finished: number;
  decided: boolean;
} {
  const toWin = Math.ceil(bestOf / 2);
  let player = 0;
  let opponent = 0;
  for (let i = 0; i < bestOf; i++) {
    const winner = setWinner(playerScores[i], opponentScores[i]);
    if (!winner) return { finished: i, decided: false };
    if (winner === "player") player++;
    else opponent++;
    if (player === toWin || opponent === toWin) {
      return { finished: i + 1, decided: true };
    }
  }
  return { finished: bestOf, decided: false };
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
export function scoreColumns(
  input: ScoreGames & {
    /** Index of the last set holding any value, plus one. */
    filled: number;
  },
): { displayed: number; decided: boolean } {
  const { bestOf, filled } = input;
  const { finished, decided } = progress(input);
  return {
    displayed: Math.min(
      bestOf,
      decided ? Math.max(filled, finished) : Math.max(2, filled, finished + 1),
    ),
    decided,
  };
}

/**
 * The first set nobody has won — where "No, I'll finish the score" sends the
 * cursor. A set can only be open once every set before it is finished, so this
 * is the count of finished sets, clamped to the format's last set.
 */
export function firstOpenSet(input: ScoreGames): number {
  return Math.min(progress(input).finished, input.bestOf - 1);
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
export function scoreUndecided(input: ScoreGames): boolean {
  const anyGames =
    input.playerScores.some((n) => (n ?? 0) > 0) ||
    input.opponentScores.some((n) => (n ?? 0) > 0);
  if (!anyGames) return false;
  return !progress(input).decided;
}
