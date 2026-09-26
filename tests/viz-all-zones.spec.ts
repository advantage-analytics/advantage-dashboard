import { expect, test } from "@playwright/test";
import {
  bandZonesFor,
  computeViz,
  computeVizStats,
  EMPTY_VIZ_FILTERS,
  type Cut,
  type VizDot,
  type VizResult,
} from "@/components/dashboard/matches/match-detail/shots/viz-model";
import { DEFAULT_BANDS } from "@/lib/data/viz-bands";
import {
  parseVizState,
  vizStateQuery,
} from "@/components/dashboard/matches/match-detail/shots/viz-url";
import { RALLY_POINTS } from "./fixtures/viz-rally-points";

const cuts: Cut[] = [
  "serve",
  "returnPlacement",
  "returnContact",
  "rallyPlacement",
  "rallyPosition",
];
for (const cut of cuts) {
  test(`${cut} Zones URL round-trip preserves filters and subject`, () => {
    const state = {
      cut,
      chart: "zones" as const,
      filters: { ...EMPTY_VIZ_FILTERS, player: "opponent" as const, set: [2] },
      viewId: "saved-zone",
    };
    const query = vizStateQuery(new URLSearchParams(), state);
    expect(parseVizState(new URLSearchParams(query))).toMatchObject(state);
  });
  test(`${cut} bands read the exact filtered statistics including empties`, () => {
    for (const subject of [true, false])
      for (const set of [[], [2], [99]]) {
        const filters = { ...EMPTY_VIZ_FILTERS, set };
        const result = computeViz(RALLY_POINTS, cut, filters, subject, "zones");
        const stats = computeVizStats(
          RALLY_POINTS,
          cut,
          filters,
          subject,
          result,
          DEFAULT_BANDS,
          "ft",
        );
        const zones = bandZonesFor(cut, DEFAULT_BANDS, "ft", stats);
        if (cut === "serve") expect(zones).toBeNull();
        else {
          expect(zones?.statRows).toBe(
            stats.groups.find((g) => g.key === "depth")!.rows,
          );
          if (set[0] === 99)
            expect(
              zones?.statRows?.every((r) => r.count === 0 && r.winPct === null),
            ).toBe(true);
        }
      }
  });
}

function resultAt(depths: number[]): VizResult {
  const dots: VizDot[] = depths.map((depthM, i) => ({
    id: `d${i}`,
    depthM,
    lateralM: 0,
    outcome: i % 2 ? "lost" : "won",
    shape: "circle",
    atNet: false,
  }));
  return {
    dots,
    count: dots.length,
    total: dots.length,
    noun: "shots",
    zoneStats: null,
  };
}
for (const cut of [
  "returnPlacement",
  "rallyPlacement",
  "returnContact",
  "rallyPosition",
] as const) {
  test(`${cut} boundaries and band changes use the existing bucketers`, () => {
    const placement = cut.endsWith("Placement");
    const metric = (ft: number) =>
      placement ? 11.885 - ft * 0.3048 : ft * 0.3048;
    const depths = [-0.001, 0, 0.001, 4.999, 5, 5.001].map(metric);
    const bands = {
      ...DEFAULT_BANDS,
      depthScheme: "custom" as const,
      depthDividersFt: [5, 10] as [number, number],
      contactDividersFt: [0, 5] as [number, number],
    };
    const statsFor = (b: typeof bands) =>
      computeVizStats(
        [],
        cut,
        EMPTY_VIZ_FILTERS,
        true,
        resultAt(depths),
        b,
        "ft",
      );
    const before = bandZonesFor(cut, bands, "ft", statsFor(bands))!;
    expect(before.statRows?.reduce((n, r) => n + r.count, 0)).toBe(
      placement ? 5 : 6,
    );
    expect(
      before.rows.map(
        (r) => before.statRows!.find((s) => s.key === r.key)!.count,
      ),
    ).toEqual(placement ? [4, 1, 0] : [1, 3, 2]);
    const changed = {
      ...bands,
      depthDividersFt: [3, 8] as [number, number],
      contactDividersFt: [1, 4] as [number, number],
    };
    const after = bandZonesFor(cut, changed, "ft", statsFor(changed))!;
    expect(after.dividersFt).not.toEqual(before.dividersFt);
    expect(after.rows).not.toEqual(before.rows);
    expect(after.statRows?.map((r) => [r.key, r.count]).sort()).not.toEqual(
      before.statRows?.map((r) => [r.key, r.count]).sort(),
    );
    const empty = computeVizStats(
      [],
      cut,
      EMPTY_VIZ_FILTERS,
      true,
      resultAt([]),
      changed,
      "m",
    );
    expect(
      bandZonesFor(cut, changed, "m", empty)?.statRows?.every(
        (r) => r.winPct === null,
      ),
    ).toBe(true);
  });
}

test("No depth bands keeps statistics and Zones equally empty", () => {
  const bands = { ...DEFAULT_BANDS, depthScheme: "none" as const };
  for (const cut of ["returnPlacement", "rallyPlacement"] as const) {
    const stats = computeVizStats(
      [],
      cut,
      EMPTY_VIZ_FILTERS,
      true,
      resultAt([5]),
      bands,
      "ft",
    );
    expect(stats.groups.find((g) => g.key === "depth")).toBeUndefined();
    expect(bandZonesFor(cut, bands, "ft", stats)).toBeNull();
  }
});

test("Hiding contact bands preserves the statistics and hides Zones consistently", () => {
  for (const cut of ["returnContact", "rallyPosition"] as const) {
    const stats = computeVizStats(
      [],
      cut,
      EMPTY_VIZ_FILTERS,
      true,
      resultAt([0, 2]),
      DEFAULT_BANDS,
      "ft",
    );
    expect(bandZonesFor(cut, DEFAULT_BANDS, "ft", stats, true)).toBeNull();
    expect(
      bandZonesFor(cut, DEFAULT_BANDS, "ft", stats, false)?.statRows?.reduce(
        (n, r) => n + r.count,
        0,
      ),
    ).toBe(2);
  }
});
