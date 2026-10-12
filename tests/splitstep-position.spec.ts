import { expect, test } from "@playwright/test";

import {
  playerAtEnd,
  serveEnd,
  type EndSchedule,
  type SplitStepRally,
  type SplitStepStroke,
} from "@/lib/services/splitstep/derivation";

/**
 * Who stands at each end from the changeover schedule, and which end a serve
 * came from. "P1" starts the match at the top of the frame throughout.
 */

function topAt(
  schedule: Omit<EndSchedule, "topAtStart" | "bottomAtStart" | "end">,
): string {
  return playerAtEnd({
    topAtStart: "P1",
    bottomAtStart: "P2",
    end: "top",
    ...schedule,
  });
}

function rallyServedFrom(playerY: number | null): SplitStepRally {
  const stroke = {
    videoTime: 0,
    strokeType: "serve",
    playerLabel: "vendor label, ignored",
    playerX: 1,
    playerY,
  } as SplitStepStroke;
  return { rallyId: 1, strokes: [stroke], server: "x", serves: [stroke] };
}

test.describe("playerAtEnd", () => {
  test("set 1: ends swap after games 1, 3, 5 and 7", () => {
    const tops = [0, 1, 2, 3, 4, 5, 6, 7].map((g) =>
      topAt({ completedSets: [], gamesBeforeInSet: g }),
    );
    expect(tops).toEqual(["P1", "P2", "P2", "P1", "P1", "P2", "P2", "P1"]);
  });

  test("the bottom end is always the other player", () => {
    for (let g = 0; g < 8; g += 1) {
      const bottom = playerAtEnd({
        topAtStart: "P1",
        bottomAtStart: "P2",
        completedSets: [],
        gamesBeforeInSet: g,
        end: "bottom",
      });
      expect(bottom).not.toBe(
        topAt({ completedSets: [], gamesBeforeInSet: g }),
      );
    }
  });

  test("set 2 after a 6-4 set: no set-break swap, five changeovers in", () => {
    // Swaps after games 1, 3, 5, 7, 9; game 10 ends the set on an even total.
    expect(topAt({ completedSets: [10], gamesBeforeInSet: 0 })).toBe("P2");
    expect(topAt({ completedSets: [10], gamesBeforeInSet: 1 })).toBe("P1");
    expect(topAt({ completedSets: [10], gamesBeforeInSet: 2 })).toBe("P1");
  });

  test("set 2 after a 6-3 set: the odd total swaps at the set break", () => {
    // Swaps after games 1, 3, 5, 7, then the set break after game 9. Ignoring
    // the set break (the server-witness.ts gap) would put P1 back at the top.
    expect(topAt({ completedSets: [9], gamesBeforeInSet: 0 })).toBe("P2");
    expect(topAt({ completedSets: [9], gamesBeforeInSet: 1 })).toBe("P1");
    expect(topAt({ completedSets: [9], gamesBeforeInSet: 2 })).toBe("P1");
  });

  test("set 3 adds both prior sets' changeovers", () => {
    // 6-4 (5 swaps) + 6-3 (5 swaps) = even: back to the match's starting ends.
    expect(topAt({ completedSets: [10, 9], gamesBeforeInSet: 0 })).toBe("P1");
    // 6-4 (5) + 6-2 (4) = odd.
    expect(topAt({ completedSets: [10, 8], gamesBeforeInSet: 0 })).toBe("P2");
  });

  test("tiebreak: ends swap every 6 points from the set's starting ends", () => {
    // 6-6 is 12 games, six changeovers: the tiebreak opens on set 1's ends.
    const at = (points: number) =>
      topAt({
        completedSets: [],
        gamesBeforeInSet: 12,
        tiebreakPointsBefore: points,
      });
    expect(at(0)).toBe("P1");
    expect(at(5)).toBe("P1");
    expect(at(6)).toBe("P2");
    expect(at(11)).toBe("P2");
    expect(at(12)).toBe("P1");
  });

  test("a tiebreak set is 13 games and swaps at the set break", () => {
    expect(topAt({ completedSets: [13], gamesBeforeInSet: 0 })).toBe("P2");
  });

  test("a 7-0 tiebreak (7 points) carries the swap after point 6: 8 in all", () => {
    // Games 1–11 swap six times; at 6-0 the players change ends and point 7
    // is still played, so that change carries; the end-of-tiebreak change is
    // the odd set's break. 6 + 1 + 1 = even: set 2 opens on the match's
    // starting ends — the opposite of what a bare 13-game total says.
    const sets = [{ games: 13, tiebreakPoints: 7 }];
    expect(topAt({ completedSets: sets, gamesBeforeInSet: 0 })).toBe("P1");
    expect(topAt({ completedSets: sets, gamesBeforeInSet: 1 })).toBe("P2");
    expect(topAt({ completedSets: sets, gamesBeforeInSet: 2 })).toBe("P2");
  });

  test("a 7-5 tiebreak (12 points) carries the swap after point 6: 8 in all", () => {
    // 6 + 1 (after point 6, play went on) + 1 (end of the tiebreak) = even.
    // The change after point 12 IS the end-of-tiebreak change, not a second
    // internal one — play did not continue.
    const sets = [{ games: 13, tiebreakPoints: 12 }];
    expect(topAt({ completedSets: sets, gamesBeforeInSet: 0 })).toBe("P1");
    expect(topAt({ completedSets: sets, gamesBeforeInSet: 1 })).toBe("P2");
    expect(topAt({ completedSets: sets, gamesBeforeInSet: 2 })).toBe("P2");
  });

  test("an 8-6 tiebreak (14 points) carries the swaps after points 6 and 12: 9 in all", () => {
    // Point 12 was followed by points 13 and 14, so it carries; 6 + 2 + 1 = odd.
    const sets = [{ games: 13, tiebreakPoints: 14 }];
    expect(topAt({ completedSets: sets, gamesBeforeInSet: 0 })).toBe("P2");
    expect(topAt({ completedSets: sets, gamesBeforeInSet: 1 })).toBe("P1");
  });

  test("a tiebreak set's carry adds to the sets around it", () => {
    // 6-4 (5 swaps) then 7-6 via a 7-5 tiebreak (8 swaps): 13, odd.
    expect(
      topAt({
        completedSets: [10, { games: 13, tiebreakPoints: 12 }],
        gamesBeforeInSet: 0,
      }),
    ).toBe("P2");
    // 6-4 (5) then 7-6 via an 8-6 tiebreak (9): 14, even.
    expect(
      topAt({
        completedSets: [10, { games: 13, tiebreakPoints: 14 }],
        gamesBeforeInSet: 0,
      }),
    ).toBe("P1");
  });

  test("a match tiebreak in place of a set swaps every 6 points", () => {
    // After 6-4, 4-6: 5 + 5 swaps, even.
    const at = (points: number) =>
      topAt({
        completedSets: [10, 10],
        gamesBeforeInSet: 0,
        tiebreakPointsBefore: points,
      });
    expect(at(0)).toBe("P1");
    expect(at(6)).toBe("P2");
    expect(at(12)).toBe("P1");
  });
});

test.describe("serveEnd", () => {
  test("reads the end from the sign of playerY", () => {
    expect(serveEnd(rallyServedFrom(11))).toBe("top");
    expect(serveEnd(rallyServedFrom(-11))).toBe("bottom");
  });

  test("a playerY of 0 or null has no end", () => {
    expect(serveEnd(rallyServedFrom(0))).toBeNull();
    expect(serveEnd(rallyServedFrom(null))).toBeNull();
  });

  test("reads the deciding serve, not a faulted first serve", () => {
    const fault = { ...rallyServedFrom(-11).strokes[0] };
    const second = { ...rallyServedFrom(11).strokes[0], videoTime: 5 };
    const rally: SplitStepRally = {
      rallyId: 2,
      strokes: [fault, second],
      server: "x",
      serves: [fault, second],
    };
    expect(serveEnd(rally)).toBe("top");
  });
});
