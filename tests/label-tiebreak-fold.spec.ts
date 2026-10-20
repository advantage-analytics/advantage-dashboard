import { expect, test } from "@playwright/test";
import {
  planTiebreakFold,
  tiebreakEndsSwapped,
  tiebreakFolds,
} from "@/lib/services/labels/tiebreak-fold";
import { tiebreakHitterHalf } from "@/components/admin/labels/court-placement";
import { slotStops } from "@/lib/services/labels/flag-nav";
import { gameOverflow, gameUnderflow } from "@/lib/services/labels/game-shift";
import type { LabelSide } from "@/lib/services/labels/session";

/**
 * The tiebreak at 6–6 (tiebreak-fold.ts): twelve games split 6–6, then the
 * vendor's cut of one tiebreak into three "games" of its own.
 */
type Row = {
  id: string;
  pointIndex: number;
  status: "unchanged";
  setNumber: number;
  gameNumber: number;
  server: LabelSide | null;
  serveSide: null;
  winner: LabelSide | null;
  ending: null;
  endedBy: null;
  gameType: "game";
  seed: null;
  shots: never[];
};

function set(tiebreak: { game: number; winner: LabelSide }[]): Row[] {
  const rows: Row[] = [];
  const add = (gameNumber: number, winner: LabelSide, server: LabelSide) =>
    rows.push({
      id: `p${rows.length + 1}`,
      pointIndex: rows.length,
      status: "unchanged",
      setNumber: 1,
      gameNumber,
      server,
      serveSide: null,
      winner,
      ending: null,
      endedBy: null,
      gameType: "game",
      seed: null,
      shots: [],
    });
  // Twelve games, each held to love by its server: 6–6.
  for (let game = 1; game <= 12; game += 1) {
    const server: LabelSide = game % 2 === 1 ? "p1" : "p2";
    for (let i = 0; i < 4; i += 1) add(game, server, server);
  }
  for (const point of tiebreak) add(point.game, point.winner, "p1");
  return rows;
}

// 7–5 to Lee (p1), cut by the vendor into games 13, 14 and 15; one point of
// game 16 after it belongs to the next set's play and is left alone.
const SEVEN_FIVE: { game: number; winner: LabelSide }[] = [
  ...["p1", "p2", "p1", "p1"].map((w) => ({
    game: 13,
    winner: w as LabelSide,
  })),
  ...["p2", "p2", "p1", "p2", "p1"].map((w) => ({
    game: 14,
    winner: w as LabelSide,
  })),
  ...["p2", "p1", "p1"].map((w) => ({ game: 15, winner: w as LabelSide })),
  { game: 16, winner: "p2" },
];

test("at 6–6 the next game is offered as a tiebreak, folding games until first to 7, two clear", () => {
  const rows = set(SEVEN_FIVE);
  const [fold] = tiebreakFolds(rows, true);
  expect(fold.type).toBe("tiebreak");
  expect(fold.setNumber).toBe(1);
  expect(fold.game).toEqual({ setNumber: 1, gameNumber: 13 });
  expect(fold.games.map((g) => g.gameNumber)).toEqual([13, 14, 15]);
  expect(fold.points).toEqual({ p1: 7, p2: 5 });
  expect(fold.winner).toBe("p1");
  // The twelve tiebreak points, and not game 16's.
  expect(fold.pointIds).toHaveLength(12);
  expect(fold.pointIds).not.toContain(rows.at(-1)!.id);
});

test("short of 7 the estimate runs to the end of the set; before 6–6, or with a tiebreak already set, nothing", () => {
  const unfinished = set(SEVEN_FIVE.slice(0, 6));
  const [fold] = tiebreakFolds(unfinished, true);
  expect(fold.winner).toBeNull();
  expect(fold.pointIds).toHaveLength(6);

  expect(tiebreakFolds(set([]).slice(0, 44), true)).toEqual([]);

  const already = set(SEVEN_FIVE).map((row) =>
    row.gameNumber === 13 ? { ...row, gameType: "tiebreak" as const } : row,
  );
  expect(tiebreakFolds(already as never, true)).toEqual([]);
});

test("the fold's writes: one game, a tiebreak, and the 1-2-2 serve order from its first server", () => {
  const rows = set(SEVEN_FIVE);
  const [fold] = tiebreakFolds(rows, true);
  const plan = planTiebreakFold(rows as never, fold);
  if ("error" in plan) throw new Error(plan.error);
  expect(new Set(plan.writes.map((w) => w.game_number))).toEqual(new Set([13]));
  expect(new Set(plan.writes.map((w) => w.game_type))).toEqual(
    new Set(["tiebreak"]),
  );
  // Lee serves point 1, then Vargas two, Lee two, …
  expect(plan.writes.map((w) => w.server)).toEqual([
    "p1",
    "p2",
    "p2",
    "p1",
    "p1",
    "p2",
    "p2",
    "p1",
    "p1",
    "p2",
    "p2",
    "p1",
  ]);
  expect(plan.shots).toEqual([]);
});

test("ends change after every six points: at 3–3, swapped; at 6–6, back", () => {
  expect([0, 5, 6, 11, 12, 17, 18].map(tiebreakEndsSwapped)).toEqual([
    false,
    false,
    true,
    true,
    false,
    false,
    true,
  ]);
});

test("a tiebreak shot with nothing placed in its point opens on its hitter's half, ends changing every six", () => {
  // Lee served point 1 from the near half (contact y 0.5, near baseline).
  const point = (
    i: number,
    shots: { hitter: LabelSide; contactY: number | null }[],
  ) => ({
    id: `t${i}`,
    status: "unchanged" as const,
    pointIndex: i,
    setNumber: 1,
    gameNumber: 13,
    ending: null,
    gameType: "tiebreak" as const,
    shots: shots.map((s) => ({ ...s, status: "kept" })),
  });
  const points = [
    point(0, [{ hitter: "p1", contactY: 0.5 }]),
    ...[1, 2, 3, 4, 5].map((i) => point(i, [])),
    point(6, [{ hitter: "p1", contactY: null }]),
  ];
  // Before the change: Lee still near, Vargas far.
  expect(tiebreakHitterHalf(points, "t3", "p1")).toBe("near");
  expect(tiebreakHitterHalf(points, "t3", "p2")).toBe("far");
  // Six points played: they have changed ends.
  expect(tiebreakHitterHalf(points, "t6", "p1")).toBe("far");
  // Not a tiebreak, or no hitter: nothing to say.
  const ordinary = points.map((p) => ({ ...p, gameType: "game" as const }));
  expect(tiebreakHitterHalf(ordinary, "t3", "p1")).toBeNull();
  expect(tiebreakHitterHalf(points, "t3", null)).toBeNull();
});

/**
 * The match tiebreak (tiebreak-fold.ts): two sets split, then the deciding
 * set the record entered as 1–0 — a 10-point match tiebreak the vendor cut
 * into games 20, 21 and 22 as the serve changed hands.
 */
function decidingSet(winners: LabelSide[], games: number[]): Row[] {
  const rows: Row[] = [];
  const add = (
    setNumber: number,
    gameNumber: number,
    winner: LabelSide,
    server: LabelSide,
    gameType: Row["gameType"] = "game",
  ) =>
    rows.push({
      id: `m${rows.length + 1}`,
      pointIndex: rows.length,
      status: "unchanged",
      setNumber,
      gameNumber,
      server,
      serveSide: null,
      winner,
      ending: null,
      endedBy: null,
      gameType,
      seed: null,
      shots: [],
    });
  // Set 1 to Lee 6–3 (games 1–9), set 2 to Vargas 3–6 (games 10–18).
  for (let game = 1; game <= 9; game += 1) {
    const server: LabelSide = game % 2 === 1 ? "p1" : "p2";
    const winner: LabelSide = game <= 6 ? "p1" : "p2";
    for (let i = 0; i < 4; i += 1) add(1, game, winner, server);
  }
  for (let game = 10; game <= 18; game += 1) {
    const server: LabelSide = game % 2 === 0 ? "p1" : "p2";
    const winner: LabelSide = game <= 15 ? "p2" : "p1";
    for (let i = 0; i < 4; i += 1) add(2, game, winner, server);
  }
  winners.forEach((winner, i) => add(3, games[i], winner, "p2"));
  return rows;
}

// 10–8 to Lee: 8–8 then two of Lee's, cut by the vendor into three games;
// one stray point of game 22 after the deciding one is left where it is.
const TEN_EIGHT: LabelSide[] = [
  ...Array.from({ length: 8 }, () => ["p1", "p2"] as LabelSide[]).flat(),
  "p1",
  "p1",
  "p2",
];
const TEN_EIGHT_GAMES = [
  ...Array(7).fill(20),
  ...Array(6).fill(21),
  ...Array(6).fill(22),
];

test.describe("the match tiebreak", () => {
  test("offered on the entered deciding set while its games are ordinary: one game, first to 10, two clear", () => {
    const rows = decidingSet(TEN_EIGHT, TEN_EIGHT_GAMES);
    // Without the entered score's set, nothing: set 3 is not at 6–6.
    expect(tiebreakFolds(rows, true)).toEqual([]);
    const folds = tiebreakFolds(rows, true, 3);
    expect(folds).toHaveLength(1);
    const [fold] = folds;
    expect(fold.type).toBe("match_tiebreak");
    expect(fold.setNumber).toBe(3);
    expect(fold.game).toEqual({ setNumber: 3, gameNumber: 20 });
    expect(fold.games.map((g) => g.gameNumber)).toEqual([20, 21, 22]);
    expect(fold.points).toEqual({ p1: 10, p2: 8 });
    expect(fold.winner).toBe("p1");
    // The eighteen points to the decider, not the stray one after it.
    expect(fold.pointIds).toHaveLength(18);
    expect(fold.pointIds).not.toContain(rows.at(-1)!.id);
  });

  test("short of 10 the estimate runs to the end of the set; a set already typed is not offered again", () => {
    const rows = decidingSet(
      TEN_EIGHT.slice(0, 9),
      TEN_EIGHT_GAMES.slice(0, 9),
    );
    const [fold] = tiebreakFolds(rows, true, 3);
    expect(fold.winner).toBeNull();
    expect(fold.points).toEqual({ p1: 5, p2: 4 });
    expect(fold.pointIds).toHaveLength(9);

    const typed = decidingSet(TEN_EIGHT, TEN_EIGHT_GAMES).map((row) =>
      row.setNumber === 3
        ? { ...row, gameNumber: 20, gameType: "match_tiebreak" as const }
        : row,
    );
    expect(tiebreakFolds(typed as never, true, 3)).toEqual([]);
    // One of the set's games typed by hand: not offered either, and the
    // set is never read for a 6–6 tiebreak too.
    const partly = decidingSet(TEN_EIGHT, TEN_EIGHT_GAMES).map((row) =>
      row.gameNumber === 20
        ? { ...row, gameType: "match_tiebreak" as const }
        : row,
    );
    expect(tiebreakFolds(partly as never, true, 3)).toEqual([]);
  });

  test("the plan: every point into game 20 as match_tiebreak, served 1-2-2 from the first server", () => {
    const rows = decidingSet(TEN_EIGHT, TEN_EIGHT_GAMES);
    const [fold] = tiebreakFolds(rows, true, 3);
    const plan = planTiebreakFold(rows as never, fold);
    if ("error" in plan) throw new Error(plan.error);
    expect(plan.writes).toHaveLength(18);
    expect(new Set(plan.writes.map((w) => w.game_number))).toEqual(
      new Set([20]),
    );
    expect(new Set(plan.writes.map((w) => w.set_number))).toEqual(new Set([3]));
    expect(new Set(plan.writes.map((w) => w.game_type))).toEqual(
      new Set(["match_tiebreak"]),
    );
    expect(plan.writes.slice(0, 7).map((w) => w.server)).toEqual([
      "p2",
      "p1",
      "p1",
      "p2",
      "p2",
      "p1",
      "p1",
    ]);
    expect(plan.shots).toEqual([]);
    // The fold's type is the plan's; a fold without one is the 6–6 kind.
    const asTiebreak = planTiebreakFold(rows as never, {
      game: fold.game,
      pointIds: fold.pointIds,
    });
    if ("error" in asTiebreak) throw new Error(asTiebreak.error);
    expect(new Set(asTiebreak.writes.map((w) => w.game_type))).toEqual(
      new Set(["tiebreak"]),
    );
  });

  test("the rail prefers the fold: the entered set's split games are neither short nor run over, and the slot stop says so", () => {
    const rows = decidingSet(TEN_EIGHT, TEN_EIGHT_GAMES);
    // Read as ordinary games under ad scoring, the vendor's cut leaves
    // games 20 and 21 short (4–3 and 3–3 in points) — "pull the next
    // game's points in" would fire on each. Named as the match tiebreak's
    // set, they are the fold's business and nothing else's.
    expect(
      gameUnderflow(rows as never, true).map((game) => game.gameNumber),
    ).toEqual([20, 21]);
    expect(gameUnderflow(rows as never, true, 3)).toEqual([]);
    expect(gameOverflow(rows as never, true, 3)).toEqual([]);
    expect(gameOverflow(rows as never, false, 3)).toEqual([]);
    const stops = slotStops(rows as never, true, 3);
    expect(stops.map((stop) => stop.label)).toEqual(["Match tiebreak?"]);
    expect(stops[0].pointId).toBe(rows.find((r) => r.setNumber === 3)!.id);
    // Once folded and typed — the plan's game, type and serve order
    // applied — nothing is left to ask about the set.
    const plan = planTiebreakFold(
      rows as never,
      tiebreakFolds(rows, true, 3)[0],
    );
    if ("error" in plan) throw new Error(plan.error);
    const writes = new Map(plan.writes.map((write) => [write.id, write]));
    const typed = rows.map((row) => {
      const write = writes.get(row.id);
      return write
        ? {
            ...row,
            gameNumber: write.game_number,
            gameType: write.game_type,
            server: write.server,
          }
        : row;
    });
    expect(slotStops(typed as never, true, 3)).toEqual([]);
  });
});
