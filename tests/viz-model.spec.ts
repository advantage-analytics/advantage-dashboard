import { expect, test } from "@playwright/test";
import type { MatchPoint, MatchShot } from "@/lib/data/match-points-server";
import {
  EMPTY_VIZ_FILTERS,
  chartAllowedOn,
  computeViz,
  computeVizStats,
  filterKeysFor,
  servePlacementMetrics,
  statRowAnnouncement,
  statsAreEmpty,
  subjectFor,
  type Cut,
} from "@/components/dashboard/matches/match-detail/shots/viz-model";
import {
  heatBoundsFor,
  projectServeMetricDot,
} from "@/components/dashboard/matches/match-detail/shots/court-geometry";
import { DEFAULT_BANDS, type BandSettings } from "@/lib/data/viz-bands";

// Same real-world constant `viz-model.ts` keeps privately under this name.
const NET_Y = 11.885;

/** Pure and offline — same model as tests/report-view.spec.ts. */
function point(over: Partial<MatchPoint>): MatchPoint {
  const merged = {
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

  // Task 2's serve cut resolves the serve shot BY ROLE from `shots` (never
  // `p.firstShotLandingX/Y` alone) to read its own `contactY` for end
  // detection. Synthesize a default `shots` row so every existing fixture
  // that only sets the flattened `firstShot*` fields keeps working, with
  // `contactY` placed on the OPPOSITE half from the landing — the same
  // relationship a real legal serve always has (the server's own side is
  // always the opposite half from where the ball lands) — so this default
  // reproduces exactly the SAME "in" classification the pre-Task-2 landing
  // -based test gave every one of these fixtures. A test exercising the NEW
  // out/net behaviour passes its own `shots` override instead.
  if (merged.shots === undefined) {
    const landingY = merged.firstShotLandingY ?? 8.0;
    merged.shots = [
      {
        id: crypto.randomUUID(),
        shotNumber: 1,
        isPlayer1: merged.serverIsPlayer1,
        shotType: merged.firstShotType ?? "First Serve",
        spinType: null,
        speedMph: null,
        zone: null,
        result: merged.firstShotResult ?? "In",
        videoTime: null,
        bounceVideoTime: null,
        contactX: 0,
        contactY: landingY <= NET_Y ? 22.0 : 2.0,
        landingX: merged.firstShotLandingX ?? -1.0,
        landingY,
      },
    ];
  }
  return merged;
}

/** A rally shot (shotNumber >= 3) with real contact/landing coords — same
 * fixed match-frame convention as `MatchPoint`'s own `secondShot*` fields
 * (`match-points-server.ts`'s `MatchShot` doc comment: metres, not varied
 * by which end a player is on). Defaults land well inside the near half
 * (no end-change flip) so a test only needs to override what it cares
 * about. */
function shot(over: Partial<MatchShot>): MatchShot {
  return {
    id: crypto.randomUUID(),
    shotNumber: 3,
    isPlayer1: true,
    shotType: "Forehand",
    spinType: null,
    speedMph: null,
    zone: null,
    result: "In",
    videoTime: null,
    bounceVideoTime: null,
    contactX: 0.5,
    contactY: 22.0, // just inside the near baseline (23.77)
    landingX: 0.5,
    landingY: 4.0, // well within the net (11.885) — no end-change flip
    ...over,
  };
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
      { ...EMPTY_VIZ_FILTERS, result: ["won"] },
      true,
    );
    expect(r.count).toBe(1);
    expect(r.total).toBe(2);
  });
});

/* ── Task 2a: servePlacementMetrics ───────────────────────────────────── */

test.describe("servePlacementMetrics (Task 2a)", () => {
  // Every call below passes `result: null` deliberately — these tests cover
  // the GEOMETRIC fallback (fix round 2: `kind` is authoritative from the
  // shot's own `result` when present; the box+tolerance rule below only
  // ever runs when `result` is null/unrecognised).
  test("null when contactY, landingX or landingY is missing", () => {
    expect(servePlacementMetrics(null, 1, 2, null)).toBeNull();
    expect(servePlacementMetrics(5, null, 2, null)).toBeNull();
    expect(servePlacementMetrics(5, 1, null, null)).toBeNull();
    expect(
      servePlacementMetrics(undefined, undefined, undefined, undefined),
    ).toBeNull();
  });

  test("end detection from contactY works in both directions — far-side and near-side contacts for the same real depth agree once mirrored", () => {
    const far = servePlacementMetrics(20, 1.0, 8.0, null)!; // contactY far half
    expect(far.kind).toBe("in");
    expect(far.lateralM).toBeCloseTo(-1.0, 5);
    expect(far.depthPastNetM).toBeCloseTo(3.885, 5);

    const near = servePlacementMetrics(2, 1.0, 15.77, null)!; // contactY near half
    expect(near.kind).toBe("in");
    expect(near.lateralM).toBeCloseTo(1.0, 5);
    expect(near.depthPastNetM).toBeCloseTo(3.885, 5);
  });

  test("kind: net — a shallow (-0.11m) and a deep (-7.80m) net ball both classify as net, from either end", () => {
    const shallow = servePlacementMetrics(20, 0.5, 11.995, null)!; // far-half
    expect(shallow.kind).toBe("net");
    expect(shallow.depthPastNetM).toBeCloseTo(-0.11, 5);

    const deep = servePlacementMetrics(2, 0.5, 4.085, null)!; // near-half
    expect(deep.kind).toBe("net");
    expect(deep.depthPastNetM).toBeCloseTo(-7.8, 5);
  });

  test("kind: out — a 12.04m serve is out, not silently mirrored into net or in", () => {
    const m = servePlacementMetrics(20, 0.5, -0.155, null)!;
    expect(m.kind).toBe("out");
    expect(m.depthPastNetM).toBeCloseTo(12.04, 2);
  });

  test("kind: out — lateral excess beyond the box+tolerance is out even at a normal depth", () => {
    const m = servePlacementMetrics(20, 5.0, 8.0, null)!;
    expect(m.kind).toBe("out");
    expect(m.lateralM).toBeCloseTo(-5.0, 5);
  });

  test("tolerance: 0.1m past the service line still reads as in", () => {
    const m = servePlacementMetrics(20, 0, 5.385, null)!; // depthPastNetM = 6.5
    expect(m.depthPastNetM).toBeCloseTo(6.5, 5);
    expect(m.kind).toBe("in");
  });

  test("just past the 20cm tolerance reads as out", () => {
    const m = servePlacementMetrics(20, 0, 5.275, null)!; // depthPastNetM = 6.61
    expect(m.kind).toBe("out");
  });

  /* ── Fix round 2: `result` is the authority, geometry is the fallback ── */

  test("an 'Out' serve recorded 6.41m past the net (inside the geometric tolerance) is still 'out' — the tracker's call wins over geometry", () => {
    // 6.41m is within SERVE_BOX_DEPTH_M(6.4)+tol(0.2)=6.6 and 0.96m is
    // within 4.115+0.2 — geometry alone would call this "in" (an imputed,
    // at-the-line landing). The real corpus case this models.
    const m = servePlacementMetrics(20, 0.96, 11.885 - 6.41, "Out")!;
    expect(m.kind).toBe("out");
  });

  test("a 'Net' serve recorded with a POSITIVE depth (+6.23m) still reads as net", () => {
    // Geometry alone (positive depth, in-box) would call this "in"; the
    // tracker's own "Net" call must win.
    const m = servePlacementMetrics(20, 0, 11.885 - 6.23, "Net")!;
    expect(m.depthPastNetM).toBeGreaterThan(0);
    expect(m.kind).toBe("net");
  });

  test("a null result still falls back to geometry and produces today's answer", () => {
    const withResult = servePlacementMetrics(20, 1.0, 8.0, "In")!;
    const withNull = servePlacementMetrics(20, 1.0, 8.0, null)!;
    expect(withNull.kind).toBe("in");
    expect(withNull.kind).toBe(withResult.kind);
    expect(withNull.lateralM).toBeCloseTo(withResult.lateralM, 5);
    expect(withNull.depthPastNetM).toBeCloseTo(withResult.depthPastNetM, 5);
  });

  test("an unrecognised result string also falls back to geometry", () => {
    const m = servePlacementMetrics(20, 1.0, 8.0, "Winner")!;
    expect(m.kind).toBe("in");
  });
});

/* ── Task 2: computeViz — serve cut draws out & net serves ────────────── */

test.describe("computeViz — serve cut, out & net (Task 2)", () => {
  function servePointWith(
    landingX: number,
    landingY: number,
    contactY: number,
    result: string,
  ): MatchPoint {
    return point({
      firstShotLandingX: landingX,
      firstShotLandingY: landingY,
      firstShotResult: result,
      shots: [
        shot({
          shotNumber: 1,
          shotType: "First Serve",
          isPlayer1: true,
          contactX: 0,
          contactY,
          landingX,
          landingY,
          result,
        }),
      ],
    });
  }

  test("total/count include in + out + net; only in-serves enter service-zone statistics", () => {
    const inPt = point({}); // default synthesized shots -> a legal "in" serve
    const outPt = servePointWith(0.5, -0.155, 20, "Out"); // depthPastNetM ~12.04
    const netPt = servePointWith(0.5, 4.085, 2, "Net"); // depthPastNetM ~-7.8
    const pts = [inPt, outPt, netPt];

    const r = computeViz(pts, "serve", EMPTY_VIZ_FILTERS, true);
    expect(r.total).toBe(3);
    expect(r.count).toBe(3);

    const zoneCount = Object.values(r.zoneStats!).reduce(
      (s, z) => s + z.count,
      0,
    );
    expect(zoneCount).toBe(1);

    const outcomes = r.dots.map((d) => d.outcome).sort();
    expect(outcomes).toEqual(["miss", "miss", "won"]);
    // Fix round 4A: net folds into Miss's ordinary grey circle — no
    // distinct shape — `atNet` carries the position fact instead.
    expect(r.dots.filter((d) => d.atNet)).toHaveLength(1);
    for (const d of r.dots) {
      expect(["circle", "triangle", "star"]).toContain(d.shape);
    }

    // Fix round 3: serveOutOrNetCount counts kind "out"/"net" directly, not
    // zoneStats — the out and net points both contribute (2), the in point
    // does not, regardless of what zoneStats itself happens to keep.
    expect(r.serveOutOrNetCount).toBe(2);
  });

  test("a netted serve yields shape 'circle' with atNet set — folded into Miss, no distinct glyph", () => {
    const netPt = servePointWith(0.5, 4.085, 2, "Net"); // depthPastNetM ~-7.8
    const r = computeViz([netPt], "serve", EMPTY_VIZ_FILTERS, true);
    expect(r.dots).toHaveLength(1);
    expect(r.dots[0].shape).toBe("circle");
    expect(r.dots[0].atNet).toBe(true);
    expect(r.dots[0].outcome).toBe("miss");
  });

  test("serveOutOrNetCount is undefined off the serve cut", () => {
    const r = computeViz(
      [point({ secondShotLandingX: 1, secondShotLandingY: 1 })],
      "returnPlacement",
      EMPTY_VIZ_FILTERS,
      true,
    );
    expect(r.serveOutOrNetCount).toBeUndefined();
  });

  test('no projected serve dot falls outside heatBoundsFor("serve")', () => {
    const outPt = servePointWith(6.0, -3.0, 20, "Out"); // way wide and way long
    const r = computeViz([outPt], "serve", EMPTY_VIZ_FILTERS, true);
    const bounds = heatBoundsFor("serve");
    for (const d of r.dots) {
      const { cx, cy } = projectServeMetricDot({
        lateralM: d.lateralM,
        depthPastNetM: d.depthM,
      });
      expect(cx).toBeGreaterThanOrEqual(bounds.xMin);
      expect(cx).toBeLessThanOrEqual(bounds.xMax);
      expect(cy).toBeGreaterThanOrEqual(bounds.yMin);
      expect(cy).toBeLessThanOrEqual(bounds.yMax);
    }
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
    // Task 2: end detection reads secondShotContactY (23.0, far half, so
    // farEnd=true): lateralM = -landingX = -1.2; depthM = NET(11.885) -
    // landingY(4.0) = 7.885 — metres PAST THE NET, not the raw landing y.
    expect(place.dots[0].lateralM).toBeCloseTo(-1.2, 5);
    expect(place.dots[0].depthM).toBeCloseTo(7.885, 5);
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

  test("a return with contact coords but NO landing still counts for returnContact — only the placement dot needs a landing", () => {
    const noLanding = {
      ...ret,
      secondShotLandingX: null,
      secondShotLandingY: null,
    } as MatchPoint;
    const placement = computeViz(
      [noLanding],
      "returnPlacement",
      EMPTY_VIZ_FILTERS,
      true,
    );
    const contact = computeViz(
      [noLanding],
      "returnContact",
      EMPTY_VIZ_FILTERS,
      true,
    );
    expect(placement.total).toBe(0); // no landing -> no placement dot
    expect(contact.total).toBe(1); // contact coords alone are enough
    expect(contact.dots).toHaveLength(1);
  });

  test("a netted BACKHAND return yields shape 'triangle' with atNet set — the cut's own glyph, folded into Miss", () => {
    const nettedBackhand = {
      ...ret,
      secondShotType: "Backhand Slice",
      secondShotResult: "Net",
    } as MatchPoint;
    const r = computeViz(
      [nettedBackhand],
      "returnPlacement",
      EMPTY_VIZ_FILTERS,
      true,
    );
    expect(r.dots).toHaveLength(1);
    expect(r.dots[0].shape).toBe("triangle");
    expect(r.dots[0].atNet).toBe(true);
    expect(r.dots[0].outcome).toBe("miss");
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
  "deuce-wide": 3.4,
  "deuce-body": 2.0,
  "deuce-t": 0.7,
  "ad-t": -0.7,
  "ad-body": -2.0,
  "ad-wide": -3.4,
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
    const stats = computeVizStats(
      pts,
      "serve",
      EMPTY_VIZ_FILTERS,
      true,
      undefined,
      DEFAULT_BANDS,
      "ft",
    );
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
    const pts = [
      point({ firstShotType: "Second Serve" }),
      point({
        firstShotType: "Second Serve",
        firstShotLandingX: ZONE_LX["ad-t"],
      }),
    ];
    const stats = computeVizStats(
      pts,
      "serve",
      { ...EMPTY_VIZ_FILTERS, ball: ["second"] },
      true,
      undefined,
      DEFAULT_BANDS,
      "ft",
    );
    expect(stats.subtitle).toContain("second serves");
  });

  // Zone rows now exclude faults; the subtitle names both their in-serve
  // denominator and the out/net count in the drawable population.

  function outServe(): MatchPoint {
    return point({
      firstShotLandingX: 0.5,
      firstShotLandingY: -0.155, // ~12.04m past the net
      firstShotResult: "Out",
      shots: [
        shot({
          shotNumber: 1,
          shotType: "First Serve",
          isPlayer1: true,
          contactX: 0,
          contactY: 20,
          landingX: 0.5,
          landingY: -0.155,
          result: "Out",
        }),
      ],
    });
  }

  test("subtitle names the out/net count when the pool has any", () => {
    const pts = [
      point({ firstShotLandingX: ZONE_LX["deuce-t"] }), // in
      outServe(),
    ];
    const stats = computeVizStats(
      pts,
      "serve",
      EMPTY_VIZ_FILTERS,
      true,
      undefined,
      DEFAULT_BANDS,
      "ft",
    );
    expect(stats.subtitle).toBe(
      "Points won by zone · 1 of 2 serves landed in · 1 out or into the net",
    );
  });

  test("subtitle keeps today's wording when nothing is out/net", () => {
    const pts = [
      point({ firstShotLandingX: ZONE_LX["deuce-t"] }),
      point({ firstShotLandingX: ZONE_LX["ad-t"] }),
    ];
    const stats = computeVizStats(
      pts,
      "serve",
      EMPTY_VIZ_FILTERS,
      true,
      undefined,
      DEFAULT_BANDS,
      "ft",
    );
    expect(stats.subtitle).toBe("Points won by zone · 2 serves");
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
      undefined,
      DEFAULT_BANDS,
      "ft",
    );
    const adStats = computeVizStats(
      [adSide],
      "returnPlacement",
      EMPTY_VIZ_FILTERS,
      true,
      undefined,
      DEFAULT_BANDS,
      "ft",
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
      undefined,
      DEFAULT_BANDS,
      "ft",
    );
    const depth = stats.groups.find((g) => g.key === "depth")!;
    const row = (key: string) => depth.rows.find((r) => r.key === key)!;
    expect(row("short").count).toBe(1);
    expect(row("mid").count).toBe(1);
    expect(row("deep").count).toBe(2);
  });

  // Stage 2C, the design's non-negotiable: "a unit switch must never move a
  // ball between bands". Same fixtures, unit "m" — counts must be identical
  // to the "ft" run above, and the Depth group's own labels ("Deep"/"Mid"/
  // "Short") are static text, not numbers, so they read the same in either
  // unit — only a band's `rangeLabel` (drawn on the overlay/editor, not
  // this stat card) follows the preference.
  test("depth thirds in metres: identical counts to feet — a unit switch never moves a ball between bands", () => {
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
    const statsFt = computeVizStats(
      pts,
      "returnPlacement",
      EMPTY_VIZ_FILTERS,
      true,
      undefined,
      DEFAULT_BANDS,
      "ft",
    );
    const statsM = computeVizStats(
      pts,
      "returnPlacement",
      EMPTY_VIZ_FILTERS,
      true,
      undefined,
      DEFAULT_BANDS,
      "m",
    );
    const depthM = statsM.groups.find((g) => g.key === "depth")!;
    const depthFt = statsFt.groups.find((g) => g.key === "depth")!;
    expect(depthM.rows.map((r) => ({ key: r.key, count: r.count }))).toEqual(
      depthFt.rows.map((r) => ({ key: r.key, count: r.count })),
    );
    expect(depthM.rows.map((r) => r.label)).toEqual(["Deep", "Mid", "Short"]);
  });

  test("out/net landings are excluded from rows and the subtitle count says so", () => {
    const inCourt1 = returnPoint({});
    const inCourt2 = returnPoint({});
    const inCourt3 = returnPoint({});
    const outWide = returnPoint({
      secondShotLandingX: 5.5, // outside the 4.115m singles half-width
      secondShotResult: "Out",
    });
    const stats = computeVizStats(
      [inCourt1, inCourt2, inCourt3, outWide],
      "returnPlacement",
      EMPTY_VIZ_FILTERS,
      true,
      undefined,
      DEFAULT_BANDS,
      "ft",
    );
    // total always equals computeViz(...).count (all four points are
    // drawable returns), even though only three land inside the rows'
    // denominator — the subtitle spells out the gap instead of hiding it.
    expect(stats.total).toBe(4);
    expect(stats.subtitle).toBe(
      "Points won by placement · 3 of 4 returns landed in",
    );
  });

  test("subtitle is the bare count when every counted return landed in", () => {
    const inCourt1 = returnPoint({});
    const inCourt2 = returnPoint({});
    const stats = computeVizStats(
      [inCourt1, inCourt2],
      "returnPlacement",
      EMPTY_VIZ_FILTERS,
      true,
      undefined,
      DEFAULT_BANDS,
      "ft",
    );
    expect(stats.total).toBe(2);
    expect(stats.subtitle).toBe("Points won by placement · 2 returns");
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
      undefined,
      DEFAULT_BANDS,
      "ft",
    );
    const depth = stats.groups.find((g) => g.key === "depth")!;
    const row = (key: string) => depth.rows.find((r) => r.key === key)!;
    expect(row("inside").count).toBe(1);
    expect(row("near").count).toBe(2);
    expect(row("far").count).toBe(2);
  });

  // Stage 2C: same fixtures in metres — identical buckets AND the rows'
  // labels (unlike Depth's thirds group, a contact row's label IS the
  // number — `contactRow` in viz-bands.ts) read as the design's worked
  // example: "Inside the baseline" / "0–1.5 m behind" / "1.5 m+ behind".
  test("contact depth bands in metres: same buckets, labels read '0–1.5 m behind' / '1.5 m+ behind'", () => {
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
      undefined,
      DEFAULT_BANDS,
      "m",
    );
    const depth = stats.groups.find((g) => g.key === "depth")!;
    const row = (key: string) => depth.rows.find((r) => r.key === key)!;
    expect(row("inside").count).toBe(1);
    expect(row("near").count).toBe(2);
    expect(row("far").count).toBe(2);
    expect(row("inside").label).toBe("Inside the baseline");
    expect(row("near").label).toBe("0–1.5 m behind");
    expect(row("far").label).toBe("1.5 m+ behind");
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
      undefined,
      DEFAULT_BANDS,
      "ft",
    );
    const stroke = stats.groups.find((g) => g.key === "stroke")!;
    expect(stroke.rows.find((r) => r.key === "forehand")!.count).toBe(1);
    expect(stroke.rows.find((r) => r.key === "backhand")!.count).toBe(2);
  });

  // A1: the contact subtitle used to hardcode "returns" regardless of the
  // ball filter, unlike returnPlacement's subtitle. It must route through
  // the same returnNoun(filters.ball) helper.
  test("contact subtitle follows the ball filter", () => {
    const pts = [contactPoint({ secondShotContactY: 30 })];
    const stats = computeVizStats(
      pts,
      "returnContact",
      { ...EMPTY_VIZ_FILTERS, ball: ["first"] },
      true,
      undefined,
      DEFAULT_BANDS,
      "ft",
    );
    expect(stats.subtitle).toBe(
      `Points won by contact point · 1 first-serve return`,
    );
  });
});

/**
 * Phase 2B Task 2 — `computeVizStats` follows the workspace's depth/contact
 * bands (`viz-bands.ts`). THE NON-NEGOTIABLE: with `DEFAULT_BANDS` (the
 * implicit default when a caller omits `bands` entirely, exactly like every
 * pre-Phase-2B call site above) every label and every number
 * `computeVizStats` returns for `returnPlacement`/`returnContact` must be
 * byte-identical to what it returned before bands existed — this block pins
 * that with a full `toEqual` snapshot, INCLUDING fixtures placed at (contact)
 * or immediately adjacent to, within one ulp (depth placement — see the
 * fixture comments below for why exact placement isn't achievable there)
 * the old `DEPTH_THIRD_M`/`2×DEPTH_THIRD_M`/`FIVE_FEET_M` boundaries, so a
 * bucketing rewrite that moves a boundary by even one row fails loudly here
 * rather than only in a count-only assertion elsewhere in this file.
 */
test.describe("computeVizStats — bands (Phase 2B Task 2)", () => {
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

  const REAL_COURT_LENGTH = 23.77;

  // Fix round 2 (#5): these four in-bounds landings exercise every depth
  // bucket, but NONE of them sit exactly on the module's internal thirds
  // dividers — `depthM = REAL_NET_Y − secondShotLandingY` for a far-half
  // landing, so a SMALL landingY is DEEP (near the baseline, high depthM)
  // and a LARGE landingY is SHORT (near the net, low depthM), the OPPOSITE
  // of landingY's own direction. The prior comments here had this backwards
  // (labeling landingY=0 "short" and landingY=NET_TO_BASELINE_M "deep") and
  // also claimed exact-boundary placement the values don't actually have —
  // `REAL_NET_Y − DEPTH_THIRD_M` (subtraction) lands ONE ULP away from the
  // module's own `2 * (COURT_HALF_M / 3)` divider (multiplication), not
  // bit-identical to it, so these two fixtures land cleanly on one side of
  // their nearby divider rather than exactly astride it. Verified per-point
  // below; the actual buckets are Deep, Deep, Mid, Short (in fixture order).
  const placementPts = [
    returnPoint({
      pointScore: "0-0",
      secondShotLandingX: 0,
      secondShotLandingY: 0,
    }), // deep — depthM = REAL_NET_Y (at the far baseline)
    returnPoint({
      pointScore: "15-0",
      secondShotLandingX: 0,
      secondShotLandingY: DEPTH_THIRD_M,
    }), // deep — depthM lands one ulp ABOVE the mid/deep divider, not on it
    returnPoint({
      pointScore: "0-0",
      secondShotLandingX: 0,
      secondShotLandingY: 2 * DEPTH_THIRD_M,
    }), // mid — depthM lands one ulp BELOW the short/mid divider, not on it
    returnPoint({
      pointScore: "15-0",
      secondShotLandingX: -2.5,
      secondShotLandingY: NET_TO_BASELINE_M,
      wonByPlayer1: false,
    }), // short — depthM = 0 (at the net)
    returnPoint({ secondShotLandingX: 5.5, secondShotResult: "Out" }), // excluded (out)
  ];

  // One at each old bucket, PLUS fixtures exactly on the two contact
  // boundaries (0 = the baseline itself, FIVE_FEET_M).
  const contactPts = [
    contactPoint({ secondShotContactY: REAL_COURT_LENGTH - 0.5 }), // inside
    contactPoint({ secondShotContactY: REAL_COURT_LENGTH }), // boundary — near (0)
    contactPoint({
      secondShotContactY: REAL_COURT_LENGTH + FIVE_FEET_M,
      secondShotType: "Backhand Slice",
      wonByPlayer1: false,
    }), // boundary — far
    contactPoint({ secondShotContactY: REAL_COURT_LENGTH + 3.0 }), // far
  ];

  const EXPECTED_PLACEMENT = {
    title: "Where the return went",
    subtitle: "Points won by placement · 4 of 5 returns landed in",
    groups: [
      {
        key: "direction",
        label: "Direction",
        rows: [
          { key: "middle", label: "Middle", count: 3, won: 3, winPct: 100 },
          {
            key: "crosscourt",
            label: "Crosscourt",
            count: 1,
            won: 0,
            winPct: 0,
          },
          {
            key: "dtl",
            label: "Down the line",
            count: 0,
            won: 0,
            winPct: null,
          },
        ],
      },
      {
        key: "depth",
        label: "Depth",
        rows: [
          { key: "deep", label: "Deep", count: 2, won: 2, winPct: 100 },
          { key: "mid", label: "Mid", count: 1, won: 1, winPct: 100 },
          { key: "short", label: "Short", count: 1, won: 0, winPct: 0 },
        ],
      },
    ],
    sentence: "Middle: 100% won on 3 returns.",
    total: 5,
  };

  const EXPECTED_CONTACT = {
    title: "Where the return was struck",
    subtitle: "Points won by contact point · 4 returns",
    groups: [
      {
        key: "depth",
        label: "Depth",
        // Order is the pre-Phase-2B `sortRows`' own: win rate, then count,
        // then label — "0–5 ft behind" sorts before "Inside the baseline".
        rows: [
          {
            key: "near",
            label: "0–5 ft behind",
            count: 1,
            won: 1,
            winPct: 100,
          },
          {
            key: "inside",
            label: "Inside the baseline",
            count: 1,
            won: 1,
            winPct: 100,
          },
          {
            key: "far",
            label: "5 ft+ behind",
            count: 2,
            won: 1,
            winPct: 50,
          },
        ],
      },
      {
        key: "stroke",
        label: "Stroke",
        rows: [
          {
            key: "forehand",
            label: "Forehand",
            count: 3,
            won: 3,
            winPct: 100,
          },
          {
            key: "backhand",
            label: "Backhand",
            count: 1,
            won: 0,
            winPct: 0,
          },
        ],
      },
    ],
    sentence: "Forehand: 100% won on 3 returns.",
    total: 4,
  };

  test("regression: returnPlacement with DEFAULT_BANDS is byte-identical to the pre-Phase-2B output, row ORDER included", () => {
    const stats = computeVizStats(
      placementPts,
      "returnPlacement",
      EMPTY_VIZ_FILTERS,
      true,
      undefined,
      DEFAULT_BANDS,
      "ft",
    );
    // Compared UNSORTED: the rows' order is part of what must not change.
    expect(stats).toEqual(EXPECTED_PLACEMENT);
  });

  test("regression: returnContact with DEFAULT_BANDS is byte-identical to the pre-Phase-2B output, row ORDER included", () => {
    const stats = computeVizStats(
      contactPts,
      "returnContact",
      EMPTY_VIZ_FILTERS,
      true,
      undefined,
      DEFAULT_BANDS,
      "ft",
    );
    // Compared UNSORTED: the rows' order is part of what must not change.
    expect(stats).toEqual(EXPECTED_CONTACT);
  });

  test("custom depth scheme buckets by its own dividers and labels the rows with formatDistance ranges", () => {
    const bands: BandSettings = {
      depthScheme: "custom",
      depthDividersFt: [6, 20],
      contactDividersFt: [0, 5],
    };
    // `depthM` (NET-origin metres) = `REAL_NET_Y − secondShotLandingY` for a
    // far-half landing (see `computeViz`'s farEnd flip) — a SMALL landingY
    // is DEEP (near the baseline) and a LARGE landingY is SHORT (near the
    // net), the opposite of landingY's own direction. Custom dividers [6,
    // 20] baseline-ft convert to net-origin metres dividers of ≈[5.79,
    // 10.06] (`REAL_NET_Y − ft/FT_PER_M`), so: landingY 1.0 -> depthM 10.885
    // (>= 10.06 -> Deep); landingY 4.0 -> depthM 7.885 (between -> Mid);
    // landingY 11.0 -> depthM 0.885 (< 5.79 -> Short).
    const pts = [
      returnPoint({ secondShotLandingX: 0, secondShotLandingY: 1.0 }), // Deep
      returnPoint({ secondShotLandingX: 0, secondShotLandingY: 4.0 }), // Mid
      returnPoint({ secondShotLandingX: 0, secondShotLandingY: 11.0 }), // Short
    ];
    const stats = computeVizStats(
      pts,
      "returnPlacement",
      EMPTY_VIZ_FILTERS,
      true,
      undefined,
      bands,
      "ft",
    );
    const depth = stats.groups.find((g) => g.key === "depth")!;
    expect(depth.rows.map((r) => r.key).sort()).toEqual([
      "deep",
      "mid",
      "short",
    ]);
    const row = (key: string) => depth.rows.find((r) => r.key === key)!;
    expect(row("deep").count).toBe(1);
    expect(row("mid").count).toBe(1);
    expect(row("short").count).toBe(1);
    expect(row("deep").label).toBe("Deep");
    expect(row("mid").label).toBe("Mid");
    expect(row("short").label).toBe("Short");
  });

  test('depthScheme: "none" omits the Depth group entirely rather than rendering zero rows', () => {
    const bands: BandSettings = {
      ...DEFAULT_BANDS,
      depthScheme: "none",
    };
    const stats = computeVizStats(
      placementPts,
      "returnPlacement",
      EMPTY_VIZ_FILTERS,
      true,
      undefined,
      bands,
      "ft",
    );
    expect(stats.groups.map((g) => g.key)).toEqual(["direction"]);
    expect(stats.groups.find((g) => g.key === "depth")).toBeUndefined();
    // The Direction group and the subtitle/total are unaffected — only the
    // Depth group disappears.
    expect(stats.total).toBe(5);
  });

  /**
   * User decision, 2026-09-21: the "Inside the baseline" scheme is gone, and
   * with it the one place a MISS was counted into a Depth row. The tracker's
   * verdict is only In / Out / Net, so a long miss cannot be told from a
   * wide one — neither now reaches a Depth row under any scheme, and the
   * Depth rows add up to the returns that landed in.
   */
  test("a miss never reaches a Depth row, long or wide", () => {
    const longMiss = returnPoint({
      secondShotLandingX: 0,
      // 1m past the far baseline — the landing that used to be counted.
      secondShotLandingY: -1,
      secondShotResult: "Out",
    });
    const wideMiss = returnPoint({
      secondShotLandingX: 6.0,
      secondShotLandingY: 4.0,
      secondShotResult: "Out",
    });
    const inCourt = returnPoint({
      secondShotLandingX: 0,
      secondShotLandingY: 6.0,
    });
    const pts = [longMiss, wideMiss, inCourt];

    for (const bands of [
      DEFAULT_BANDS,
      { ...DEFAULT_BANDS, depthScheme: "deepMidShort" } as BandSettings,
      {
        depthScheme: "custom",
        depthDividersFt: [6, 20],
        contactDividersFt: [0, 5],
      } as BandSettings,
    ]) {
      const stats = computeVizStats(
        pts,
        "returnPlacement",
        EMPTY_VIZ_FILTERS,
        true,
        undefined,
        bands,
        "ft",
      );
      const depth = stats.groups.find((g) => g.key === "depth")!;
      const counted = depth.rows.reduce((sum, r) => sum + r.count, 0);
      expect(counted).toBe(1); // the in-court landing, and only it
      expect(stats.total).toBe(3);
      expect(stats.subtitle).toBe(
        "Points won by placement · 1 of 3 returns landed in",
      );
    }
  });

  test("returnContact/rallyPosition follow custom contact dividers too", () => {
    const bands: BandSettings = {
      ...DEFAULT_BANDS,
      contactDividersFt: [2, 8],
    };
    // `depthM` here is metres (SwingVision's coordinate unit), not feet —
    // `contactDividersFt` [2, 8] converts to metres dividers of ≈[0.61,
    // 2.44] (`ft / FT_PER_M`). Pick metre offsets that land clearly inside
    // each band rather than the feet numbers themselves.
    const pts = [
      contactPoint({ secondShotContactY: REAL_COURT_LENGTH - 0.5 }), // depthM -0.5 -> inside
      contactPoint({ secondShotContactY: REAL_COURT_LENGTH + 1.5 }), // depthM 1.5 -> between 0.61 and 2.44
      contactPoint({ secondShotContactY: REAL_COURT_LENGTH + 3.0 }), // depthM 3.0 -> >= 2.44
    ];
    const stats = computeVizStats(
      pts,
      "returnContact",
      EMPTY_VIZ_FILTERS,
      true,
      undefined,
      bands,
      "ft",
    );
    const depth = stats.groups.find((g) => g.key === "depth")!;
    const row = (key: string) => depth.rows.find((r) => r.key === key)!;
    expect(row("inside").count).toBe(1);
    expect(row("near").count).toBe(1);
    expect(row("far").count).toBe(1);
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
    const asSubject = computeVizStats(
      pts,
      "serve",
      EMPTY_VIZ_FILTERS,
      false,
      undefined,
      DEFAULT_BANDS,
      "ft",
    );
    const row = asSubject.groups[0].rows.find((r) => r.key === "deuce-wide")!;
    expect(row.count).toBe(1);
    expect(row.won).toBe(1);
    expect(row.winPct).toBe(100);

    // The same point, read as if player 1 were the subject: player 1 lost,
    // so the identical point now reads as a loss for the row.
    const asOpponent = computeVizStats(
      pts,
      "serve",
      EMPTY_VIZ_FILTERS,
      true,
      undefined,
      DEFAULT_BANDS,
      "ft",
    );
    const oppRow = asOpponent.groups[0].rows.find(
      (r) => r.key === "deuce-wide",
    )!;
    expect(oppRow.count).toBe(0); // player 1 never served
  });
});

/**
 * A2: the serve-only attribution test above never exercises return rows.
 * Fixture: every point lands/contacts in the SAME bucket (Direction:
 * middle, Depth: short for placement; Depth: near, Stroke: forehand for
 * contact) so a single row's count/won can be read straight off without
 * summing across rows — the point of this fixture is attribution, not
 * bucketing.
 *
 * The won counts are chosen so a naive `outcome = wonByPlayer1 ? "won" :
 * "lost"` (comparing the raw column instead of going through
 * `subjectIsPlayer1`) gives a DIFFERENT number than the correct one for
 * the player-2 / opponent cases: p2Returns is 2 wins by player 2 (both
 * `wonByPlayer1: false`) and 1 loss (`wonByPlayer1: true`) — the naive
 * read scores that as 1 win (only the `true` row), the correct
 * subject-relative read scores it as 2 wins.
 */
test.describe("computeVizStats — return attribution", () => {
  const RETURN_CONTACT_Y = 23.77; // REAL_COURT_LENGTH — puts depthM at 0 ("near")

  function returnPoint(over: Partial<MatchPoint>): MatchPoint {
    return point({
      secondShotLandingX: 0, // direction "middle"
      // Task 2: placement depth is now metres PAST THE NET (farEnd=true from
      // RETURN_CONTACT_Y, so depthM = NET - landingY) — 10.885 is 1m past
      // the net, depth "short".
      secondShotLandingY: 10.885,
      secondShotContactX: 0,
      secondShotContactY: RETURN_CONTACT_Y, // contact depth "near"
      secondShotType: "Forehand", // stroke "forehand"
      ...over,
    });
  }

  // Player 1 returns (player 2 serves): 2 won, 1 lost, by player 1.
  const p1Returns = [
    returnPoint({ serverIsPlayer1: false, wonByPlayer1: true }),
    returnPoint({ serverIsPlayer1: false, wonByPlayer1: true }),
    returnPoint({ serverIsPlayer1: false, wonByPlayer1: false }),
  ];
  // Player 2 returns (player 1 serves): 2 won, 1 lost, by player 2.
  const p2Returns = [
    returnPoint({ serverIsPlayer1: true, wonByPlayer1: false }), // player 2 won
    returnPoint({ serverIsPlayer1: true, wonByPlayer1: false }), // player 2 won
    returnPoint({ serverIsPlayer1: true, wonByPlayer1: true }), // player 2 lost
  ];
  const pts = [...p1Returns, ...p2Returns];

  function depthRow(stats: ReturnType<typeof computeVizStats>, key: string) {
    return stats.groups
      .find((g) => g.key === "depth")!
      .rows.find((r) => r.key === key)!;
  }

  const cases: { cut: Cut; rowKey: string }[] = [
    { cut: "returnPlacement", rowKey: "short" },
    { cut: "returnContact", rowKey: "near" },
  ];

  for (const { cut, rowKey } of cases) {
    test(`${cut}: subject = player 1 gets player 1's returns and wins`, () => {
      const stats = computeVizStats(
        pts,
        cut,
        EMPTY_VIZ_FILTERS,
        true,
        undefined,
        DEFAULT_BANDS,
        "ft",
      );
      const row = depthRow(stats, rowKey);
      expect(row.count).toBe(3);
      expect(row.won).toBe(2);
    });

    test(`${cut}: subject = player 2 (viewer is player 2) gets player 2's returns and wins`, () => {
      const stats = computeVizStats(
        pts,
        cut,
        EMPTY_VIZ_FILTERS,
        false,
        undefined,
        DEFAULT_BANDS,
        "ft",
      );
      const row = depthRow(stats, rowKey);
      expect(row.count).toBe(3);
      expect(row.won).toBe(2); // would read 1 under the naive (non-subject) comparison
    });

    test(`${cut}: the opponent subject for a player-1 viewer reads player 2's numbers`, () => {
      const opponentSubject = subjectFor(
        { ...EMPTY_VIZ_FILTERS, player: "opponent" },
        true,
      );
      expect(opponentSubject).toBe(false);
      const stats = computeVizStats(
        pts,
        cut,
        EMPTY_VIZ_FILTERS,
        opponentSubject,
        undefined,
        DEFAULT_BANDS,
        "ft",
      );
      const row = depthRow(stats, rowKey);
      expect(row.count).toBe(3);
      expect(row.won).toBe(2);
    });
  }
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
      const stats = computeVizStats(
        pts,
        cut,
        EMPTY_VIZ_FILTERS,
        true,
        undefined,
        DEFAULT_BANDS,
        "ft",
      );
      const viz = computeViz(pts, cut, EMPTY_VIZ_FILTERS, true);
      expect(stats.total).toBe(viz.count);
    }
  });
});

test.describe("computeVizStats — sentence", () => {
  test("every number in the sentence comes from an actual row", () => {
    const pts = [
      point({ firstShotLandingX: ZONE_LX["deuce-wide"], wonByPlayer1: true }),
      point({ firstShotLandingX: ZONE_LX["deuce-wide"], wonByPlayer1: true }),
      point({ firstShotLandingX: ZONE_LX["deuce-wide"], wonByPlayer1: true }),
      point({ firstShotLandingX: ZONE_LX["deuce-wide"], wonByPlayer1: true }),
      point({ firstShotLandingX: ZONE_LX["deuce-wide"], wonByPlayer1: true }),
      // A lower QUALIFYING (count >= 3) comparator in the same group —
      // the ceiling must come from this row, not from the higher-but-
      // small-sample rows below.
      point({ firstShotLandingX: ZONE_LX["ad-t"], wonByPlayer1: true }),
      point({ firstShotLandingX: ZONE_LX["ad-t"], wonByPlayer1: true }),
      point({ firstShotLandingX: ZONE_LX["ad-t"], wonByPlayer1: false }),
      point({ firstShotLandingX: ZONE_LX["ad-t"], wonByPlayer1: false }),
      // Small-sample rows sitting ABOVE the headline's win rate — since
      // neither clears the count >= 3 floor, they must NOT set the ceiling
      // (round 1 bug: a 2-serve 100% zone inflated "sits at or under").
      point({ firstShotLandingX: ZONE_LX["ad-body"], wonByPlayer1: true }),
    ];
    const stats = computeVizStats(
      pts,
      "serve",
      EMPTY_VIZ_FILTERS,
      true,
      undefined,
      DEFAULT_BANDS,
      "ft",
    );
    expect(stats.sentence).not.toBeNull();
    const rows = stats.groups[0].rows;
    const deuceWide = rows.find((r) => r.key === "deuce-wide")!;
    const adT = rows.find((r) => r.key === "ad-t")!;
    const adBody = rows.find((r) => r.key === "ad-body")!;
    expect(deuceWide.winPct).toBe(100);
    expect(deuceWide.count).toBe(5);
    expect(adT.winPct).toBe(50);
    expect(adT.count).toBe(4);
    // The non-qualifying row sits ABOVE the headline — proof this number
    // must not appear as the sentence's ceiling.
    expect(adBody.winPct).toBe(100);
    expect(adBody.count).toBe(1);

    expect(stats.sentence).toContain(`${deuceWide.winPct}%`);
    expect(stats.sentence).toContain(`${deuceWide.count} serves`);
    expect(stats.sentence).toContain(`${adT.winPct}%.`);
    expect(stats.sentence).toBe(
      "Deuce wide: 100% won on 5 serves — every other zone with 3+ serves sits at or under 50%.",
    );
  });

  test("no other qualifying row in the headline's group → the comparison clause is dropped", () => {
    const pts = [
      point({ firstShotLandingX: ZONE_LX["deuce-wide"], wonByPlayer1: true }),
      point({ firstShotLandingX: ZONE_LX["deuce-wide"], wonByPlayer1: true }),
      point({ firstShotLandingX: ZONE_LX["deuce-wide"], wonByPlayer1: true }),
      // Below the count >= 3 floor — never qualifies as a comparator.
      point({ firstShotLandingX: ZONE_LX["ad-t"], wonByPlayer1: false }),
      point({ firstShotLandingX: ZONE_LX["ad-body"], wonByPlayer1: false }),
    ];
    const stats = computeVizStats(
      pts,
      "serve",
      EMPTY_VIZ_FILTERS,
      true,
      undefined,
      DEFAULT_BANDS,
      "ft",
    );
    expect(stats.sentence).toBe("Deuce wide: 100% won on 3 serves.");
  });

  test("a tied qualifying comparator reads 'level with', never 'at or under' its own value — the exact live case", () => {
    // The round-1 bug report's exact rows: 100%/2, 75%/4, 75%/4, 50%/2,
    // 50%/2, 0%/3 across the six serve zones, filtered to first serves.
    const zonePoints = (
      key: keyof typeof ZONE_LX,
      wins: number,
      losses: number,
    ) =>
      Array.from({ length: wins }, () =>
        point({ firstShotLandingX: ZONE_LX[key], wonByPlayer1: true }),
      ).concat(
        Array.from({ length: losses }, () =>
          point({ firstShotLandingX: ZONE_LX[key], wonByPlayer1: false }),
        ),
      );
    const pts = [
      ...zonePoints("deuce-wide", 2, 0), // 100%, count 2 — not qualifying
      ...zonePoints("deuce-body", 3, 1), // 75%, count 4 — qualifying
      ...zonePoints("ad-body", 3, 1), // 75%, count 4 — qualifying
      ...zonePoints("deuce-t", 1, 1), // 50%, count 2 — not qualifying
      ...zonePoints("ad-t", 1, 1), // 50%, count 2 — not qualifying
      ...zonePoints("ad-wide", 0, 3), // 0%, count 3 — qualifying
    ];
    const stats = computeVizStats(
      pts,
      "serve",
      { ...EMPTY_VIZ_FILTERS, ball: ["first"] },
      true,
      undefined,
      DEFAULT_BANDS,
      "ft",
    );
    const rows = stats.groups[0].rows;
    expect(rows.find((r) => r.key === "deuce-wide")!.winPct).toBe(100);
    expect(rows.find((r) => r.key === "ad-body")!.winPct).toBe(75);
    expect(rows.find((r) => r.key === "deuce-body")!.winPct).toBe(75);
    expect(stats.sentence).toBe(
      "Ad body: 75% won on 4 first serves — level with Deuce body.",
    );
  });

  test("no qualifying row (every row under 3 points) → sentence is null", () => {
    const pts = [
      point({ firstShotLandingX: ZONE_LX["deuce-wide"], wonByPlayer1: true }),
      point({ firstShotLandingX: ZONE_LX["ad-t"], wonByPlayer1: true }),
    ];
    const stats = computeVizStats(
      pts,
      "serve",
      EMPTY_VIZ_FILTERS,
      true,
      undefined,
      DEFAULT_BANDS,
      "ft",
    );
    expect(stats.sentence).toBeNull();
  });
});

test.describe("computeVizStats — empty input", () => {
  test("empty points → every row is count 0 / winPct null, sentence is null, total is 0", () => {
    const cuts: Cut[] = ["serve", "returnPlacement", "returnContact"];
    for (const cut of cuts) {
      const stats = computeVizStats(
        [],
        cut,
        EMPTY_VIZ_FILTERS,
        true,
        undefined,
        DEFAULT_BANDS,
        "ft",
      );
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

/* ── A3: singular nouns in the subtitle ──────────────────────────────────
 * Subtitles used to read "1 returns" / "1 serves" — the noun helpers must
 * singularise at n === 1 and stay plural at n === 0 and n === 2. */
test.describe("computeVizStats — singular nouns", () => {
  test("serve subtitle: 0 serves / 1 serve / 2 serves", () => {
    const zero = computeVizStats(
      [],
      "serve",
      EMPTY_VIZ_FILTERS,
      true,
      undefined,
      DEFAULT_BANDS,
      "ft",
    );
    expect(zero.subtitle).toBe("Points won by zone · 0 serves");

    const one = computeVizStats(
      [point({ firstShotLandingX: ZONE_LX["deuce-t"] })],
      "serve",
      EMPTY_VIZ_FILTERS,
      true,
      undefined,
      DEFAULT_BANDS,
      "ft",
    );
    expect(one.subtitle).toBe("Points won by zone · 1 serve");

    const two = computeVizStats(
      [
        point({ firstShotLandingX: ZONE_LX["deuce-t"] }),
        point({ firstShotLandingX: ZONE_LX["ad-t"] }),
      ],
      "serve",
      EMPTY_VIZ_FILTERS,
      true,
      undefined,
      DEFAULT_BANDS,
      "ft",
    );
    expect(two.subtitle).toBe("Points won by zone · 2 serves");
  });

  test("serve subtitle with a ball filter singularises the ball-qualified noun", () => {
    const firstOnly = computeVizStats(
      [point({ firstShotLandingX: ZONE_LX["deuce-t"] })],
      "serve",
      { ...EMPTY_VIZ_FILTERS, ball: ["first"] },
      true,
      undefined,
      DEFAULT_BANDS,
      "ft",
    );
    expect(firstOnly.subtitle).toBe("Points won by zone · 1 first serve");

    const secondOnly = computeVizStats(
      [
        point({
          firstShotLandingX: ZONE_LX["deuce-t"],
          firstShotType: "Second Serve",
        }),
      ],
      "serve",
      { ...EMPTY_VIZ_FILTERS, ball: ["second"] },
      true,
      undefined,
      DEFAULT_BANDS,
      "ft",
    );
    expect(secondOnly.subtitle).toBe("Points won by zone · 1 second serve");
  });

  test("return placement subtitle: 0 returns / 1 return / 2 returns", () => {
    const returnPoint = (over: Partial<MatchPoint> = {}) =>
      point({
        serverIsPlayer1: false,
        secondShotLandingX: 0,
        secondShotLandingY: 0,
        secondShotType: "Forehand",
        ...over,
      });

    const zero = computeVizStats(
      [],
      "returnPlacement",
      EMPTY_VIZ_FILTERS,
      true,
      undefined,
      DEFAULT_BANDS,
      "ft",
    );
    expect(zero.subtitle).toBe("Points won by placement · 0 returns");

    const one = computeVizStats(
      [returnPoint()],
      "returnPlacement",
      EMPTY_VIZ_FILTERS,
      true,
      undefined,
      DEFAULT_BANDS,
      "ft",
    );
    expect(one.subtitle).toBe("Points won by placement · 1 return");

    const two = computeVizStats(
      [returnPoint(), returnPoint()],
      "returnPlacement",
      EMPTY_VIZ_FILTERS,
      true,
      undefined,
      DEFAULT_BANDS,
      "ft",
    );
    expect(two.subtitle).toBe("Points won by placement · 2 returns");
  });

  test("return contact subtitle: 0 returns / 1 return / 2 returns", () => {
    const contactPoint = (over: Partial<MatchPoint> = {}) =>
      point({
        serverIsPlayer1: false,
        secondShotLandingX: 0,
        secondShotLandingY: 0,
        secondShotContactX: 0,
        secondShotContactY: 23.77,
        secondShotType: "Forehand",
        ...over,
      });

    const zero = computeVizStats(
      [],
      "returnContact",
      EMPTY_VIZ_FILTERS,
      true,
      undefined,
      DEFAULT_BANDS,
      "ft",
    );
    expect(zero.subtitle).toBe("Points won by contact point · 0 returns");

    const one = computeVizStats(
      [contactPoint()],
      "returnContact",
      EMPTY_VIZ_FILTERS,
      true,
      undefined,
      DEFAULT_BANDS,
      "ft",
    );
    expect(one.subtitle).toBe("Points won by contact point · 1 return");

    const two = computeVizStats(
      [contactPoint(), contactPoint()],
      "returnContact",
      EMPTY_VIZ_FILTERS,
      true,
      undefined,
      DEFAULT_BANDS,
      "ft",
    );
    expect(two.subtitle).toBe("Points won by contact point · 2 returns");
  });
});

test.describe("statsAreEmpty (M4)", () => {
  test("total === 0 is empty", () => {
    const stats = computeVizStats(
      [],
      "serve",
      EMPTY_VIZ_FILTERS,
      true,
      undefined,
      DEFAULT_BANDS,
      "ft",
    );
    expect(statsAreEmpty(stats)).toBe(true);
  });

  test("total > 0 but every row is count 0 (all returns out/net) is still empty", () => {
    // Every landing is outside the singles half-width, so `total` (drawable
    // returns) is > 0 while the Direction/Depth rows all read count 0.
    const outWideReturn = point({
      serverIsPlayer1: false,
      secondShotLandingX: 5.5,
      secondShotLandingY: 4.0,
      secondShotType: "Forehand",
      secondShotResult: "Out",
    });
    const stats = computeVizStats(
      [outWideReturn, outWideReturn],
      "returnPlacement",
      EMPTY_VIZ_FILTERS,
      true,
      undefined,
      DEFAULT_BANDS,
      "ft",
    );
    expect(stats.total).toBeGreaterThan(0);
    expect(stats.groups.every((g) => g.rows.every((r) => r.count === 0))).toBe(
      true,
    );
    expect(statsAreEmpty(stats)).toBe(true);
  });

  test("at least one row with a nonzero count is not empty", () => {
    const stats = computeVizStats(
      [point({ firstShotLandingX: ZONE_LX["deuce-wide"] })],
      "serve",
      EMPTY_VIZ_FILTERS,
      true,
      undefined,
      DEFAULT_BANDS,
      "ft",
    );
    expect(statsAreEmpty(stats)).toBe(false);
  });
});

test.describe("computeVizStats — precomputed result (M2)", () => {
  test("passing computeViz's own result produces the same stats as recomputing it", () => {
    const pts = [
      point({ firstShotLandingX: ZONE_LX["deuce-wide"], wonByPlayer1: true }),
      point({ firstShotLandingX: ZONE_LX["ad-t"], wonByPlayer1: false }),
    ];
    const withoutPrecomputed = computeVizStats(
      pts,
      "serve",
      EMPTY_VIZ_FILTERS,
      true,
      undefined,
      DEFAULT_BANDS,
      "ft",
    );
    const precomputed = computeViz(pts, "serve", EMPTY_VIZ_FILTERS, true);
    const withPrecomputed = computeVizStats(
      pts,
      "serve",
      EMPTY_VIZ_FILTERS,
      true,
      precomputed,
      DEFAULT_BANDS,
      "ft",
    );
    expect(withPrecomputed).toEqual(withoutPrecomputed);
  });
});

test.describe("statRowAnnouncement", () => {
  test("carries a non-empty label for a row from each of the three cuts", () => {
    const serveStats = computeVizStats(
      [point({ firstShotLandingX: ZONE_LX["deuce-wide"] })],
      "serve",
      EMPTY_VIZ_FILTERS,
      true,
      undefined,
      DEFAULT_BANDS,
      "ft",
    );
    const placementStats = computeVizStats(
      [
        point({
          serverIsPlayer1: false,
          secondShotLandingX: 2.5,
          secondShotLandingY: 4.0,
          secondShotType: "Forehand",
        }),
      ],
      "returnPlacement",
      EMPTY_VIZ_FILTERS,
      true,
      undefined,
      DEFAULT_BANDS,
      "ft",
    );
    const contactStats = computeVizStats(
      [
        point({
          serverIsPlayer1: false,
          secondShotLandingX: 0,
          secondShotLandingY: 0,
          secondShotType: "Forehand",
        }),
      ],
      "returnContact",
      EMPTY_VIZ_FILTERS,
      true,
      undefined,
      DEFAULT_BANDS,
      "ft",
    );

    for (const stats of [serveStats, placementStats, contactStats]) {
      for (const group of stats.groups) {
        for (const row of group.rows) {
          const announcement = statRowAnnouncement(row);
          expect(row.label.length).toBeGreaterThan(0);
          expect(announcement).toContain(row.label);
          expect(announcement.startsWith(":")).toBe(false);
          expect(announcement.length).toBeGreaterThan(row.label.length);
        }
      }
    }
  });

  test("exact wording: a row with points, and a row with none", () => {
    const withPoints = {
      key: "crosscourt",
      label: "Crosscourt",
      count: 4,
      won: 4,
      winPct: 100,
    };
    const noPoints = {
      key: "ad-t",
      label: "Ad T",
      count: 0,
      won: 0,
      winPct: null,
    };
    expect(statRowAnnouncement(withPoints)).toBe(
      "Crosscourt: 100% of 4 points won",
    );
    expect(statRowAnnouncement(noPoints)).toBe("Ad T: no points");
  });
});

/* ── G3a: chartAllowedOn ───────────────────────────────────────────────── */

test.describe("chartAllowedOn", () => {
  test("zones is supported on every cut", () => {
    expect(chartAllowedOn("rallyPlacement", "zones")).toBe(true);
    expect(chartAllowedOn("serve", "zones")).toBe(true);
    expect(chartAllowedOn("returnPlacement", "zones")).toBe(true);
    expect(chartAllowedOn("returnContact", "zones")).toBe(true);
    expect(chartAllowedOn("rallyPosition", "zones")).toBe(true);
  });

  test("scatter and heat are legal on every cut", () => {
    const cuts: Cut[] = [
      "serve",
      "returnPlacement",
      "returnContact",
      "rallyPosition",
    ];
    for (const cut of cuts) {
      expect(chartAllowedOn(cut, "scatter")).toBe(true);
      expect(chartAllowedOn(cut, "heat")).toBe(true);
    }
  });
});

/* ── G3a: computeViz — rallyPosition cut ──────────────────────────────── */

test.describe("computeViz — rallyPosition cut", () => {
  test("only shots after the return, struck by the subject, count", () => {
    const pts = [
      point({
        shots: [
          shot({ shotNumber: 1, isPlayer1: true }),
          shot({ shotNumber: 2, isPlayer1: false }),
          shot({ shotNumber: 3, isPlayer1: true, id: "keep-1" }),
          shot({ shotNumber: 4, isPlayer1: false, id: "opponent-shot" }),
          shot({ shotNumber: 5, isPlayer1: true, id: "keep-2" }),
        ],
      }),
    ];
    const r = computeViz(pts, "rallyPosition", EMPTY_VIZ_FILTERS, true);
    expect(r.dots.map((d) => d.id).sort()).toEqual(["keep-1", "keep-2"]);
    expect(r.total).toBe(2);
    expect(r.count).toBe(2);
    expect(r.noun).toBe("shots");
    expect(r.zoneStats).toBeNull();
  });

  /* ── I1: shots are selected by ROLE, not by shot_number ───────────────
   * shot_number is unreliable — a faulted first serve and the second
   * serve actually played can share a number (and the return can collide
   * with it too), and SwingVision emits a `Feed` row at shot_number=0.
   * `pickRallyShots` (serve-return-shots.ts) drops Feed/serve rows, then
   * drops the first remaining row (the return), keeping the rest. */

  test("I1: colliding shotNumbers — the rally shot IS drawn, the return is NOT", () => {
    const pts = [
      point({
        shots: [
          shot({
            shotType: "First Serve",
            shotNumber: 1,
            isPlayer1: true,
            id: "serve1",
          }),
          shot({
            shotType: "Second Serve",
            shotNumber: 1,
            isPlayer1: true,
            id: "serve2",
          }),
          shot({
            shotType: "Forehand",
            shotNumber: 2,
            isPlayer1: true,
            id: "return",
          }),
          shot({
            shotType: "Forehand",
            shotNumber: 2,
            isPlayer1: true,
            id: "rally",
          }),
        ],
      }),
    ];
    const r = computeViz(pts, "rallyPosition", EMPTY_VIZ_FILTERS, true);
    expect(r.dots.map((d) => d.id)).toEqual(["rally"]);
  });

  test("I1: a return sitting at shotNumber 3 is not drawn as a rally shot", () => {
    const pts = [
      point({
        shots: [
          shot({
            shotType: "First Serve",
            shotNumber: 1,
            isPlayer1: true,
            id: "serve",
          }),
          shot({
            shotType: "Forehand",
            shotNumber: 3,
            isPlayer1: true,
            id: "return-at-3",
          }),
          shot({
            shotType: "Forehand",
            shotNumber: 4,
            isPlayer1: true,
            id: "rally-at-4",
          }),
        ],
      }),
    ];
    const r = computeViz(pts, "rallyPosition", EMPTY_VIZ_FILTERS, true);
    expect(r.dots.map((d) => d.id)).toEqual(["rally-at-4"]);
  });

  test("I1: a Feed row at shot_number 0 is dropped, not treated as the return", () => {
    const pts = [
      point({
        shots: [
          shot({
            shotType: "Feed",
            shotNumber: 0,
            isPlayer1: true,
            id: "feed",
          }),
          shot({
            shotType: "First Serve",
            shotNumber: 1,
            isPlayer1: true,
            id: "serve",
          }),
          shot({
            shotType: "Forehand",
            shotNumber: 2,
            isPlayer1: true,
            id: "return",
          }),
          shot({
            shotType: "Forehand",
            shotNumber: 3,
            isPlayer1: true,
            id: "rally",
          }),
        ],
      }),
    ];
    const r = computeViz(pts, "rallyPosition", EMPTY_VIZ_FILTERS, true);
    expect(r.dots.map((d) => d.id)).toEqual(["rally"]);
  });

  test("a shot with null CONTACT coords is skipped, not crashed on", () => {
    const pts = [
      point({
        shots: [
          shot({
            shotNumber: 3,
            isPlayer1: true,
            contactX: null,
            id: "no-contact",
          }),
          shot({ shotNumber: 3, isPlayer1: true, id: "valid" }),
        ],
      }),
    ];
    const r = computeViz(pts, "rallyPosition", EMPTY_VIZ_FILTERS, true);
    expect(r.dots.map((d) => d.id)).toEqual(["valid"]);
    expect(r.total).toBe(1);
  });

  /* ── Task 2d: contactMetrics requires only the contact pair — a missing
   * landing no longer drops the dot (dot counts on returnContact/
   * rallyPosition must go up, never down). */
  test("a shot with a null LANDING still draws — only contact is required now", () => {
    const pts = [
      point({
        shots: [
          shot({ shotNumber: 2, isPlayer1: false, id: "return" }),
          shot({
            shotNumber: 3,
            isPlayer1: true,
            landingX: null,
            landingY: null,
            id: "no-landing",
          }),
        ],
      }),
    ];
    const r = computeViz(pts, "rallyPosition", EMPTY_VIZ_FILTERS, true);
    expect(r.dots.map((d) => d.id)).toEqual(["no-landing"]);
    expect(r.total).toBe(1);
  });

  test("a contact close to the net on the hitter's own side (never crossed it) still draws — the old 'must clear the net' guard is gone", () => {
    const pts = [
      point({
        shots: [
          shot({ shotNumber: 2, isPlayer1: false, id: "return" }),
          shot({
            shotNumber: 3,
            isPlayer1: true,
            id: "close-to-net",
            contactX: 0.2,
            contactY: 10, // near half, close to the net — never crossed it
            landingX: 0.2,
            landingY: 9, // also near half — old landing-based flip wouldn't
            // mirror this, and the old guard (`contactNorm.ly<=NET`) would
            // have dropped it entirely.
          }),
        ],
      }),
    ];
    const r = computeViz(pts, "rallyPosition", EMPTY_VIZ_FILTERS, true);
    expect(r.dots.map((d) => d.id)).toEqual(["close-to-net"]);
    // farEnd = contactY(10) > NET(11.885) = false -> depthM = -contactY = -10
    // (deep inside the hitter's own court, on their own side).
    expect(r.dots[0].depthM).toBeCloseTo(-10, 5);
  });

  test("pool is every point, not gated on who served — the subject's rally shots in a point the OPPONENT served still count", () => {
    const pts = [
      point({
        serverIsPlayer1: false,
        shots: [
          shot({ shotNumber: 2, isPlayer1: false, id: "return" }),
          shot({ shotNumber: 3, isPlayer1: true, id: "returner-rally" }),
        ],
      }),
    ];
    const r = computeViz(pts, "rallyPosition", EMPTY_VIZ_FILTERS, true);
    expect(r.dots.map((d) => d.id)).toEqual(["returner-rally"]);
  });

  test("outcome is the subject's own point result — a player-1 viewer", () => {
    const pts = [
      point({
        wonByPlayer1: true,
        shots: [
          shot({ shotNumber: 2, isPlayer1: false, id: "return" }),
          shot({ shotNumber: 3, isPlayer1: true, id: "won-shot" }),
        ],
      }),
      point({
        wonByPlayer1: false,
        shots: [
          shot({ shotNumber: 2, isPlayer1: false, id: "return" }),
          shot({ shotNumber: 3, isPlayer1: true, id: "lost-shot" }),
        ],
      }),
    ];
    const r = computeViz(pts, "rallyPosition", EMPTY_VIZ_FILTERS, true);
    const byId = new Map(r.dots.map((d) => [d.id, d]));
    expect(byId.get("won-shot")?.outcome).toBe("won");
    expect(byId.get("lost-shot")?.outcome).toBe("lost");
    // No "miss" class for rally dots.
    expect(r.dots.every((d) => d.outcome !== "miss")).toBe(true);
  });

  test("outcome flips for a player-2 viewer", () => {
    const pts = [
      point({
        wonByPlayer1: true, // player 1 won -> player 2 (the subject) lost
        shots: [
          shot({ shotNumber: 2, isPlayer1: true, id: "return" }),
          shot({ shotNumber: 3, isPlayer1: false, id: "p2-shot" }),
        ],
      }),
    ];
    const r = computeViz(pts, "rallyPosition", EMPTY_VIZ_FILTERS, false);
    expect(r.dots[0].outcome).toBe("lost");
  });

  test("outcome for the opponent subject reads the OTHER player's result", () => {
    const pts = [
      point({
        wonByPlayer1: true,
        shots: [
          shot({ shotNumber: 2, isPlayer1: true, id: "return" }),
          shot({ shotNumber: 3, isPlayer1: false, id: "opp-shot" }),
        ],
      }),
    ];
    const opponentSubject = subjectFor(
      { ...EMPTY_VIZ_FILTERS, player: "opponent" },
      true,
    );
    expect(opponentSubject).toBe(false);
    const r = computeViz(
      pts,
      "rallyPosition",
      { ...EMPTY_VIZ_FILTERS, player: "opponent" },
      opponentSubject,
    );
    // Player 1 won the point, subject is player 2 -> subject lost.
    expect(r.dots[0].outcome).toBe("lost");
  });

  test("dot metrics match the same conversion pointToReturnDots uses for contact", () => {
    // contactX=0.5, contactY=22.0, landingY=4.0 (< net, no flip):
    // lateralM = -0.5, depthM = 22.0 - 23.77 = -1.77 (inside the court).
    const pts = [
      point({
        shots: [
          shot({ shotNumber: 2, isPlayer1: false, id: "return" }),
          shot({ shotNumber: 3, isPlayer1: true, id: "s" }),
        ],
      }),
    ];
    const r = computeViz(pts, "rallyPosition", EMPTY_VIZ_FILTERS, true);
    expect(r.dots[0].lateralM).toBeCloseTo(-0.5, 5);
    expect(r.dots[0].depthM).toBeCloseTo(-1.77, 5);
  });

  test("shape follows the shot's own shotType, backhand -> triangle", () => {
    const pts = [
      point({
        shots: [
          shot({ shotNumber: 2, isPlayer1: false, id: "return" }),
          shot({
            shotNumber: 3,
            isPlayer1: true,
            id: "fh",
            shotType: "Forehand",
          }),
          shot({
            shotNumber: 3,
            isPlayer1: true,
            id: "bh",
            shotType: "Backhand Slice",
          }),
          shot({ shotNumber: 3, isPlayer1: true, id: "bh2", shotType: "bh" }),
        ],
      }),
    ];
    const r = computeViz(pts, "rallyPosition", EMPTY_VIZ_FILTERS, true);
    const byId = new Map(r.dots.map((d) => [d.id, d]));
    expect(byId.get("fh")?.shape).toBe("circle");
    expect(byId.get("bh")?.shape).toBe("triangle");
    expect(byId.get("bh2")?.shape).toBe("triangle");
  });

  test("total counts every qualifying shot before filtering; count only the filtered ones", () => {
    const pts = [
      point({
        isBreakPoint: true,
        shots: [
          shot({ shotNumber: 2, isPlayer1: false, id: "return" }),
          shot({ shotNumber: 3, isPlayer1: true, id: "bp-shot" }),
        ],
      }),
      point({
        isBreakPoint: false,
        shots: [
          shot({ shotNumber: 2, isPlayer1: false, id: "return" }),
          shot({ shotNumber: 3, isPlayer1: true, id: "regular-shot" }),
        ],
      }),
    ];
    const r = computeViz(
      pts,
      "rallyPosition",
      { ...EMPTY_VIZ_FILTERS, pressure: ["break"] },
      true,
    );
    expect(r.total).toBe(2);
    expect(r.count).toBe(1);
    expect(r.dots.map((d) => d.id)).toEqual(["bp-shot"]);
  });

  test("the ball filter reads the serve-frame meaning (first/second serve point)", () => {
    const firstServePoint = point({
      firstShotType: "First Serve",
      shots: [
        shot({ shotNumber: 2, isPlayer1: false, id: "return" }),
        shot({ shotNumber: 3, isPlayer1: true, id: "on-first" }),
      ],
    });
    const secondServePoint = point({
      firstShotType: "Second Serve",
      shots: [
        shot({ shotNumber: 2, isPlayer1: false, id: "return" }),
        shot({ shotNumber: 3, isPlayer1: true, id: "on-second" }),
      ],
    });
    const r = computeViz(
      [firstServePoint, secondServePoint],
      "rallyPosition",
      { ...EMPTY_VIZ_FILTERS, ball: ["first"] },
      true,
    );
    expect(r.dots.map((d) => d.id)).toEqual(["on-first"]);
  });

  test("filterKeysFor(rallyPosition) has no zone key (serve-only concept)", () => {
    expect(filterKeysFor("rallyPosition")).not.toContain("zone");
  });

  test("the court filter reads the score-based side, not the serve's landing side", () => {
    // pointScore "15-0" -> SCORE_MAP sums to 1 (odd) -> score-based side is
    // "ad". firstShotLandingX stays at the point() default (-1.0), which
    // reads as serve-frame side "deuce". Before the fix, computeRallyViz
    // passed a single "serve" frame into pointMatchesFilters for BOTH ball
    // and court, so `court: ["ad"]` incorrectly fell back to the serve's
    // landing side ("deuce") and dropped this point. It must match on the
    // score-based side instead, same as the return cuts.
    const pts = [
      point({
        pointScore: "15-0",
        shots: [
          shot({ shotNumber: 2, isPlayer1: false, id: "return" }),
          shot({ shotNumber: 3, isPlayer1: true, id: "ad-side" }),
        ],
      }),
    ];
    const r = computeViz(
      pts,
      "rallyPosition",
      { ...EMPTY_VIZ_FILTERS, court: ["ad"] },
      true,
    );
    expect(r.dots.map((d) => d.id)).toEqual(["ad-side"]);
    expect(r.count).toBe(1);
  });

  test("a rally shot's contact near the net (Task 2d: contactMetrics reads only contactY, never the landing)", () => {
    // contactY (1.77) is near-half (<= REAL_NET_Y), so farEnd = false:
    // lateralM = contactX (unflipped) = 0.5, depthM = -contactY = -1.77.
    // landingX/Y below are deliberately far-end-looking (would have driven
    // the OLD landing-based `didFlip`) to prove `contactMetrics` no longer
    // reads them at all — only `contactY` decides the sign.
    const pts = [
      point({
        shots: [
          shot({ shotNumber: 2, isPlayer1: false, id: "return" }),
          shot({
            shotNumber: 3,
            isPlayer1: true,
            id: "far-end",
            contactX: 0.5,
            contactY: 1.77,
            landingX: -0.5,
            landingY: 19.77,
          }),
        ],
      }),
    ];
    const r = computeViz(pts, "rallyPosition", EMPTY_VIZ_FILTERS, true);
    expect(r.dots).toHaveLength(1);
    expect(r.dots[0].lateralM).toBeCloseTo(0.5, 5);
    expect(r.dots[0].depthM).toBeCloseTo(-1.77, 5);
  });
});

/* ── heat-blob rewrite: `VizResult` carries no binned grid any more — the
 * density heatmap (`court-art.tsx`'s `HeatFilterDef`) draws straight off the
 * SAME `dots` every other chart uses, so there's nothing cut-specific left
 * to test at this layer (the per-frame maths that WAS here —
 * `heatDotRadiusFor`, the ramp tables, the filter region — moved to
 * `court-geometry.ts` and is covered by `tests/court-geometry.spec.ts`). ── */

/* ── G3a: computeVizStats — rallyPosition cut ─────────────────────────── */

test.describe("computeVizStats — rallyPosition cut", () => {
  test("reuses the depth-band + Forehand/Backhand builder, with rally copy", () => {
    const pts = [
      point({
        wonByPlayer1: true,
        shots: [
          shot({ shotNumber: 2, isPlayer1: false, id: "return" }),
          shot({
            shotNumber: 3,
            isPlayer1: true,
            id: "s1",
            shotType: "Forehand",
          }),
        ],
      }),
    ];
    const stats = computeVizStats(
      pts,
      "rallyPosition",
      EMPTY_VIZ_FILTERS,
      true,
      undefined,
      DEFAULT_BANDS,
      "ft",
    );
    expect(stats.title).toBe("Where rally shots were struck");
    expect(stats.total).toBe(1);
    const groupKeys = stats.groups.map((g) => g.key).sort();
    expect(groupKeys).toEqual(["depth", "stroke"]);
    const stroke = stats.groups.find((g) => g.key === "stroke")!;
    const forehandRow = stroke.rows.find((r) => r.key === "forehand")!;
    expect(forehandRow.count).toBe(1);
    expect(forehandRow.won).toBe(1);
  });
});

/* ── Task 2 (Phase 2A): VizDot.meta — the fullscreen hover readout ──────── */

test.describe("VizDot.meta — serve cut", () => {
  test("carries the point's own score/set fields and the resolved serve shot's type/result/speed", () => {
    const p = point({
      id: "pt-1",
      setNumber: 2,
      pointScore: "30-15",
      gameScore: "2-1",
      serverIsPlayer1: true,
      wonByPlayer1: true,
      shots: [
        {
          id: "serve-shot",
          shotNumber: 1,
          isPlayer1: true,
          shotType: "First Serve",
          spinType: null,
          speedMph: 118,
          zone: null,
          result: "In",
          videoTime: null,
          bounceVideoTime: null,
          contactX: 0,
          contactY: 20.0,
          landingX: -1.0,
          landingY: 8.0,
        },
      ],
    });
    const r = computeViz([p], "serve", EMPTY_VIZ_FILTERS, true);
    expect(r.dots).toHaveLength(1);
    const meta = r.dots[0].meta!;
    expect(meta).toBeDefined();
    expect(meta.setNumber).toBe(2);
    expect(meta.pointScore).toBe("30-15");
    expect(meta.wonBySubject).toBe(true);
    expect(meta.shotType).toBe("First Serve");
    expect(meta.result).toBe("In");
    expect(meta.speedMph).toBe(118);
    expect(meta.isAce).toBe(false);
  });

  // Fix round 1: the ace is a POINT fact, and the readout could never reach it
  // through the shot's own `result` (an ace's serve row still reads "In").
  // `meta.isAce` and the star shape come from the same expression, so this
  // asserts they agree rather than asserting each separately.
  test("isAce tracks the star shape exactly — both off MatchPoint.resultType", () => {
    const ace = point({
      serverIsPlayer1: true,
      wonByPlayer1: true,
      resultType: "Ace",
    });
    const plain = point({ serverIsPlayer1: true, wonByPlayer1: true });

    const aceResult = computeViz([ace], "serve", EMPTY_VIZ_FILTERS, true);
    expect(aceResult.dots[0].shape).toBe("star");
    expect(aceResult.dots[0].meta!.isAce).toBe(true);
    // The shot row itself never says "Ace" — that is the whole point.
    expect(aceResult.dots[0].meta!.result).not.toBe("Ace");

    const plainResult = computeViz([plain], "serve", EMPTY_VIZ_FILTERS, true);
    expect(plainResult.dots[0].shape).not.toBe("star");
    expect(plainResult.dots[0].meta!.isAce).toBe(false);
  });

  test("isAce is false on every non-serve cut — no other cut has aces", () => {
    const p = point({ serverIsPlayer1: false, wonByPlayer1: true });
    for (const cut of ["returnPlacement", "returnContact"] as const) {
      const r = computeViz([p], cut, EMPTY_VIZ_FILTERS, true);
      for (const dot of r.dots) expect(dot.meta!.isAce).toBe(false);
    }
  });

  test("wonBySubject flips for a player-2 viewer (guardrails §4: never a literal 'player1' check)", () => {
    const p = point({ serverIsPlayer1: true, wonByPlayer1: true });
    const asServer = computeViz([p], "serve", EMPTY_VIZ_FILTERS, true);
    const asOpponent = computeViz([p], "serve", EMPTY_VIZ_FILTERS, false);
    // Only the server's own serves draw on "serve" — flip who served too,
    // so both subjects actually get a dot to compare.
    const p2 = point({ serverIsPlayer1: false, wonByPlayer1: false });
    const opponentServes = computeViz([p2], "serve", EMPTY_VIZ_FILTERS, false);
    expect(asServer.dots[0].meta!.wonBySubject).toBe(true);
    expect(opponentServes.dots[0].meta!.wonBySubject).toBe(true);
    expect(asOpponent.dots).toHaveLength(0); // player 2 didn't serve this point
  });

  test("speedMph is null, never fabricated, when the shot row carries no speed", () => {
    const p = point({ serverIsPlayer1: true, wonByPlayer1: true });
    const r = computeViz([p], "serve", EMPTY_VIZ_FILTERS, true);
    expect(r.dots[0].meta!.speedMph).toBeNull();
  });

  /**
   * Fix round 1: `serveShot` (`pickServeShotBy`'s result) is `undefined`
   * whenever the point has no `shots` row at all — the dot still draws off
   * `p.firstShotLandingX/Y`/`p.firstShotResult` via `classifyServePlacement`'s
   * own fallback path, but `meta` used to go blank instead of falling back
   * the same way the return branch already did.
   */
  test("falls back to the flattened firstShotType/firstShotResult when the point has no shots row at all", () => {
    const p = point({
      serverIsPlayer1: true,
      wonByPlayer1: true,
      firstShotType: "First Serve",
      firstShotResult: "In",
      firstShotLandingX: -1.0,
      firstShotLandingY: 8.0,
      shots: [], // no shots row to resolve a serve shot from
    });
    const r = computeViz([p], "serve", EMPTY_VIZ_FILTERS, true);
    expect(r.dots).toHaveLength(1);
    const meta = r.dots[0].meta!;
    expect(meta.shotType).toBe("First Serve");
    expect(meta.result).toBe("In");
    expect(meta.speedMph).toBeNull();
  });
});

test.describe("VizDot.meta — return cuts", () => {
  const withReturnShot = point({
    id: "pt-return",
    setNumber: 1,
    pointScore: "0-0",
    gameScore: "1-0",
    serverIsPlayer1: false,
    wonByPlayer1: true,
    secondShotLandingX: 1.2,
    secondShotLandingY: 4.0,
    secondShotContactX: 0.5,
    secondShotContactY: 23.0,
    secondShotType: "Forehand",
    secondShotResult: "In",
    shots: [
      {
        id: "serve-row",
        shotNumber: 1,
        isPlayer1: false,
        shotType: "First Serve",
        spinType: null,
        speedMph: null,
        zone: null,
        result: "In",
        videoTime: null,
        bounceVideoTime: null,
        contactX: 0,
        contactY: 2.0,
        landingX: 1.0,
        landingY: 15.0,
      },
      {
        id: "return-row",
        shotNumber: 2,
        isPlayer1: true,
        shotType: "Forehand",
        spinType: null,
        speedMph: 72,
        zone: null,
        result: "In",
        videoTime: null,
        bounceVideoTime: null,
        contactX: 0.5,
        contactY: 23.0,
        landingX: 1.2,
        landingY: 4.0,
      },
    ],
  });

  test("returnPlacement meta resolves the return shot's own type/result/speed by role", () => {
    const r = computeViz(
      [withReturnShot],
      "returnPlacement",
      EMPTY_VIZ_FILTERS,
      true,
    );
    const meta = r.dots[0].meta!;
    expect(meta.setNumber).toBe(1);
    expect(meta.pointScore).toBe("0-0");
    expect(meta.wonBySubject).toBe(true);
    expect(meta.shotType).toBe("Forehand");
    expect(meta.result).toBe("In");
    expect(meta.speedMph).toBe(72);
  });

  test("returnContact meta reads the SAME resolved return shot as returnPlacement", () => {
    const r = computeViz(
      [withReturnShot],
      "returnContact",
      EMPTY_VIZ_FILTERS,
      true,
    );
    const meta = r.dots[0].meta!;
    expect(meta.shotType).toBe("Forehand");
    expect(meta.speedMph).toBe(72);
  });

  test("falls back to the flattened secondShotType/secondShotResult when the point has no resolvable return `shots` row, with speedMph null (no flattened speed field exists to read)", () => {
    const noShotsRow = point({
      serverIsPlayer1: false,
      wonByPlayer1: true,
      secondShotLandingX: 1.2,
      secondShotLandingY: 4.0,
      secondShotContactX: 0.5,
      secondShotContactY: 23.0,
      secondShotType: "Backhand Slice",
      secondShotResult: "In",
    });
    const r = computeViz(
      [noShotsRow],
      "returnPlacement",
      EMPTY_VIZ_FILTERS,
      true,
    );
    const meta = r.dots[0].meta!;
    expect(meta.shotType).toBe("Backhand Slice");
    expect(meta.result).toBe("In");
    expect(meta.speedMph).toBeNull();
  });
});

test.describe("VizDot.meta — rallyPosition cut", () => {
  test("carries the point's fields and the struck shot's own type/result/speed", () => {
    const p = point({
      id: "pt-rally",
      setNumber: 3,
      pointScore: "40-30",
      gameScore: "3-2",
      wonByPlayer1: false,
      shots: [
        shot({ shotNumber: 2, isPlayer1: false, id: "return" }),
        shot({
          shotNumber: 3,
          isPlayer1: true,
          id: "s1",
          shotType: "Backhand",
          result: "Winner",
          speedMph: 61,
        }),
      ],
    });
    // subjectIsPlayer1=false, wonByPlayer1=false -> subject won.
    const r = computeViz([p], "rallyPosition", EMPTY_VIZ_FILTERS, false);
    expect(r.dots).toHaveLength(0); // the subject (player2) struck no rally shot here
    const rSubjectHit = computeViz(
      [p],
      "rallyPosition",
      EMPTY_VIZ_FILTERS,
      true,
    );
    expect(rSubjectHit.dots).toHaveLength(1);
    const meta = rSubjectHit.dots[0].meta!;
    expect(meta.setNumber).toBe(3);
    expect(meta.pointScore).toBe("40-30");
    expect(meta.wonBySubject).toBe(false); // subject=player1, wonByPlayer1=false -> lost
    expect(meta.shotType).toBe("Backhand");
    expect(meta.result).toBe("Winner");
    expect(meta.speedMph).toBe(61);
  });
});
