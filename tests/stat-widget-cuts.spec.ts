import { expect, test } from "@playwright/test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { RALLY_BAND_CUTS } from "@/components/dashboard/matches/match-detail/rally-length-card";
import {
  outcomeCut,
  type OutcomeKey,
} from "@/components/dashboard/matches/match-detail/point-endings-card";
import { sideCut } from "@/components/dashboard/matches/match-detail/head-to-head-card";
import {
  DEFAULT_FILM_FILTERS,
  type FilmFilters,
} from "@/components/dashboard/matches/match-detail/film/filters/types";
import type { MatchPoint } from "@/lib/data/match-points-server";
import { createLoader } from "./fixtures/vm-modules";

/**
 * The rally-length bands, point-endings segments and performance tracker that
 * open their points in the Video tab (Advantage Intelligence UI T5).
 *
 * Pure and offline. As in `head-to-head-cuts.spec.ts`, what goes wrong here
 * never shows on the card: a misspelt key is spread over the defaults and
 * silently ignored, and a swapped side opens the opponent's points. So the
 * tables are pinned exactly, every key is checked against the filter
 * model's defaults, and the two render paths are checked — read-only markup
 * without a video, a button with a "Watch in Video" cue with one.
 */

const known = new Set(Object.keys(DEFAULT_FILM_FILTERS));

function expectKnownKeys(cut: Partial<FilmFilters>, what: string) {
  for (const key of Object.keys(cut))
    expect(known.has(key), `${what} → ${key}`).toBe(true);
}

test.describe("rally-length cuts", () => {
  test("the band table is exactly Short 1–4, Medium 5–8, Long 9+", () => {
    expect(RALLY_BAND_CUTS).toEqual({
      short: { rallyMin: 1, rallyMax: 4 },
      medium: { rallyMin: 5, rallyMax: 8 },
      long: { rallyMin: 9, rallyMax: null },
    });
  });

  test("Long clears the upper bound explicitly, so a leftover max cannot carry over", () => {
    expect("rallyMax" in RALLY_BAND_CUTS.long).toBe(true);
    expect(RALLY_BAND_CUTS.long.rallyMax).toBeNull();
  });

  test("every band cut uses only keys of DEFAULT_FILM_FILTERS", () => {
    for (const [band, cut] of Object.entries(RALLY_BAND_CUTS))
      expectKnownKeys(cut, band);
  });
});

test.describe("point-endings cuts", () => {
  const KEYS: OutcomeKey[] = [
    "winners",
    "unforcedErrors",
    "doubleFaults",
    "aces",
  ];

  test("the viewer's row", () => {
    expect(outcomeCut("winners", "you")).toEqual({
      result: ["winner"],
      outcome: "you",
    });
    // The player who errs loses the point, and `outcome` is the winner.
    expect(outcomeCut("unforcedErrors", "you")).toEqual({
      result: ["unforced"],
      outcome: "opp",
    });
    expect(outcomeCut("doubleFaults", "you")).toEqual({
      serve: ["double-fault"],
      server: "you",
    });
    expect(outcomeCut("aces", "you")).toEqual({
      serve: ["ace"],
      server: "you",
    });
  });

  test("the opponent's row is the viewer's with the sides swapped", () => {
    expect(outcomeCut("winners", "opp")).toEqual({
      result: ["winner"],
      outcome: "opp",
    });
    expect(outcomeCut("unforcedErrors", "opp")).toEqual({
      result: ["unforced"],
      outcome: "you",
    });
    expect(outcomeCut("doubleFaults", "opp")).toEqual({
      serve: ["double-fault"],
      server: "opp",
    });
    expect(outcomeCut("aces", "opp")).toEqual({
      serve: ["ace"],
      server: "opp",
    });
  });

  test("every segment cut uses only keys of DEFAULT_FILM_FILTERS", () => {
    for (const key of KEYS)
      for (const side of ["you", "opp"] as const)
        expectKnownKeys(outcomeCut(key, side), `${key} (${side})`);
  });

  test("agrees with the head-to-head card's cut for the same statistic", () => {
    const h2h: Record<OutcomeKey, Partial<FilmFilters>> = {
      winners: { result: ["winner"] },
      unforcedErrors: { result: ["unforced"] },
      doubleFaults: { serve: ["double-fault"] },
      aces: { serve: ["ace"] },
    };
    for (const key of KEYS)
      for (const side of ["you", "opp"] as const)
        expect(outcomeCut(key, side), `${key} (${side})`).toEqual(
          sideCut(h2h[key], side),
        );
  });
});

/* ── The two render paths ───────────────────────────────────────────────── */

function point(overrides: Partial<MatchPoint> = {}): MatchPoint {
  return {
    id: "p1",
    pointNumber: 1,
    setNumber: 1,
    gameNumber: 1,
    setScore: "0-0",
    gameScore: "0-0",
    pointScore: "0-0",
    resultType: "",
    eventType: "",
    description: "",
    player: "player1",
    wonByPlayer1: true,
    serverIsPlayer1: true,
    isBreakPoint: false,
    isSetPoint: false,
    isMatchPoint: false,
    rallyLength: 0,
    duration: null,
    videoTime: 12,
    saved: false,
    savedBy: [],
    ...overrides,
  };
}

const POINTS: MatchPoint[] = [
  point({ id: "a", rallyLength: 2, resultType: "Ace" }),
  point({
    id: "b",
    pointNumber: 2,
    rallyLength: 6,
    resultType: "Forehand Winner",
    player: "player2",
    wonByPlayer1: false,
  }),
  point({
    id: "c",
    pointNumber: 3,
    rallyLength: 11,
    resultType: "Backhand Unforced Error",
    player: "player1",
    wonByPlayer1: false,
  }),
  point({
    id: "d",
    pointNumber: 4,
    rallyLength: 1,
    resultType: "Double Fault",
    serverIsPlayer1: false,
    wonByPlayer1: true,
  }),
];

const DETAIL = "src/components/dashboard/matches/match-detail/";

function render(
  file: string,
  exportName: string,
  hasPlayableVideo: boolean,
  props: Record<string, unknown> = {},
) {
  const loader = createLoader({
    markUnknown: true,
    stubs: {
      "@/components/dashboard/matches/match-data-provider": {
        useMatchData: () => ({ points: POINTS, match: {}, statsResult: null }),
      },
      "@/components/dashboard/matches/match-detail/match-report-context": {
        useMatchReport: () => ({
          meta: { hasPlayableVideo },
          actions: { watchCut: () => {}, watchPoint: () => {} },
        }),
      },
      "@/components/dashboard/matches/match-detail/use-match-sides": {
        useMatchSides: () => ({
          you: { isPlayer1: true, name: "Alex Rivera" },
          opp: { isPlayer1: false, name: "Sam Okafor" },
          sets: [],
        }),
      },
      "@/components/dashboard/matches/match-detail/set-scope": {
        useSetScope: () => ({ activeSet: null, selectable: [] }),
        scopePoints: (p: MatchPoint[]) => p,
      },
      "@/lib/data/match-utils": {
        surnameLabels: (a: string, b: string) => [a, b],
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
    },
  });
  const exports = loader.load(file) as Record<
    string,
    React.ComponentType<Record<string, unknown>>
  >;
  return renderToStaticMarkup(React.createElement(exports[exportName], props));
}

const count = (html: string, needle: string) => html.split(needle).length - 1;

test.describe("rally-length bands", () => {
  const file = DETAIL + "rally-length-card.tsx";

  test("without video: read-only bands, no cue", () => {
    const html = render(file, "RallyLengthCard", false);
    expect(count(html, "cursor-default")).toBe(3);
    expect(html).not.toContain("cursor-pointer");
    expect(html).not.toContain('role="button"');
    expect(html).not.toContain("Watch in Video");
  });

  test("with video: each band is a button and says so", () => {
    const html = render(file, "RallyLengthCard", true);
    expect(count(html, 'role="button"')).toBe(3);
    expect(count(html, "cursor-pointer")).toBe(3);
    expect(html).not.toContain("cursor-default");
    // Once in each readout, once in each band's aria-label.
    expect(count(html, "Watch in Video")).toBe(6);
  });
});

test.describe("point-endings segments", () => {
  const file = DETAIL + "point-endings-card.tsx";
  // You: 1 ace, 1 unforced error. Opp: 1 winner, 1 double fault.
  const SEGMENTS = 4;

  test("without video: read-only segments, no cue", () => {
    const html = render(file, "PointEndingsCard", false, { isDerived: false });
    expect(count(html, "cursor-default")).toBe(SEGMENTS);
    expect(html).not.toContain("cursor-pointer");
    expect(html).not.toContain('role="button"');
    expect(html).not.toContain("Watch in Video");
  });

  test("with video: each segment is a button and says so", () => {
    const html = render(file, "PointEndingsCard", true, { isDerived: false });
    expect(count(html, 'role="button"')).toBe(SEGMENTS);
    expect(count(html, "cursor-pointer")).toBe(SEGMENTS);
    expect(html).not.toContain("cursor-default");
    expect(count(html, "Watch in Video")).toBe(SEGMENTS * 2);
  });
});

test.describe("performance tracker", () => {
  const file = DETAIL + "performance-tracker-chart.tsx";

  test("nothing hovered: no pointer and no cue, video or not", () => {
    // Hovering alone is what arms the click, and nothing is hovered on the
    // first render — so neither path draws the affordance yet.
    for (const video of [false, true]) {
      const html = render(file, "PerformanceTrackerChart", video);
      expect(html).toContain("above</span>");
      expect(html).not.toContain("cursor-pointer");
      expect(html).not.toContain("Watch in Video");
    }
  });
});
