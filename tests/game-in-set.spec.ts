import { expect, test } from "@playwright/test";

import { gameNumbersInSet } from "@/lib/data/game-in-set";

/**
 * `points.game_number` is stored match-cumulative; every screen that names a
 * game ("SET 2 · GAME 1") reads it counted per set.
 */

const renumber = (pairs: [number, number][]) => {
  const input = pairs.map(([set_number, game_number]) => ({
    set_number,
    game_number,
  }));
  return input.map(gameNumbersInSet(input));
};

test.describe("gameNumbersInSet", () => {
  test("restarts a match-cumulative count at 1 in each set", () => {
    // 7-5 first set (games 1–12), then set 2 opens at stored game 13.
    expect(
      renumber([
        [1, 1],
        [1, 12],
        [2, 13],
        [2, 14],
        [2, 22],
        [3, 23],
      ]),
    ).toEqual([1, 12, 1, 2, 10, 1]);
  });

  test("leaves a count that is already per set alone", () => {
    expect(
      renumber([
        [1, 1],
        [1, 6],
        [2, 1],
        [2, 4],
      ]),
    ).toEqual([1, 6, 1, 4]);
  });

  test("a set trimmed past its opening games keeps its real numbers", () => {
    // Set 1 ended on game 10; the video picks set 2 up at its third game.
    expect(
      renumber([
        [1, 10],
        [2, 13],
        [2, 14],
      ]),
    ).toEqual([10, 3, 4]);
  });

  test("a single-set match is unchanged", () => {
    expect(
      renumber([
        [1, 1],
        [1, 2],
        [1, 9],
      ]),
    ).toEqual([1, 2, 9]);
  });
});
