import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

import {
  autoGameFix,
  autoGameFixKey,
} from "@/lib/services/labels/game-auto-shift";
import { applyGameShift } from "@/lib/services/labels/game-shift";
import { labelScores } from "@/lib/services/labels/score";
import type { LabelPoint, LabelSide } from "@/lib/services/labels/session";
import { labelPoint } from "./fixtures/label-session";

// A game whose checked points run past its end, or stop short of it, moves
// its own boundary; an unchecked point anywhere in the games touched holds it.

const UUID = (n: number) =>
  `aaaaaaaa-aaaa-4aaa-8aaa-${String(n).padStart(12, "0")}`;
const AT = "2026-11-11T12:00:00.000Z";

/** One entry per game: its number, server and each point's winner. */
function match(
  games: { game: number; server: LabelSide; winners: LabelSide[] }[],
  unchecked: number[] = [],
): LabelPoint[] {
  const points: LabelPoint[] = [];
  for (const game of games) {
    for (const winner of game.winners) {
      const pointIndex = points.length;
      points.push(
        labelPoint(UUID(pointIndex + 1), pointIndex, {
          vendorRallyIds: [],
          serveSide: null,
          gameNumber: game.game,
          server: game.server,
          winner,
          ending: "winner",
          checkedAt: unchecked.includes(pointIndex + 1) ? null : AT,
          seed: {
            set_number: 1,
            game_number: game.game,
            server: game.server,
            serve_side: null,
            winner,
            ending: "winner",
            ended_by: null,
          },
        }),
      );
    }
  }
  return points;
}

const w = (winners: string) =>
  [...winners].map((c) => (c === "1" ? "p1" : "p2") as LabelSide);

const games = (points: LabelPoint[]) =>
  labelScores(points, true, null).games.map((band) => [
    band.gameNumber,
    band.outcome.kind,
  ]);

test.describe("autoGameFix", () => {
  // Game 1 is settled after four points and holds two of game 2's; game 2 is
  // two points short; game 3 is whole.
  const over = (unchecked: number[] = []) =>
    match(
      [
        { game: 1, server: "p1", winners: w("111122") },
        { game: 2, server: "p2", winners: w("22") },
        { game: 3, server: "p1", winners: w("1111") },
        { game: 4, server: "p2", winners: w("2222") },
      ],
      unchecked,
    );

  test("checked points past a game's end move to the next game by themselves", () => {
    const points = over();
    expect(games(points)).toEqual([
      [1, "overflow"],
      [2, "unfinished"],
      [3, "decided"],
      [4, "decided"],
    ]);
    const fix = autoGameFix(points, true, null, null);
    expect(fix?.kind).toBe("shift");
    if (fix?.kind !== "shift") throw new Error("no shift");
    expect(fix.fromPointId).toBe(UUID(5));
    expect(autoGameFixKey(fix)).toBe(`shift:${UUID(5)}:2`);
    const after = applyGameShift(points, fix.writes);
    expect(games(after)).toEqual([
      [1, "decided"],
      [2, "decided"],
      [3, "decided"],
      [4, "decided"],
    ]);
    // Nothing left to fix.
    expect(autoGameFix(after, true, null, null)).toBeNull();
  });

  test("an unchecked point in the game it leaves, or the game it enters, holds the fix", () => {
    // Point 2 is in game 1; point 7 in game 2.
    expect(autoGameFix(over([2]), true, null, null)).toBeNull();
    expect(autoGameFix(over([7]), true, null, null)).toBeNull();
    // Held, nothing later is tried: game 2 is short only because its points
    // sit in game 1, so it must not pull game 3's in instead.
    // An unchecked point in a game the fix does not touch holds nothing.
    expect(autoGameFix(over([12]), true, null, null)?.kind).toBe("shift");
  });

  test("a checked game that stops short pulls the next game's checked points in", () => {
    // Game 1 holds only three of its points; game 2 opens with the fourth.
    const short = (unchecked: number[] = []) =>
      match(
        [
          { game: 1, server: "p1", winners: w("111") },
          { game: 2, server: "p2", winners: w("12222") },
          { game: 3, server: "p1", winners: w("1111") },
        ],
        unchecked,
      );
    const fix = autoGameFix(short(), true, null, null);
    expect(fix?.kind).toBe("pull");
    if (fix?.kind !== "pull") throw new Error("no pull");
    expect(fix.gameKey).toBe("1·1");
    expect(games(applyGameShift(short(), fix.writes))).toEqual([
      [1, "decided"],
      [2, "decided"],
      [3, "decided"],
    ]);
    expect(autoGameFix(short([4]), true, null, null)).toBeNull();
  });

  test("games that add up need nothing", () => {
    expect(
      autoGameFix(
        match([
          { game: 1, server: "p1", winners: w("1111") },
          { game: 2, server: "p2", winners: w("2222") },
        ]),
        true,
        null,
        null,
      ),
    ).toBeNull();
  });
});

test("the console runs it first, once per fix, with the slot's own operations", () => {
  const source = readFileSync(
    "src/components/admin/labels/label-console.tsx",
    "utf8",
  );
  expect(source).toContain("const gameFixPending = useOncePerKey(");
  expect(source).toContain(
    'if (gameFix.kind === "shift") shiftGameOverflow(gameFix.fromPointId);',
  );
  expect(source).toContain("else pullGamePoints(gameFix.gameKey);");
  // The set cut and the server fix wait for it.
  expect(source).toContain(
    "if (!autoFixes || !cutSetAction || gameFixPending) return null;",
  );
});
