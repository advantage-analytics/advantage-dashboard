import { readFileSync } from "node:fs";

import { expect, test } from "@playwright/test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type { MatchPoint } from "@/lib/data/match-points-server";
import {
  EMPTY_MATCH_FILTERS,
  type MatchFilterContext,
  type MatchFilters,
} from "@/components/dashboard/matches/match-detail/match-filters/model";
import { applyFilmCut } from "@/components/dashboard/matches/match-detail/film-cut-context";

import { pt } from "./fixtures/film-point";
import { createLoader, marker } from "./fixtures/vm-modules";

/**
 * The Statistics tab has NO filters (product owner, 2026-09-28: "There should
 * be no filter in the Statistics tab, just the Video tab"). It always shows
 * the whole match, whatever `?f=` the URL carries — the match filters live on
 * the Video tab alone.
 *
 * Every render below stubs `useMatchFilters()` as a URL `?f=` that matches
 * NOTHING (`filteredPoints: []`, `filtersActive: true`). If the Statistics
 * view or any of its four cards still read the applied filters, that stub
 * would empty them; each test asserts it does not.
 *
 * Offline, through `createLoader()` (Playwright's JSX transform breaks
 * `renderToStaticMarkup` on an imported .tsx).
 */

const DETAIL = "src/components/dashboard/matches/match-detail/";
const DETAIL_ID = "@/components/dashboard/matches/match-detail/";

/** p1–p3 won by player1 (you), p4–p5 by player2; rallies of 2–10 shots. */
const POINTS: MatchPoint[] = [
  pt({ id: "p1", pointNumber: 1, rallyLength: 2, wonByPlayer1: true }),
  pt({ id: "p2", pointNumber: 2, rallyLength: 3, wonByPlayer1: true }),
  pt({ id: "p3", pointNumber: 3, rallyLength: 6, wonByPlayer1: true }),
  pt({
    id: "p4",
    pointNumber: 4,
    rallyLength: 10,
    wonByPlayer1: false,
    player: "player2",
    resultType: "Backhand Winner",
  }),
  pt({
    id: "p5",
    pointNumber: 5,
    rallyLength: 4,
    wonByPlayer1: false,
    player: "player1",
    resultType: "Forehand Unforced Error",
  }),
];

const CTX: MatchFilterContext = {
  youIsPlayer1: true,
  hands: { player1: null, player2: null },
};

/** A `?f=` that no point passes — the case that must change nothing here. */
const NOTHING_PASSES: MatchFilters = {
  ...EMPTY_MATCH_FILTERS,
  scorePoints: ["Ad-40"],
};

const sides = {
  you: {
    isPlayer1: true,
    name: "Rudy Stepanov",
    shortName: "Rudy",
    stats: { totalPointsWon: 3, totalPoints: 5, fractions: {} },
  },
  opp: {
    isPlayer1: false,
    name: "Sam Okafor",
    shortName: "Sam",
    stats: { totalPointsWon: 2, totalPoints: 5, fractions: {} },
  },
  sets: [],
};

const passThrough = ({ children }: { children?: React.ReactNode }) =>
  React.createElement(React.Fragment, null, children);

function commonStubs(hasPlayableVideo: boolean): Record<string, unknown> {
  const noop = () => {};
  return {
    "@/components/dashboard/matches/match-data-provider": {
      useMatchData: () => ({
        points: POINTS,
        match: { verificationStatus: null },
        statsResult: null,
      }),
    },
    [DETAIL_ID + "match-report-context"]: {
      useMatchReport: () => ({
        meta: {
          statsPublished: true,
          isDerived: false,
          readOnly: false,
          hasPlayableVideo,
        },
        actions: { watchCut: noop, watchPoint: noop },
      }),
    },
    [DETAIL_ID + "use-match-sides"]: { useMatchSides: () => sides },
    [DETAIL_ID + "match-filters/provider"]: {
      useMatchFilters: () => ({
        filters: NOTHING_PASSES,
        setFilters: noop,
        clearFilters: noop,
        filteredPoints: [],
        filtersActive: true,
        context: CTX,
      }),
    },
    "@/lib/data/match-utils": {
      surnameLabels: (a: string, b: string) => [
        a.split(" ").pop(),
        b.split(" ").pop(),
      ],
    },
    "@/components/ui/tooltip": {
      Tooltip: passThrough,
      TooltipTrigger: passThrough,
      TooltipContent: passThrough,
    },
    "framer-motion": {
      useReducedMotion: () => true,
      // `motion.div` → a plain element that drops the animation props.
      motion: new Proxy(
        {},
        {
          get:
            (_, tag) =>
            ({
              initial: _i,
              animate: _a,
              transition: _t,
              ...rest
            }: Record<string, unknown>) =>
              React.createElement(String(tag), rest),
        },
      ),
    },
  };
}

function renderCard(
  file: string,
  exportName: string,
  { hasPlayableVideo = false, props = {} as Record<string, unknown> } = {},
): string {
  const loader = createLoader({
    markUnknown: true,
    stubs: commonStubs(hasPlayableVideo),
  });
  const exports = loader.load(DETAIL + file) as Record<
    string,
    React.ComponentType<Record<string, unknown>>
  >;
  return renderToStaticMarkup(React.createElement(exports[exportName], props));
}

function renderStatistics(): string {
  const loader = createLoader({
    stubs: {
      ...commonStubs(false),
      [DETAIL_ID + "match-report"]: {
        MatchReport: { Insight: marker("Insight") },
      },
      [DETAIL_ID + "head-to-head-card"]: {
        HeadToHeadCard: marker("HeadToHeadCard"),
      },
      [DETAIL_ID + "performance-tracker-chart"]: {
        PerformanceTrackerChart: marker("PerformanceTrackerChart"),
      },
      [DETAIL_ID + "rally-length-card"]: {
        RallyLengthCard: marker("RallyLengthCard"),
      },
      [DETAIL_ID + "point-endings-card"]: {
        PointEndingsCard: marker("PointEndingsCard"),
      },
      [DETAIL_ID + "statistics-empty"]: {
        StatisticsEmpty: marker("StatisticsEmpty"),
      },
      [DETAIL_ID + "unpublished-stats-notice"]: {
        UnpublishedStatsNotice: marker("UnpublishedStatsNotice"),
      },
    },
  });
  const { StatisticsView } = loader.load(DETAIL + "statistics-view.tsx") as {
    StatisticsView: React.ComponentType;
  };
  return renderToStaticMarkup(React.createElement(StatisticsView));
}

/* ── The view ──────────────────────────────────────────────────────────── */

test.describe("StatisticsView has no filters", () => {
  test("no Filter button, no applied strip, no zero-match empty — even with ?f= set", () => {
    const html = renderStatistics();
    expect(html).not.toMatch(/aria-label="Filters/);
    expect(html).not.toContain("data-filter-count");
    expect(html).not.toContain('aria-label="Applied filters"');
    expect(html).not.toContain("Clear all");
    expect(html).not.toContain("filtered-points-empty");
    expect(html).not.toContain("No points match these filters");
    expect(html).not.toMatch(/\d+ of \d+ points/);
    // The whole report still draws, every card included.
    for (const part of [
      "Insight",
      "HeadToHeadCard",
      "PerformanceTrackerChart",
      "RallyLengthCard",
      "PointEndingsCard",
    ])
      expect(html).toContain(`data-component="${part}"`);
  });

  test("the view, the share page and the skeleton carry no filter wiring", () => {
    const view = readFileSync(DETAIL + "statistics-view.tsx", "utf8");
    expect(view).not.toMatch(/canFilter|match-filters\//);

    const share = readFileSync("src/app/m/[token]/page.tsx", "utf8");
    expect(share).not.toMatch(/canFilter|MatchFiltersProvider|match-filters\//);

    const pending = readFileSync(
      "src/components/dashboard/loading/match-report-pending.tsx",
      "utf8",
    );
    expect(pending).not.toMatch(/applied-filters|Filter button/);
  });
});

/* ── The cards ─────────────────────────────────────────────────────────── */

test.describe("the four Statistics cards count every point of the match", () => {
  test("none of them reads the applied filters", () => {
    for (const card of [
      "head-to-head-card.tsx",
      "performance-tracker-chart.tsx",
      "rally-length-card.tsx",
      "point-endings-card.tsx",
    ]) {
      const source = readFileSync(DETAIL + card, "utf8");
      expect(source, card).not.toMatch(
        /filteredPoints|filtersActive|useSetScope|scopePoints/,
      );
      expect(source, card).not.toMatch(/[Ff]iltered points|"Filtered"/);
    }
  });

  test("performance tracker: the whole series, not its empty", () => {
    const html = renderCard(
      "performance-tracker-chart.tsx",
      "PerformanceTrackerChart",
    );
    expect(html).not.toContain('data-testid="performance-tracker-empty"');
    expect(html).toContain("Momentum across 5 points");
  });

  test("rally length: every band, as a share of the match", () => {
    const html = renderCard("rally-length-card.tsx", "RallyLengthCard");
    expect(html).not.toContain('data-testid="rally-length-empty"');
    // 1–4 shots: p1, p2, p5; 5–8: p3; 9+: p4.
    expect(html).toContain("3 points, 60 percent of the match");
    expect(html).toContain("1 points, 20 percent of the match");
    expect(html).not.toContain("filtered");
  });

  test("point endings: tallied over the whole match", () => {
    const html = renderCard("point-endings-card.tsx", "PointEndingsCard", {
      props: { isDerived: false },
    });
    expect(html).not.toContain('data-testid="point-endings-empty"');
    expect(html).not.toContain("filtered");
  });

  test("head to head: whole-match heading, and Watch all N counts every point", () => {
    const html = renderCard("head-to-head-card.tsx", "HeadToHeadCard", {
      hasPlayableVideo: true,
    });
    expect(html).toContain("Whole match · 5 points");
    expect(html).not.toContain(">Filtered<");
    expect(html).not.toContain("filtered points");

    // "Total points won" opens the whole match from the label, and the
    // points each side won from its figure — the published 3 and 2, never
    // the zero an unmatched ?f= would leave.
    const all = applyFilmCut(POINTS, POINTS, {}, CTX).length;
    expect(all).toBe(5);
    expect(html).toContain(
      "Total points won, both players. Watch all 5 points in Video",
    );
    expect(html).toContain(
      "Total points won, Stepanov: 3 of 5 won. Watch all 3 points in Video",
    );
    expect(html).toContain(
      "Total points won, Okafor: 2 of 5 won. Watch all 2 points in Video",
    );
  });
});
