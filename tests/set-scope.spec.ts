import { expect, test } from "@playwright/test";

import { totalGames } from "@/components/dashboard/matches/match-detail/set-scope";
import type { ScoreLineSet } from "@/lib/ui/score-format";

/**
 * What is left of the set scope — the whole-match games total the report's
 * facts line prints. The point-derived cards moved onto the match filters
 * (T4; `tests/match-filters-provider.spec.ts`), and the `?set=` parse/write
 * rules and the per-set reads went with them.
 *
 * A games count taken from the point rows instead of the score is off by one
 * on every tiebreak set and by everything on a match whose points were never
 * imported — which is why this stays a pure function of the score alone.
 */

/** A set as `useMatchSides().sets` hands it over — already oriented you-first. */
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

/** 6-4, 3-6, 7-6(5): 10 + 9 + 13 = 32 games. */
const SETS = [set(6, 4), set(3, 6), set(7, 6, [7, 5])];

test.describe("totalGames", () => {
  test("sums both players' games across every set", () => {
    expect(totalGames(SETS)).toBe(32);
  });

  test("a tiebreak set is thirteen games", () => {
    // 7-6 is 7 + 6 games played, and the score row stores the GAME count for
    // a tiebreak set, never the tiebreak points (guardrails §4.3). Counting
    // distinct game numbers off point rows is the version of this that reads
    // 12 and looks entirely plausible — which is why this reads the score.
    expect(totalGames([set(7, 6, [7, 5])])).toBe(13);
  });

  test("no sets is zero games", () => {
    expect(totalGames([])).toBe(0);
  });
});
