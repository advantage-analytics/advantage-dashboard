import { expect, test } from "@playwright/test";
import {
  computeViz,
  computeVizStats,
  deriveZoneFromX,
  EMPTY_VIZ_FILTERS,
  subjectFor,
} from "@/components/dashboard/matches/match-detail/shots/viz-model";
import {
  projectServeMetricDot,
  projectViewerDot,
  zoneCellX,
} from "@/components/dashboard/matches/match-detail/shots/court-geometry";
import { DEFAULT_BANDS } from "@/lib/data/viz-bands";
import {
  classifyZone,
  computeZoneStats,
  pointToServeDot,
} from "@/lib/data/serve-zones";
import {
  ASYMMETRIC_SERVES,
  SERVE_ZONE_KEYS,
  servePoint,
} from "./fixtures/viz-serve-points";

for (const player1 of [true, false]) {
  for (const highEnd of [false, true]) {
    test(`source orientation, membership and percentages: player ${player1 ? 1 : 2}, ${highEnd ? "high" : "low"} end`, () => {
      const filters = { ...EMPTY_VIZ_FILTERS, set: [highEnd ? 2 : 1] };
      const result = computeViz(ASYMMETRIC_SERVES, "serve", filters, player1);
      expect(result.total).toBe(42);
      expect(result.count).toBe(21);
      SERVE_ZONE_KEYS.forEach((key, index) => {
        const count = player1 ? index + 1 : 6 - index;
        const stats = result.zoneStats![key];
        expect(stats.count).toBe(count);
        expect(stats.pct).toBe(Math.round((100 * count) / 21));
        expect(stats.winPct).toBe(Math.round(100 / count));
        expect(stats.first + stats.second).toBe(count);
        const members = result.dots.filter((d) => d.id.includes(`-${index}-`));
        expect(members).toHaveLength(count);
        const cell = zoneCellX(index);
        for (const dot of members) {
          const focused = projectServeMetricDot({
            lateralM: dot.lateralM,
            depthPastNetM: dot.depthM,
          });
          const fullscreen = projectViewerDot("serve", dot);
          expect(focused.cx).toBeGreaterThan(cell.x1);
          expect(focused.cx).toBeLessThan(cell.x2);
          expect(fullscreen.x).toBeCloseTo(focused.cx, 10);
          expect(fullscreen.y).toBeCloseTo(focused.cy, 10);
        }
      });
    });
  }
}

test("home and team serve dots use contact-based orientation on both ends", () => {
  const laterals = [-3.4, -2.1, -0.4, 0.8, 1.9, 3.7];
  for (const highEnd of [false, true]) {
    const dots = laterals.map((lateral, index) => {
      const point = servePoint({ highEnd, lateral });
      const dot = pointToServeDot({
        ...point,
        firstShotLandingX: point.firstShotLandingX!,
        firstShotLandingY: point.firstShotLandingY!,
        firstShotContactY: point.shots![0].contactY,
      })!;
      expect(dot).not.toBeNull();
      expect(classifyZone(dot.x)).toBe(SERVE_ZONE_KEYS[index]);
      const current = computeViz([point], "serve", EMPTY_VIZ_FILTERS, true);
      expect(current.zoneStats![SERVE_ZONE_KEYS[index]].count).toBe(1);
      return dot;
    });
    const stats = computeZoneStats(dots)!;
    for (const key of SERVE_ZONE_KEYS) {
      expect(stats[key].count).toBe(1);
      expect(stats[key].pct).toBe(17);
    }
  }
});

test("a net fault stays on the server's side when contact is available", () => {
  for (const highEnd of [false, true]) {
    const point = servePoint({
      highEnd,
      lateral: -3.4,
      depth: -0.2,
      result: "Net",
    });
    const dot = pointToServeDot({
      ...point,
      firstShotLandingX: point.firstShotLandingX!,
      firstShotLandingY: point.firstShotLandingY!,
      firstShotContactY: point.shots![0].contactY,
      resultType: "Double Fault",
    })!;
    expect(classifyZone(dot.x)).toBe("deuce-wide");
    expect(dot.y).toBeGreaterThan(1);
  }
});

test("home and team zone thirds and near-line faults agree with source metres", () => {
  const third = 4.115 / 3;
  for (const highEnd of [false, true]) {
    for (const [lateral, zone] of [
      [-4.16, "deuce-wide"],
      [-2 * third, "deuce-body"],
      [-third, "deuce-t"],
      [third, "ad-body"],
      [2 * third, "ad-wide"],
      [4.16, "ad-wide"],
    ] as const) {
      const point = servePoint({ highEnd, lateral, result: "Out" });
      const dot = pointToServeDot({
        ...point,
        firstShotLandingX: point.firstShotLandingX!,
        firstShotLandingY: point.firstShotLandingY!,
        firstShotContactY: point.shots![0].contactY,
      })!;
      expect(dot).not.toBeNull();
      expect(classifyZone(dot.x)).toBe(zone);
    }
  }
});

test("subject, service side, zone, set, ball and result filters share resolved coordinates", () => {
  for (const youIsPlayer1 of [true, false]) {
    for (const player of ["you", "opponent"] as const) {
      const filters = {
        ...EMPTY_VIZ_FILTERS,
        player,
        court: ["deuce"] as const,
        zone: ["wide"] as const,
        set: [2],
        ball: ["first"] as const,
        result: ["won"] as const,
      };
      const subject = subjectFor(filters, youIsPlayer1);
      const result = computeViz(
        ASYMMETRIC_SERVES,
        "serve",
        filters,
        subject,
        "zones",
      );
      expect(result.count).toBe(1);
      expect(result.dots[0].id).toBe(`${subject ? "p1" : "p2"}-high-0-0`);
      expect(result.zoneStats!["deuce-wide"]).toMatchObject({
        count: 1,
        pct: 100,
        winPct: 100,
      });
      const stats = computeVizStats(
        ASYMMETRIC_SERVES,
        "serve",
        filters,
        subject,
        result,
        DEFAULT_BANDS,
        "m",
      );
      expect(
        stats.groups[0].rows.find((r) => r.key === "deuce-wide"),
      ).toMatchObject({ count: 1, won: 1, winPct: 100 });
    }
  }
});

test("exact service thirds and sidelines agree with drawn cells from both ends", () => {
  const third = 4.115 / 3;
  const cases = [
    [0, "t"],
    [third - 1e-7, "t"],
    [third, "body"],
    [2 * third - 1e-7, "body"],
    [2 * third, "wide"],
    [4.115, "wide"],
  ] as const;
  for (const highEnd of [false, true])
    for (const sign of [-1, 1]) {
      for (const [distance, family] of cases) {
        const lateral = distance * sign;
        const point = servePoint({ highEnd, lateral, depth: 6.4 });
        const result = computeViz(
          [point],
          "serve",
          { ...EMPTY_VIZ_FILTERS, zone: [family] },
          true,
        );
        expect(deriveZoneFromX(lateral)).toBe(family);
        expect(result.count).toBe(1);
        const side = lateral < 0 ? "deuce" : "ad";
        const key = `${side}-${family}` as (typeof SERVE_ZONE_KEYS)[number];
        expect(result.zoneStats![key].count).toBe(1);
        const cell = zoneCellX(SERVE_ZONE_KEYS.indexOf(key));
        const projected = projectServeMetricDot({
          lateralM: lateral,
          depthPastNetM: 6.4,
        });
        expect(projected.cx).toBeGreaterThanOrEqual(cell.x1 - 1e-9);
        expect(projected.cx).toBeLessThanOrEqual(cell.x2 + 1e-9);
        expect(projected.cy).toBeCloseTo(116.5);
      }
    }
});

test("faults remain marks but never enter zone frequency or win-rate denominators", () => {
  for (const highEnd of [false, true]) {
    const pts = [
      servePoint({ id: "win", highEnd }),
      servePoint({ id: "loss", highEnd, won: false }),
      servePoint({ id: "wide-fault", highEnd, lateral: -6, result: "Out" }),
      servePoint({ id: "imputed-fault", highEnd, depth: 6.4, result: "Out" }),
      servePoint({ id: "net", highEnd, depth: -0.3, result: "Net" }),
      {
        ...servePoint({
          id: "double-fault",
          highEnd,
          depth: 4,
          result: "Net",
          second: true,
        }),
        resultType: "Double Fault",
      },
    ];
    const result = computeViz(pts, "serve", EMPTY_VIZ_FILTERS, true);
    expect(result.count).toBe(6);
    expect(result.serveOutOrNetCount).toBe(4);
    expect(result.dots.filter((d) => d.atNet)).toHaveLength(2);
    expect(result.zoneStats!["deuce-wide"]).toMatchObject({
      count: 2,
      pct: 100,
      winPct: 50,
      won: 1,
      lost: 1,
      doubleFault: 0,
    });
    expect(
      Object.values(result.zoneStats!).reduce((n, z) => n + z.count, 0),
    ).toBe(2);
    const stats = computeVizStats(
      pts,
      "serve",
      EMPTY_VIZ_FILTERS,
      true,
      result,
      DEFAULT_BANDS,
      "m",
    );
    expect(stats.subtitle).toBe(
      "Points won by zone · 2 of 6 serves landed in · 4 out or into the net",
    );
    const faultsOnly = computeViz(
      pts.slice(2),
      "serve",
      EMPTY_VIZ_FILTERS,
      true,
      "zones",
    );
    expect(
      Object.values(faultsOnly.zoneStats!).every(
        (z) => z.count === 0 && z.pct === 0 && z.winPct === 0,
      ),
    ).toBe(true);
  }
});

test("resolved serve row controls coordinates and filters; missing pairs are never mixed", () => {
  const point = servePoint({ second: true });
  point.firstShotLandingX = 3;
  point.firstShotLandingY = 8;
  point.firstShotType = "First Serve";
  const filters = {
    ...EMPTY_VIZ_FILTERS,
    court: ["deuce"] as const,
    zone: ["wide"] as const,
    ball: ["second"] as const,
  };
  expect(
    computeViz([point], "serve", filters, true).zoneStats!["deuce-wide"].second,
  ).toBe(1);
  for (const invalid of [null, NaN, Infinity]) {
    const missing = {
      ...point,
      shots: [{ ...point.shots![0], landingX: invalid }],
    };
    expect(computeViz([missing], "serve", EMPTY_VIZ_FILTERS, true).count).toBe(
      0,
    );
  }
  const legacy = { ...servePoint(), shots: [] };
  expect(
    computeViz([legacy], "serve", EMPTY_VIZ_FILTERS, true).zoneStats![
      "deuce-wide"
    ].count,
  ).toBe(1);
  legacy.firstShotLandingY = null;
  expect(computeViz([legacy], "serve", EMPTY_VIZ_FILTERS, true).total).toBe(0);
});
