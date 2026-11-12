import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

import { applyGameShift } from "@/lib/services/labels/game-shift";
import { planSetCut, setCut, setCutKey } from "@/lib/services/labels/set-cut";
import { labelScores } from "@/lib/services/labels/score";
import { labelSetScores } from "@/lib/services/labels/set-scores";
import type {
  LabelPoint,
  LabelSide,
  LabelStartScore,
} from "@/lib/services/labels/session";
import { labelPoint } from "./fixtures/label-session";

// A set that reaches its entered score with games still filed under it: the
// games after its end move to the next set (set-cut.ts), and the console runs
// that by itself.

const UUID = (n: number) =>
  `aaaaaaaa-aaaa-4aaa-8aaa-${String(n).padStart(12, "0")}`;

/**
 * A match from a sketch: one entry per game — its stored set and who won it,
 * four points to love (`null`: a game with no winner yet) — numbered down the
 * match, every point seeded with what it holds.
 */
function match(games: { set: number; winner: LabelSide | null }[]) {
  const points: LabelPoint[] = [];
  games.forEach((game, g) => {
    for (let i = 0; i < 4; i += 1) {
      const pointIndex = points.length;
      const server: LabelSide = g % 2 === 0 ? "p1" : "p2";
      points.push(
        labelPoint(UUID(pointIndex + 1), pointIndex, {
          vendorRallyIds: [],
          serveSide: null,
          setNumber: game.set,
          gameNumber: g + 1,
          server,
          winner: game.winner,
          ending: game.winner ? "winner" : null,
          seed: {
            set_number: game.set,
            game_number: g + 1,
            server,
            serve_side: null,
            winner: game.winner,
            ending: game.winner ? "winner" : null,
            ended_by: null,
          },
        }),
      );
    }
  });
  return points;
}

const won = (set: number, winners: string) =>
  [...winners].map((w) => ({
    set,
    winner: (w === "1" ? "p1" : w === "2" ? "p2" : null) as LabelSide | null,
  }));

const START: LabelStartScore = {
  sets: [0, 0],
  games: [2, 0],
  points: [0, 0],
  server: "p1",
};

const tally = (points: LabelPoint[], start: LabelStartScore | null) =>
  labelSetScores(points, labelScores(points, true, start).games, start).map(
    (set) => set.games,
  );

test.describe("setCut", () => {
  // The video starts at 2–0 of a 6–3 set: seven of its games are on film, but
  // the vendor filed nine under set 1, as if from 0–0.
  const midSet = match([...won(1, "112121212"), ...won(2, "12121211")]);
  const entered = [
    [6, 3],
    [6, 4],
  ];

  test("a set at its entered score hands the games after it to the next set", () => {
    expect(tally(midSet, START)).toEqual([
      [7, 4],
      [5, 3],
    ]);
    const cut = setCut(midSet, true, entered, null, START);
    expect(cut).toEqual({ setNumber: 1, gameKeys: ["1·8", "1·9"] });
    expect(setCutKey(cut!)).toBe("1:1·8");

    const plan = planSetCut(midSet, true, entered, null, START);
    if ("error" in plan) throw new Error(plan.error);
    expect(plan.writes).toHaveLength(8);
    expect(plan.shots).toEqual([]);
    for (const write of plan.writes) {
      expect(write.set_number).toBe(2);
      expect([8, 9]).toContain(write.game_number);
      expect(write.status).toBe("edited");
    }
    const after = applyGameShift(midSet, plan.writes);
    expect(tally(after, START)).toEqual([
      [6, 3],
      [6, 4],
    ]);
    // The moved games open set 2, in point order.
    const bands = labelScores(after, true, START).games;
    expect(
      bands.filter((b) => b.setNumber === 2).map((b) => b.gameNumber),
    ).toEqual([8, 9, 10, 11, 12, 13, 14, 15, 16, 17]);
    // Nothing left to cut: set 2 ends on its last game.
    expect(setCut(after, true, entered, null, START)).toBeNull();
  });

  test("a cut cascades: the next set is cut on the rows the first leaves", () => {
    // Three sets, each boundary two games late.
    const three = match([
      ...won(1, "112121212"),
      ...won(2, "1212121111"),
      ...won(3, "1111"),
    ]);
    const score = [
      [6, 3],
      [6, 4],
      [6, 0],
    ];
    let rows = three;
    const cuts: number[] = [];
    for (;;) {
      const plan = planSetCut(rows, true, score, null, START);
      if ("error" in plan) break;
      cuts.push(plan.cut.setNumber);
      rows = applyGameShift(rows, plan.writes);
    }
    expect(cuts).toEqual([1, 2]);
    expect(tally(rows, START)).toEqual([
      [6, 3],
      [6, 4],
      [6, 0],
    ]);
  });

  test("no start score: a set the labeller gave an extra game is cut the same way", () => {
    const extra = match([...won(1, "1111112"), ...won(2, "111111")]);
    expect(
      setCut(
        extra,
        true,
        [
          [6, 0],
          [6, 1],
        ],
        null,
        null,
      ),
    ).toEqual({ setNumber: 1, gameKeys: ["1·7"] });
  });

  test("a set that ends where its games do is left alone", () => {
    const clean = match([...won(1, "111111"), ...won(2, "111111")]);
    expect(
      setCut(
        clean,
        true,
        [
          [6, 0],
          [6, 0],
        ],
        null,
        null,
      ),
    ).toBeNull();
  });

  test("a wrong winner never cuts early: the tally must be the entered one", () => {
    // Entered 6–3, but a game of player 2's is labelled for player 1: the
    // set passes 7–2 without ever reading 6–3.
    const flipped = match([...won(1, "111121212"), ...won(2, "1212")]);
    expect(setCut(flipped, true, [[6, 3]], null, START)).toBeNull();
  });

  test("an unfinished game before the set's end holds the cut", () => {
    const open = match([...won(1, "11 121212"), ...won(2, "1212")]);
    expect(setCut(open, true, entered, null, START)).toBeNull();
  });

  test("a set at 6–6 whose tiebreak is not folded yet is not cut through it", () => {
    // Entered 7–6: twelve games to 6–6, then the tiebreak the vendor cut into
    // two ordinary games. The first piece would read as the game for 7–6.
    const unfolded = match([...won(1, "121212121212"), ...won(1, "11")]);
    expect(setCut(unfolded, true, [[7, 6]], null, null)).toBeNull();
  });

  test("nothing entered, an empty entered set and the match-tiebreak set are skipped", () => {
    expect(setCut(midSet, true, null, null, START)).toBeNull();
    expect(setCut(midSet, true, [[0, 0]], null, START)).toBeNull();
    expect(setCut(midSet, true, entered, 1, START)).toBeNull();
  });
});

test.describe("the console and the server", () => {
  const consoleSource = readFileSync(
    "src/components/admin/labels/label-console.tsx",
    "utf8",
  );
  const service = readFileSync(
    "src/lib/services/labels/game-shift-session.ts",
    "utf8",
  );

  test("the console runs the cut by itself, once per cut, on settled rows", () => {
    expect(consoleSource).toContain("const cutPending = useOncePerKey(");
    expect(consoleSource).toContain(
      "runGameShift(setCutPlan, () => cutSetAction(session.id, setNumber));",
    );
    // Once per key, kept across a reload.
    expect(consoleSource).toContain(
      "const pending = key !== null && !tried.has(key);",
    );
    expect(consoleSource).toContain("window.localStorage.setItem(");
    // Settled rows: nothing saving, no undo or redo, no confirm open, and not
    // straight after an Undo or Redo.
    for (const guard of [
      "saveStatus.pending === 0 &&",
      "!undoing &&",
      "!redoing &&",
      "!confirm &&",
      "!autoHeld;",
    ]) {
      expect(consoleSource).toContain(guard);
    }
    expect(consoleSource.match(/setAutoHeld\(true\);/g)).toHaveLength(2);
    // Not on a practice copy, nor on a session labelled without marks.
    // Nor by an admin on a session assigned to a labeller.
    for (const gate of [
      'session.kind !== "practice" &&',
      "liveMarks !== null &&",
      "(labeller || !session.assigned);",
    ]) {
      expect(consoleSource).toContain(gate);
    }
    // A key is kept for the browser only once its write has landed.
    expect(consoleSource).toContain("if (awaiting === null || busy) return;");
    expect(consoleSource).toContain("if (!failed) {");
  });

  test("the server re-plans on the rows as read and refuses another set's cut", () => {
    expect(service).toContain(
      "planSetCut(points, adScoring, entered, tiebreakSet, start)",
    );
    expect(service).toContain(
      "plan.cut.setNumber === setNumber ? plan : { error: NO_SET_CUT }",
    );
    // The entered score is not read for a session labelled without marks.
    expect(service).toContain("session.marks_enabled === true");
  });

  test("both apps hand the console the action", () => {
    for (const page of [
      "src/app/admin/labels/[sessionId]/page.tsx",
      "src/app/label/[sessionId]/page.tsx",
    ]) {
      expect(readFileSync(page, "utf8")).toContain(
        "cutSet: cutLabelSetAction,",
      );
    }
  });
});
