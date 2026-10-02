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

  test("a tiebreak is one game however often the server changes", () => {
    // A set that reaches 6-6 plays a tiebreak: the vendor numbers
    // a new game at each server change while the game score stays 6-6.
    const rows = [
      { set_number: 1, game_number: 12, game_score: "5-6" },
      { set_number: 1, game_number: 13, game_score: "6-6" },
      { set_number: 1, game_number: 13, game_score: "6-6" },
      { set_number: 1, game_number: 14, game_score: "6-6" },
      { set_number: 1, game_number: 15, game_score: "6-6" },
      { set_number: 1, game_number: 17, game_score: "6-6" },
    ];
    expect(rows.map(gameNumbersInSet(rows))).toEqual([12, 13, 13, 13, 13, 13]);
  });

  test("ordinary games that move the game score stay separate", () => {
    const rows = [
      { set_number: 1, game_number: 1, game_score: "0-0" },
      { set_number: 1, game_number: 2, game_score: "1-0" },
      { set_number: 1, game_number: 3, game_score: "1-1" },
    ];
    expect(rows.map(gameNumbersInSet(rows))).toEqual([1, 2, 3]);
  });

  test("a tiebreak whose server-first score flips is still one game", () => {
    // Stored 7-5 / 5-7 alternating with the server, games 24 to 29.
    const rows = [
      { set_number: 1, game_number: 23, game_score: "4-7" },
      { set_number: 1, game_number: 24, game_score: "7-5" },
      { set_number: 1, game_number: 25, game_score: "5-7" },
      { set_number: 1, game_number: 26, game_score: "7-5" },
      { set_number: 1, game_number: 29, game_score: "5-7" },
    ];
    expect(rows.map(gameNumbersInSet(rows))).toEqual([23, 24, 24, 24, 24]);
  });

  test("full-length games that repeat a stale game score are not folded", () => {
    // Some stored matches keep the game score on 0-0 / 2-1 across two plain
    // four-point games; those are two games, not a tiebreak.
    const game = (game_number: number, game_score: string) =>
      Array.from({ length: 4 }, () => ({
        set_number: 1,
        game_number,
        game_score,
      }));
    const rows = [...game(1, "0-0"), ...game(2, "0-0"), ...game(3, "1-0")];
    expect(rows.map(gameNumbersInSet(rows))).toEqual([
      ...Array(4).fill(1),
      ...Array(4).fill(2),
      ...Array(4).fill(3),
    ]);
  });
});
