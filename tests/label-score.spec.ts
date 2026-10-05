import { readFileSync } from "node:fs";
import path from "node:path";

import { expect, test } from "@playwright/test";

import {
  LABEL_GAME_TYPES,
  isCountedPoint,
  isLabelGameType,
  labelScores,
  type LabelGameType,
  type ScorablePoint,
} from "@/lib/services/labels/score";
import type { LabelEnding, LabelSide } from "@/lib/services/labels/session";

/**
 * T8's scoreboard: the score before every point and the games before every
 * game, derived from the session's rows in `point_index` order and never
 * stored.
 */

let nextId = 0;

/** A live point in set 1, game 1, served by p1, won by `winner`. */
function pt(
  winner: LabelSide | null,
  overrides: Partial<ScorablePoint> = {},
): ScorablePoint {
  nextId += 1;
  return {
    id: `pt-${nextId}`,
    status: "unchanged",
    setNumber: 1,
    gameNumber: 1,
    server: "p1",
    winner,
    ending: winner === null ? null : "winner",
    ...overrides,
  };
}

/** `scoreBefore` of every point passed, in order. */
function scoresBefore(points: ScorablePoint[], adScoring = true): string[] {
  const { points: scored } = labelScores(points, adScoring);
  return points.map((point) => {
    const score = scored.get(point.id);
    if (!score) throw new Error(`no score for ${point.id}`);
    return score.scoreBefore ?? "(none)";
  });
}

/** One game's points, in order, each won by the side listed. */
function game(
  fields: Partial<ScorablePoint>,
  winners: LabelSide[],
): ScorablePoint[] {
  return winners.map((winner) => pt(winner, fields));
}

test.describe("an ordinary game", () => {
  test("ad scoring: deuce, Ad, back to deuce, Ad, game", () => {
    const points = game({}, [
      "p1",
      "p2",
      "p1",
      "p2",
      "p1",
      "p2", // 40–40
      "p1", // Ad–40
      "p2", // 40–40
      "p1", // Ad–40
      "p1", // game
    ]);
    expect(scoresBefore(points, true)).toEqual([
      "0–0",
      "15–0",
      "15–15",
      "30–15",
      "30–30",
      "40–30",
      "40–40",
      "Ad–40",
      "40–40",
      "Ad–40",
    ]);
  });

  test("the server's points print first, whoever serves", () => {
    const points = game({ server: "p2" }, ["p1", "p1", "p2"]);
    expect(scoresBefore(points)).toEqual(["0–0", "0–15", "0–30"]);
    // Ad on the receiver's side reads 40–Ad.
    const deuce = game({ server: "p2" }, ["p1", "p2", "p1", "p2", "p1", "p2"]);
    expect(scoresBefore([...deuce, pt("p1", { server: "p2" })]).at(-1)).toBe(
      "40–40",
    );
    expect(
      scoresBefore([
        ...deuce,
        pt("p1", { server: "p2" }),
        pt("p1", { server: "p2" }),
      ]).at(-1),
    ).toBe("40–Ad");
  });

  test("no-ad: the point at 40–40 ends the game", () => {
    const deuce = game({}, ["p1", "p2", "p1", "p2", "p1", "p2"]);
    const decider = pt("p2");
    const stray = pt("p1");
    expect(scoresBefore([...deuce, decider, stray], false)).toEqual([
      "0–0",
      "15–0",
      "15–15",
      "30–15",
      "30–30",
      "40–30",
      "40–40",
      // p2 took the deciding point: a point still in this game is a stray.
      "40–Game",
    ]);
    // With ad scoring the same points are not over yet.
    expect(scoresBefore([...deuce, decider, stray], true).at(-1)).toBe("40–Ad");
  });

  test("a decided game stays decided for the points left in it", () => {
    const won = game({}, ["p1", "p1", "p1", "p1"]);
    const strays = game({}, ["p2", "p2", "p2", "p2"]);
    const scores = scoresBefore([...won, ...strays], true);
    expect(scores.slice(4)).toEqual([
      "Game–0",
      "Game–15",
      "Game–30",
      "Game–40",
    ]);
  });
});

test.describe("tiebreaks", () => {
  test("a 7-point tiebreak prints raw counts, server first", () => {
    const tb = { gameNumber: 13, gameType: "tiebreak" as LabelGameType };
    const points = [
      pt("p1", { ...tb, server: "p1" }),
      pt("p2", { ...tb, server: "p2" }),
      pt("p1", { ...tb, server: "p2" }),
      pt("p1", { ...tb, server: "p1" }),
      pt("p2", { ...tb, server: "p1" }),
      pt("p1", { ...tb, server: "p2" }),
      pt("p1", { ...tb, server: "p2" }),
    ];
    expect(scoresBefore(points)).toEqual([
      "0–0",
      "0–1",
      "1–1",
      "2–1",
      "3–1",
      "2–3",
      "2–4",
    ]);
  });

  test("a match tiebreak counts the same way and never calls Ad", () => {
    const mtb = {
      setNumber: 3,
      gameNumber: 25,
      gameType: "match_tiebreak" as LabelGameType,
    };
    const points = game(mtb, ["p1", "p2", "p1", "p2", "p1", "p2", "p1", "p2"]);
    expect(scoresBefore(points, true).at(-1)).toBe("4–3");
  });

  test("the vocabulary", () => {
    expect([...LABEL_GAME_TYPES]).toEqual([
      "game",
      "tiebreak",
      "match_tiebreak",
    ]);
    for (const good of LABEL_GAME_TYPES)
      expect(isLabelGameType(good)).toBe(true);
    for (const bad of [undefined, null, "", "Game", "tie_break", 1]) {
      expect(isLabelGameType(bad), String(bad)).toBe(false);
    }
  });
});

test.describe("rows that are not points", () => {
  const skipped: [string, Partial<ScorablePoint>][] = [
    ["a let that was replayed", { winner: "p2", ending: "let_replayed" }],
    ["a row marked not a point", { winner: "p2", ending: "not_a_point" }],
    ["a deleted point", { winner: "p2", status: "deleted" }],
    ["a point with no winner yet", { winner: null, ending: null }],
  ];

  for (const [name, fields] of skipped) {
    test(`${name} in the middle of a game does not move the score`, () => {
      const before = game({}, ["p1", "p2"]);
      const row = pt(null, fields);
      const after = game({}, ["p1", "p1"]);
      const { points } = labelScores([...before, row, ...after], true);
      expect(points.get(after[0].id)?.scoreBefore).toBe("15–15");
      if (row.status === "deleted") {
        // A tombstone has no row on the scoreboard at all.
        expect(points.has(row.id)).toBe(false);
      } else {
        // The row itself shows the score it was played at…
        expect(points.get(row.id)?.scoreBefore).toBe("15–15");
        // …which is exactly the next point's.
        expect(points.get(row.id)).toEqual(points.get(after[0].id));
      }
      expect(points.get(after[1].id)?.scoreBefore).toBe("30–15");
    });
  }

  test("isCountedPoint is the rule the scoreboard uses", () => {
    expect(isCountedPoint(pt("p1"))).toBe(true);
    expect(isCountedPoint(pt("p1", { ending: null }))).toBe(true);
    for (const ending of [
      "ace",
      "service_winner",
      "double_fault",
      "winner",
      "error",
    ] as LabelEnding[]) {
      expect(isCountedPoint(pt("p2", { ending })), ending).toBe(true);
    }
    expect(isCountedPoint(pt("p1", { ending: "let_replayed" }))).toBe(false);
    expect(isCountedPoint(pt("p1", { ending: "not_a_point" }))).toBe(false);
    expect(isCountedPoint(pt("p1", { status: "deleted" }))).toBe(false);
    expect(isCountedPoint(pt(null))).toBe(false);
  });

  test("a let that ends a game's run of points leaves the game's winner alone", () => {
    // p1 wins game 1 outright; the let after it is not the "last point".
    const won = game({}, ["p1", "p1", "p1", "p1"]);
    const let_ = pt("p2", { ending: "let_replayed" });
    const next = game({ gameNumber: 2 }, ["p2"]);
    const { games } = labelScores([...won, let_, ...next], true);
    expect(games.map((g) => g.gamesBefore)).toEqual(["0–0", "1–0"]);
  });
});

test.describe("games and sets", () => {
  test("game numbering restarts in set 2 while the stored number does not", () => {
    const set1 = [1, 2, 3, 4, 5, 6].flatMap((gameNumber) =>
      game({ gameNumber }, ["p1", "p1", "p1", "p1"]),
    );
    const set2 = [7, 8].flatMap((gameNumber) =>
      game({ setNumber: 2, gameNumber }, ["p2", "p2", "p2", "p2"]),
    );
    const points = [...set1, ...set2];
    const scored = labelScores(points, true);

    expect(scored.points.get(set2[0].id)).toEqual({
      gameInSet: 1,
      scoreBefore: "0–0",
    });
    expect(scored.points.get(set2[4].id)?.gameInSet).toBe(2);
    expect(scored.points.get(set1[20].id)?.gameInSet).toBe(6);

    expect(
      scored.games.map((g) => [g.setNumber, g.gameNumber, g.gameInSet]),
    ).toEqual([
      [1, 1, 1],
      [1, 2, 2],
      [1, 3, 3],
      [1, 4, 4],
      [1, 5, 5],
      [1, 6, 6],
      [2, 7, 1],
      [2, 8, 2],
    ]);
    // The stored game numbers are what they were.
    expect(points.map((p) => p.gameNumber)).toEqual([
      ...[1, 2, 3, 4, 5, 6].flatMap((n) => [n, n, n, n]),
      7,
      7,
      7,
      7,
      8,
      8,
      8,
      8,
    ]);
  });

  test("gamesBefore counts the set's games won so far, p1 first", () => {
    const points = [
      ...game({ gameNumber: 1 }, ["p1", "p1", "p1", "p1"]),
      ...game({ gameNumber: 2, server: "p2" }, ["p1", "p1", "p1", "p1"]),
      ...game({ gameNumber: 3 }, ["p2", "p2", "p2", "p2"]),
      ...game({ setNumber: 2, gameNumber: 4 }, ["p2"]),
    ];
    const { games } = labelScores(points, true);
    expect(games).toEqual([
      {
        setNumber: 1,
        gameNumber: 1,
        gameInSet: 1,
        gamesBefore: "0–0",
        winner: "p1",
      },
      {
        setNumber: 1,
        gameNumber: 2,
        gameInSet: 2,
        gamesBefore: "1–0",
        winner: "p1",
      },
      {
        setNumber: 1,
        gameNumber: 3,
        gameInSet: 3,
        gamesBefore: "2–0",
        winner: "p2",
      },
      // A new set starts from nothing.
      {
        setNumber: 2,
        gameNumber: 4,
        gameInSet: 1,
        gamesBefore: "0–0",
        winner: "p2",
      },
    ]);
  });

  test("a game's winner is the winner of its last counted point", () => {
    // Mislabelled: p1 has the points but the labeller's last call is p2.
    const odd = game({ gameNumber: 1 }, ["p1", "p1", "p1", "p2"]);
    const next = game({ gameNumber: 2 }, ["p1"]);
    const { games } = labelScores([...odd, ...next], true);
    expect(games[1].gamesBefore).toBe("0–1");
    // A game with no counted point wins nobody a game.
    const empty = [pt(null, { gameNumber: 1 })];
    expect(labelScores([...empty, ...next], true).games[1].gamesBefore).toBe(
      "0–0",
    );
  });

  test("a point without a set or game has no place on the scoreboard", () => {
    const loose = pt("p1", { setNumber: null, gameNumber: null });
    const { points, games } = labelScores([loose, ...game({}, ["p2"])], true);
    expect(points.get(loose.id)).toEqual({
      gameInSet: null,
      scoreBefore: null,
    });
    expect(games).toHaveLength(1);
  });

  test("a row loaded without gameType scores as an ordinary game", () => {
    const points = game({}, ["p1", "p1", "p1"]);
    for (const point of points) delete point.gameType;
    expect(scoresBefore(points)).toEqual(["0–0", "15–0", "30–0"]);
    expect(scoresBefore(points.map((p) => ({ ...p, gameType: null })))).toEqual(
      ["0–0", "15–0", "30–0"],
    );
  });

  test("the input is read, never written", () => {
    const points = game({}, ["p1", "p2", "p1"]).map((p) => Object.freeze(p));
    const snapshot = JSON.stringify(points);
    labelScores(points, true);
    expect(JSON.stringify(points)).toBe(snapshot);
  });
});

test("the module stays free of components, next/ and server-side code", () => {
  const source = readFileSync(
    path.join(process.cwd(), "src/lib/services/labels/score.ts"),
    "utf8",
  );
  const imports = [...source.matchAll(/from\s+"([^"]+)"/g)].map((m) => m[1]);
  expect(imports).toEqual(["./session"]);
  expect(source).not.toMatch(/components\//);
  expect(source).not.toMatch(/from\s+"next/);
  expect(source).not.toMatch(/-server"|supabase|"server-only"/);
});
