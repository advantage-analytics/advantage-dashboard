import { expect, test } from "@playwright/test";

import { slotStops } from "@/lib/services/labels/flag-nav";
import type { GameServerPoint } from "@/lib/services/labels/game-operations";
import {
  gameServeRepeatBeforePoints,
  gameServeRepeatReason,
  gameServeRepeats,
} from "@/lib/services/labels/game-serve-order";
import type { SwapShot } from "@/lib/services/labels/player-swap";
import type {
  LabelPoint,
  LabelSide,
  LabelStroke,
} from "@/lib/services/labels/session";

// Two games in a row of one set served by the same player
// (game-serve-order.ts): flagged on the game the serving strokes argue
// against, and put right by the game band's own server change.

const NAMES = { p1: "Lee", p2: "Kim" };

function shot(
  id: string,
  hitter: LabelSide,
  stroke: LabelStroke,
  videoTime: number,
): SwapShot {
  return {
    id,
    eventId: null,
    status: "kept",
    statusBeforeDelete: null,
    seed: null,
    hitter,
    stroke,
    result: null,
    spin: null,
    contactX: null,
    contactY: null,
    landingX: null,
    landingY: null,
    videoTime,
  };
}

/** One game: `count` points stored as `server`'s, each served by `serves`. */
function game(
  from: number,
  gameNumber: number,
  server: LabelSide,
  serves: LabelSide,
  { count = 2, setNumber = 1, gameType = "game" as const } = {},
): GameServerPoint[] {
  return Array.from({ length: count }, (_, k) => {
    const index = from + k;
    const id = `p${index + 1}`;
    return {
      id,
      pointIndex: index,
      status: "unchanged",
      server,
      setNumber,
      gameNumber,
      serveSide: null,
      winner: serves,
      ending: null,
      endedBy: null,
      gameType,
      seed: null,
      shots: [
        shot(`${id}-s`, serves, "first_serve", index * 10),
        shot(
          `${id}-r`,
          serves === "p1" ? "p2" : "p1",
          "forehand",
          index * 10 + 1,
        ),
      ],
    } as GameServerPoint;
  });
}

test.describe("the same server two games in a row", () => {
  test("servers that alternate: nothing to say", () => {
    const rows = [
      ...game(0, 1, "p1", "p1"),
      ...game(2, 2, "p2", "p2"),
      ...game(4, 3, "p1", "p1"),
    ];
    expect(gameServeRepeats(rows)).toEqual([]);
  });

  test("strokes agreeing with both: the later game is the one flagged", () => {
    const rows = [
      ...game(0, 1, "p1", "p1"),
      ...game(2, 2, "p2", "p2"),
      ...game(4, 3, "p2", "p2"),
    ];
    const [repeat, ...rest] = gameServeRepeats(rows);
    expect(rest).toEqual([]);
    expect(repeat).toMatchObject({
      game: { setNumber: 1, gameNumber: 3 },
      gameInSet: 3,
      other: { game: { setNumber: 1, gameNumber: 2 }, gameInSet: 2 },
      server: "p2",
      expected: "p1",
      pointId: "p5",
      pointNumber: 5,
      // Each of game 3's serves is Kim's: given to Lee, both points switch.
      switched: 2,
    });
    expect(gameServeRepeatReason(repeat, NAMES)).toBe(
      "Kim serves games 2 and 3",
    );
    expect([...gameServeRepeatBeforePoints([repeat]).keys()]).toEqual(["p5"]);
  });

  test("the game whose serves name the other player is the one flagged", () => {
    // Game 1 is stored as Kim's, but Lee hits its serves: game 1 is wrong.
    const rows = [...game(0, 1, "p2", "p1"), ...game(2, 2, "p2", "p2")];
    const [repeat] = gameServeRepeats(rows);
    expect(repeat).toMatchObject({
      game: { setNumber: 1, gameNumber: 1 },
      expected: "p1",
      pointId: "p1",
      // Its serves are already Lee's: nobody switches.
      switched: 0,
    });
    expect(gameServeRepeatReason(repeat, NAMES)).toBe(
      "Kim serves games 1 and 2",
    );
  });

  test("a tiebreak, a new set and a deleted game's rows are not compared", () => {
    const tiebreak = game(0, 12, "p1", "p1").concat(
      game(2, 13, "p1", "p1", { gameType: "tiebreak" as never }),
    );
    expect(gameServeRepeats(tiebreak)).toEqual([]);
    const sets = [
      ...game(0, 12, "p1", "p1"),
      ...game(2, 13, "p1", "p1", { setNumber: 2 }),
    ];
    expect(gameServeRepeats(sets)).toEqual([]);
    const deleted = [
      ...game(0, 1, "p1", "p1"),
      ...game(2, 2, "p1", "p1").map((p) => ({
        ...p,
        status: "deleted" as const,
      })),
      ...game(4, 3, "p2", "p2"),
    ];
    expect(gameServeRepeats(deleted)).toEqual([]);
  });

  test("a game missing between two keeps the turn: no repeat", () => {
    const gap = [...game(0, 1, "p1", "p1"), ...game(2, 3, "p1", "p1")];
    expect(gameServeRepeats(gap)).toEqual([]);
    // Three apart, the server should have changed.
    const odd = [...game(0, 1, "p1", "p1"), ...game(2, 4, "p1", "p1")];
    expect(gameServeRepeats(odd).map((r) => r.game.gameNumber)).toEqual([4]);
  });

  test("one game between two repeats is flagged once", () => {
    const rows = [
      ...game(0, 1, "p1", "p1"),
      ...game(2, 2, "p1", "p2"),
      ...game(4, 3, "p1", "p1"),
    ];
    expect(gameServeRepeats(rows).map((r) => r.game.gameNumber)).toEqual([2]);
  });

  test("it is a stop for ] and [, on the game's first point", () => {
    const rows = [
      ...game(0, 1, "p1", "p1", { count: 4 }),
      ...game(4, 2, "p1", "p1", { count: 4 }),
    ].map((p) => ({
      ...p,
      vendorRallyIds: [],
      checkedAt: null,
      dismissed: [],
    }));
    expect(
      slotStops(rows as unknown as LabelPoint[], true).map((s) => [
        s.pointId,
        s.label,
      ]),
    ).toContainEqual(["p5", "Same server two games in a row"]);
  });
});
