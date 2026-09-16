import { expect, test } from "@playwright/test";

import { setOutcome } from "@/components/dashboard/matches/match-detail/report-scoreboard";
import type { ScoreLineSet } from "@/lib/ui/score-format";

/**
 * The rail scoreboard's set-winner ink rule (F8; spec decisions #6). Pure and
 * offline — nothing here draws a digit, only decides which one is darker.
 */

/** A set as `useMatchSides().sets` hands it over — already you-first. */
function set(
  you: number,
  opp: number,
  tiebreak?: [number, number],
): ScoreLineSet {
  return {
    player1: you,
    player2: opp,
    player1Tiebreak: tiebreak ? tiebreak[0] : null,
    player2Tiebreak: tiebreak ? tiebreak[1] : null,
  };
}

test.describe("setOutcome", () => {
  test("more games than the opponent is a set you won", () => {
    expect(setOutcome(set(6, 4))).toBe("you");
  });

  test("fewer games than the opponent is a set you lost", () => {
    expect(setOutcome(set(3, 6))).toBe("opp");
  });

  test("a tiebreak set resolves by games alone", () => {
    // 7-6(5): decided on games; the tiebreak's own points never enter it —
    // reading them would put whoever scored more tiebreak points ahead even
    // when they lost the set.
    expect(setOutcome(set(7, 6, [7, 5]))).toBe("you");
  });

  test("equal games is level", () => {
    expect(setOutcome(set(6, 6))).toBe("level");
  });
});
