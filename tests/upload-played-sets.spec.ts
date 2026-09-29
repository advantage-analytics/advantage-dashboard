import { expect, test } from "@playwright/test";

import { DEFAULT_FORM_DATA } from "@/components/dashboard/matches/new-match-wizard/types";
import {
  buildMatchData,
  playedSetCount,
} from "@/components/dashboard/matches/new-match-wizard/utils";

// A best-of-3 form always holds three sets, so a match that ended in two kept a
// blank third set that `buildMatchData` saved as 0-0 (Ace v Goodman 6-2 6-2 0-0,
// Emon v Roger 5-7 1-6 0-0). The trailing unentered sets are dropped instead.

const form = (
  playerScores: (number | null)[],
  opponentScores: (number | null)[],
) => ({
  ...DEFAULT_FORM_DATA,
  playerName: "Ace",
  opponentName: "Goodman",
  playerScores,
  opponentScores,
  playerTiebreaks: [null, null, null],
  opponentTiebreaks: [null, null, null],
});

const saved = (p: (number | null)[], o: (number | null)[]) => {
  const winner = { id: null, name: "Ace", scores: [] };
  const loser = { id: null, name: "Goodman", scores: [] };
  return buildMatchData("m1", form(p, o), winner, loser, false, {
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
    expect(playedSetCount([null, null, null], [null, null, null])).toBe(3);
    expect(saved([null, null, null], [null, null, null])).toMatchObject({
      player1: [0, 0, 0],
      player2: [0, 0, 0],
    });
  });

  test("playedSetCount drops only trailing blank sets", () => {
    expect(playedSetCount([6, 6, null], [2, 2, null])).toBe(2);
    expect(playedSetCount([6, null, null], [2, null, null])).toBe(1);
    expect(playedSetCount([6, null, 6], [2, null, 3])).toBe(3);
  });
});
