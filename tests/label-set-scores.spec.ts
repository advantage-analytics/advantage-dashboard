import { expect, test } from "@playwright/test";

import { labelScores, type ScorablePoint } from "@/lib/services/labels/score";
import type { LabelSide, MatchScore } from "@/lib/services/labels/session";
import { parseMatchScore } from "@/lib/data/labels-server";
import {
  enteredScore,
  formatSets,
  labelSetScores,
  matchTiebreakSet,
  mismatchGameKey,
  scoreMismatch,
  scoreMismatchSentence,
  scoreReasonText,
  type LabelScoreMismatch,
} from "@/lib/services/labels/set-scores";

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
  test("counts each settled game for its winner, per set, with the set's first live point and the games left unfinished", () => {
    const points = twoSets();
    expect(setsOf(points)).toEqual([
      {
        setNumber: 1,
        games: [2, 1],
        firstPointId: "pt-1",
        lastPointId: "pt-12",
        unfinished: [],
        overflow: [],
      },
      {
        setNumber: 2,
        games: [0, 1],
        firstPointId: "pt-13",
        lastPointId: "pt-18",
        unfinished: [
          { setNumber: 2, gameNumber: 5, gameInSet: 2, score: "0–0" },
        ],
        overflow: [],
      },
    ]);
  });

  test("a game the points leave short counts for nobody — not its last point's winner — and is listed with its call", () => {
    // 30–40 under no-ad scoring, then a full game: p1 has 1 game, not 2.
    ids = 0;
    const points = [
      won(1, 1, "p1"),
      won(1, 1, "p1"),
      won(1, 1, "p2"),
      won(1, 1, "p2"),
      won(1, 1, "p2"),
      ...game(1, 2, "p1"),
    ];
    const games = labelScores(points, false).games;
    expect(games[0].winner).toBe("p2");
    expect(labelSetScores(points, games)).toEqual([
      {
        setNumber: 1,
        games: [1, 0],
        firstPointId: "pt-1",
        lastPointId: "pt-9",
        unfinished: [
          { setNumber: 1, gameNumber: 1, gameInSet: 1, score: "30–40" },
        ],
        overflow: [],
      },
    ]);
  });

  test("a game with rows past its end counts for who it was settled for, and is listed with the extra", () => {
    // p1 settles game 1 on the fourth point; two more rows go p2's way.
    ids = 0;
    const points = [
      ...game(1, 1, "p1"),
      won(1, 1, "p2"),
      won(1, 1, "p2"),
      ...game(1, 2, "p2"),
    ];
    const games = labelScores(points, true).games;
    expect(games[0].winner).toBe("p2");
    expect(labelSetScores(points, games)).toEqual([
      {
        setNumber: 1,
        games: [1, 1],
        firstPointId: "pt-1",
        lastPointId: "pt-10",
        unfinished: [],
        overflow: [{ setNumber: 1, gameNumber: 1, gameInSet: 1, extra: 2 }],
      },
    ]);
  });

  test("a deleted first point is not the set's first; a set with no live point is absent", () => {
    const points = twoSets();
    points[0] = { ...points[0], status: "deleted" };
    const sets = setsOf(points);
    expect(sets[0].firstPointId).toBe("pt-2");
    // Set 2 deleted whole: the tally has one set — and game 1, three
    // points now, is short of settled.
    const oneSet = points.map((p) =>
      p.setNumber === 2 ? { ...p, status: "deleted" as const } : p,
    );
    expect(setsOf(oneSet)).toEqual([
      {
        setNumber: 1,
        games: [1, 1],
        firstPointId: "pt-2",
        lastPointId: "pt-12",
        unfinished: [
          { setNumber: 1, gameNumber: 1, gameInSet: 1, score: "40–0" },
        ],
        overflow: [],
      },
    ]);
    // Points with no set are not a set.
    expect(setsOf([{ ...won(1, 1, "p1"), setNumber: null }])).toEqual([]);
  });

  test("formatSets writes the labelled sets as the publish script prints them", () => {
    expect(formatSets(setsOf(twoSets()))).toBe("2–1, 0–1");
    expect(formatSets([])).toBe("");
  });

  test("sets come back in set order whatever the row order", () => {
    const points = [...game(2, 3, "p2"), ...game(1, 1, "p1")];
    expect(setsOf(points).map((s) => s.setNumber)).toEqual([1, 2]);
  });
});

test.describe("enteredScore", () => {
  test("matches.score wins over final_score; final_score only without one; neither is null", () => {
    const match = { player1: [6, 4], player2: [3, 6] };
    expect(enteredScore(null, match)).toEqual([
      [6, 3],
      [4, 6],
    ]);
    // The match record is the source of truth: a stored reading never
    // replaces it (Andy Nguyen v Shaurya Bharadwaj, 2026-10-10).
    expect(enteredScore([[2, 1]], match)).toEqual([
      [6, 3],
      [4, 6],
    ]);
    expect(enteredScore([[2, 1]], { player1: [], player2: [] })).toEqual([
      [2, 1],
    ]);
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

  test("names the first set whose pair differs, with the labelled and entered pairs, the set's first point and its reasons", () => {
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
      lastPointId: "pt-18",
      reasons: [
        {
          kind: "unfinished",
          setNumber: 2,
          gameNumber: 5,
          gameInSet: 2,
          score: "0–0",
        },
      ],
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
      lastPointId: null,
      reasons: [],
    });
    // The rows run into a set the entered score never had.
    expect(scoreMismatch(labelled(), [[2, 1]])).toMatchObject({
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
      lastPointId: null,
      reasons: [],
    });
  });
});

test.describe("the chip's sentence", () => {
  const mismatch = (reasons: LabelScoreMismatch["reasons"]) => ({
    setNumber: 2,
    labelled: "4–5",
    entered: "4–6",
    firstPointId: "pt-13",
    lastPointId: "pt-18",
    reasons,
  });

  test("the set, the two pairs, then each reason after a middle dot", () => {
    const short = {
      kind: "unfinished" as const,
      setNumber: 2,
      gameNumber: 11,
      gameInSet: 5,
      score: "30–40",
    };
    const over = {
      kind: "overflow" as const,
      setNumber: 2,
      gameNumber: 9,
      gameInSet: 3,
      extra: 2,
    };
    expect(scoreMismatchSentence(mismatch([short]))).toBe(
      "Set 2: labelled 4–5, entered 4–6 · game 5 unfinished (30–40)",
    );
    expect(scoreMismatchSentence(mismatch([short, over]))).toBe(
      "Set 2: labelled 4–5, entered 4–6 · game 5 unfinished (30–40) · game 3 has 2 extra points",
    );
    expect(scoreMismatchSentence(mismatch([]))).toBe(
      "Set 2: labelled 4–5, entered 4–6",
    );
    expect(scoreReasonText({ ...over, extra: 1 })).toBe(
      "game 3 has 1 extra point",
    );
    // The first reason's game is where the chip goes; none, nowhere.
    expect(mismatchGameKey(mismatch([short, over]))).toBe("2·11");
    expect(mismatchGameKey(mismatch([]))).toBeNull();
  });
});

test.describe("matchTiebreakSet", () => {
  // The record as the wizard stores a deciding-set match tiebreak: the third
  // set entered as 0–1 games, its points in the tiebreak arrays.
  const RECORD = {
    player1: [6, 6, 0],
    player2: [7, 3, 1],
    player1_tiebreaks: [5, null, 8],
    player2_tiebreaks: [7, null, 10],
  };
  const score = (
    player1: number[],
    player2: number[],
    tiebreaks?: [(number | null)[], (number | null)[]],
  ): MatchScore => ({
    player1,
    player2,
    ...(tiebreaks
      ? { player1_tiebreaks: tiebreaks[0], player2_tiebreaks: tiebreaks[1] }
      : {}),
  });

  test("the exact entered score: a 0–1 third set with its points 8–10 is set 3", () => {
    const parsed = parseMatchScore(RECORD);
    expect(parsed).toEqual(RECORD);
    expect(matchTiebreakSet(parsed, 3)).toBe(3);
    // Player 1 taking it reads the same way, and a 7-point match tiebreak
    // counts: the winner's points need only reach 7.
    expect(
      matchTiebreakSet(
        score(
          [7, 3, 1],
          [6, 6, 0],
          [
            [7, null, 10],
            [5, null, 8],
          ],
        ),
        3,
      ),
    ).toBe(3);
    expect(
      matchTiebreakSet(
        score(
          [7, 3, 1],
          [6, 6, 0],
          [
            [7, null, 7],
            [5, null, 3],
          ],
        ),
        3,
      ),
    ).toBe(3);
  });

  test("a 1–0 deciding set with no tiebreak points is a retirement, not a match tiebreak", () => {
    // 6–4, 3–6, 1–0 ret.: the games alone never say tiebreak.
    expect(matchTiebreakSet(score([6, 3, 1], [4, 6, 0]), 3)).toBeNull();
    // Arrays present but the deciding set's entry null: the same retirement.
    expect(
      matchTiebreakSet(
        score(
          [6, 3, 1],
          [4, 6, 0],
          [
            [null, null, null],
            [null, null, null],
          ],
        ),
        3,
      ),
    ).toBeNull();
    // The loser's points entered, the winner's missing or short of 7: not one.
    expect(
      matchTiebreakSet(
        score(
          [6, 3, 1],
          [4, 6, 0],
          [
            [null, null, null],
            [null, null, 5],
          ],
        ),
        3,
      ),
    ).toBeNull();
    expect(
      matchTiebreakSet(
        score(
          [6, 3, 1],
          [4, 6, 0],
          [
            [null, null, 6],
            [null, null, 4],
          ],
        ),
        3,
      ),
    ).toBeNull();
  });

  test("the console's own final_score is games only: nothing is inferred from it", () => {
    // `enteredScore` folds it into pairs for the set tally, but the match
    // tiebreak is read from the record alone — a session with no record has
    // none, whatever its stored score spells.
    const stored = [
      [6, 7],
      [6, 3],
      [1, 0],
    ];
    expect(enteredScore(stored, null)).toEqual(stored);
    expect(matchTiebreakSet(null, 3)).toBeNull();
    // A record whose games say 1–0 with no tiebreak arrays at all: none.
    expect(matchTiebreakSet(score([6, 6, 1], [7, 3, 0]), 3)).toBeNull();
  });

  test("a real third set, a best-of-5 at 1–1, a 1–0 set that is not deciding, and nothing entered", () => {
    expect(matchTiebreakSet(score([6, 6, 6], [7, 3, 4]), 3)).toBeNull();
    // Best of 5 at one set each: the third set is not the deciding one, so
    // a 1–0 there is not a match tiebreak even with its points entered.
    const tiebreakThird = score(
      [6, 6, 1],
      [7, 3, 0],
      [
        [5, null, 10],
        [7, null, 8],
      ],
    );
    expect(matchTiebreakSet(tiebreakThird, 5)).toBeNull();
    // Best of 5 at two sets each: the fifth is, whether entered as the
    // fifth of five or as the last of a level match.
    expect(
      matchTiebreakSet(
        score(
          [6, 6, 4, 6, 0],
          [7, 3, 6, 4, 1],
          [
            [5, null, null, null, 8],
            [7, null, null, null, 10],
          ],
        ),
        5,
      ),
    ).toBe(5);
    // A 1–0 opener, or a 1–0 second set with the first already won: not
    // deciding — an unfinished set entered as 1–0 stays a set of games.
    expect(
      matchTiebreakSet(
        score(
          [1, 6],
          [0, 4],
          [
            [10, null],
            [8, null],
          ],
        ),
        3,
      ),
    ).toBeNull();
    expect(
      matchTiebreakSet(
        score(
          [6, 1],
          [4, 0],
          [
            [null, 10],
            [null, 8],
          ],
        ),
        3,
      ),
    ).toBeNull();
    expect(matchTiebreakSet(null, 3)).toBeNull();
    expect(matchTiebreakSet(score([], []), 3)).toBeNull();
  });

  test("the set tally stays games-only: one decided match tiebreak is the 1–0 the record entered", () => {
    ids = 0;
    const tiebreak: ScorablePoint[] = [
      ...Array.from({ length: 8 }, () => [
        won(3, 20, "p1"),
        won(3, 20, "p2"),
      ]).flat(),
      won(3, 20, "p1"),
      won(3, 20, "p1"),
    ].map((point) => ({ ...point, gameType: "match_tiebreak" as const }));
    const points = [
      ...game(1, 1, "p2", 4),
      ...game(2, 2, "p1", 4),
      ...tiebreak,
    ];
    const labelled = labelSetScores(points, labelScores(points, true).games);
    expect(labelled.find((set) => set.setNumber === 3)?.games).toEqual([1, 0]);
    // 10–8 in points is not held against the 8–10 the record stores — the
    // tiebreak points never block publish.
    expect(
      scoreMismatch(labelled, [
        [0, 1],
        [1, 0],
        [1, 0],
      ]),
    ).toBeNull();
  });
});
