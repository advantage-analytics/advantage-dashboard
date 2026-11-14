import { expect, test } from "@playwright/test";

import type { MatchPoint, MatchShot } from "@/lib/data/match-points-server";
import type { BallPathsFile } from "@/lib/services/splitstep/derivation/ball-paths";

import {
  NO_LOB_DATA_NOTE,
  NO_PASS_DATA_NOTE,
  POINT_ROWS,
  sideCut,
  withLobAvailability,
  tallySide,
  withPointRows,
} from "@/components/dashboard/matches/match-detail/head-to-head-card";
import { applyFilmCut } from "@/components/dashboard/matches/match-detail/film-cut-context";
import type { MatchFilterContext } from "@/components/dashboard/matches/match-detail/match-filters/model";
import {
  DRAWN_IN_DEPTH_M,
  DRAWN_IN_RUN_IN_M,
  DROP_SHOT_FROM_M,
  hitADropShot,
  isDropShot,
  hasLobKey,
  isLobShot,
  LOB_APEX_M,
  lobKeyOf,
  lobShotKeys,
  netEndingOf,
  netEntryOf,
  netGameTally,
} from "@/components/dashboard/matches/match-detail/match-filters/net-game";
import {
  cameInByLine,
  netEndingsFor,
  PASSED_OR_LOBBED,
} from "@/components/dashboard/matches/match-detail/net-game-card";

/**
 * The net game classifiers (`match-filters/net-game.ts`) and the three
 * head-to-head Points rows counted with them. Pure and offline.
 *
 * Player 1 is "you" and plays the low end (y < the net); player 2 the high
 * end. Court frame: y 0 → 23.77, the net at 11.885.
 */

const NET = 11.885;

let shotId = 0;
function s(
  shotNumber: number,
  isPlayer1: boolean,
  shotType: string,
  o: {
    cy?: number | null;
    ly?: number | null;
    t?: number | null;
    result?: string;
    spin?: string | null;
  } = {},
): MatchShot {
  shotId += 1;
  return {
    id: `s${shotId}`,
    shotNumber,
    isPlayer1,
    shotType,
    spinType: o.spin ?? null,
    speedMph: null,
    zone: null,
    result: o.result ?? "In",
    videoTime: o.t === undefined ? shotNumber * 1.3 : o.t,
    bounceVideoTime: null,
    contactX: 0,
    contactY: o.cy === undefined ? null : o.cy,
    landingX: 0,
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

/** The lob in `lobbed`, and the lob player 1 hits in `youLob`. */
const LOB_T = 30;
const YOU_LOB_T = 40;
const LOBS: ReadonlySet<number> = new Set([LOB_T, YOU_LOB_T]);

// You serve and volley, and win it on the volley.
const SERVE_VOLLEY = p("serve-volley", {
  server: 1,
  winner: 1,
  resultType: "Volley Winner",
  shots: [
    s(1, true, "First Serve", { cy: 0, ly: 17 }),
    s(2, false, "Backhand", { cy: 22, ly: 7 }),
    s(3, true, "Forehand Volley", { cy: 9 }),
  ],
});

// You approach off a deep ball and are passed.
const PASSED = p("passed", {
  server: 2,
  winner: 2,
  resultType: "Forehand Winner",
  shots: [
    s(1, false, "First Serve", { cy: 23.5, ly: 7 }),
    s(2, true, "Forehand", { cy: 0.5, ly: 20 }),
    s(3, false, "Backhand", { cy: 22, ly: 2 }),
    s(4, true, "Forehand", { cy: 3, ly: 21 }),
    s(5, false, "Backhand", { cy: 22, ly: 6 }),
    s(6, true, "Backhand Volley", { cy: 9, ly: 20 }),
    s(7, false, "Forehand", { cy: 21, ly: 3 }),
  ],
});

// A short ball drags you in: you run onto it near its bounce, then net the
// volley.
const DRAWN_IN = p("drawn-in", {
  server: 2,
  winner: 2,
  resultType: "Volley Unforced Error",
  shots: [
    s(1, false, "First Serve", { cy: 23.5, ly: 7 }),
    s(2, true, "Forehand", { cy: 0.5, ly: 20 }),
    s(3, false, "Backhand", { cy: 22, ly: NET - 2 }),
    s(4, true, "Forehand", { cy: 8.5, ly: 20 }),
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
    s(4, true, "Forehand", { cy: 2, ly: 21 }),
    s(5, false, "Backhand", { cy: 22, ly: 5 }),
    s(6, true, "Backhand Volley", { cy: 9, ly: 20 }),
    s(7, false, "Forehand", { cy: 21, ly: 1, t: LOB_T }),
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

// Nobody comes in; you hit a lob and lose the point.
const YOU_LOB = p("you-lob", {
  server: 2,
  winner: 2,
  resultType: "Forehand Winner",
  shots: [
    s(1, false, "First Serve", { cy: 23.5, ly: 7 }),
    s(2, true, "Forehand", { cy: 0.5, ly: 20 }),
    s(3, false, "Backhand", { cy: 22, ly: 3 }),
    s(4, true, "Backhand", { cy: 1, ly: 22, t: YOU_LOB_T }),
    s(5, false, "Forehand", { cy: 22.5, ly: 2 }),
  ],
});

const MATCH = [SERVE_VOLLEY, PASSED, DRAWN_IN, LOBBED, OPP_ERROR, YOU_LOB];

const CTX: MatchFilterContext = {
  youIsPlayer1: true,
  hands: { player1: null, player2: null },
  isDerived: true,
};
const LOB_CTX: MatchFilterContext = { ...CTX, lobKeys: LOBS };

test.describe("netEntryOf", () => {
  test("the three entries", () => {
    expect(netEntryOf(SERVE_VOLLEY, true)).toBe("serve-volley");
    expect(netEntryOf(PASSED, true)).toBe("approach");
    expect(netEntryOf(DRAWN_IN, true)).toBe("drawn-in");
    expect(netEntryOf(OPP_ERROR, true)).toBe("approach");
  });

  test("serve and volley needs the server's next shot to be a volley", () => {
    const plusOne = (type: string, returnLy: number) =>
      netEntryOf(
        p("x", {
          server: 1,
          winner: 1,
          resultType: "Forehand Winner",
          shots: [
            s(1, true, "First Serve", { cy: 0, ly: 17 }),
            s(2, false, "Backhand", { cy: 22, ly: returnLy }),
            s(3, true, type, { cy: 9 }),
          ],
        }),
        true,
      );
    expect(plusOne("Backhand Volley", 2)).toBe("serve-volley");
    // A groundstroke from inside the service line, or an overhead: the server
    // came in, but not by serving and volleying.
    expect(plusOne("Forehand", 2)).toBe("approach");
    expect(plusOne("Overhead", 2)).toBe("approach");
    // ...and off a short return it was drawn in.
    expect(plusOne("Forehand", 10)).toBe("drawn-in");
  });

  test("null when the side never came in", () => {
    expect(netEntryOf(YOU_LOB, true)).toBeNull();
    expect(netEntryOf(SERVE_VOLLEY, false)).toBeNull();
  });

  /**
   * The side at the low end strikes its first net shot, a forehand, from
   * `cy` off the opponent's ball bouncing at `ly`, then volleys.
   */
  const ranOnto = (ly: number | null, cy: number | null, type = "Forehand") =>
    netEntryOf(
      p("x", {
        server: 2,
        winner: 1,
        resultType: "Volley Winner",
        shots: [
          s(1, false, "First Serve", { cy: 23.5, ly: 7 }),
          s(2, true, "Forehand", { cy: 0.5, ly: 20 }),
          s(3, false, "Backhand", { cy: 22, ly }),
          s(4, true, type, { cy, ly: 20 }),
          s(5, false, "Backhand", { cy: 22, ly: 7 }),
          s(6, true, "Volley", { cy: 10 }),
        ],
      }),
      true,
    );

  test("drawn in is the depth threshold", () => {
    expect(ranOnto(NET - DRAWN_IN_DEPTH_M + 0.01, 8)).toBe("drawn-in");
    expect(ranOnto(NET - DRAWN_IN_DEPTH_M - 0.01, 8)).toBe("approach");
    // No bounce or no contact recorded: an approach.
    expect(ranOnto(null, 8)).toBe("approach");
    expect(ranOnto(NET - 1, null)).toBe("approach");
  });

  test("drawn in is met near the bounce; a short ball that carried on is an approach", () => {
    const bounce = NET - 1.4;
    expect(ranOnto(bounce, bounce - DRAWN_IN_RUN_IN_M + 0.01)).toBe("drawn-in");
    // Stoiber v Perelman, 83: bounced 1.4 m from the net, met 6.3 m from it.
    expect(ranOnto(bounce, NET - 6.3)).toBe("approach");
    expect(ranOnto(bounce, bounce - DRAWN_IN_RUN_IN_M - 0.01)).toBe("approach");
  });

  test("a bounce on the hitter's own side of the net is never drawn in", () => {
    // Stoiber v Perelman, 60: the bounce is recorded 0.6 m past the net, on
    // the opponent's own half — the ball cannot have been played from there.
    expect(ranOnto(NET + 0.6, NET - 3)).toBe("approach");
  });

  test("a volley or overhead off a short ball is not drawn in: it never bounced", () => {
    expect(ranOnto(NET - 1, NET - 2, "Forehand Volley")).toBe("approach");
    expect(ranOnto(NET - 1, NET - 2, "Overhead")).toBe("approach");
  });

  test("an approach shot hit off a short ball is an approach", () => {
    // Stoiber v Perelman, 73: a ball bouncing 2.6 m from the net, taken from
    // 9.8 m as the approach, then a volley.
    const point = p("x", {
      server: 2,
      winner: 1,
      resultType: "Volley Winner",
      shots: [
        s(1, false, "First Serve", { cy: 23.5, ly: 7 }),
        s(2, true, "Forehand", { cy: 0.5, ly: 20 }),
        s(3, false, "Backhand", { cy: 22, ly: NET - 2.6 }),
        s(4, true, "Forehand", { cy: NET - 9.8, ly: 20 }),
        s(5, false, "Backhand", { cy: 22, ly: 7 }),
        s(6, true, "Volley", { cy: NET - 2.1 }),
      ],
    });
    expect(netEntryOf(point, true)).toBe("approach");
  });

  test("a groundstroke run onto off a drop shot is drawn in, whatever came before", () => {
    const point = p("x", {
      server: 2,
      winner: 2,
      resultType: "Forehand Winner",
      shots: [
        s(1, false, "First Serve", { cy: 23.5, ly: 7 }),
        s(2, true, "Forehand", { cy: 0.5, ly: 20 }),
        // A deep ball the side answers from the baseline…
        s(3, false, "Backhand", { cy: 22, ly: 2 }),
        s(4, true, "Forehand", { cy: 1, ly: 21 }),
        // …then a drop shot they run onto and strike inside the service line.
        s(5, false, "Backhand", { cy: 22, ly: NET - 1.5 }),
        s(6, true, "Forehand", { cy: 8, ly: 20 }),
        s(7, false, "Forehand", { cy: 21, ly: 3 }),
      ],
    });
    expect(netEntryOf(point, true)).toBe("drawn-in");
  });

  test("a returner who volleys their first shot after the return is not serve and volley", () => {
    const point = p("x", {
      server: 2,
      winner: 1,
      resultType: "Volley Winner",
      shots: [
        s(1, false, "First Serve", { cy: 23.5, ly: 7 }),
        s(2, true, "Forehand", { cy: 0.5, ly: 20 }),
        s(3, false, "Backhand", { cy: 22, ly: 4 }),
        s(4, true, "Volley", { cy: 9 }),
      ],
    });
    expect(netEntryOf(point, true)).toBe("approach");
  });
});

test.describe("netEndingOf", () => {
  test("the five endings, with lob keys", () => {
    expect(netEndingOf(SERVE_VOLLEY, true, LOBS)).toBe("winner");
    expect(netEndingOf(OPP_ERROR, true, LOBS)).toBe("opponent-error");
    expect(netEndingOf(DRAWN_IN, true, LOBS)).toBe("own-error");
    expect(netEndingOf(PASSED, true, LOBS)).toBe("passed");
    expect(netEndingOf(LOBBED, true, LOBS)).toBe("lobbed");
  });

  test("without lob keys a lob is a pass", () => {
    expect(netEndingOf(LOBBED, true, null)).toBe("passed");
    expect(netEndingOf(LOBBED, true, new Set())).toBe("passed");
  });

  test("null when the side never came in", () => {
    expect(netEndingOf(YOU_LOB, true, LOBS)).toBeNull();
    expect(netEndingOf(PASSED, false, LOBS)).toBeNull();
  });
});

test.describe("lobs", () => {
  const stroke = (
    contactTime: number,
    bounceTime: number | null,
    heights: [t: number, z: number][],
  ) => ({
    contactTime,
    bounceTime,
    path: heights.map(
      ([t, z]) => [t, 0, 0, z] as [number, number, number, number],
    ),
  });

  test("lobShotKeys keeps strokes whose pre-bounce apex reaches the threshold", () => {
    const file: BallPathsFile = {
      version: 1,
      strokes: [
        stroke(1, 2, [
          [1, 1],
          [1.5, LOB_APEX_M],
          [2, 0],
        ]),
        stroke(3, 4, [
          [3, 1],
          [3.5, LOB_APEX_M - 0.01],
          [4, 0],
        ]),
        // Its height only after the bounce: not a lob.
        stroke(5, 5.5, [
          [5, 1],
          [5.5, 0],
          [6, LOB_APEX_M + 1],
        ]),
        // No bounce seen: every sample counts.
        stroke(7, null, [
          [7, 1],
          [7.5, LOB_APEX_M + 0.2],
        ]),
      ],
    };
    expect([...lobShotKeys(file)].sort()).toEqual([1, 7]);
  });

  test("isLobShot is a groundstroke whose contact is a lob key", () => {
    expect(isLobShot({ shotType: "Forehand", videoTime: LOB_T }, LOBS)).toBe(
      true,
    );
    expect(isLobShot({ shotType: "Volley", videoTime: LOB_T }, LOBS)).toBe(
      false,
    );
    expect(isLobShot({ shotType: "Overhead", videoTime: LOB_T }, LOBS)).toBe(
      false,
    );
    expect(isLobShot({ shotType: "First Serve", videoTime: LOB_T }, LOBS)).toBe(
      false,
    );
    expect(isLobShot({ shotType: "Forehand", videoTime: 31 }, LOBS)).toBe(
      false,
    );
  });
});

test.describe("lob keys after the database", () => {
  test("a contact time read back from a float4 column still finds its lob", () => {
    // shots.video_time is a float4: late in a long match a time comes back
    // off by up to ~0.25 ms, enough to move its millisecond key a step.
    let missedExact = 0;
    let missedTolerant = 0;
    for (let i = 0; i < 5000; i += 1) {
      const contact = 3600 + i * 0.7213;
      const keys = new Set([lobKeyOf(contact)]);
      const stored = Math.fround(contact);
      if (!keys.has(lobKeyOf(stored))) missedExact += 1;
      if (!hasLobKey(keys, stored)) missedTolerant += 1;
    }
    // The exact key is what failed; the tolerant lookup never does.
    expect(missedExact).toBeGreaterThan(0);
    expect(missedTolerant).toBe(0);
  });

  test("a neighbouring stroke is never mistaken for the lob", () => {
    const keys = new Set([lobKeyOf(1200.5)]);
    expect(hasLobKey(keys, 1200.5)).toBe(true);
    expect(hasLobKey(keys, 1200.8)).toBe(false);
    expect(
      isLobShot({ shotType: "Backhand", videoTime: Math.fround(1200.5) }, keys),
    ).toBe(true);
  });
});

test.describe("the Net game card's tally", () => {
  test("endings and entries, Lobbed only with lob keys", () => {
    const withLobs = netGameTally(MATCH, true, LOBS);
    expect(withLobs.total).toBe(5);
    expect(withLobs.endings).toEqual({
      winner: 1,
      "opponent-error": 1,
      "own-error": 1,
      passed: 1,
      lobbed: 1,
    });
    expect(withLobs.entries).toEqual({
      "serve-volley": 1,
      approach: 3,
      "drawn-in": 1,
    });
    expect(netGameTally(MATCH, true, null).endings).toMatchObject({
      passed: 2,
      lobbed: 0,
    });
    expect(netGameTally(MATCH, false, LOBS).total).toBe(0);
  });

  test("the came-in-by line omits zero parts", () => {
    expect(
      cameInByLine({ approach: 14, "serve-volley": 0, "drawn-in": 7 }),
    ).toBe("Came in by · Approach 14 · Drawn in 7");
  });
});

test.describe("head-to-head net rows", () => {
  const configs = POINT_ROWS.filter((c) =>
    ["Approach points won", "Passed the net player", "Lob points won"].includes(
      c.label,
    ),
  );
  const rows = (lobs: ReadonlySet<number> | null) =>
    withPointRows(
      configs,
      [],
      tallySide(MATCH, true, lobs),
      tallySide(MATCH, false, lobs),
    );
  const row = (lobs: ReadonlySet<number> | null, label: string) =>
    rows(lobs).find((r) => r.label === label)!;

  test("approach points won: you won 1 of 3", () => {
    const r = row(LOBS, "Approach points won");
    expect(r.you).toMatchObject({ display: "33%", detail: "1/3" });
    expect(r.opp.display).toBe("");
  });

  test("passing shots won: the opponent passed 1 of your 5 net points", () => {
    const r = row(LOBS, "Passed the net player");
    expect(r.opp).toMatchObject({ display: "20%", detail: "1/5" });
    // The opponent never came in, so you have nobody to pass.
    expect(r.you.display).toBe("");
    // Without lobs a lob would read as a pass, so the row is a dash.
    expect(row(null, "Passed the net player").opp.display).toBe("");
  });

  test("lob points won: a rate with lob keys, a dash without", () => {
    const r = row(LOBS, "Lob points won");
    expect(r.you).toMatchObject({ display: "0%", detail: "0/1" });
    expect(r.opp).toMatchObject({ display: "100%", detail: "1/1" });
    const none = row(null, "Lob points won");
    expect(none.you.display).toBe("");
    expect(none.opp.display).toBe("");
  });

  test("each figure's cut opens exactly the points it counts", () => {
    const ids = (cut: Parameters<typeof applyFilmCut>[2], ctx = LOB_CTX) =>
      applyFilmCut(MATCH, MATCH, cut, ctx).map((pt) => pt.id);
    const cell = (label: string, side: "you" | "opp") => {
      const c = configs.find((x) => x.label === label)!;
      return sideCut(c.cut!, side, c.sideBy, c.sideWon);
    };
    expect(ids(cell("Approach points won", "you"))).toEqual(["opp-error"]);
    expect(ids(cell("Passed the net player", "opp"))).toEqual(["passed"]);
    expect(ids(cell("Passed the net player", "opp"), CTX)).toEqual([
      "passed",
      "lobbed",
    ]);
    expect(ids(cell("Lob points won", "opp"))).toEqual(["lobbed"]);
    expect(ids(cell("Lob points won", "you"), CTX)).toEqual([]);
    // The Net game card's Lobbed segment: nothing without lob keys.
    expect(ids({ netBy: "you", netEnding: "lobbed" })).toEqual(["lobbed"]);
    expect(ids({ netBy: "you", netEnding: "lobbed" }, CTX)).toEqual([]);
    expect(ids({ netBy: "you", netEntry: "serve-volley" })).toEqual([
      "serve-volley",
    ]);
  });
});

test.describe("drop shots", () => {
  // You drop-shot from the baseline and win it outright.
  const YOU_DROP = p("you-drop", {
    server: 1,
    winner: 1,
    resultType: "Backhand Winner",
    shots: [
      s(1, true, "First Serve", { cy: 0, ly: 17 }),
      s(2, false, "Backhand", { cy: 22, ly: 3 }),
      s(3, true, "Backhand", { cy: 1, ly: NET + 1.5, spin: "backspin" }),
    ],
  });
  // The opponent drop-shots (a SwingVision "Slice"); you run it down and win.
  const OPP_DROP = p("opp-drop", {
    server: 2,
    winner: 1,
    resultType: "Forehand Winner",
    shots: [
      s(1, false, "First Serve", { cy: 23.5, ly: 7 }),
      s(2, true, "Forehand", { cy: 0.5, ly: 20 }),
      s(3, false, "Forehand", { cy: 21, ly: NET - 2, spin: "Slice" }),
      s(4, true, "Forehand", { cy: 9.5, ly: 21 }),
    ],
  });
  const DROP_MATCH = [YOU_DROP, OPP_DROP, PASSED];

  test("a backspin groundstroke from deep that lands short", () => {
    const shot = (o: Partial<MatchShot>) =>
      isDropShot({
        shotType: "Forehand",
        spinType: "backspin",
        contactY: NET - DROP_SHOT_FROM_M - 0.5,
        landingY: NET + 2,
        ...o,
      });
    expect(shot({})).toBe(true);
    expect(shot({ spinType: "Slice" })).toBe(true);
    expect(shot({ spinType: "topspin" })).toBe(false);
    expect(shot({ spinType: null })).toBe(false);
    expect(shot({ shotType: "Volley" })).toBe(false);
    // Struck from inside the box: a touch shot, not a drop shot.
    expect(shot({ contactY: NET - DROP_SHOT_FROM_M + 0.5 })).toBe(false);
    // Lands past the short-ball line.
    expect(shot({ landingY: NET + DRAWN_IN_DEPTH_M + 0.5 })).toBe(false);
    expect(shot({ landingY: null })).toBe(false);
  });

  test("hitADropShot is per side", () => {
    expect(hitADropShot(YOU_DROP, true)).toBe(true);
    expect(hitADropShot(YOU_DROP, false)).toBe(false);
    expect(hitADropShot(OPP_DROP, false)).toBe(true);
    expect(hitADropShot(PASSED, true)).toBe(false);
  });

  test("drop shot points won counts and cuts the same points", () => {
    expect(tallySide(DROP_MATCH, true).dropPoints).toEqual({
      won: 1,
      total: 1,
    });
    expect(tallySide(DROP_MATCH, false).dropPoints).toEqual({
      won: 0,
      total: 1,
    });
    const ids = (cut: Parameters<typeof applyFilmCut>[2]) =>
      applyFilmCut(DROP_MATCH, DROP_MATCH, cut, CTX).map((pt) => pt.id);
    const config = POINT_ROWS.find((c) => c.label === "Drop shot points won")!;
    expect(ids(sideCut(config.cut!, "you", config.sideBy))).toEqual([
      "you-drop",
    ]);
    expect(ids(sideCut(config.cut!, "opp", config.sideBy))).toEqual([
      "opp-drop",
    ]);
    expect(ids(config.cut!)).toEqual(["you-drop", "opp-drop"]);
  });
});

test.describe("without ball flight data", () => {
  const groups = [{ title: "Points", configs: POINT_ROWS }];
  const byLabel = (hasLobs: boolean, label: string) =>
    withLobAvailability(groups, hasLobs)[0].configs.find(
      (c) => c.label === label,
    )!;

  test("the Lob and Passed rows lose their cut and say why", () => {
    expect(byLabel(false, "Lob points won")).toMatchObject({
      cut: undefined,
      note: NO_LOB_DATA_NOTE,
    });
    expect(byLabel(false, "Passed the net player")).toMatchObject({
      cut: undefined,
      note: NO_PASS_DATA_NOTE,
    });
    // Every other row, and both rows with lobs known, pass through untouched.
    expect(byLabel(false, "Approach points won").note).toBeUndefined();
    expect(byLabel(true, "Passed the net player").cut).toEqual({
      netBy: "either",
      netEnding: "passed",
    });
  });

  test("the Net game card drops Lobbed and names Passed for what it holds", () => {
    expect(netEndingsFor(false)).not.toContain("lobbed");
    expect(netEndingsFor(true)).toContain("lobbed");
    expect(PASSED_OR_LOBBED).toBe("Passed or lobbed");
  });
});
