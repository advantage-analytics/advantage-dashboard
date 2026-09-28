import { expect, test } from "@playwright/test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type { MatchPoint } from "@/lib/data/match-points-server";
import {
  EMPTY_MATCH_FILTERS,
  hasActiveMatchFilters,
  type MatchFilters,
} from "@/components/dashboard/matches/match-detail/match-filters/model";
import {
  appliedChips,
  removeChip,
} from "@/components/dashboard/matches/match-detail/match-filters/applied-chips";
import {
  escClosesRail,
  filterRailReducer,
} from "@/components/dashboard/matches/match-detail/match-filters/rail-state";

import { pt } from "./fixtures/film-point";
import { createLoader, marker } from "./fixtures/vm-modules";

/**
 * T6 — the match filters wired into the Statistics view.
 *
 * `StatisticsView` and the real `applied-filters.tsx` (with the real model
 * and chip helpers) render through `createLoader()`; the report, the match
 * data, the sides, the applied filters and the rail are stubbed, and the
 * cards are markers. A static render cannot click, so removing a chip, the
 * button's re-click and Esc are held through the pure `applied-chips.ts` and
 * `rail-state.ts` the components drive their handlers from.
 */

const DETAIL = "@/components/dashboard/matches/match-detail/";

const NAMES = { you: "Rudy", opponent: "Sam" };
const sides = {
  you: { isPlayer1: true, name: "Rudy Stepanov", shortName: NAMES.you },
  opp: { isPlayer1: false, name: "Sam Okafor", shortName: NAMES.opponent },
  sets: [],
};

const POINTS: MatchPoint[] = [1, 2, 3, 4, 5].map((n) =>
  pt({ id: `p${n}`, pointNumber: n }),
);

function filtersWith(overrides: Partial<MatchFilters>): MatchFilters {
  return { ...EMPTY_MATCH_FILTERS, ...overrides };
}

function renderStatistics({
  filters = EMPTY_MATCH_FILTERS,
  filteredPoints = POINTS,
  canFilter,
}: {
  filters?: MatchFilters;
  filteredPoints?: MatchPoint[];
  canFilter?: boolean;
} = {}) {
  const noop = () => {};
  const loader = createLoader({
    stubs: {
      [DETAIL + "match-report-context"]: {
        useMatchReport: () => ({
          meta: { statsPublished: true, isDerived: false, readOnly: false },
          actions: {},
        }),
      },
      [DETAIL + "match-report"]: {
        MatchReport: { Insight: marker("Insight") },
      },
      "@/components/dashboard/matches/match-data-provider": {
        useMatchData: () => ({ points: POINTS, match: {}, statsResult: null }),
      },
      [DETAIL + "use-match-sides"]: { useMatchSides: () => sides },
      [DETAIL + "match-filters/provider"]: {
        useMatchFilters: () => ({
          filters,
          setFilters: noop,
          clearFilters: noop,
          filteredPoints,
          filtersActive: hasActiveMatchFilters(filters),
          context: { youIsPlayer1: true, hands: {} },
        }),
      },
      [DETAIL + "match-filters/filter-rail"]: {
        FILTER_RAIL_ID: "match-filters-rail",
        useFilterRailHost: () => ({
          open: false,
          toggle: noop,
          registerTrigger: noop,
        }),
      },
      [DETAIL + "head-to-head-card"]: {
        HeadToHeadCard: marker("HeadToHeadCard"),
      },
      [DETAIL + "performance-tracker-chart"]: {
        PerformanceTrackerChart: marker("PerformanceTrackerChart"),
      },
      [DETAIL + "rally-length-card"]: {
        RallyLengthCard: marker("RallyLengthCard"),
      },
      [DETAIL + "point-endings-card"]: {
        PointEndingsCard: marker("PointEndingsCard"),
      },
      [DETAIL + "statistics-empty"]: {
        StatisticsEmpty: marker("StatisticsEmpty"),
      },
      [DETAIL + "unpublished-stats-notice"]: {
        UnpublishedStatsNotice: marker("UnpublishedStatsNotice"),
      },
    },
  });
  const { StatisticsView } = loader.load(
    "src/components/dashboard/matches/match-detail/statistics-view.tsx",
  ) as { StatisticsView: React.ComponentType<{ canFilter?: boolean }> };
  return renderToStaticMarkup(
    React.createElement(
      StatisticsView,
      canFilter === undefined ? {} : { canFilter },
    ),
  );
}

/** The Filter button's opening tag, or null when it is not drawn. */
function filterButton(html: string): string | null {
  const match = html.match(
    /<button[^>]*aria-label="Filters[^"]*"[^>]*>.*?<\/button>/,
  );
  return match ? match[0] : null;
}

const TWO_VALUES = filtersWith({ server: "you", serveZone: ["Wide"] });

test.describe("StatisticsView › Filter button", () => {
  test("no filters: one Filter button, no badge, no applied strip", () => {
    const html = renderStatistics();
    const button = filterButton(html);
    expect(button).not.toBeNull();
    expect(button).toContain('aria-label="Filters"');
    expect(button).toContain('aria-expanded="false"');
    expect(html).not.toContain("data-filter-count");
    expect(html).not.toContain('aria-label="Applied filters"');
    // Exactly one — never per-category chips in the header.
    expect(html.match(/aria-label="Filters/g)).toHaveLength(1);
    expect(html).toContain('data-component="HeadToHeadCard"');
  });

  test("two values applied: the badge reads 2", () => {
    const html = renderStatistics({
      filters: TWO_VALUES,
      filteredPoints: POINTS.slice(0, 3),
    });
    const button = filterButton(html);
    expect(button).toContain('aria-label="Filters, 2 applied"');
    expect(button).toMatch(/data-filter-count=""[^>]*>2<\/span>/);
  });

  test("the public page's canFilter={false} draws no Filter button", () => {
    expect(filterButton(renderStatistics({ canFilter: false }))).toBeNull();
    const active = renderStatistics({
      canFilter: false,
      filters: TWO_VALUES,
      filteredPoints: POINTS.slice(0, 3),
    });
    expect(filterButton(active)).toBeNull();
    expect(active).not.toContain("data-filter-count");
  });
});

test.describe("StatisticsView › applied strip", () => {
  test("active filters: N of M points, a removable chip per value, Clear all", () => {
    const html = renderStatistics({
      filters: TWO_VALUES,
      filteredPoints: POINTS.slice(0, 3),
    });
    expect(html).toContain('aria-label="Applied filters"');
    expect(html).toContain("3 of 5 points");
    expect(html).toContain('aria-label="Remove filter: Rudy serving"');
    expect(html).toContain('aria-label="Remove filter: Wide serve"');
    expect(html.match(/>Clear all</g)).toHaveLength(1);
    // The strip sits above the cards it scopes, which still draw.
    expect(html.indexOf("3 of 5 points")).toBeLessThan(
      html.indexOf('data-component="HeadToHeadCard"'),
    );
  });

  test("a selected value the match cannot produce still gets a removable chip", () => {
    const html = renderStatistics({
      filters: filtersWith({ scorePoints: ["Ad-40"] }),
      filteredPoints: [],
    });
    expect(html).toContain('aria-label="Remove filter: Ad-40"');
    expect(html).toContain("0 of 5 points");
  });

  test("read-only (public page): chips without remove, the count still shown", () => {
    const html = renderStatistics({
      canFilter: false,
      filters: TWO_VALUES,
      filteredPoints: POINTS.slice(0, 3),
    });
    expect(html).toContain("3 of 5 points");
    expect(html).toContain(">Rudy serving</span>");
    expect(html).not.toContain("Remove filter:");
  });
});

test.describe("StatisticsView › zero-match empty state", () => {
  test("no point passes: the cards give way to one statement and Clear all", () => {
    const html = renderStatistics({
      filters: TWO_VALUES,
      filteredPoints: [],
    });
    expect(html).toContain('data-testid="filtered-points-empty"');
    expect(html).toContain("No points match these filters");
    // One Clear all — the empty state's; the strip's steps aside.
    expect(html.match(/>Clear all</g)).toHaveLength(1);
    expect(html).not.toContain('data-component="HeadToHeadCard"');
    expect(html).not.toContain('data-component="RallyLengthCard"');
    expect(html).not.toContain('data-component="PerformanceTrackerChart"');
    expect(html).not.toContain('data-component="PointEndingsCard"');
    // The bar stays so one chip can be removed instead.
    expect(filterButton(html)).not.toBeNull();
    expect(html).toContain('aria-label="Remove filter: Rudy serving"');
    // The insight is whole-match prose and stays.
    expect(html).toContain('data-component="Insight"');
  });

  test("no filters: the cards draw and the zero-match empty does not", () => {
    const html = renderStatistics({ filteredPoints: POINTS });
    expect(html).not.toContain("No points match these filters");
    expect(html).toContain('data-component="RallyLengthCard"');
  });
});

test.describe("applied-chips", () => {
  test("one chip per value, in panel order; Serve/Return player is one chip", () => {
    const chips = appliedChips(
      filtersWith({
        serveZone: ["T", "Wide"],
        server: "opponent",
        sets: [2, 1],
        resultOutcome: ["winner"],
        customRallyShot: [4],
        returnContact: ["middle"],
      }),
      NAMES,
    );
    expect(chips.map((c) => c.label)).toEqual([
      "Set 1",
      "Set 2",
      "Sam serving",
      "Wide serve",
      "T serve",
      "Middle contact",
      "Result: Winner",
      "Rally shot 4",
    ]);
    expect(new Set(chips.map((c) => c.id)).size).toBe(chips.length);
  });

  test("no filters, no chips", () => {
    expect(appliedChips(EMPTY_MATCH_FILTERS, NAMES)).toEqual([]);
  });

  test("removing a chip removes that value and only that value", () => {
    const filters = filtersWith({
      server: "you",
      serveZone: ["Wide", "T"],
      scorePoints: ["Ad-40"],
    });
    const chips = appliedChips(filters, NAMES);
    const wide = chips.find((c) => c.label === "Wide serve")!;
    expect(removeChip(filters, wide)).toEqual({
      ...filters,
      serveZone: ["T"],
    });
    const serving = chips.find((c) => c.label === "Rudy serving")!;
    expect(removeChip(filters, serving).server).toBeNull();
    // The unavailable value is removable like any other.
    const ad = chips.find((c) => c.label === "Ad-40")!;
    expect(removeChip(filters, ad).scorePoints).toEqual([]);
  });

  test("removing every chip leaves nothing filtered", () => {
    let filters = TWO_VALUES;
    for (const chip of appliedChips(TWO_VALUES, NAMES)) {
      filters = removeChip(filters, chip);
    }
    expect(hasActiveMatchFilters(filters)).toBe(false);
  });

  test("a stale chip (value already gone) is a no-op, never a re-add", () => {
    const filters = filtersWith({ serveZone: ["T"] });
    expect(removeChip(filters, { key: "serveZone", value: "Wide" })).toBe(
      filters,
    );
    const noServer = filtersWith({});
    expect(removeChip(noServer, { key: "server", value: "you" })).toBe(
      noServer,
    );
  });
});

test.describe("rail-state", () => {
  test("the Filter button toggles: open, then re-click closes", () => {
    expect(filterRailReducer("closed", "toggle")).toBe("open");
    expect(filterRailReducer("open", "toggle")).toBe("closing");
    // A click mid-close reopens rather than waiting out the animation.
    expect(filterRailReducer("closing", "toggle")).toBe("open");
  });

  test("close (Esc, Cancel, Apply) only starts from open; the animation end finishes it", () => {
    expect(filterRailReducer("open", "close")).toBe("closing");
    expect(filterRailReducer("closed", "close")).toBe("closed");
    expect(filterRailReducer("closing", "close")).toBe("closing");
    expect(filterRailReducer("closing", "closed")).toBe("closed");
    expect(filterRailReducer("open", "closed")).toBe("open");
  });

  test("reset (the view unmounted) shuts it at once from any phase", () => {
    for (const phase of ["open", "closing", "closed"] as const) {
      expect(filterRailReducer(phase, "reset")).toBe("closed");
    }
  });

  test("Esc closes an open rail unless something above it took the key", () => {
    const esc = { key: "Escape", defaultPrevented: false };
    expect(escClosesRail("open", esc)).toBe(true);
    expect(escClosesRail("closed", esc)).toBe(false);
    expect(escClosesRail("closing", esc)).toBe(false);
    expect(escClosesRail("open", { ...esc, defaultPrevented: true })).toBe(
      false,
    );
    expect(
      escClosesRail("open", { key: "Enter", defaultPrevented: false }),
    ).toBe(false);
  });
});
