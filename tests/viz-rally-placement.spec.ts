import { expect, test } from "@playwright/test";
import {
  computeViz,
  computeVizStats,
  EMPTY_VIZ_FILTERS,
} from "@/components/dashboard/matches/match-detail/shots/viz-model";
import { buildDefaultTiles } from "@/components/dashboard/matches/match-detail/shots/default-tiles";
import {
  heatBoundsFor,
  projectViewerDot,
  viewerInitialTransform,
  VIEWER_COURT,
} from "@/components/dashboard/matches/match-detail/shots/court-geometry";
import { bandKindFor } from "@/components/dashboard/matches/match-detail/shots/viz-bands-menu";
import {
  parseVizState,
  vizStateQuery,
} from "@/components/dashboard/matches/match-detail/shots/viz-url";
import { rowToSavedView, validateVizInput } from "@/lib/data/saved-views-logic";
import { DEFAULT_BANDS } from "@/lib/data/viz-bands";
import { RALLY_POINTS, rallyShot } from "./fixtures/viz-rally-points";

test("rally placement counts each role-resolved landing for either player at both ends", () => {
  for (const player1 of [true, false]) {
    const result = computeViz(
      RALLY_POINTS,
      "rallyPlacement",
      EMPTY_VIZ_FILTERS,
      player1,
    );
    expect(result.count).toBe(6);
    expect(result.total).toBe(6);
    expect(result.noun).toBe("shots");
    const names = player1
      ? ["p1-deep", "p1-wide", "p1-net"]
      : ["p2-short", "p2-net", "p2-deep"];
    expect(result.dots.map((d) => d.id)).toEqual(
      ["low", "high"].flatMap((end) => names.map((n) => `${end}-${n}`)),
    );
    const expected = player1
      ? [
          [-2.7, 10, false, "won"],
          [5, 8, false, "miss"],
          [-1.2, -0.4, true, "miss"],
        ]
      : [
          [1.4, 3, false, "lost"],
          [-0.8, 2, true, "miss"],
          [-3, 9, false, "lost"],
        ];
    for (let i = 0; i < 6; i++) {
      const dot = result.dots[i];
      const [lateral, depth, net, outcome] = expected[i % 3];
      expect(dot.lateralM).toBeCloseTo(lateral as number);
      expect(dot.depthM).toBeCloseTo(depth as number);
      expect(dot.atNet).toBe(net);
      expect(dot.outcome).toBe(outcome);
      expect(dot.meta?.wonBySubject).toBe(player1);
      expect(dot.meta?.pointId).toBe(dot.id.split("-")[0]);
      expect(projectViewerDot("rallyPlacement", dot)).toEqual(
        projectViewerDot("returnPlacement", dot),
      );
      if (net)
        expect(projectViewerDot("rallyPlacement", dot).y).toBe(
          VIEWER_COURT.netY,
        );
    }
    const filtered = computeViz(
      RALLY_POINTS,
      "rallyPlacement",
      { ...EMPTY_VIZ_FILTERS, set: [2] },
      player1,
    );
    expect(filtered.count).toBe(3);
    expect(filtered.total).toBe(6);
    expect(filtered.dots.every((d) => d.id.startsWith("high-"))).toBe(true);
    // Placement requires landing/end, contact does not require a landing.
    const contact = computeViz(
      RALLY_POINTS,
      "rallyPosition",
      EMPTY_VIZ_FILTERS,
      player1,
    );
    expect(
      contact.dots.some((d) =>
        d.id.includes(player1 ? "missing-landing" : "invalid"),
      ),
    ).toBe(true);
  }
});

test("missing and nonfinite axes never draw, long landings are misses, boundaries are in", () => {
  const point = RALLY_POINTS[0];
  const prefix = point.shots!.slice(0, 3);
  const result = computeViz(
    [
      {
        ...point,
        shots: [
          ...prefix,
          rallyShot("line", true, false, 4.115, 11.885, { result: null }),
          rallyShot("long", true, false, 1, 12, { result: null }),
          rallyShot("no-y", true, false, 1, 3, { landingY: null }),
          rallyShot("nan-x", true, false, 1, 3, { landingX: Infinity }),
          rallyShot("nan-end", true, false, 1, 3, { contactY: NaN }),
        ],
      },
    ],
    "rallyPlacement",
    EMPTY_VIZ_FILTERS,
    true,
  );
  expect(result.dots.map((d) => [d.id, d.outcome])).toEqual([
    ["line", "won"],
    ["long", "miss"],
  ]);
});

test("placement stats use landing depth and exclude misses from row denominators", () => {
  const stats = computeVizStats(
    RALLY_POINTS,
    "rallyPlacement",
    EMPTY_VIZ_FILTERS,
    true,
    undefined,
    DEFAULT_BANDS,
    "m",
  );
  expect(stats.total).toBe(6);
  expect(stats.title).toBe("Where rally shots landed");
  expect(stats.subtitle).toContain("2 of 6 shots landed in");
  expect(
    stats.groups
      .flatMap((g) => g.rows)
      .reduce((sum, row) => sum + row.count, 0),
  ).toBe(2);
  expect(bandKindFor("rallyPlacement")).toBe("depth");
  expect(heatBoundsFor("rallyPlacement")).toEqual(
    heatBoundsFor("returnPlacement"),
  );
  expect(viewerInitialTransform("rallyPlacement", { w: 900, h: 700 })).toEqual(
    viewerInitialTransform("returnPlacement", { w: 900, h: 700 }),
  );
});

for (const chart of ["scatter", "heat"] as const) {
  test(`rally placement ${chart} round-trips URL and stored views without changing existing cuts`, () => {
    const state = {
      cut: "rallyPlacement" as const,
      chart,
      filters: { ...EMPTY_VIZ_FILTERS, player: "opponent" as const, set: [2] },
      viewId: "view-1",
    };
    expect(
      parseVizState(
        new URLSearchParams(vizStateQuery(new URLSearchParams(), state)),
      ),
    ).toEqual(state);
    expect(validateVizInput(state)).toEqual({
      cut: state.cut,
      chart,
      filters: state.filters,
    });
    const row = {
      id: "view-1",
      name: "Rallies",
      cut: state.cut,
      chart,
      filters: state.filters,
      sort_order: 2,
      shared: false,
      created_by: "user-1",
      created_at: "2026-09-23",
    };
    expect(rowToSavedView(row)).toEqual({
      id: "view-1",
      name: "Rallies",
      cut: state.cut,
      chart,
      filters: state.filters,
      order: 2,
    });
    for (const cut of [
      "serve",
      "returnPlacement",
      "returnContact",
      "rallyPosition",
    ])
      expect(rowToSavedView({ ...row, cut })?.cut).toBe(cut);
  });
}

test("default previews include independent rally placement tiles for both subjects", () => {
  const tiles = buildDefaultTiles(
    RALLY_POINTS,
    {
      you: { name: "P2", isPlayer1: false },
      opp: { name: "P1", isPlayer1: true },
    },
    (state) => vizStateQuery(new URLSearchParams(), state),
  );
  const rallies = tiles.filter((t) => t.cut === "rallyPlacement");
  expect(tiles).toHaveLength(8);
  expect(rallies.map((t) => t.key)).toEqual([
    "you:rallyPlacement",
    "opponent:rallyPlacement",
  ]);
  expect(rallies.map((t) => t.dots[0].id)).toEqual([
    "low-p2-short",
    "low-p1-deep",
  ]);
  for (const tile of rallies)
    expect(parseVizState(new URLSearchParams(tile.href))).toEqual(tile.state);
});
