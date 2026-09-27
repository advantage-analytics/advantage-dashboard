import { expect, test } from "@playwright/test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type { MatchPoint } from "@/lib/data/match-points-server";
import { createLoader, marker } from "./fixtures/vm-modules";

/**
 * The match report's empty states, offline: each view (or card) is loaded
 * through `fixtures/vm-modules` with its providers stubbed and every other
 * import replaced by a marker. What is checked is the DS rule — an honest
 * zero in the region's own anatomy with `—` where a value goes, one
 * region-level statement when the whole view is empty, never a skeleton and
 * never sample data — and the two gates that decide which one draws.
 */

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
    videoTime: null,
    saved: false,
    savedBy: [],
    ...overrides,
  };
}

const sides = {
  you: { isPlayer1: true, name: "Alex Rivera" },
  opp: { isPlayer1: false, name: "Sam Okafor" },
  sets: [],
};

/** The real primitives a card empty is built from; everything else is a marker. */
const REAL = new Set([
  "@/components/ui/empty-mark",
  "@/lib/utils",
  "@/components/dashboard/matches/match-detail/report-view",
]);

function render(
  file: string,
  exportName: string,
  points: MatchPoint[],
  stubs: Record<string, unknown> = {},
  props: Record<string, unknown> = {},
) {
  const real = createLoader();
  const loader = createLoader({
    markUnknown: true,
    stubs: new Proxy(
      {
        ...stubs,
        "@/components/dashboard/matches/match-data-provider": {
          useMatchData: () => ({ points, match: {}, statsResult: null }),
        },
        "@/components/dashboard/matches/match-detail/use-match-sides": {
          useMatchSides: () => sides,
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
          motion: new Proxy({}, { get: (_, tag) => String(tag) }),
          AnimatePresence: ({ children }: { children: React.ReactNode }) =>
            children,
        },
      } as Record<string, unknown>,
      {
        has: (target, id) =>
          id in target ||
          REAL.has(String(id)) ||
          // Every other `@/` or relative import is a marker, never a file.
          String(id).startsWith("@/") ||
          String(id).startsWith("."),
        get: (target, id) => {
          if (id in target) return target[id as string];
          if (REAL.has(String(id)))
            return real.load(
              `src/${String(id).slice(2)}.tsx`.replace(
                /\.tsx$/,
                existsTsx(String(id)) ? ".tsx" : ".ts",
              ),
            );
          return new Proxy({}, { get: (_, name) => marker(String(name)) });
        },
      },
    ),
  });
  const exports = loader.load(file) as Record<
    string,
    React.ComponentType<Record<string, unknown>>
  >;
  return renderToStaticMarkup(React.createElement(exports[exportName], props));
}

import { existsSync } from "node:fs";
import { resolve } from "node:path";
function existsTsx(id: string) {
  return existsSync(resolve(process.cwd(), "src", `${id.slice(2)}.tsx`));
}

const DETAIL = "src/components/dashboard/matches/match-detail/";

test.describe("StatisticsView", () => {
  const file = DETAIL + "statistics-view.tsx";
  const report = (statsPublished: boolean) => ({
    useMatchReport: () => ({ meta: { statsPublished, isDerived: false } }),
  });
  const stubs = (statsPublished: boolean) => ({
    "@/components/dashboard/matches/match-detail/match-report-context":
      report(statsPublished),
    "@/components/dashboard/matches/match-detail/match-report": {
      MatchReport: { Insight: marker("Insight") },
    },
  });

  test("no points: one region-level empty, no notice, no cards, no insight", () => {
    const html = render(file, "StatisticsView", [], stubs(false));
    expect(html).toContain('data-component="StatisticsEmpty"');
    expect(html).not.toContain('data-component="UnpublishedStatsNotice"');
    expect(html).not.toContain('data-component="HeadToHeadCard"');
    expect(html).not.toContain('data-component="RallyLengthCard"');
    // A view with nothing says so once — the insight card's own empty would
    // be a second statement of the same absence.
    expect(html).not.toContain('data-component="Insight"');
  });

  test("points: the insight card is offered (it draws its own empty without a summary)", () => {
    const html = render(file, "StatisticsView", [point()], stubs(true));
    expect(html).toContain('data-component="Insight"');
  });

  test("points without published stats: the notice and the chart column, full width", () => {
    const html = render(file, "StatisticsView", [point()], stubs(false));
    expect(html).not.toContain('data-component="StatisticsEmpty"');
    expect(html).toContain('data-component="UnpublishedStatsNotice"');
    expect(html).toContain('data-component="RallyLengthCard"');
    expect(html).not.toContain('data-component="HeadToHeadCard"');
  });

  test("points with published stats: the full widgets row", () => {
    const html = render(file, "StatisticsView", [point()], stubs(true));
    expect(html).toContain('data-component="HeadToHeadCard"');
    expect(html).toContain('data-component="PointEndingsCard"');
    expect(html).not.toContain('data-component="StatisticsEmpty"');
  });
});

test.describe("MatchReportInsight", () => {
  const file = DETAIL + "report-insight-card.tsx";
  const stubs = (summary: string | null) => ({
    "next/image": { __esModule: true, default: () => null },
    "next/link": { __esModule: true, default: marker("Link") },
    "@/components/dashboard/matches/match-detail/match-report-context": {
      useMatchReport: () => ({
        state: { insight: "expanded" },
        actions: {},
        meta: { summary },
      }),
    },
    "@/components/dashboard/matches/match-detail/insight-text": {
      splitInsight: (text: string) => ({ claim: text, evidence: null }),
    },
  });

  test("no summary: the card's anatomy says what is missing — no toggle, no link, no figure", () => {
    const html = render(file, "MatchReportInsight", [], stubs(null));
    expect(html).toContain('data-testid="insight-empty"');
    expect(html).toContain('role="status"');
    expect(html).toContain("No Advantage Intelligence summary for this match.");
    expect(html).toContain("Advantage Intelligence</span>");
    expect(html).not.toContain("<button");
    expect(html).not.toContain('data-component="Link"');
    expect(html).not.toMatch(/\d+%/);
    expect(html).not.toContain("animate-pulse");
  });

  test("a summary draws the real card", () => {
    const html = render(
      file,
      "MatchReportInsight",
      [],
      stubs("You won the net."),
    );
    expect(html).not.toContain('data-testid="insight-empty"');
    expect(html).toContain("You won the net.");
  });
});

test.describe("card anatomy empties (points exist, the measure does not)", () => {
  test("rally length: eyebrow, three band labels with a dash, one sentence", () => {
    const html = render(DETAIL + "rally-length-card.tsx", "RallyLengthCard", [
      point({ rallyLength: 0 }),
    ]);
    expect(html).toContain('data-testid="rally-length-empty"');
    expect(html).toContain("Rally length");
    for (const band of ["Short", "Medium", "Long"])
      expect(html).toContain(band);
    expect(html).toContain("shots average");
    expect(html).toContain("No rally lengths were recorded");
    // Dashes, never zeros: four marks (average + three bands).
    expect(html.match(/>—</g)?.length).toBe(4);
    expect(html).not.toContain(">0<");
    expect(html).not.toContain("animate-pulse");
  });

  test("rally length: with a banded point the real card draws", () => {
    const html = render(DETAIL + "rally-length-card.tsx", "RallyLengthCard", [
      point({ rallyLength: 3 }),
    ]);
    expect(html).not.toContain('data-testid="rally-length-empty"');
    expect(html).toContain("Width is how often");
  });

  test("how points ended: both names, a dash per total, one sentence", () => {
    const html = render(
      DETAIL + "point-endings-card.tsx",
      "PointEndingsCard",
      [point({ resultType: "" })],
      {},
      { isDerived: false },
    );
    expect(html).toContain('data-testid="point-endings-empty"');
    expect(html).toContain("Alex Rivera");
    expect(html).toContain("Sam Okafor");
    expect(html.match(/>—</g)?.length).toBe(2);
    expect(html).toContain("No point on this match records how it ended.");
  });

  test("how points ended: a winner draws the real card", () => {
    const html = render(
      DETAIL + "point-endings-card.tsx",
      "PointEndingsCard",
      [point({ resultType: "Forehand Winner", player: "player1" })],
      {},
      { isDerived: false },
    );
    expect(html).not.toContain('data-testid="point-endings-empty"');
  });

  test("performance tracker: one point is the midline and a sentence, not a flat trend", () => {
    const html = render(
      DETAIL + "performance-tracker-chart.tsx",
      "PerformanceTrackerChart",
      [point()],
    );
    expect(html).toContain('data-testid="performance-tracker-empty"');
    expect(html).toContain("Performance tracker");
    expect(html).toContain(
      "Momentum is drawn once at least two points are tagged.",
    );
    expect(html).not.toContain("above</span>");
  });
});

const passthrough = ({ children }: { children: React.ReactNode }) => children;

test.describe("ShotsTab", () => {
  const file = DETAIL + "shots/shots-tab.tsx";
  const stubs = (cut: string | null) => ({
    "next/dynamic": {
      __esModule: true,
      default: () => marker("VizFullscreen"),
    },
    "@/lib/ui/use-mounted": { useMounted: () => false },
    "@/components/dashboard/matches/match-detail/match-report-context": {
      useMatchReport: () => ({
        meta: {
          savedViews: [],
          workspaceRole: "owner",
          workspaceKind: "personal",
          workspaceName: "",
        },
        actions: { watchPoint: () => {} },
      }),
    },
    "@/components/dashboard/matches/match-detail/shots/viz-state-context": {
      useVizState: () => ({ state: { cut, fullscreen: false, draft: false } }),
      VizStateProvider: passthrough,
    },
    "@/components/dashboard/matches/match-detail/shots/viz-bands-context": {
      VizBandsProvider: passthrough,
    },
  });

  test("no points with a ?cut= link: the view-level empty, never an empty court", () => {
    const html = render(file, "ShotsTab", [], stubs("serve"));
    expect(html).toContain('data-component="VizEmpty"');
    expect(html).not.toContain('data-component="VizFocused"');
    expect(html).not.toContain('data-component="VizWall"');
  });

  test("no points on the wall: the same empty", () => {
    const html = render(file, "ShotsTab", [], stubs(null));
    expect(html).toContain('data-component="VizEmpty"');
  });

  test("with points the wall and the focused court draw as before", () => {
    expect(render(file, "ShotsTab", [point()], stubs(null))).toContain(
      'data-component="VizWall"',
    );
    expect(render(file, "ShotsTab", [point()], stubs("serve"))).toContain(
      'data-component="VizFocused"',
    );
  });
});
