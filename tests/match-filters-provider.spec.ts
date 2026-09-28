import { readFileSync } from "node:fs";

import { expect, test } from "@playwright/test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  EMPTY_MATCH_FILTERS,
  MATCH_FILTERS_PARAM,
  matchFiltersQuery,
  parseMatchFilters,
  serializeMatchFilters,
  type MatchFilters,
} from "@/components/dashboard/matches/match-detail/match-filters/model";
import type { MatchPoint } from "@/lib/data/match-points-server";
import { createLoader } from "./fixtures/vm-modules";
import { pt } from "./fixtures/film-point";

/**
 * T4: `MatchFiltersProvider` + `useMatchFilters()`, the one filter state the
 * Statistics cards read in place of the retired set scope.
 *
 * Offline: the URL helper is pure, and the provider is rendered through
 * `fixtures/vm-modules` (Playwright's JSX transform breaks
 * `renderToStaticMarkup` on an imported .tsx) with `useMatchData` and
 * `useMatchSides` stubbed. Server rendering runs no effects, so what is
 * checked is the SEED — the state the first render (server and client alike)
 * computes from `initialQuery` — and the no-provider fallback.
 */

const PROVIDER =
  "src/components/dashboard/matches/match-detail/match-filters/provider.tsx";
const DETAIL = "src/components/dashboard/matches/match-detail/";

/** p1/p3 served by player1, p2/p4 by player2. */
const POINTS: MatchPoint[] = [
  pt({ id: "p1", pointNumber: 1, serverIsPlayer1: true }),
  pt({ id: "p2", pointNumber: 2, serverIsPlayer1: false }),
  pt({ id: "p3", pointNumber: 3, serverIsPlayer1: true }),
  pt({ id: "p4", pointNumber: 4, serverIsPlayer1: false }),
];

const YOU_SERVING: MatchFilters = { ...EMPTY_MATCH_FILTERS, server: "you" };

/* ── The URL param ──────────────────────────────────────────────────────── */

test.describe("matchFiltersQuery", () => {
  test("writes the compact form and carries every other parameter", () => {
    const next = new URLSearchParams(
      matchFiltersQuery("tab=film&cut=break&serve=you", YOU_SERVING),
    );
    expect(next.get(MATCH_FILTERS_PARAM)).toBe(
      serializeMatchFilters(YOU_SERVING),
    );
    expect(next.get("tab")).toBe("film");
    expect(next.get("cut")).toBe("break");
    expect(next.get("serve")).toBe("you");
  });

  test("empty filters drop the parameter entirely", () => {
    const current = `tab=shots&${MATCH_FILTERS_PARAM}=sv.y`;
    expect(matchFiltersQuery(current, EMPTY_MATCH_FILTERS)).toBe("tab=shots");
    expect(matchFiltersQuery("", EMPTY_MATCH_FILTERS)).toBe("");
  });

  test("round-trips through parseMatchFilters", () => {
    const query = new URLSearchParams(matchFiltersQuery("", YOU_SERVING));
    expect(parseMatchFilters(query.get(MATCH_FILTERS_PARAM))).toEqual(
      YOU_SERVING,
    );
  });

  test("the caller's params are not mutated", () => {
    const current = new URLSearchParams("tab=film");
    matchFiltersQuery(current, YOU_SERVING);
    expect(current.toString()).toBe("tab=film");
  });

  test("the name collides with no other key the match page uses", () => {
    // Report (`tab`), Video (`point`, `fullscreen`, `cut`, `serve`), the
    // retired set scope (`set`) and every Visualizations key (`viz-url.ts`).
    const taken = [
      "tab",
      "point",
      "fullscreen",
      "cut",
      "serve",
      "set",
      "chart",
      "view",
      "vset",
      "draft",
      "player",
      "ball",
      "court",
      "zone",
      "result",
      "pressure",
      "rally",
      "game",
    ];
    expect(taken).not.toContain(MATCH_FILTERS_PARAM);
  });
});

/* ── The provider and the hook ──────────────────────────────────────────── */

interface Seen {
  ids: string[];
  active: boolean;
  serialized: string;
}

/** Render `Probe` under the provider (or bare) and read what the hook saw. */
function probe(options: {
  youIsPlayer1: boolean;
  initialQuery?: string | string[];
  withProvider?: boolean;
}): Seen {
  const loader = createLoader({
    stubs: {
      "@/components/dashboard/matches/match-data-provider": {
        useMatchData: () => ({
          points: POINTS,
          match: { player1: { hand: "right" }, player2: { hand: "left" } },
          statsResult: null,
        }),
      },
      "@/components/dashboard/matches/match-detail/use-match-sides": {
        useMatchSides: () => ({
          you: { isPlayer1: options.youIsPlayer1 },
          opp: { isPlayer1: !options.youIsPlayer1 },
          sets: [],
        }),
      },
    },
  });
  const mod = loader.load(PROVIDER) as {
    MatchFiltersProvider: React.ComponentType<{
      initialQuery?: string | string[];
      children?: React.ReactNode;
    }>;
    useMatchFilters: () => {
      filters: MatchFilters;
      filteredPoints: MatchPoint[];
      filtersActive: boolean;
    };
  };
  const seen: Seen = { ids: [], active: false, serialized: "" };
  function Probe() {
    const value = mod.useMatchFilters();
    seen.ids = value.filteredPoints.map((p) => p.id);
    seen.active = value.filtersActive;
    seen.serialized = serializeMatchFilters(value.filters);
    return null;
  }
  const tree =
    options.withProvider === false
      ? React.createElement(Probe)
      : React.createElement(
          mod.MatchFiltersProvider,
          { initialQuery: options.initialQuery },
          React.createElement(Probe),
        );
  renderToStaticMarkup(tree);
  return seen;
}

test.describe("MatchFiltersProvider", () => {
  const youServing = serializeMatchFilters(YOU_SERVING);

  test("seeds from the page's ?f= and filters the points", () => {
    const seen = probe({ youIsPlayer1: true, initialQuery: youServing });
    expect(seen.active).toBe(true);
    expect(seen.serialized).toBe(youServing);
    expect(seen.ids).toEqual(["p1", "p3"]);
  });

  test("'you' resolves through useMatchSides, never player order", () => {
    // Same URL, a player-2 viewer: "you serving" is player2's service points.
    const seen = probe({ youIsPlayer1: false, initialQuery: youServing });
    expect(seen.ids).toEqual(["p2", "p4"]);
  });

  test("no ?f= is the whole match, unfiltered", () => {
    const seen = probe({ youIsPlayer1: true });
    expect(seen.active).toBe(false);
    expect(seen.ids).toEqual(["p1", "p2", "p3", "p4"]);
  });

  test("a garbage ?f= reads as no filter rather than throwing", () => {
    const seen = probe({ youIsPlayer1: true, initialQuery: "zz.9_%%" });
    expect(seen.active).toBe(false);
    expect(seen.ids).toHaveLength(4);
  });

  test("a repeated ?f= takes the first value", () => {
    const seen = probe({
      youIsPlayer1: true,
      initialQuery: [youServing, "sv.o"],
    });
    expect(seen.ids).toEqual(["p1", "p3"]);
  });

  test("without a provider the hook answers 'nothing filtered'", () => {
    const seen = probe({ youIsPlayer1: true, withProvider: false });
    expect(seen.active).toBe(false);
    expect(seen.ids).toEqual(["p1", "p2", "p3", "p4"]);
  });
});

/* ── The cards read the filters, not the set scope ─────────────────────── */

test("the four point-derived cards read useMatchFilters, not set-scope", () => {
  for (const card of [
    "head-to-head-card.tsx",
    "performance-tracker-chart.tsx",
    "rally-length-card.tsx",
    "point-endings-card.tsx",
  ]) {
    const source = readFileSync(`${DETAIL}${card}`, "utf8");
    expect(source, card).toContain("useMatchFilters()");
    expect(source, card).not.toMatch(/useSetScope|scopePoints|\/set-scope"/);
  }
});

/* ── Filters that match nothing ─────────────────────────────────────────── */

/**
 * A filter can narrow the match to zero points. Each chart card must fall to
 * its own empty anatomy — never crash, never draw a zero-height series — and
 * say the FILTERS left nothing, not that the match recorded nothing. (The
 * page-level "No points match these filters" state is T6's.)
 */
function renderFilteredEmpty(file: string, exportName: string): string {
  const loader = createLoader({
    markUnknown: true,
    stubs: {
      "@/components/dashboard/matches/match-data-provider": {
        useMatchData: () => ({ points: POINTS, match: {}, statsResult: null }),
      },
      "@/components/dashboard/matches/match-detail/use-match-sides": {
        useMatchSides: () => ({
          you: { isPlayer1: true, name: "Alex Rivera" },
          opp: { isPlayer1: false, name: "Sam Okafor" },
          sets: [],
        }),
      },
      "@/components/dashboard/matches/match-detail/match-report-context": {
        useMatchReport: () => ({
          meta: { hasPlayableVideo: false },
          actions: {},
        }),
      },
      "@/components/dashboard/matches/match-detail/match-filters/provider": {
        useMatchFilters: () => ({ filteredPoints: [], filtersActive: true }),
      },
      "@/lib/data/match-utils": {
        surnameLabels: (a: string, b: string) => [a, b],
      },
      "framer-motion": {
        useReducedMotion: () => true,
        motion: new Proxy({}, { get: (_, tag) => String(tag) }),
      },
    },
  });
  const exports = loader.load(`${DETAIL}${file}`) as Record<
    string,
    React.ComponentType<Record<string, unknown>>
  >;
  return renderToStaticMarkup(
    React.createElement(exports[exportName], { isDerived: false }),
  );
}

test.describe("filters that match no points", () => {
  test("performance tracker: its empty, worded for the filters", () => {
    const html = renderFilteredEmpty(
      "performance-tracker-chart.tsx",
      "PerformanceTrackerChart",
    );
    expect(html).toContain('data-testid="performance-tracker-empty"');
    expect(html).toContain("at least two points match the filters");
  });

  test("rally length: its empty, worded for the filters", () => {
    const html = renderFilteredEmpty(
      "rally-length-card.tsx",
      "RallyLengthCard",
    );
    expect(html).toContain('data-testid="rally-length-empty"');
    expect(html).toContain("recorded on the filtered points");
  });

  test("point endings: its empty, worded for the filters", () => {
    const html = renderFilteredEmpty(
      "point-endings-card.tsx",
      "PointEndingsCard",
    );
    expect(html).toContain('data-testid="point-endings-empty"');
    expect(html).toContain("None of the filtered points");
  });
});
