import { expect, test } from "@playwright/test";

import type { MatchPoint, MatchShot } from "@/lib/data/match-points-server";

import {
  approachLateralM,
  approachOf,
  laneOf,
  wingOf,
} from "@/components/dashboard/matches/match-detail/match-filters/approach";
import { cameToNet } from "@/components/dashboard/matches/match-detail/match-filters/model";
import {
  netApproachShotOf,
  netEndingOf,
  netEntryOf,
} from "@/components/dashboard/matches/match-detail/match-filters/net-game";

/**
 * The approach classifier (`match-filters/approach.ts`) against the Net game
 * classifiers it builds on. Pure and offline.
 *
 * Player 1 plays the low end (y < the net), player 2 the high end. Court
 * frame: y 0 → 23.77, the net at 11.885, x about the centre line.
 */

const NET = 11.885;

let shotId = 0;
function s(
  shotNumber: number,
  isPlayer1: boolean,
  shotType: string,
  o: {
    cy?: number | null;
    lx?: number | null;
    ly?: number | null;
    t?: number | null;
    result?: string;
    zone?: string | null;
  } = {},
): MatchShot {
  shotId += 1;
  return {
    id: `s${shotId}`,
    shotNumber,
    isPlayer1,
    shotType,
    spinType: null,
    zone: o.zone ?? null,
    result: o.result ?? "In",
    videoTime: o.t === undefined ? shotNumber * 1.3 : o.t,
    bounceVideoTime: null,
    contactX: 0,
    contactY: o.cy === undefined ? null : o.cy,
    landingX: o.lx === undefined ? 0 : o.lx,
    landingY: o.ly === undefined ? null : o.ly,
  };
}

function p(
  id: string,
  o: {
    server: 1 | 2;
    winner: 1 | 2;
    resultType: string;
    shots: MatchShot[];
  },
): MatchPoint {
  return {
    id,
    pointNumber: 1,
    setNumber: 1,
    gameNumber: 1,
    setScore: "0-0",
    gameScore: "0-0",
    pointScore: "0-0",
    resultType: o.resultType,
    eventType: "",
    description: "",
    player: o.winner === 1 ? "player1" : "player2",
    wonByPlayer1: o.winner === 1,
    serverIsPlayer1: o.server === 1,
    isBreakPoint: false,
    isSetPoint: false,
    isMatchPoint: false,
    rallyLength: o.shots.length,
    duration: null,
    videoTime: 10,
    saved: false,
    savedBy: [],
    shots: o.shots,
  };
}

const LOB_T = 30;
const LOBS: ReadonlySet<number> = new Set([LOB_T]);

// You serve and volley, and win it on the volley.
const SERVE_VOLLEY = p("serve-volley", {
  server: 1,
  winner: 1,
  resultType: "Volley Winner",
  shots: [
    s(1, true, "First Serve", { cy: 0, lx: 2, ly: 17, zone: "Wide" }),
    s(2, false, "Backhand", { cy: 22, ly: 7 }),
    s(3, true, "Forehand Volley", { cy: 9 }),
  ],
});

/** You approach (shot 4) to `lx`, then are passed by a reply in `zone`. */
const passedBy = (id: string, zone: string | null, lx = -3) =>
  p(id, {
    server: 2,
    winner: 2,
    resultType: "Forehand Winner",
    shots: [
      s(1, false, "First Serve", { cy: 23.5, ly: 7 }),
      s(2, true, "Forehand", { cy: 0.5, ly: 20 }),
      s(3, false, "Backhand", { cy: 22, ly: 2 }),
      s(4, true, "Forehand", { cy: 3, lx, ly: 21, zone: "Down the Line" }),
      s(5, false, "Backhand", { cy: 22, ly: 6 }),
      s(6, true, "Backhand Volley", { cy: 9, ly: 20 }),
      s(7, false, "Forehand", { cy: 21, ly: 3, zone }),
    ],
  });

const PASSED_DTL = passedBy("passed-dtl", "Down the Line");
const PASSED_CC = passedBy("passed-cc", "Crosscourt");

// A short ball drags you in; you net the volley.
const DRAWN_IN = p("drawn-in", {
  server: 2,
  winner: 2,
  resultType: "Volley Unforced Error",
  shots: [
    s(1, false, "First Serve", { cy: 23.5, ly: 7 }),
    s(2, true, "Forehand", { cy: 0.5, ly: 20 }),
    s(3, false, "Backhand", { cy: 22, ly: NET - 2 }),
    s(4, true, "Forehand", { cy: 8.5, lx: 0.5, ly: 20, zone: "Middle" }),
    s(5, false, "Backhand", { cy: 21, ly: 7 }),
    s(6, true, "Forehand Volley", { cy: 9.5, result: "Net" }),
  ],
});

// You approach and the opponent lobs you (a lob only with lob keys).
const LOBBED = p("lobbed", {
  server: 2,
  winner: 2,
  resultType: "Forehand Winner",
  shots: [
    s(1, false, "First Serve", { cy: 23.5, ly: 7 }),
    s(2, true, "Forehand", { cy: 0.5, ly: 20 }),
    s(3, false, "Backhand", { cy: 22, ly: 3 }),
    s(4, true, "Forehand", { cy: 2, lx: 3, ly: 21, zone: "Crosscourt" }),
    s(5, false, "Backhand", { cy: 22, ly: 5 }),
    s(6, true, "Backhand Volley", { cy: 9, ly: 20 }),
    s(7, false, "Forehand", { cy: 21, ly: 1, t: LOB_T, zone: "Crosscourt" }),
  ],
});

// You approach and the opponent misses the pass.
const OPP_ERROR = p("opp-error", {
  server: 1,
  winner: 1,
  resultType: "Forehand Unforced Error",
  shots: [
    s(1, true, "First Serve", { cy: 0, ly: 17 }),
    s(2, false, "Backhand", { cy: 22, ly: 3 }),
    s(3, true, "Forehand", { cy: 2, ly: 21 }),
    s(4, false, "Backhand", { cy: 22, ly: 6 }),
    s(5, true, "Forehand Volley", { cy: 9.5, ly: 20 }),
    s(6, false, "Forehand", { cy: 21, result: "Net" }),
  ],
});

// The opponent (high end) approaches and you pass them.
const OPP_APPROACH = p("opp-approach", {
  server: 2,
  winner: 1,
  resultType: "Forehand Winner",
  shots: [
    s(1, false, "First Serve", { cy: 23.5, ly: 7 }),
    s(2, true, "Forehand", { cy: 0.5, ly: 20 }),
    s(3, false, "Forehand", { cy: 21, lx: 3, ly: 2, zone: "Crosscourt" }),
    s(4, true, "Backhand", { cy: 1, ly: 22 }),
    s(5, false, "Forehand Volley", { cy: 14, ly: 5 }),
    s(6, true, "Forehand", { cy: 3, ly: 20, zone: "Down the Line" }),
  ],
});

// Nobody comes in.
const BASELINE = p("baseline", {
  server: 2,
  winner: 2,
  resultType: "Forehand Winner",
  shots: [
    s(1, false, "First Serve", { cy: 23.5, ly: 7 }),
    s(2, true, "Forehand", { cy: 0.5, ly: 20 }),
    s(3, false, "Backhand", { cy: 22, ly: 3 }),
    s(4, true, "Backhand", { cy: 1, ly: 22 }),
    s(5, false, "Forehand", { cy: 22.5, ly: 2 }),
  ],
});

const MATCH = [
  SERVE_VOLLEY,
  PASSED_DTL,
  PASSED_CC,
  DRAWN_IN,
  LOBBED,
  OPP_ERROR,
  OPP_APPROACH,
  BASELINE,
];

test.describe("approachOf agrees with the Net game", () => {
  test("null exactly where cameToNet is false", () => {
    for (const point of MATCH) {
      for (const seat of [true, false]) {
        for (const lobs of [LOBS, null]) {
          const a = approachOf(point, seat, lobs, null);
          expect(a === null, `${point.id} p1=${seat}`).toBe(
            !cameToNet(point, seat),
          );
        }
      }
    }
    // Both kinds are in the fixture.
    expect(approachOf(BASELINE, true, LOBS, null)).toBeNull();
    expect(approachOf(PASSED_DTL, true, LOBS, null)).not.toBeNull();
  });

  test("entry, ending and shot equal netEntryOf / netEndingOf / netApproachShotOf", () => {
    let seen = 0;
    for (const point of MATCH) {
      for (const seat of [true, false]) {
        for (const lobs of [LOBS, null]) {
          const a = approachOf(point, seat, lobs, "right");
          if (a === null) continue;
          seen += 1;
          expect(a.entry).toBe(netEntryOf(point, seat));
          expect(a.ending).toBe(netEndingOf(point, seat, lobs));
          expect(a.shot).toBe(netApproachShotOf(point, seat));
        }
      }
    }
    expect(seen).toBeGreaterThan(0);
    // The fixture covers all three entries.
    expect(approachOf(SERVE_VOLLEY, true, LOBS, null)?.entry).toBe(
      "serve-volley",
    );
    expect(approachOf(PASSED_DTL, true, LOBS, null)?.entry).toBe("approach");
    expect(approachOf(DRAWN_IN, true, LOBS, null)?.entry).toBe("drawn-in");
  });
});

test.describe("lane and wing", () => {
  test("lane is the hitter's-view third, mirrored at the high end", () => {
    // Low end: x < 0 is the hitter's left.
    expect(approachOf(PASSED_DTL, true, LOBS, "right")?.lane).toBe("left");
    expect(approachOf(LOBBED, true, LOBS, "right")?.lane).toBe("right");
    expect(approachOf(DRAWN_IN, true, LOBS, "right")?.lane).toBe("middle");
    // High end: the hitter faces −y, so world x > 0 is their left.
    expect(approachOf(OPP_APPROACH, false, LOBS, "right")?.lane).toBe("left");

    expect(laneOf(-1.5)).toBe("left");
    expect(laneOf(1.3)).toBe("middle");
    expect(laneOf(1.5)).toBe("right");
  });

  test("the same lane is the opposite wing for a left-handed opponent", () => {
    const right = approachOf(PASSED_DTL, true, LOBS, "right");
    const left = approachOf(PASSED_DTL, true, LOBS, "left");
    expect(right?.lane).toBe(left?.lane);
    // A right-hander facing the hitter has their forehand on the hitter's left.
    expect(right?.wing).toBe("forehand");
    expect(left?.wing).toBe("backhand");
    expect(right?.handAssumed).toBe(false);
    expect(left?.handAssumed).toBe(false);

    expect(wingOf("right", "right")).toBe("backhand");
    expect(wingOf("right", "left")).toBe("forehand");
    expect(wingOf("middle", "left")).toBe("middle");
  });

  test("an unknown hand reads as right-handed, flagged handAssumed", () => {
    for (const point of [PASSED_DTL, LOBBED, DRAWN_IN]) {
      const unknown = approachOf(point, true, LOBS, null);
      const right = approachOf(point, true, LOBS, "right");
      expect(unknown?.wing).toBe(right?.wing);
      expect(unknown?.handAssumed).toBe(true);
    }
  });

  test("no lane or wing when the approach shot never crossed the net", () => {
    expect(
      approachLateralM({ contactY: 3, landingX: 1, landingY: 8, result: "In" }),
    ).toBeNull();
    expect(
      approachLateralM({
        contactY: 3,
        landingX: 1,
        landingY: 20,
        result: "Net",
      }),
    ).toBeNull();
    expect(
      approachLateralM({
        contactY: 3,
        landingX: null,
        landingY: 20,
        result: "In",
      }),
    ).toBeNull();
    const noLanding = p("no-landing", {
      server: 2,
      winner: 2,
      resultType: "Forehand Winner",
      shots: [
        s(1, false, "First Serve", { cy: 23.5, ly: 7 }),
        s(2, true, "Forehand", { cy: 0.5, ly: 20 }),
        s(3, false, "Backhand", { cy: 22, ly: 2 }),
        s(4, true, "Forehand", { cy: 3, lx: null, ly: null }),
        s(5, false, "Backhand", { cy: 22, ly: 6 }),
        s(6, true, "Backhand Volley", { cy: 9, ly: 20 }),
        s(7, false, "Forehand", { cy: 21, ly: 3 }),
      ],
    });
    const a = approachOf(noLanding, true, LOBS, null);
    expect(a).not.toBeNull();
    expect(a?.lane).toBeNull();
    expect(a?.wing).toBeNull();
  });
});

test.describe("direction", () => {
  test("a serve-and-volley approach has no direction", () => {
    const a = approachOf(SERVE_VOLLEY, true, LOBS, null);
    expect(a?.entry).toBe("serve-volley");
    expect(a?.shot.shotType).toBe("First Serve");
    expect(a?.direction).toBeNull();
  });

  test("a rally approach takes its shot's zone", () => {
    expect(approachOf(PASSED_DTL, true, LOBS, null)?.direction).toBe(
      "Down the Line",
    );
    expect(approachOf(LOBBED, true, LOBS, null)?.direction).toBe("Crosscourt");
    expect(approachOf(DRAWN_IN, true, LOBS, null)?.direction).toBe("Middle");
  });
});

test.describe("how it ended", () => {
  test("the five buckets with lob keys", () => {
    const passedDtl = approachOf(PASSED_DTL, true, LOBS, null);
    expect(passedDtl?.bucket).toBe("passed-dtl");
    expect(passedDtl?.reply?.zone).toBe("Down the Line");

    const passedCc = approachOf(PASSED_CC, true, LOBS, null);
    expect(passedCc?.bucket).toBe("passed-crosscourt");
    expect(passedCc?.reply?.isPlayer1).toBe(false);

    const lobbed = approachOf(LOBBED, true, LOBS, null);
    expect(lobbed?.ending).toBe("lobbed");
    expect(lobbed?.bucket).toBe("lobbed");
    expect(lobbed?.reply?.videoTime).toBe(LOB_T);

    // Won at the net: the side's winner and the opponent's error together.
    const winner = approachOf(SERVE_VOLLEY, true, LOBS, null);
    const oppError = approachOf(OPP_ERROR, true, LOBS, null);
    expect(winner?.ending).toBe("winner");
    expect(oppError?.ending).toBe("opponent-error");
    expect(winner?.bucket).toBe("won-at-net");
    expect(oppError?.bucket).toBe("won-at-net");
    expect(winner?.reply).toBeNull();
    expect(oppError?.reply).toBeNull();

    const ownError = approachOf(DRAWN_IN, true, LOBS, null);
    expect(ownError?.bucket).toBe("own-error");
    expect(ownError?.reply).toBeNull();
  });

  test("with lobKeys null nothing is lobbed and passes read passed or lobbed", () => {
    const buckets = MATCH.flatMap((point) =>
      [true, false].map((seat) => approachOf(point, seat, null, null)?.bucket),
    ).filter((b) => b !== undefined);
    expect(buckets).not.toContain("lobbed");
    expect(buckets).not.toContain("passed-dtl");
    expect(buckets).not.toContain("passed-crosscourt");

    expect(approachOf(PASSED_DTL, true, null, null)?.bucket).toBe(
      "passed-or-lobbed-dtl",
    );
    expect(approachOf(PASSED_CC, true, null, null)?.bucket).toBe(
      "passed-or-lobbed-crosscourt",
    );
    // The lob, unknown as one, is a crosscourt pass.
    const lob = approachOf(LOBBED, true, null, null);
    expect(lob?.ending).toBe("passed");
    expect(lob?.bucket).toBe("passed-or-lobbed-crosscourt");
    // Wins and own errors are unchanged.
    expect(approachOf(SERVE_VOLLEY, true, null, null)?.bucket).toBe(
      "won-at-net",
    );
    expect(approachOf(DRAWN_IN, true, null, null)?.bucket).toBe("own-error");
  });

  test("a pass with no down-the-line zone counts as crosscourt", () => {
    expect(
      approachOf(passedBy("mid", "Middle"), true, LOBS, null)?.bucket,
    ).toBe("passed-crosscourt");
    expect(approachOf(passedBy("none", null), true, LOBS, null)?.bucket).toBe(
      "passed-crosscourt",
    );
  });
});
