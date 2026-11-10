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
 * report's classes — Head to head and its Differential on the left, the
 * column Game profile → How points ended → Rally length → Net game on the
 * right; the retired Performance tracker gone; every
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

function loader() {
  return createLoader({
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
}

function render(): string {
  const { ProfileStatisticsView } = loader().load(VIEW) as {
    ProfileStatisticsView: React.ComponentType<{
      playerId: string;
      playerName: string;
      firstName: string;
      analyzed: number;
      groups: ReturnType<typeof foldSeasonRows>;
      tallies: ReturnType<typeof foldSeasonTallies>;
      evidence: null;
      insightSignature: string;
    }>;
  };
  return renderToStaticMarkup(
    React.createElement(ProfileStatisticsView, {
      playerId: "p-maya",
      playerName: "Maya Chen",
      firstName: "Maya",
      analyzed: 0,
      groups: foldSeasonRows([]),
      tallies: foldSeasonTallies([]),
      // Nothing analyzed: no evidence line, so the slot is the empty state.
      evidence: null,
      insightSignature: "",
    }),
  );
}

const count = (html: string, needle: string) => html.split(needle).length - 1;

test.describe("profile Statistics tab — no analyzed matches", () => {
  test("insight slot, then Head to head + Differential beside the four charts in order", () => {
    const html = render();
    const order = [
      'data-testid="insight-empty"',
      'aria-labelledby="season-head-to-head-heading"',
      'aria-labelledby="season-differential-heading"',
      'aria-labelledby="season-game-profile-heading"',
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
    // Head to head and the Differential are the row's first column; the
    // charts are the second.
    const row = html.indexOf("@min-[720px]:flex-row");
    const column = 'class="flex min-w-0 flex-1 flex-col gap-4 *:shrink-0"';
    const left = html.indexOf(column, row);
    const right = html.indexOf(column, left + 1);
    const h2h = html.indexOf("season-head-to-head-heading");
    const differential = html.indexOf("season-differential-heading");
    const radar = html.indexOf("season-game-profile-heading");
    expect(left).toBeLessThan(h2h);
    expect(h2h).toBeLessThan(differential);
    expect(differential).toBeLessThan(right);
    expect(right).toBeLessThan(radar);
    // The tracker is retired.
    expect(html).not.toContain("Performance tracker");
    expect(html).not.toContain("season-performance-tracker");
  });

  test("the season head to head leaves off Lob and Drop shot points", () => {
    const html = render();
    expect(html).toContain("Approach points won");
    expect(html).not.toContain("Lob points won");
    expect(html).not.toContain("Drop shot points won");
  });

  test("every card draws its empty: dashes, never a 0%", () => {
    const html = render();
    for (const id of [
      "season-differential-empty",
      "season-game-profile-empty",
      "point-endings-empty",
      "rally-length-empty",
      "net-game-empty",
    ])
      expect(html, id).toContain(`data-testid="${id}"`);
    for (const eyebrow of [
      "Head to head",
      "Differential",
      "Game profile",
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

test.describe("Game profile, with matches", () => {
  const VALUES = [57.4, 76, 44, 52, 73, null];
  const profile = (lastFive: (number | null)[] | null) => ({
    overall: [64, 71, 52, 44, 66, 45],
    lastMatch: { values: VALUES, opponent: "Ana Ruiz", date: "2026-11-07" },
    lastFive,
  });
  const renderCard = (lastFive: (number | null)[] | null) => {
    const { SeasonGameProfileCard } = loader().load(
      PROFILE + "season-game-profile-card.tsx",
    ) as {
      SeasonGameProfileCard: React.ComponentType<Record<string, unknown>>;
    };
    return renderToStaticMarkup(
      React.createElement(SeasonGameProfileCard, {
        playerName: "Maya Chen",
        analyzed: lastFive ? 8 : 3,
        profile: profile(lastFive),
      }),
    );
  };

  test("the last match, filled blue, over a solid overall outline", () => {
    const html = renderCard(null);
    expect(html).toContain('data-testid="season-game-profile"');
    // Axis labels carry the blue shape's figure; an axis with no attempts is a dash.
    expect(html).toContain("1st serve in 57%");
    expect(html).toContain("BP converted —");
    expect(html).toContain("Last match · vs Ruiz, Nov 7");
    expect(html).toContain(">Overall · 3 matches<");
    // Two solid shapes: nothing dashed anywhere on the card.
    expect(html).not.toContain("stroke-dasharray");
    expect(html).toMatch(
      /data-testid="game-profile-overall"[^>]*fill="none"[^>]*stroke="var\(--viz-opp\)"/,
    );
    expect(html).toMatch(
      /data-testid="game-profile-recent"[^>]*fill="var\(--viz-you\)" fill-opacity="0.14"/,
    );
    // Five matches or fewer: no swap.
    expect(html).not.toContain("<button");
  });

  test("more than five matches: a labelled swap with a dark tooltip", () => {
    const html = renderCard([61, 73, 50, 47, 69, 48]);
    expect(html).toMatch(/<button[^>]*aria-label="Show last 5 matches"/);
    expect(html).toContain('<span data-tip="">Show last 5 matches</span>');
    // Before the swap the blue shape is still the last match.
    expect(html).toContain(">Last match<");
    expect(html).toContain("1st serve in 57%");
  });
});

test.describe("Game profile readouts and legend", () => {
  const card = () =>
    loader().load(PROFILE + "season-game-profile-card.tsx") as {
      SeasonGameProfileCard: React.ComponentType<Record<string, unknown>>;
      gameProfileDelta: (r: number | null, o: number | null) => string | null;
      gameProfileReadoutAlign: (x: number) => "start" | "center" | "end";
      gameProfileOverallLegend: (n: number) => string;
    };

  test("the readout's last line: points above, below or level, from the printed figures", () => {
    const { gameProfileDelta } = card();
    expect(gameProfileDelta(76, 71)).toBe("+5 points above overall");
    expect(gameProfileDelta(44, 52)).toBe("−8 points below overall");
    expect(gameProfileDelta(45.4, 44.6)).toBe("Level with overall");
    expect(gameProfileDelta(53, 52)).toBe("+1 point above overall");
    expect(gameProfileDelta(null, 52)).toBeNull();
    expect(gameProfileDelta(50, null)).toBeNull();
  });

  test("the readout hangs from its own side near an edge, centred otherwise", () => {
    const { gameProfileReadoutAlign } = card();
    expect(gameProfileReadoutAlign(40)).toBe("start");
    expect(gameProfileReadoutAlign(210)).toBe("center");
    expect(gameProfileReadoutAlign(390)).toBe("end");
  });

  test("six focusable vertices of about 16px, each named with both figures", () => {
    const { SeasonGameProfileCard } = card();
    const html = renderToStaticMarkup(
      React.createElement(SeasonGameProfileCard, {
        playerName: "Maya Chen",
        analyzed: 12,
        profile: {
          overall: [64, 71, 52, 44, 66, 45],
          lastMatch: {
            values: [57, 76, 44, 52, 73, null],
            opponent: "Ana Ruiz",
            date: "2026-11-07",
          },
          lastFive: null,
        },
      }),
    );
    const vertices =
      html.match(/<circle data-testid="game-profile-vertex"[^>]*>/g) ?? [];
    expect(vertices).toHaveLength(6);
    for (const v of vertices) {
      expect(v).toContain('r="16"');
      expect(v).toContain('tabindex="0"');
    }
    expect(html).toContain(
      'aria-label="1st serve won: Last match 76%, overall 71%, +5 points above overall."',
    );
    // No attempts on an axis: a dash, and no delta.
    expect(html).toContain(
      'aria-label="BP converted: Last match —, overall 45%."',
    );
    // Nothing open until a vertex is hovered, focused or tapped.
    expect(html).not.toContain("game-profile-overall-ring");
    // The legend: both keys a short line — blue naming the match, slate
    // with the count; both focusable.
    expect(html).toMatch(
      /data-testid="game-profile-key-recent" tabindex="0"[\s\S]*?width="10"[\s\S]*?stroke="var\(--viz-you\)"[\s\S]*?Last match · vs Ruiz, Nov 7/,
    );
    expect(html).toMatch(
      /data-testid="game-profile-key-overall" tabindex="0"[\s\S]*?stroke="var\(--viz-opp\)"[\s\S]*?Overall · 12 matches/,
    );
    // Fades respect reduced motion.
    expect(html).toContain("motion-reduce:transition-none");
  });

  test("one match: Overall · 1 match", () => {
    expect(card().gameProfileOverallLegend(1)).toBe("Overall · 1 match");
  });
});

test.describe("Differential, with matches", () => {
  test("per-match winners minus errors, signed to one decimal", () => {
    const { SeasonDifferentialCard } = loader().load(
      PROFILE + "season-differential-card.tsx",
    ) as {
      SeasonDifferentialCard: React.ComponentType<Record<string, unknown>>;
    };
    const tally = (winners: number, unforcedErrors: number) => ({
      ...foldSeasonTallies([]).outcomes.you,
      winners,
      unforcedErrors,
    });
    const html = renderToStaticMarkup(
      React.createElement(SeasonDifferentialCard, {
        playerName: "Maya Chen",
        analyzed: 4,
        outcomes: {
          you: tally(40, 28),
          opp: tally(30, 36),
          errorSplitJudged: false,
        },
      }),
    );
    expect(html).toContain('data-testid="season-differential"');
    expect(html).toContain("Winners minus errors, per match");
    // 40−28 over 4 matches; 30−36 over 4.
    expect(html).toContain(">+3.0<");
    expect(html).toContain(">−1.5<");
    expect(html).toContain(">10.0<");
    expect(html).toContain(">7.0<");
    expect(html).toContain(">Chen<");
    expect(html).toContain(">Opponents<");
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
    // …and the component that does is rendered inside one — the `<Suspense`
    // nearest above it (the Visualizations body has its own after it).
    const statisticsBody = pageBody.indexOf("<ProfileStatisticsBody");
    const suspense = pageBody.lastIndexOf("<Suspense", statisticsBody);
    expect(suspense).toBeGreaterThan(-1);
    expect(pageBody.indexOf("<ProfileStatisticsPanePending")).toBeGreaterThan(
      suspense,
    );
    expect(pageBody.indexOf("<ProfileStatisticsPanePending")).toBeLessThan(
      statisticsBody,
    );
    expect(source).toMatch(
      /async function ProfileStatisticsBody[\s\S]*await getPlayerSeason\(/,
    );
  });
});
