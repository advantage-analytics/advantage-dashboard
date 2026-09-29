import { expect, test } from "@playwright/test";

import { DEFAULT_FORM_DATA } from "@/components/dashboard/matches/new-match-wizard/types";
import {
  buildMatchData,
  playedSetCount,
} from "@/components/dashboard/matches/new-match-wizard/utils";

// A best-of-3 form always holds three sets; a match that ended in two must not
// be saved with a blank third set read as 0-0.

const NO_TIEBREAKS = [null, null, null];

const form = (
  playerScores: (number | null)[],
  opponentScores: (number | null)[],
  playerTiebreaks: (number | null)[] = NO_TIEBREAKS,
  opponentTiebreaks: (number | null)[] = NO_TIEBREAKS,
) => ({
  ...DEFAULT_FORM_DATA,
  playerName: "Ace",
  opponentName: "Goodman",
  playerScores,
  opponentScores,
  playerTiebreaks,
  opponentTiebreaks,
});

const saved = (
  p: (number | null)[],
  o: (number | null)[],
  pt?: (number | null)[],
  ot?: (number | null)[],
) => {
  const winner = { id: null, name: "Ace", scores: [] };
  const loser = { id: null, name: "Goodman", scores: [] };
  return buildMatchData("m1", form(p, o, pt, ot), winner, loser, false, {
    userId: "u1",
    sourceProvider: "splitstep",
    analysisMethod: "video",
  }).score;
};

test.describe("played sets — no blank third set", () => {
  test("a two-set best-of-3 saves two sets", () => {
    expect(saved([6, 6, null], [2, 2, null])).toMatchObject({
      player1: [6, 6],
      player2: [2, 2],
      player1_tiebreaks: [null, null],
      player2_tiebreaks: [null, null],
    });
  });

  test("a tiebreak stays with its own set after the trim", () => {
    // 7-6(5), 6-4 in a best-of-3: the loser's 5 is on the first set, player2's
    // side, and still is once the blank third set is gone.
    expect(
      saved([7, 6, null], [6, 4, null], [null, null, null], [5, null, null]),
    ).toMatchObject({
      player1: [7, 6],
      player2: [6, 4],
      player1_tiebreaks: [null, null],
      player2_tiebreaks: [5, null],
    });
  });

  test("a three-set match keeps all three", () => {
    expect(saved([4, 6, 7], [6, 4, 5])).toMatchObject({
      player1: [4, 6, 7],
      player2: [6, 4, 5],
    });
  });

  test("a set with one side entered is kept, its blank read as 0", () => {
    expect(saved([6, 3, 2], [4, 6, null])).toMatchObject({
      player1: [6, 3, 2],
      player2: [4, 6, 0],
    });
  });

  test("nothing entered keeps every set, as before", () => {
    expect(saved([null, null, null], [null, null, null])).toMatchObject({
      player1: [0, 0, 0],
      player2: [0, 0, 0],
    });
  });

  test("playedSetCount drops only trailing blank sets", () => {
    expect(playedSetCount([6, 6, null], [2, 2, null])).toBe(2);
    expect(playedSetCount([6, null, null], [2, null, null])).toBe(1);
    expect(playedSetCount([6, null, 6], [2, null, 3])).toBe(3);
    expect(playedSetCount([null, null, null], [null, null, null])).toBe(3);
  });
});
