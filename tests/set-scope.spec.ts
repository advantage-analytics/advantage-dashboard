import { expect, test } from "@playwright/test";

import {
  scopeMeta,
  scopePoints,
} from "@/components/dashboard/matches/match-detail/set-scope";
import type { ScoreLineSet } from "@/lib/ui/score-format";

/**
 * What is left of the set scope — the games/points summary the report's facts
 * line prints. The point-derived cards moved onto the match filters (T4;
 * `tests/match-filters-provider.spec.ts`), and the `?set=` parse/write rules
 * went with them.
 *
 * A games count taken from the point rows instead of the score is off by one
 * on every tiebreak set and by everything on a match whose points were never
 * imported — and in both cases the number beside it (points) is right, which
 * is what makes the wrong one believable.
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

/** `n` point rows in one set — the only field scoping reads. */
function rows(setNumber: number, n: number): { setNumber: number }[] {
  return Array.from({ length: n }, () => ({ setNumber }));
}

/** 6-4, 3-6, 7-6(5): the third set is where the game count and the rows differ. */
const SETS = [set(6, 4), set(3, 6), set(7, 6, [7, 5])];

/* ------------------------------------------------------------------------- *
 * The rows one scope covers
 * ------------------------------------------------------------------------- */

test.describe("scopePoints", () => {
  const points = [...rows(1, 4), ...rows(2, 3), ...rows(3, 5)];

  test("no scope is every row, not zero rows", () => {
    expect(scopePoints(points, null)).toHaveLength(12);
  });

  test("a scope is that set alone", () => {
    expect(scopePoints(points, 2)).toHaveLength(3);
    expect(scopePoints(points, 2).every((p) => p.setNumber === 2)).toBe(true);
  });

  test("rows keep their order and their identity", () => {
    // Cards downstream read far more than `setNumber` off these rows, and the
    // tracker draws them in the order they arrive.
    const numbered = points.map((p, index) => ({
      ...p,
      pointNumber: index + 1,
    }));
    expect(scopePoints(numbered, 3).map((p) => p.pointNumber)).toEqual([
      8, 9, 10, 11, 12,
    ]);
  });
});

/* ------------------------------------------------------------------------- *
 * What a scope is worth
 * ------------------------------------------------------------------------- */

test.describe("scopeMeta", () => {
  /** 6-4, 3-6, 7-6: 10 + 9 + 13 = 32 games. */
  const points = [...rows(1, 62), ...rows(2, 61), ...rows(3, 65)];

  test("the whole match counts every row and every game", () => {
    expect(scopeMeta(SETS, points, null)).toEqual({
      label: "Whole match",
      points: 188,
      games: 32,
    });
  });

  test("a set counts its own rows and its own games", () => {
    expect(scopeMeta(SETS, points, 2)).toEqual({
      label: "Set 2",
      points: 61,
      games: 9,
    });
  });

  test("a tiebreak set is thirteen games", () => {
    // 7-6 is 7 + 6 games played, and the score row stores the GAME count for a
    // tiebreak set, never the tiebreak points (guardrails §4.3). Counting
    // distinct game numbers off the point rows is the version of this that
    // reads 12 and looks entirely plausible.
    expect(scopeMeta(SETS, points, 3).games).toBe(13);
    expect(scopeMeta([set(7, 6, [7, 5])], rows(1, 65), 1).games).toBe(13);
  });

  test("games come from the score even when there are no point rows", () => {
    // A published match whose points were never imported: the pane still says
    // how long the match was. Games derived from `points` would say zero.
    expect(scopeMeta(SETS, [], null)).toEqual({
      label: "Whole match",
      points: 0,
      games: 32,
    });
  });

  test("a scope past the end of the score claims no games", () => {
    // Unreachable from the report, which is the point: if it ever becomes
    // reachable, the label must not invent a set's worth of tennis.
    expect(scopeMeta(SETS, points, 9)).toEqual({
      label: "Set 9",
      points: 0,
      games: 0,
    });
  });
});
