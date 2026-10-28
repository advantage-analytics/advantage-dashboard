import { expect, test } from "@playwright/test";

import {
  courtEndSwapReason,
  courtEndSwaps,
  settledSetNumbers,
  type CourtEndPoint,
  type CourtEndShot,
} from "@/lib/services/labels/court-end";
import type { LabelGameType, LabelSide } from "@/lib/services/labels/session";

// Players at each other's end (court-end.ts): each stroke's end, turned by
// the changeovers before it, names its hitter once the set's games are right.

const NEAR = 5;
const FAR = 18.77;

let nextId = 0;

/** A vendor stroke the labeller has not touched: hitter = seed. */
function stroke(hitter: LabelSide, contactY: number | null): CourtEndShot {
  nextId += 1;
  return {
    id: `s${nextId}`,
    eventId: nextId,
    status: "kept",
    hitter,
    contactY,
    seed: { hitter } as CourtEndShot["seed"],
    siteRemoval: null,
    siteRemovalRestoredAt: null,
  };
}

/**
 * One game of `count` points. p1 starts the set at the near end; `turned`
 * is how many changes of end come before this game. A swapped point's
 * strokes carry the other player's names, from the same positions.
 */
function game(
  setNumber: number,
  gameNumber: number,
  from: number,
  turned: number,
  {
    count = 3,
    swapped = [] as number[],
    locked = false,
    gameType = "game" as LabelGameType,
  } = {},
): CourtEndPoint[] {
  return Array.from({ length: count }, (_, k) => {
    const turns = turned + (gameType === "game" ? 0 : Math.floor(k / 6));
    const p1End = turns % 2 === 0 ? NEAR : FAR;
    const p2End = p1End === NEAR ? FAR : NEAR;
    const flip = swapped.includes(k);
    const a: LabelSide = flip ? "p2" : "p1";
    const b: LabelSide = flip ? "p1" : "p2";
    return {
      id: `set${setNumber}-g${gameNumber}-p${k + 1}`,
      pointIndex: from + k,
      status: "unchanged",
      setNumber,
      gameNumber,
      gameType,
      gameStartLocked: locked && k === 0,
      shots: [stroke(a, p1End), stroke(b, p2End), stroke(a, p1End)],
    };
  });
}

/** Games 1–4 of set 1: ends change after games 1 and 3. */
function setOne(
  options: { swappedGame3?: number[]; lockGame3?: boolean } = {},
) {
  return [
    ...game(1, 1, 0, 0),
    ...game(1, 2, 3, 1),
    ...game(1, 3, 6, 1, {
      swapped: options.swappedGame3 ?? [],
      locked: options.lockGame3 ?? false,
    }),
    ...game(1, 4, 9, 2),
  ];
}

const SETTLED = { settledSets: new Set([1, 2, 3]) };
const UNSETTLED = { settledSets: new Set<number>() };

test.describe("players at the wrong end", () => {
  test("rows that follow the changeovers: nothing to say", () => {
    expect(courtEndSwaps(setOne(), SETTLED)).toEqual([]);
  });

  test("a swapped point in a settled set is offered, in its game", () => {
    const [swap] = courtEndSwaps(setOne({ swappedGame3: [1] }), SETTLED);
    expect(swap).toMatchObject({
      game: { setNumber: 1, gameNumber: 3 },
      gameInSet: 3,
      pointIds: ["set1-g3-p2"],
      pointId: "set1-g3-p2",
      pointNumber: 8,
      gamePoints: 3,
    });
    expect(courtEndSwapReason(swap)).toBe(
      "1 of 3 points in game 3 has the players at each other’s end",
    );
  });

  test("a whole game swapped reads as all of it", () => {
    const [swap] = courtEndSwaps(setOne({ swappedGame3: [0, 1, 2] }), SETTLED);
    expect(swap.pointIds).toHaveLength(3);
    expect(courtEndSwapReason(swap)).toBe(
      "All 3 points in game 3 have the players at each other’s end",
    );
  });

  test("an unsettled set says nothing until the labeller locks the game", () => {
    const rows = setOne({ swappedGame3: [0, 1, 2] });
    expect(courtEndSwaps(rows, UNSETTLED)).toEqual([]);
    const locked = setOne({ swappedGame3: [0, 1, 2], lockGame3: true });
    expect(courtEndSwaps(locked, UNSETTLED).map((s) => s.gameInSet)).toEqual([
      3,
    ]);
  });

  test("a hitter the labeller gave stands: the point is theirs", () => {
    const rows = setOne({ swappedGame3: [1] });
    const point = rows.find((p) => p.id === "set1-g3-p2")!;
    const [first, ...rest] = point.shots;
    const edited = {
      ...point,
      shots: [
        { ...first, seed: { hitter: "p1" } as CourtEndShot["seed"] },
        ...rest,
      ],
    };
    const out = rows.map((p) => (p.id === point.id ? edited : p));
    expect(courtEndSwaps(out, SETTLED)).toEqual([]);
  });

  test("an added stroke makes the point the labeller's too", () => {
    const rows = setOne({ swappedGame3: [1] }).map((p) =>
      p.id === "set1-g3-p2"
        ? {
            ...p,
            shots: [...p.shots, { ...stroke("p1", NEAR), eventId: null }],
          }
        : p,
    );
    expect(courtEndSwaps(rows, SETTLED)).toEqual([]);
  });

  test("strokes at the net and deleted points name no end", () => {
    const rows = setOne({ swappedGame3: [1] }).map((p) =>
      p.id === "set1-g3-p2"
        ? { ...p, shots: p.shots.map((s) => ({ ...s, contactY: 11.9 })) }
        : p,
    );
    expect(courtEndSwaps(rows, SETTLED)).toEqual([]);
    const gone = setOne({ swappedGame3: [1] }).map((p) =>
      p.id === "set1-g3-p2" ? { ...p, status: "deleted" as const } : p,
    );
    expect(courtEndSwaps(gone, SETTLED)).toEqual([]);
  });

  test("a ghost the site removed is no evidence: it neither flags a point nor votes", () => {
    // Game 3 has p1 at the far end. Point 2 is right there, plus four ghost
    // swings from the wrong ends, enough to outvote its three strokes if
    // they counted.
    const ghosts = [1, 2, 3, 4].map((n) => ({
      ...stroke(n % 2 ? "p1" : "p2", n % 2 ? NEAR : FAR),
      siteRemoval: "hit_after_fault" as const,
    }));
    const rows = setOne().map((p) =>
      p.id === "set1-g3-p2" ? { ...p, shots: [...p.shots, ...ghosts] } : p,
    );
    expect(courtEndSwaps(rows, SETTLED)).toEqual([]);
    // Restored, the same swings are the labeller's rally again: they count.
    const restored = rows.map((p) => ({
      ...p,
      shots: p.shots.map((s) =>
        s.siteRemoval
          ? { ...s, siteRemovalRestoredAt: "2026-10-28T00:00:00Z" }
          : s,
      ),
    }));
    expect(courtEndSwaps(restored, SETTLED)[0]?.pointIds).toEqual([
      "set1-g3-p2",
    ]);
  });

  test("too few placed strokes in a set: no vote, no slot", () => {
    const rows = game(1, 1, 0, 0, { count: 2, swapped: [1] });
    expect(courtEndSwaps(rows, SETTLED)).toEqual([]);
  });

  test("a tiebreak changes ends every six points", () => {
    // 12 games before it: six changes, so p1 is back at the near end, then
    // turns after its sixth point.
    const rows = [
      ...setOne(),
      ...game(1, 13, 12, 6, { count: 8, gameType: "tiebreak", swapped: [6] }),
    ];
    const [swap] = courtEndSwaps(rows, SETTLED);
    expect(swap.pointIds).toEqual(["set1-g13-p7"]);
  });

  test("a start score moves the changeovers: the video's first game is game 2", () => {
    // One game already played: the video's first game is played after a
    // change of end, so p1 is far there.
    const rows = [
      ...game(1, 2, 0, 1),
      ...game(1, 3, 3, 1, { swapped: [0] }),
      ...game(1, 4, 6, 2),
      ...game(1, 5, 9, 2),
    ];
    const start = {
      sets: [0, 0] as [number, number],
      games: [1, 0] as [number, number],
      points: [0, 0] as [number, number],
      server: "p1" as const,
    };
    const [swap] = courtEndSwaps(rows, { ...SETTLED, startScore: start });
    expect(swap.pointIds).toEqual(["set1-g3-p1"]);
  });

  test("a match tiebreak takes its ends from the set before, even when most of it is swapped", () => {
    // Set 1: four games (even), so no change into set 2's match tiebreak.
    const rows = [
      ...setOne(),
      ...game(2, 1, 12, 0, {
        count: 6,
        gameType: "match_tiebreak",
        swapped: [0, 1, 2, 3],
      }),
    ];
    const [swap] = courtEndSwaps(rows, SETTLED);
    expect(swap.game).toEqual({ setNumber: 2, gameNumber: 1 });
    expect(swap.pointIds).toEqual([
      "set2-g1-p1",
      "set2-g1-p2",
      "set2-g1-p3",
      "set2-g1-p4",
    ]);
  });

  test("into a match tiebreak, the ends carry by the set's changeovers, not its game count", () => {
    // Six games: changes after games 1, 3 and 5, so the match tiebreak
    // starts turned once — though six is even.
    const sixGames = Array.from({ length: 6 }, (_, i) =>
      game(1, i + 1, i * 3, Math.floor((i + 1) / 2)),
    ).flat();
    const rows = [
      ...sixGames,
      ...game(2, 1, 18, 3, {
        count: 6,
        gameType: "match_tiebreak",
        swapped: [0, 1, 2, 3],
      }),
    ];
    const [swap] = courtEndSwaps(rows, SETTLED);
    expect(swap.pointIds).toEqual([
      "set2-g1-p1",
      "set2-g1-p2",
      "set2-g1-p3",
      "set2-g1-p4",
    ]);
  });

  test("a set closed by a tiebreak carries the changes inside it too", () => {
    // 12 games, then an 8-point tiebreak: six changes before it, one after
    // its sixth point, and the set break — eight in all, so the match
    // tiebreak starts as set 1 did.
    const twelve = Array.from({ length: 12 }, (_, i) =>
      game(1, i + 1, i * 3, Math.floor((i + 1) / 2)),
    ).flat();
    const rows = [
      ...twelve,
      ...game(1, 13, 36, 6, { count: 8, gameType: "tiebreak" }),
      ...game(2, 1, 44, 8, {
        count: 6,
        gameType: "match_tiebreak",
        swapped: [0, 1, 2, 3],
      }),
    ];
    const [swap] = courtEndSwaps(rows, SETTLED);
    expect(swap.game).toEqual({ setNumber: 2, gameNumber: 1 });
    expect(swap.pointIds).toHaveLength(4);
  });

  test("settled sets: the labelled games make the entered score", () => {
    expect(
      settledSetNumbers(
        [
          { setNumber: 1, games: [6, 4] },
          { setNumber: 2, games: [3, 5] },
        ],
        [
          [6, 4],
          [3, 6],
        ],
      ),
    ).toEqual(new Set([1]));
    expect(settledSetNumbers([{ setNumber: 1, games: [6, 4] }], null)).toEqual(
      new Set(),
    );
  });
});
