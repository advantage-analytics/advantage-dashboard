import { expect, test } from "@playwright/test";

import { labelScores, type ScorablePoint } from "@/lib/services/labels/score";
import type { LabelSide } from "@/lib/services/labels/session";
import {
  enteredScore,
  formatPair,
  labelSetScores,
  scoreMismatch,
} from "@/lib/services/labels/set-scores";

/**
 * The "Score doesn't add up" banner's arithmetic (T41, board 08m `BANNER`):
 * each set's games counted for the winner of each game's last counted point
 * (`LabelGameBand.winner`), held against the score that was entered —
 * `final_score` first, else `matches.score` — and the first disagreeing set
 * named with its first live point.
 */

let ids = 0;

/** A counted point of `game` in `set`, won by `winner`. */
function won(
  set: number,
  game: number,
  winner: LabelSide | null,
): ScorablePoint {
  ids += 1;
  return {
    id: `pt-${ids}`,
    status: "unchanged",
    setNumber: set,
    gameNumber: game,
    server: "p1",
    winner,
    ending: winner ? "winner" : null,
  };
}

/** A game of `n` points all won by `winner`, straight through. */
function game(set: number, game: number, winner: LabelSide, n = 4) {
  return Array.from({ length: n }, () => won(set, game, winner));
}

/**
 * Two sets: p1 takes set 1 by 2–1 (games 1, 3 to p1, game 2 to p2), and set
 * 2 has one game to p2 and one still without a counted point — the vendor
 * numbers games through the match, so set 2 opens at game 4.
 */
function twoSets(): ScorablePoint[] {
  ids = 0;
  return [
    ...game(1, 1, "p1"),
    ...game(1, 2, "p2"),
    ...game(1, 3, "p1"),
    ...game(2, 4, "p2"),
    won(2, 5, null),
    won(2, 5, null),
  ];
}

test.describe("LabelGameBand.winner", () => {
  test("is the winner of the game's last counted point, null while nothing counts", () => {
    const points = twoSets();
    const { games } = labelScores(points, true);
    expect(games.map((g) => [g.setNumber, g.gameNumber, g.winner])).toEqual([
      [1, 1, "p1"],
      [1, 2, "p2"],
      [1, 3, "p1"],
      [2, 4, "p2"],
      [2, 5, null],
    ]);
    // A game whose points are split names the last counted point's winner.
    const split = [won(1, 1, "p1"), won(1, 1, "p1"), won(1, 1, "p2")];
    expect(labelScores(split, true).games[0].winner).toBe("p2");
    // A replayed let, a tombstone and a point with no winner move nothing.
    const uncounted: ScorablePoint[] = [
      won(1, 1, "p1"),
      { ...won(1, 1, "p2"), ending: "let_replayed" },
      { ...won(1, 1, "p2"), status: "deleted" },
      won(1, 1, null),
    ];
    expect(labelScores(uncounted, true).games[0].winner).toBe("p1");
  });
});

/** The tally over `points` under ad scoring, from the bands `labelScores` makes. */
const setsOf = (points: readonly ScorablePoint[]) =>
  labelSetScores(points, labelScores(points, true).games);

test.describe("labelSetScores", () => {
  test("counts each game for its winner, per set, with the set's first live point", () => {
    const points = twoSets();
    expect(setsOf(points)).toEqual([
      { setNumber: 1, games: [2, 1], firstPointId: "pt-1" },
      { setNumber: 2, games: [0, 1], firstPointId: "pt-13" },
    ]);
  });

  test("a deleted first point is not the set's first; a set with no live point is absent", () => {
    const points = twoSets();
    points[0] = { ...points[0], status: "deleted" };
    const sets = setsOf(points);
    expect(sets[0].firstPointId).toBe("pt-2");
    // Set 2 deleted whole: the tally has one set.
    const oneSet = points.map((p) =>
      p.setNumber === 2 ? { ...p, status: "deleted" as const } : p,
    );
    expect(setsOf(oneSet)).toEqual([
      { setNumber: 1, games: [2, 1], firstPointId: "pt-2" },
    ]);
    // Points with no set are not a set.
    expect(setsOf([{ ...won(1, 1, "p1"), setNumber: null }])).toEqual([]);
  });

  test("sets come back in set order whatever the row order", () => {
    const points = [...game(2, 3, "p2"), ...game(1, 1, "p1")];
    expect(setsOf(points).map((s) => s.setNumber)).toEqual([1, 2]);
  });
});

test.describe("enteredScore", () => {
  test("final_score wins over matches.score; neither is null", () => {
    const match = { player1: [6, 4], player2: [3, 6] };
    expect(enteredScore(null, match)).toEqual([
      [6, 3],
      [4, 6],
    ]);
    expect(enteredScore([[2, 1]], match)).toEqual([[2, 1]]);
    expect(enteredScore([[2, 1]], null)).toEqual([[2, 1]]);
    expect(enteredScore(null, null)).toBeNull();
    // A record with sides of unequal length pads the short side with 0.
    expect(enteredScore(null, { player1: [6, 1], player2: [3] })).toEqual([
      [6, 3],
      [1, 0],
    ]);
  });
});

test.describe("scoreMismatch", () => {
  const labelled = () => setsOf(twoSets());

  test("names the first set whose pair differs, with the labelled and entered pairs and the set's first point", () => {
    expect(
      scoreMismatch(labelled(), [
        [2, 1],
        [5, 2],
      ]),
    ).toEqual({
      setNumber: 2,
      labelled: "0–1",
      entered: "5–2",
      firstPointId: "pt-13",
    });
    // Set 1 differs: it is named, not set 2.
    expect(
      scoreMismatch(labelled(), [
        [6, 3],
        [5, 2],
      ]),
    ).toMatchObject({ setNumber: 1, labelled: "2–1", entered: "6–3" });
  });

  test("null when every set agrees, and when nothing was entered", () => {
    expect(
      scoreMismatch(labelled(), [
        [2, 1],
        [0, 1],
      ]),
    ).toBeNull();
    expect(scoreMismatch(labelled(), null)).toBeNull();
    expect(scoreMismatch([], null)).toBeNull();
  });

  test("a set one side has and the other lacks reads 0–0 on the side without it", () => {
    // The entered score has a third set the rows never reach: the one
    // "Video ends early" answers — no first point to go to.
    expect(
      scoreMismatch(labelled(), [
        [2, 1],
        [0, 1],
        [6, 4],
      ]),
    ).toEqual({
      setNumber: 3,
      labelled: "0–0",
      entered: "6–4",
      firstPointId: null,
    });
    // The rows run into a set the entered score never had.
    expect(scoreMismatch(labelled(), [[2, 1]])).toEqual({
      setNumber: 2,
      labelled: "0–1",
      entered: "0–0",
      firstPointId: "pt-13",
    });
    // Nothing labelled at all against an entered score: set 1, 0–0.
    expect(scoreMismatch([], [[6, 3]])).toEqual({
      setNumber: 1,
      labelled: "0–0",
      entered: "6–3",
      firstPointId: null,
    });
  });

  test("final_score is what the rows are held against when both are set", () => {
    const sets = labelled();
    const entered = enteredScore(
      [
        [2, 1],
        [0, 1],
      ],
      { player1: [6, 4], player2: [3, 6] },
    );
    expect(scoreMismatch(sets, entered)).toBeNull();
  });

  test("formatPair writes an en dash", () => {
    expect(formatPair([4, 0])).toBe("4–0");
  });
});
