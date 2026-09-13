import { expect, test } from "@playwright/test";

import { updateScoreState } from "@/components/dashboard/matches/new-match-wizard/score-state";
import { DEFAULT_FORM_DATA } from "@/components/dashboard/matches/new-match-wizard/types";
import { getAdjustedScores } from "@/components/dashboard/matches/new-match-wizard/utils";

function scoreState(
  overrides: Partial<typeof DEFAULT_FORM_DATA> = {},
): typeof DEFAULT_FORM_DATA {
  return {
    ...DEFAULT_FORM_DATA,
    playerScores: [...DEFAULT_FORM_DATA.playerScores],
    opponentScores: [...DEFAULT_FORM_DATA.opponentScores],
    playerTiebreaks: [...DEFAULT_FORM_DATA.playerTiebreaks],
    opponentTiebreaks: [...DEFAULT_FORM_DATA.opponentTiebreaks],
    ...overrides,
  };
}

test.describe("updateScoreState", () => {
  test("pads short imports with nulls and preserves entries through set five", () => {
    let state = scoreState({
      bestOf: "5",
      numberOfSets: 1,
      playerScores: [6],
      opponentScores: [4],
      playerTiebreaks: [null],
      opponentTiebreaks: [null],
    });

    for (const [index, value] of [
      [1, "3"],
      [2, "0"],
      [3, "7"],
      [4, "5"],
    ] as const) {
      state = updateScoreState(state, "playerScores", index, value);
    }

    expect(state.playerScores).toEqual([6, 3, 0, 7, 5]);
    expect(state.opponentScores).toEqual([4]);
    expect(state.numberOfSets).toBe(5);
  });

  test("records a new set's first digit and active count together", () => {
    const state = updateScoreState(
      scoreState({
        numberOfSets: 1,
        playerScores: [6],
        opponentScores: [4],
      }),
      "opponentScores",
      2,
      "0",
    );

    expect(state.opponentScores).toEqual([4, null, 0]);
    expect(state.playerScores).toEqual([6]);
    expect(state.numberOfSets).toBe(3);
  });

  test("clearing writes null without turning an unanswered cell into zero", () => {
    const state = updateScoreState(
      scoreState({ numberOfSets: 3, playerScores: [6] }),
      "playerScores",
      2,
      "",
    );

    expect(state.playerScores).toEqual([6, null, null]);
    expect(state.numberOfSets).toBe(3);
  });

  test("tiebreak edits pad independently and keep the existing 99 limit", () => {
    const state = updateScoreState(
      scoreState({
        bestOf: "5",
        numberOfSets: 1,
        playerScores: [7],
        opponentScores: [6],
        playerTiebreaks: [null],
      }),
      "playerTiebreaks",
      3,
      "120",
      99,
    );

    expect(state.playerTiebreaks).toEqual([null, null, null, 99]);
    expect(state.playerScores).toEqual([7]);
    expect(state.opponentScores).toEqual([6]);
    expect(state.numberOfSets).toBe(4);
  });

  test("ignores non-digits and indexes outside the selected format", () => {
    const initial = scoreState({ playerScores: [6] });

    expect(updateScoreState(initial, "playerScores", 1, "six")).toBe(initial);
    expect(updateScoreState(initial, "playerScores", 3, "6")).toBe(initial);
  });

  test("submitted game arrays retain every populated active set", () => {
    let state = scoreState({
      numberOfSets: 1,
      playerScores: [6],
      opponentScores: [4],
    });
    state = updateScoreState(state, "playerScores", 1, "7");
    state = updateScoreState(state, "opponentScores", 1, "5");
    state = updateScoreState(state, "playerScores", 2, "0");
    state = updateScoreState(state, "opponentScores", 2, "6");

    expect(
      getAdjustedScores(state.playerScores, state.bestOf, state.numberOfSets),
    ).toEqual([6, 7, 0]);
    expect(
      getAdjustedScores(state.opponentScores, state.bestOf, state.numberOfSets),
    ).toEqual([4, 5, 6]);
  });
});
