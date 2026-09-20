import { expect, test } from "@playwright/test";
import type { MatchPoint } from "@/lib/data/match-points-server";
import {
  EMPTY_VIZ_FILTERS,
  computeViz,
  computeVizStats,
  filterKeysFor,
  subjectFor,
  type Cut,
} from "@/components/dashboard/matches/match-detail/shots/viz-model";

/** Pure and offline — same model as tests/report-view.spec.ts. */
function point(over: Partial<MatchPoint>): MatchPoint {
  return {
    id: crypto.randomUUID(),
    pointNumber: 1,
    setNumber: 1,
    gameNumber: 1,
    setScore: "0-0",
    gameScore: "0-0",
    pointScore: "0-0",
    resultType: "Winner",
    eventType: "Rally",
    description: "Test point",
    player: "player1",
    wonByPlayer1: true,
    serverIsPlayer1: true,
    isBreakPoint: false,
    isSetPoint: false,
    isMatchPoint: false,
    rallyLength: 3,
    duration: 5000,
    videoTime: 10000,
    saved: true,
    firstShotType: "First Serve",
    firstShotResult: "In",
    firstShotLandingX: -1.0,
    firstShotLandingY: 8.0,
    ...over,
  } as MatchPoint;
}

test.describe("computeViz — serve cut", () => {
  const pts = [
    point({ serverIsPlayer1: true, wonByPlayer1: true }),
    point({ serverIsPlayer1: true, wonByPlayer1: false }),
    point({ serverIsPlayer1: false, wonByPlayer1: false }),
  ];

  test("subject = player 1 draws only player 1's serves", () => {
    const r = computeViz(pts, "serve", EMPTY_VIZ_FILTERS, true);
    expect(r.total).toBe(2);
    expect(r.dots.map((d) => d.outcome).sort()).toEqual(["lost", "won"]);
    expect(r.noun).toBe("serves");
    expect(r.zoneStats).not.toBeNull();
  });

  test("subject = player 2: won means player 2 won", () => {
    const r = computeViz(pts, "serve", EMPTY_VIZ_FILTERS, false);
    expect(r.total).toBe(1);
    expect(r.dots[0].outcome).toBe("won"); // p2 served, p1 lost it
  });

  test("result filter is subject-relative", () => {
    const r = computeViz(
      pts,
      "serve",
      { ...EMPTY_VIZ_FILTERS, result: "won" },
      true,
    );
    expect(r.count).toBe(1);
    expect(r.total).toBe(2);
  });
});

test.describe("computeViz — return cuts", () => {
  const ret = point({
    serverIsPlayer1: false,
    wonByPlayer1: true,
    secondShotLandingX: 1.2,
    secondShotLandingY: 4.0,
    secondShotContactX: 0.5,
    secondShotContactY: 23.0,
    secondShotType: "Forehand",
  });

  test("placement keeps landing dots, contact keeps contact dots", () => {
    const place = computeViz([ret], "returnPlacement", EMPTY_VIZ_FILTERS, true);
    const contact = computeViz([ret], "returnContact", EMPTY_VIZ_FILTERS, true);
    expect(place.dots).toHaveLength(1);
    expect(contact.dots).toHaveLength(1);
    // Placement's depthM is distance-from-net (landing); contact's is
    // signed distance from the returner's own baseline — different
    // quantities for the same point, so they should differ.
    expect(place.dots[0].depthM).not.toBe(contact.dots[0].depthM);
    expect(place.zoneStats).toBeNull();
    expect(place.noun).toBe("returns");
  });

  test("return dots carry metres, not the legacy pixel frame", () => {
    const place = computeViz([ret], "returnPlacement", EMPTY_VIZ_FILTERS, true);
    // secondShotLandingX: 1.2, secondShotLandingY: 4.0 — well within the net
    // (REAL_NET_Y=11.885), so no end-change flip: lateralM is the mirrored
    // (leading-minus) landing x, depthM is the landing y unchanged.
    expect(place.dots[0].lateralM).toBeCloseTo(-1.2, 5);
    expect(place.dots[0].depthM).toBeCloseTo(4.0, 5);
  });

  test("a return without contact coords counts for placement only", () => {
    const noContact = {
      ...ret,
      secondShotContactX: null,
      secondShotContactY: null,
    } as MatchPoint;
    expect(
      computeViz([noContact], "returnPlacement", EMPTY_VIZ_FILTERS, true).total,
    ).toBe(1);
    expect(
      computeViz([noContact], "returnContact", EMPTY_VIZ_FILTERS, true).total,
    ).toBe(0);
  });
});

test("filterKeysFor: zone exists on serve only", () => {
  expect(filterKeysFor("serve")).toContain("zone");
  expect(filterKeysFor("returnPlacement")).not.toContain("zone");
});

test("subjectFor flips for the opponent and for a player-2 viewer", () => {
  expect(subjectFor({ ...EMPTY_VIZ_FILTERS, player: "you" }, true)).toBe(true);
  expect(subjectFor({ ...EMPTY_VIZ_FILTERS, player: "opponent" }, true)).toBe(
    false,
  );
  expect(subjectFor({ ...EMPTY_VIZ_FILTERS, player: "you" }, false)).toBe(
    false,
  );
});

/* ── computeVizStats (Task F3) ────────────────────────────────────────── */

// Real-world landing x values that land cleanly in the middle of each of
// the six serve zones (see viz-model.ts's ZONE_LINES_X derivation) — chosen
// so none sits near a zone boundary.
const ZONE_LX = {
  "deuce-wide": -3.4,
  "deuce-body": -2.0,
  "deuce-t": -0.7,
  "ad-t": 0.7,
  "ad-body": 2.0,
  "ad-wide": 3.4,
} as const;

// Same real-world constants the module's doc comments cite (REAL_NET_Y,
// the singles half-width, and 5ft in metres) — duplicated here rather than
// imported since the module keeps them private.
const NET_TO_BASELINE_M = 11.885;
const DEPTH_THIRD_M = NET_TO_BASELINE_M / 3;
const FIVE_FEET_M = 1.524;

test.describe("computeVizStats — serve", () => {
  test("rows sort by win rate, highest first; a zero-count row sorts last with winPct null", () => {
    const pts = [
      point({ firstShotLandingX: ZONE_LX["deuce-wide"], wonByPlayer1: true }), // 100%
      point({
        firstShotLandingX: ZONE_LX["deuce-body"],
        wonByPlayer1: true,
      }),
      point({
        firstShotLandingX: ZONE_LX["deuce-body"],
        wonByPlayer1: false,
      }), // 50%
      point({
        firstShotLandingX: ZONE_LX["deuce-t"],
        wonByPlayer1: false,
      }), // 0%
      point({
        firstShotLandingX: ZONE_LX["ad-t"],
        wonByPlayer1: false,
      }), // 0%
      point({
        firstShotLandingX: ZONE_LX["ad-body"],
        wonByPlayer1: true,
      }), // 100%
      // ad-wide gets no points at all.
    ];
    const stats = computeVizStats(pts, "serve", EMPTY_VIZ_FILTERS, true);
    expect(stats.groups).toHaveLength(1);
    const rows = stats.groups[0].rows;
    expect(rows).toHaveLength(6);

    const last = rows[rows.length - 1];
    expect(last.key).toBe("ad-wide");
    expect(last.count).toBe(0);
    expect(last.winPct).toBeNull();

    for (let i = 0; i < rows.length - 2; i++) {
      const a = rows[i];
      const b = rows[i + 1];
      expect(a.winPct).not.toBeNull();
      expect(b.winPct).not.toBeNull();
      expect((a.winPct as number) >= (b.winPct as number)).toBe(true);
    }

    expect(stats.title).toBe("Where the serve went");
    expect(stats.subtitle).toBe(`Points won by zone · ${pts.length} serves`);
  });

  test("noun follows the ball filter", () => {
    const pts = [point({ firstShotType: "Second Serve" })];
    const stats = computeVizStats(
      pts,
      "serve",
      { ...EMPTY_VIZ_FILTERS, ball: "second" },
      true,
    );
    expect(stats.subtitle).toContain("second serves");
  });
});

test.describe("computeVizStats — return placement", () => {
  function returnPoint(over: Partial<MatchPoint>): MatchPoint {
    return point({
      serverIsPlayer1: false,
      wonByPlayer1: true,
      secondShotLandingX: 2.5,
      secondShotLandingY: 4.0,
      secondShotType: "Forehand",
      ...over,
    });
  }

  test("direction flips between deuce-side and ad-side serves for the same landing x", () => {
    const deuceSide = returnPoint({ pointScore: "0-0" }); // deuce
    const adSide = returnPoint({ pointScore: "15-0" }); // ad

    const deuceStats = computeVizStats(
      [deuceSide],
      "returnPlacement",
      EMPTY_VIZ_FILTERS,
      true,
    );
    const adStats = computeVizStats(
      [adSide],
      "returnPlacement",
      EMPTY_VIZ_FILTERS,
      true,
    );

    const directionRow = (
      stats: ReturnType<typeof computeVizStats>,
      key: string,
    ) =>
      stats.groups
        .find((g) => g.key === "direction")!
        .rows.find((r) => r.key === key)!;

    // Landing at lateralM = -2.5 (outer third, the "ad" landing half):
    // a deuce-side serve puts it on the OPPOSITE side → crosscourt; an
    // ad-side serve puts it on the SAME side → down the line.
    expect(directionRow(deuceStats, "crosscourt").count).toBe(1);
    expect(directionRow(deuceStats, "dtl").count).toBe(0);
    expect(directionRow(adStats, "dtl").count).toBe(1);
    expect(directionRow(adStats, "crosscourt").count).toBe(0);
  });

  test("depth thirds: short / mid / deep boundaries", () => {
    const pts = [
      returnPoint({ secondShotLandingX: 0, secondShotLandingY: 0 }), // short
      returnPoint({ secondShotLandingX: 0, secondShotLandingY: DEPTH_THIRD_M }), // mid (boundary, inclusive)
      returnPoint({
        secondShotLandingX: 0,
        secondShotLandingY: 2 * DEPTH_THIRD_M,
      }), // deep (boundary, inclusive)
      returnPoint({
        secondShotLandingX: 0,
        secondShotLandingY: NET_TO_BASELINE_M,
      }), // deep
    ];
    const stats = computeVizStats(
      pts,
      "returnPlacement",
      EMPTY_VIZ_FILTERS,
      true,
    );
    const depth = stats.groups.find((g) => g.key === "depth")!;
    const row = (key: string) => depth.rows.find((r) => r.key === key)!;
    expect(row("short").count).toBe(1);
    expect(row("mid").count).toBe(1);
    expect(row("deep").count).toBe(2);
  });

  test("out/net landings are excluded from rows but the subtitle count says so", () => {
    const inCourt = returnPoint({});
    const outWide = returnPoint({
      secondShotLandingX: 5.5, // outside the 4.115m singles half-width
      secondShotResult: "Out",
    });
    const stats = computeVizStats(
      [inCourt, outWide],
      "returnPlacement",
      EMPTY_VIZ_FILTERS,
      true,
    );
    // total always equals computeViz(...).count (both points are drawable
    // returns), even though only one lands inside the rows' denominator.
    expect(stats.total).toBe(2);
    expect(stats.subtitle).toBe("Points won by placement · 1 returns");
  });
});

test.describe("computeVizStats — return contact", () => {
  function contactPoint(over: Partial<MatchPoint>): MatchPoint {
    return point({
      serverIsPlayer1: false,
      wonByPlayer1: true,
      secondShotLandingX: 0,
      secondShotLandingY: 4.0,
      secondShotContactX: 0,
      secondShotType: "Forehand",
      ...over,
    });
  }

  test("contact depth bands at -0.5m / 0m / 1.0m / 1.524m / 3m", () => {
    const REAL_COURT_LENGTH = 23.77;
    const atDepth = (depthM: number) =>
      contactPoint({ secondShotContactY: REAL_COURT_LENGTH + depthM });
    const pts = [
      atDepth(-0.5), // inside the baseline
      atDepth(0), // 0-5ft behind (on the line)
      atDepth(1.0), // 0-5ft behind
      atDepth(FIVE_FEET_M), // 5ft+ behind (boundary, inclusive)
      atDepth(3.0), // 5ft+ behind
    ];
    const stats = computeVizStats(
      pts,
      "returnContact",
      EMPTY_VIZ_FILTERS,
      true,
    );
    const depth = stats.groups.find((g) => g.key === "depth")!;
    const row = (key: string) => depth.rows.find((r) => r.key === key)!;
    expect(row("inside").count).toBe(1);
    expect(row("near").count).toBe(2);
    expect(row("far").count).toBe(2);
  });

  test("stroke rows split forehand and backhand the same way the triangle mark does", () => {
    const pts = [
      contactPoint({ secondShotContactY: 30, secondShotType: "Forehand" }),
      contactPoint({
        secondShotContactY: 30,
        secondShotType: "Backhand Slice",
      }),
      contactPoint({ secondShotContactY: 30, secondShotType: "BH Volley" }),
    ];
    const stats = computeVizStats(
      pts,
      "returnContact",
      EMPTY_VIZ_FILTERS,
      true,
    );
    const stroke = stats.groups.find((g) => g.key === "stroke")!;
    expect(stroke.rows.find((r) => r.key === "forehand")!.count).toBe(1);
    expect(stroke.rows.find((r) => r.key === "backhand")!.count).toBe(2);
  });
});

test.describe("computeVizStats — attribution", () => {
  test("a player-2 viewer and an opponent subject get their own rows: won means THEY won", () => {
    const pts = [
      point({
        serverIsPlayer1: false,
        wonByPlayer1: false, // player 2 (the server) won
        firstShotLandingX: ZONE_LX["deuce-wide"],
      }),
    ];
    const asSubject = computeVizStats(pts, "serve", EMPTY_VIZ_FILTERS, false);
    const row = asSubject.groups[0].rows.find((r) => r.key === "deuce-wide")!;
    expect(row.count).toBe(1);
    expect(row.won).toBe(1);
    expect(row.winPct).toBe(100);

    // The same point, read as if player 1 were the subject: player 1 lost,
    // so the identical point now reads as a loss for the row.
    const asOpponent = computeVizStats(pts, "serve", EMPTY_VIZ_FILTERS, true);
    const oppRow = asOpponent.groups[0].rows.find(
      (r) => r.key === "deuce-wide",
    )!;
    expect(oppRow.count).toBe(0); // player 1 never served
  });
});

test.describe("computeVizStats — total", () => {
  test("total always equals computeViz(...).count, for every cut", () => {
    const pts = [
      point({ firstShotLandingX: ZONE_LX["deuce-t"], wonByPlayer1: true }),
      point({ firstShotLandingX: ZONE_LX["ad-body"], wonByPlayer1: false }),
      point({
        serverIsPlayer1: false,
        wonByPlayer1: true,
        secondShotLandingX: 1.0,
        secondShotLandingY: 3.0,
        secondShotContactX: 0.5,
        secondShotContactY: 25.0,
        secondShotType: "Forehand",
      }),
    ];
    const cuts: Cut[] = ["serve", "returnPlacement", "returnContact"];
    for (const cut of cuts) {
      const stats = computeVizStats(pts, cut, EMPTY_VIZ_FILTERS, true);
      const viz = computeViz(pts, cut, EMPTY_VIZ_FILTERS, true);
      expect(stats.total).toBe(viz.count);
    }
  });
});

test.describe("computeVizStats — sentence", () => {
  test("every number in the sentence comes from an actual row", () => {
    const pts = [
      point({
        firstShotLandingX: ZONE_LX["deuce-wide"],
        wonByPlayer1: true,
      }),
      point({
        firstShotLandingX: ZONE_LX["deuce-wide"],
        wonByPlayer1: true,
      }),
      point({
        firstShotLandingX: ZONE_LX["deuce-wide"],
        wonByPlayer1: true,
      }),
      point({ firstShotLandingX: ZONE_LX["ad-t"], wonByPlayer1: false }),
      point({ firstShotLandingX: ZONE_LX["ad-body"], wonByPlayer1: false }),
    ];
    const stats = computeVizStats(pts, "serve", EMPTY_VIZ_FILTERS, true);
    expect(stats.sentence).not.toBeNull();
    const rows = stats.groups[0].rows;
    const deuceWide = rows.find((r) => r.key === "deuce-wide")!;
    expect(deuceWide.winPct).toBe(100);
    expect(deuceWide.count).toBe(3);
    expect(stats.sentence).toContain(`${deuceWide.winPct}%`);
    expect(stats.sentence).toContain(`${deuceWide.count} serves`);
    const otherPcts = rows
      .filter((r) => r.key !== "deuce-wide")
      .map((r) => r.winPct)
      .filter((p): p is number => p !== null);
    const nextBest = Math.max(...otherPcts);
    expect(stats.sentence).toContain(`${nextBest}%.`);
  });

  test("no qualifying row (every row under 3 points) → sentence is null", () => {
    const pts = [
      point({ firstShotLandingX: ZONE_LX["deuce-wide"], wonByPlayer1: true }),
      point({ firstShotLandingX: ZONE_LX["ad-t"], wonByPlayer1: true }),
    ];
    const stats = computeVizStats(pts, "serve", EMPTY_VIZ_FILTERS, true);
    expect(stats.sentence).toBeNull();
  });
});

test.describe("computeVizStats — empty input", () => {
  test("empty points → every row is count 0 / winPct null, sentence is null, total is 0", () => {
    const cuts: Cut[] = ["serve", "returnPlacement", "returnContact"];
    for (const cut of cuts) {
      const stats = computeVizStats([], cut, EMPTY_VIZ_FILTERS, true);
      expect(stats.total).toBe(0);
      expect(stats.sentence).toBeNull();
      for (const group of stats.groups) {
        for (const row of group.rows) {
          expect(row.count).toBe(0);
          expect(row.winPct).toBeNull();
        }
      }
    }
  });
});
