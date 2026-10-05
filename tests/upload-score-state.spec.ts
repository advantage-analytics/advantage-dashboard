import { expect, test } from "@playwright/test";

import {
  asksIfEndedEarly,
  isStoppedResult,
  scoreCheckAnswered,
  STOP_REASONS,
  retiredWinner,
  firstOpenSet,
  offersOneSet,
  scoreGames,
  scoreColumns,
  scoreUndecided,
  setWinner,
  updateScoreState,
} from "@/components/dashboard/matches/new-match-wizard/score-state";
import {
  DEFAULT_FORM_DATA,
  type EventPreset,
} from "@/components/dashboard/matches/new-match-wizard/types";
import { getAdjustedScores } from "@/components/dashboard/matches/new-match-wizard/utils";
import { uploadWizardHarness } from "./fixtures/upload-wizard-hook";

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

test.describe("setWinner", () => {
  test("a set is won at 6 by two, at 7-5, at 7-6, or as a 1-0 match tiebreak", () => {
    expect(setWinner(6, 4)).toBe("player");
    expect(setWinner(3, 6)).toBe("opponent");
    expect(setWinner(7, 5)).toBe("player");
    expect(setWinner(6, 7)).toBe("opponent");
    expect(setWinner(1, 0)).toBe("player");
    expect(setWinner(0, 1)).toBe("opponent");
    expect(setWinner(8, 6)).toBe("player");
  });

  test("an unfinished or half-entered set has no winner", () => {
    expect(setWinner(5, 4)).toBeNull();
    expect(setWinner(6, 5)).toBeNull();
    expect(setWinner(6, null)).toBeNull();
    expect(setWinner(null, null)).toBeNull();
    expect(setWinner(3, 3)).toBeNull();
  });
});

test.describe("scoreColumns", () => {
  const cols = (
    bestOf: number,
    player: (number | null)[],
    opponent: (number | null)[],
  ) => {
    let filled = 0;
    player.forEach((p, i) => {
      if (p != null || opponent[i] != null) filled = i + 1;
    });
    return scoreColumns({
      bestOf,
      playerScores: player,
      opponentScores: opponent,
      filled,
    });
  };

  test("a best-of-3 split 1-1 opens a third set", () => {
    expect(cols(3, [6, 3], [4, 6])).toEqual({ displayed: 3, decided: false });
  });

  test("a best-of-3 won 2-0 ends at two sets, with nothing to add", () => {
    expect(cols(3, [6, 6], [4, 3])).toEqual({ displayed: 2, decided: true });
  });

  test("a set still being typed doesn't open the next one", () => {
    expect(cols(3, [6, 6], [4, null])).toEqual({
      displayed: 2,
      decided: false,
    });
    expect(cols(3, [6, 5], [4, 4])).toEqual({ displayed: 2, decided: false });
  });

  test("a set that already holds a score is never hidden, even after the match is decided", () => {
    expect(cols(3, [6, 6, 2], [4, 3, 1])).toEqual({
      displayed: 3,
      decided: true,
    });
  });

  test("best of 5 keeps opening sets until someone has three", () => {
    expect(cols(5, [6, 6], [4, 3])).toEqual({ displayed: 3, decided: false });
    expect(cols(5, [6, 6, 6], [4, 3, 2])).toEqual({
      displayed: 3,
      decided: true,
    });
    expect(cols(5, [6, 3, 6, 3], [4, 6, 2, 6])).toEqual({
      displayed: 5,
      decided: false,
    });
  });

  test("best of 1 is one set", () => {
    expect(cols(1, [null], [null])).toEqual({ displayed: 1, decided: false });
    expect(cols(1, [6], [4])).toEqual({ displayed: 1, decided: true });
  });
});

test.describe("scoreUndecided — when Save asks whether the match ended early", () => {
  const bestOf = 3;

  test("an empty score is a missing field, not an early end", () => {
    expect(
      scoreUndecided({
        bestOf,
        playerScores: [null, null],
        opponentScores: [null, null],
      }),
    ).toBe(false);
  });

  test("one set, a split and a half-typed set are all undecided", () => {
    expect(
      scoreUndecided({ bestOf, playerScores: [6], opponentScores: [4] }),
    ).toBe(true);
    expect(
      scoreUndecided({ bestOf, playerScores: [6, 3], opponentScores: [4, 6] }),
    ).toBe(true);
    expect(
      scoreUndecided({
        bestOf,
        playerScores: [6, 3],
        opponentScores: [4, null],
      }),
    ).toBe(true);
  });

  test("a won match is decided", () => {
    expect(
      scoreUndecided({ bestOf, playerScores: [6, 6], opponentScores: [4, 3] }),
    ).toBe(false);
    expect(
      scoreUndecided({
        bestOf,
        playerScores: [6, 3, 7],
        opponentScores: [4, 6, 6],
      }),
    ).toBe(false);
  });

  test("a match tiebreak recorded without its points is still a finished match", () => {
    // How a line scored courtside arrives: games only, no tiebreak points
    // (`EventPreset.score`). Asking "did it end early?" here would push a
    // complete match into a false Retired or Unfinished.
    expect(
      scoreUndecided({
        bestOf,
        playerScores: [6, 3, 1],
        opponentScores: [4, 6, 0],
      }),
    ).toBe(false);
  });

  test("only Retired and Unfinished count as an answer", () => {
    expect(isStoppedResult("Retired")).toBe(true);
    expect(isStoppedResult("Unfinished")).toBe(true);
    expect(isStoppedResult("")).toBe(false);
    expect(isStoppedResult("Rudy Wins")).toBe(false);
  });

  test("Retired is only an answer once it says who retired", () => {
    expect(scoreCheckAnswered({ result: "Unfinished" })).toBe(true);
    expect(scoreCheckAnswered({ result: "Retired" })).toBe(false);
    expect(
      scoreCheckAnswered({ result: "Retired", retiredSide: "opponent" }),
    ).toBe(true);
    expect(scoreCheckAnswered({ result: "", retiredSide: "player" })).toBe(
      false,
    );
  });

  test("STOP_REASONS is exactly the three slugs", () => {
    expect([...STOP_REASONS]).toEqual(["clinched", "time_weather", "retired"]);
  });

  test("a stop reason is detail on the answer, never the answer", () => {
    expect(DEFAULT_FORM_DATA.stopReason).toBeUndefined();
    expect(scoreCheckAnswered({ result: "Unfinished" })).toBe(true);
    // The form passes its whole state, stopReason included; the check must
    // read past it.
    for (const stopReason of STOP_REASONS) {
      const answered = (result: string) =>
        scoreCheckAnswered({ ...scoreState({ result, stopReason }) });
      expect(answered("Unfinished")).toBe(true);
      // A reason alone, with no result or no retired side, answers nothing.
      expect(answered("")).toBe(false);
      expect(answered("Retired")).toBe(false);
    }
  });

  test("a SwingVision import is never asked", () => {
    expect(asksIfEndedEarly("swing-vision")).toBe(false);
    expect(asksIfEndedEarly("splitstep")).toBe(true);
    expect(asksIfEndedEarly(null)).toBe(true);
  });

  test("the side that did not retire takes the win", () => {
    expect(retiredWinner("opponent")).toBe("player1");
    expect(retiredWinner("player")).toBe("player2");
  });
});

test.describe("firstOpenSet — where finishing the score starts", () => {
  test("the first set nobody has won, in play order", () => {
    expect(
      firstOpenSet({ bestOf: 3, playerScores: [6], opponentScores: [4] }),
    ).toBe(1);
    expect(
      firstOpenSet({
        bestOf: 3,
        playerScores: [7, 6],
        opponentScores: [6, null],
      }),
    ).toBe(1);
    expect(
      firstOpenSet({ bestOf: 3, playerScores: [6, 3], opponentScores: [4, 6] }),
    ).toBe(2);
    expect(
      firstOpenSet({ bestOf: 3, playerScores: [5], opponentScores: [4] }),
    ).toBe(0);
  });

  test("a 7-6 set is finished on its games", () => {
    expect(
      firstOpenSet({
        bestOf: 3,
        playerScores: [7, 6],
        opponentScores: [6, null],
      }),
    ).toBe(1);
  });

  test("never past the format's last set", () => {
    expect(
      firstOpenSet({ bestOf: 3, playerScores: [6, 6], opponentScores: [4, 3] }),
    ).toBe(2);
    expect(
      firstOpenSet({ bestOf: 1, playerScores: [6], opponentScores: [4] }),
    ).toBe(0);
  });
});

test.describe('offersOneSet — "No, it was a one-set match"', () => {
  test("set 1 finished, nothing past it, in a best of 3 or 5", () => {
    expect(
      offersOneSet({ bestOf: 3, playerScores: [6], opponentScores: [4] }),
    ).toBe(true);
    expect(
      offersOneSet({ bestOf: 5, playerScores: [3], opponentScores: [6] }),
    ).toBe(true);
    // The form pads with empty sets; those are not games typed past set 1.
    expect(
      offersOneSet({
        bestOf: 3,
        playerScores: [7, null, null],
        opponentScores: [6, null, null],
      }),
    ).toBe(true);
  });

  test("never for best of 1 — it already is one set", () => {
    expect(
      offersOneSet({ bestOf: 1, playerScores: [6], opponentScores: [4] }),
    ).toBe(false);
  });

  test("never for a 1-1 split", () => {
    expect(
      offersOneSet({ bestOf: 3, playerScores: [6, 3], opponentScores: [4, 6] }),
    ).toBe(false);
  });

  test("never for a half-typed second set — the switch would drop it", () => {
    expect(
      offersOneSet({
        bestOf: 3,
        playerScores: [6, 2],
        opponentScores: [4, 1],
      }),
    ).toBe(false);
    // One side alone, even a zero, is a game entered past set 1.
    expect(
      offersOneSet({
        bestOf: 3,
        playerScores: [6, null],
        opponentScores: [4, 0],
      }),
    ).toBe(false);
  });

  test("never for an undecided first set", () => {
    expect(
      offersOneSet({ bestOf: 3, playerScores: [5], opponentScores: [4] }),
    ).toBe(false);
    expect(
      offersOneSet({ bestOf: 3, playerScores: [6], opponentScores: [5] }),
    ).toBe(false);
  });

  test("never once the match is decided", () => {
    expect(
      offersOneSet({ bestOf: 3, playerScores: [6, 6], opponentScores: [4, 4] }),
    ).toBe(false);
  });

  test("when offered, best of 1 decides the score with nothing lost", () => {
    const form = scoreState({
      bestOf: "3",
      playerScores: [6, null, null],
      opponentScores: [4, null, null],
    });
    expect(scoreUndecided(scoreGames(form))).toBe(true);
    expect(offersOneSet(scoreGames(form))).toBe(true);
    // What `handleFormatChange("1")` leaves behind.
    const oneSet = {
      bestOf: "1",
      playerScores: form.playerScores.slice(0, 1),
      opponentScores: form.opponentScores.slice(0, 1),
    };
    expect(oneSet.playerScores).toEqual([6]);
    expect(oneSet.opponentScores).toEqual([4]);
    expect(scoreUndecided(scoreGames(oneSet))).toBe(false);
    expect(setWinner(oneSet.playerScores[0], oneSet.opponentScores[0])).toBe(
      "player",
    );
  });
});

test("scoreGames reads an unparseable format as best of 3", () => {
  const scores = { playerScores: [6], opponentScores: [4] };
  expect(scoreGames({ bestOf: "5", ...scores }).bestOf).toBe(5);
  expect(scoreGames({ bestOf: "", ...scores }).bestOf).toBe(3);
});

test.describe("the wizard's preset seed · recorded tiebreaks", () => {
  function scoredLine(score: EventPreset["score"]): EventPreset {
    return {
      entryId: "entry-a",
      eventId: "event-1",
      eventName: "Westfield vs Meridian",
      matchId: "match-a",
      round: "S1",
      playerName: "Marcus Reid",
      playerUserId: "athlete",
      opponentName: "Jordan Alvarez",
      date: "2026-09-10",
      surface: "hard",
      bestOf: 3,
      adScoring: false,
      score,
      supportsVideo: true,
      eventHref: "/dashboard/team/schedule/event-1",
      site: "home",
      eventKind: "dual",
      opponentProgramKey: "meridian",
      opponentSchool: "Meridian",
    };
  }

  async function seeded(preset: EventPreset) {
    const h = uploadWizardHarness({
      team: true,
      props: { preset, initialProvider: "splitstep" },
    });
    await h.flush();
    return h.current.formData;
  }

  test("a 7-6(5), 6-4 record fills games and the 5 in the loser's tiebreak cell", async () => {
    const f = await seeded(
      scoredLine({
        player1: [7, 6],
        player2: [6, 4],
        player1_tiebreaks: [null, null],
        player2_tiebreaks: [5, null],
      }),
    );

    expect(f.playerScores).toEqual([7, 6]);
    expect(f.opponentScores).toEqual([6, 4]);
    expect(f.numberOfSets).toBe(2);
    expect(f.playerTiebreaks).toEqual([null, null, null]);
    expect(f.opponentTiebreaks).toEqual([5, null, null]);
  });

  test("a record with no tiebreak arrays seeds nulls as before", async () => {
    const f = await seeded(scoredLine({ player1: [6, 6], player2: [3, 4] }));

    expect(f.playerScores).toEqual([6, 6]);
    expect(f.numberOfSets).toBe(2);
    expect(f.playerTiebreaks).toEqual(DEFAULT_FORM_DATA.playerTiebreaks);
    expect(f.opponentTiebreaks).toEqual(DEFAULT_FORM_DATA.opponentTiebreaks);
  });
});
