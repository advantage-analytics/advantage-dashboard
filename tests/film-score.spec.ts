import { expect, test } from "@playwright/test";

import {
  absolutize,
  boardAt,
  initialSurname,
} from "@/components/dashboard/matches/match-detail/film/film-score";

import { pt } from "./fixtures/film-point";

/**
 * Scores are stored server-first and the board is drawn you-first. Both
 * re-orientations happen here and nowhere else; getting either wrong prints
 * the opponent's 40 in your row with nothing looking broken (guardrails §4).
 */

test.describe("absolutize", () => {
  test("server-first → player1/player2", () => {
    expect(absolutize("30-40", true)).toEqual({ player1: "30", player2: "40" });
    expect(absolutize("30-40", false)).toEqual({
      player1: "40",
      player2: "30",
    });
    expect(absolutize(null, true)).toBeNull();
    expect(absolutize("garbage", true)).toBeNull();
  });
});

test("initialSurname", () => {
  expect(initialSurname("Giacomo Revelli")).toBe("G. Revelli");
  expect(initialSurname("Timofey  Stepanov")).toBe("T. Stepanov");
  expect(initialSurname("Cher")).toBe("Cher");
});

test.describe("boardAt", () => {
  const sides = {
    youIsPlayer1: false,
    youName: "Timofey Stepanov",
    oppName: "Giacomo Revelli",
    sets: [
      { player1: 6, player2: 4, player1Tiebreak: null, player2Tiebreak: null },
      { player1: 6, player2: 4, player1Tiebreak: null, player2Tiebreak: null },
    ],
  };

  test("settled sets from the entered score, the live set from game_score, points you-first", () => {
    const point = pt({
      id: "p",
      setNumber: 2,
      serverIsPlayer1: true,
      gameScore: "3-5",
      pointScore: "30-40",
    });
    const board = boardAt(point, sides, {
      hasGameScore: true,
      hasPointScore: true,
    });
    expect(board.liveSet).toBe(1);
    expect(board.rows[0]).toEqual({
      name: "T. Stepanov",
      serving: false,
      sets: [6, 5],
      game: "40",
    });
    expect(board.rows[1]).toEqual({
      name: "G. Revelli",
      serving: true,
      sets: [4, 3],
      game: "30",
    });
    expect(board.pointLine).toBe("40\u201330");
  });

  test("a match with no score columns leaves the cells blank, never 0-0", () => {
    const point = pt({ id: "p", setNumber: 1, serverIsPlayer1: false });
    const board = boardAt(point, sides, {
      hasGameScore: false,
      hasPointScore: false,
    });
    expect(board.rows[0].sets).toEqual([null]);
    expect(board.rows[0].game).toBeNull();
    expect(board.rows[0].serving).toBe(true);
    expect(board.pointLine).toBeNull();
  });
});
