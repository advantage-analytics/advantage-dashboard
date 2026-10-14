import { expect, test } from "@playwright/test";

import { courtSidesOf } from "@/components/dashboard/matches/match-detail/match-filters/score";

/**
 * The service court of every point (the Video filter's Side), and the rule
 * Ask's `ask.points.court` restates. A point whose score was never recorded
 * is read by its place in its game, never as the "0-0" the loader fills in.
 */

function point(score: string | null, game = 1) {
  return {
    pointScore: score ?? "0-0",
    pointScoreRaw: score,
    setNumber: 1,
    gameNumber: game,
  };
}

test("a real score decides the court by its rungs", () => {
  expect(
    courtSidesOf([
      point("0-0"),
      point("15-0"),
      point("30-0"),
      point("40-0"),
      point("40-15"),
      point("AD-40"),
    ]),
  ).toEqual(["deuce", "ad", "deuce", "ad", "deuce", "ad"]);
});

test("an unrecorded score is read by its place in the game, not as 0-0", () => {
  expect(
    courtSidesOf([
      point("0-0", 1),
      point("15-0", 1),
      point(null, 2),
      point(null, 2),
      point(null, 2),
    ]),
  ).toEqual(["deuce", "ad", "deuce", "ad", "deuce"]);
});

test("a match with no score at all alternates within each game", () => {
  expect(
    courtSidesOf([point(null, 1), point(null, 1), point(null, 2)]).join(","),
  ).toBe("deuce,ad,deuce");
});
