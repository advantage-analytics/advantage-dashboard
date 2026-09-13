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
