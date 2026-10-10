import { expect, test } from "@playwright/test";
import {
  planTiebreakFold,
  tiebreakEndsSwapped,
  tiebreakFolds,
} from "@/lib/services/labels/tiebreak-fold";
import { tiebreakHitterHalf } from "@/components/admin/labels/court-placement";
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
