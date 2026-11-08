import { readFileSync } from "node:fs";

import { expect, test } from "@playwright/test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { foldSeasonRows, foldSeasonTallies } from "@/lib/data/player-season";

import { createLoader } from "./fixtures/vm-modules";

/**
 * The team player profile's Statistics tab (design Q), rendered offline from
 * the real `profile-statistics-view.tsx` and every season card under it
 * through `createLoader()`, over the real season fold of NO analyzed matches
 * — what `getPlayerSeason` returns for a player with nothing analysed yet.
 *
 * What is pinned: the insight slot first, then the widgets row with the
 * report's classes — Head to head on the left, the column Performance
 * tracker → How points ended → Rally length → Net game on the right; every
 * card present in its own empty, dashes and no `0%`; the season insight copy
 * on `INSIGHT_SURFACE` with the engine mark; and that the page imports none
 * of the profile's retired KPI strip / Last match / Match history cards, and
 * awaits the season only inside the pane body's `<Suspense>`.
 */

const PROFILE = "src/components/dashboard/team/player-profile/";
const VIEW = PROFILE + "profile-statistics-view.tsx";
const PAGE = "src/app/dashboard/team/roster/[playerId]/page.tsx";
const INSIGHT_CARD =
  "src/components/dashboard/matches/match-detail/report-insight-card.tsx";

const passThrough = ({ children }: { children?: React.ReactNode }) =>
  React.createElement(React.Fragment, null, children);

/** The real class string, read from its source: the card module itself pulls in framer-motion, links and the report context. */
const INSIGHT_SURFACE = (() => {
  const match = /export const INSIGHT_SURFACE =\s*"([^"]+)"/.exec(
    readFileSync(INSIGHT_CARD, "utf8"),
  );
  if (!match) throw new Error("INSIGHT_SURFACE not found");
  return match[1];
})();

function render(): string {
  const loader = createLoader({
    stubs: {
      "@/components/ui/tooltip": {
        Tooltip: passThrough,
        TooltipTrigger: passThrough,
        TooltipContent: ({ children }: { children?: React.ReactNode }) =>
          React.createElement("span", { "data-tip": "" }, children),
      },
      "@/components/dashboard/matches/match-detail/report-insight-card": {
        INSIGHT_SURFACE,
      },
      "next/image": (props: Record<string, unknown>) =>
        React.createElement("img", { ...props, "data-next-image": "" }),
      "framer-motion": {
        useReducedMotion: () => true,
        motion: new Proxy(
          {},
          {
            get:
              (_, tag) =>
              ({
                initial: _i,
                animate: _a,
                transition: _t,
                exit: _e,
                ...rest
              }: Record<string, unknown>) =>
                React.createElement(String(tag), rest),
          },
        ),
        AnimatePresence: passThrough,
      },
    },
  });
  const { ProfileStatisticsView } = loader.load(VIEW) as {
    ProfileStatisticsView: React.ComponentType<{
      playerName: string;
      firstName: string;
      analyzed: number;
      groups: ReturnType<typeof foldSeasonRows>;
      tallies: ReturnType<typeof foldSeasonTallies>;
    }>;
  };
  return renderToStaticMarkup(
    React.createElement(ProfileStatisticsView, {
      playerName: "Maya Chen",
      firstName: "Maya",
      analyzed: 0,
      groups: foldSeasonRows([]),
      tallies: foldSeasonTallies([]),
    }),
  );
}

const count = (html: string, needle: string) => html.split(needle).length - 1;

test.describe("profile Statistics tab — no analyzed matches", () => {
  test("insight slot, then Head to head beside the four charts in order", () => {
    const html = render();
    const order = [
      'data-testid="insight-empty"',
      'aria-labelledby="season-head-to-head-heading"',
      'aria-labelledby="season-performance-tracker-heading"',
      'aria-labelledby="season-point-endings-heading"',
      'aria-labelledby="season-rally-length-heading"',
      'aria-labelledby="season-net-game-heading"',
    ].map((needle) => {
      const at = html.indexOf(needle);
      expect(at, needle).toBeGreaterThan(-1);
      return at;
    });
    expect(order).toEqual([...order].sort((a, b) => a - b));

    // `statistics-view.tsx`'s row and column classes, the 1:1 split from 720px.
    expect(html).toContain(
      'class="flex shrink-0 flex-col gap-4 @min-[720px]:flex-row"',
    );
    expect(html).toContain(
      'class="flex min-w-0 flex-1 flex-col gap-4 *:shrink-0"',
    );
    // Head to head is the row's first column; the charts are the second.
    const row = html.indexOf("@min-[720px]:flex-row");
    const left = html.indexOf('class="min-w-0 flex-1"', row);
    const right = html.indexOf("flex min-w-0 flex-1 flex-col gap-4", row);
    const h2h = html.indexOf("season-head-to-head-heading");
    const tracker = html.indexOf("season-performance-tracker-heading");
    expect(left).toBeLessThan(h2h);
    expect(h2h).toBeLessThan(right);
    expect(right).toBeLessThan(tracker);
  });

  test("every card draws its empty: dashes, never a 0%", () => {
    const html = render();
    for (const id of [
      "season-performance-tracker-empty",
      "point-endings-empty",
      "rally-length-empty",
      "net-game-empty",
    ])
      expect(html, id).toContain(`data-testid="${id}"`);
    for (const eyebrow of [
      "Head to head",
      "Performance tracker",
      "How points ended",
      "Rally length",
      "Net game",
    ])
      expect(html).toContain(eyebrow);
    expect(count(html, ">—<")).toBeGreaterThan(4);
    expect(html).not.toContain(">0%<");
    expect(html).not.toContain(">0<");
  });

  test("the season insight empty: surface, mark, copy, a status", () => {
    const html = render();
    const start = html.indexOf("<section");
    const insight = html.slice(start, html.indexOf("</section>", start));
    expect(insight).toContain('role="status"');
    expect(insight).toContain('data-testid="insight-empty"');
    expect(insight).toContain(`class="${INSIGHT_SURFACE}"`);
    expect(insight).toContain("data-next-image");
    expect(insight).toContain("Advantage Intelligence");
    expect(insight).toContain(
      "No Advantage Intelligence summary for Maya&#x27;s season yet.",
    );
    expect(insight).toContain("is analysed.");
    // A status, not a finding: no toggle and no link.
    expect(insight).not.toContain("<button");
    expect(insight).not.toContain("<a ");
  });
});

test.describe("profile page wiring", () => {
  const source = readFileSync(PAGE, "utf8");
  const imports = source
    .split("\n")
    .filter((line) => /^\s*import|from "/.test(line))
    .join("\n");

  test("no KPI strip, Last match or Match history card on the page", () => {
    for (const retired of [
      "SeasonKpiStrip",
      "LastMatchCard",
      "MatchHistoryCard",
      "last-match-card",
      "match-history-card",
    ])
      expect(imports, retired).not.toContain(retired);
    expect(imports).toContain("ProfileStatisticsView");
  });

  test("the season is awaited only inside the pane body's Suspense", () => {
    const page = source.slice(
      source.indexOf("export default async function PlayerProfilePage"),
    );
    const pageBody = page.slice(0, page.indexOf("\n}\n"));
    // The page itself never awaits the season — the rail renders from the profile.
    expect(pageBody).not.toContain("getPlayerSeason(");
    expect(pageBody).toContain("<Suspense");
    expect(pageBody).toContain("<ProfileStatisticsBody");
    expect(pageBody).toContain('<ProfileViewWhen view="statistics">');
    // …and the component that does is rendered inside it.
    const suspense = pageBody.lastIndexOf("<Suspense");
    expect(pageBody.indexOf("<ProfileStatisticsBody")).toBeGreaterThan(
      suspense,
    );
    expect(source).toMatch(
      /async function ProfileStatisticsBody[\s\S]*await getPlayerSeason\(/,
    );
  });
});
