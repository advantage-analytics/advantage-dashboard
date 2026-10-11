import { expect, test } from "@playwright/test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type { DbStatRow } from "@/lib/data/player-profile";
import {
  toStatisticsMatches,
  type StatisticsMatch,
  type StatisticsMatchRow,
} from "@/lib/data/statistics";
import type { StatisticsContextValue } from "@/components/dashboard/statistics/statistics-provider";
import { createLoader } from "./fixtures/vm-modules";

/**
 * The personal Statistics page's states, offline: each is rendered through
 * `fixtures/vm-modules` from the real components — the season strip, the
 * placeholder regions, the day-zero offer — with only `next/*` stubbed.
 *
 * Three states that must never borrow one another's treatment
 * (empty-and-loading.md):
 *
 *   - **day zero** — no analyzed match: one offer over the page's own shape,
 *     dimmed and `inert`
 *   - **filtered to nothing** — a season exists and the URL excludes all of
 *     it: the page stays, every region keeps its anatomy with `—`, one
 *     sentence says why, and there is a way back
 *   - **loading** — the only state that draws a bar
 */

const DIR = "src/components/dashboard/statistics/";

/** What the router was last asked for. */
let replaced: { href: string; options: unknown } | null = null;

function load(query = "") {
  const link = ({
    href,
    children,
    ...rest
  }: {
    href: string;
    children: React.ReactNode;
  }) => React.createElement("a", { href, ...rest }, children);
  return createLoader({
    stubs: {
      "next/link": { __esModule: true, default: link },
      "next/dynamic": { __esModule: true, default: () => () => null },
      "next/navigation": {
        useSearchParams: () => new URLSearchParams(query),
        usePathname: () => "/dashboard/statistics",
        useRouter: () => ({
          replace: (href: string, options: unknown) => {
            replaced = { href, options };
          },
          refresh: () => {},
        }),
      },
    },
    globals: { URLSearchParams, Intl },
  });
}

function render(
  loader: ReturnType<typeof createLoader>,
  file: string,
  exportName: string,
  props: Record<string, unknown> = {},
) {
  const exports = loader.load(DIR + file) as Record<
    string,
    React.ComponentType<Record<string, unknown>>
  >;
  return renderToStaticMarkup(React.createElement(exports[exportName], props));
}

const count = (html: string, needle: string) => html.split(needle).length - 1;

/** What a reader sees: the markup with its tags and attributes dropped. */
const text = (html: string) => html.replace(/<[^>]*>/g, " ");

/** Every em dash an `EmptyMark` drew — hidden from assistive technology. */
const marks = (html: string) => count(html, '<span aria-hidden="true"');

const ME = "user-me";

function row(overrides: Partial<StatisticsMatchRow>): StatisticsMatchRow {
  return {
    id: "m",
    date: "2026-03-01",
    player1_id: ME,
    player2_id: null,
    player1_name: "Me Myself",
    player2_name: "Olivia Opponent",
    created_by: ME,
    score: null,
    court_type: "hard",
    opponent_hand: "right",
    opponent_backhand: "two-handed",
    source_provider: null,
    ...overrides,
  };
}

/** Two right-handers and one left-hander, oldest → newest. */
const ROWS = [
  row({ id: "a", date: "2026-01-18" }),
  row({ id: "b", date: "2026-05-02", opponent_hand: "left" }),
  row({ id: "c", date: "2026-09-28", court_type: "clay" }),
];
const SEASON: StatisticsMatch[] = toStatisticsMatches(
  ROWS,
  ROWS.map(
    (each) => ({ match_id: each.id, is_player1: true }) as unknown as DbStatRow,
  ),
  [ME],
  ME,
);

const REGIONS = [
  "Trend",
  "By opponent type",
  "All statistics",
  "Rally length",
  "How points ended",
];

test.describe("day zero", () => {
  const html = render(load(), "statistics-day-zero.tsx", "StatisticsDayZero", {
    awaitingReport: false,
  });

  test("one offer, to Matches", () => {
    expect(html).toContain("Every match you send adds to these numbers.");
    expect(html).toContain("Send a match from Matches to start.");
    expect(count(html, "<a ")).toBe(1);
    expect(html).toMatch(
      /<a href="\/dashboard\/matches"[^>]*>View matches<\/a>/,
    );
    // The match pair belongs to Home and Matches; this page offers one door.
    expect(html).not.toContain("Send match video");
  });

  test("the page's own shape below it, inert and described", () => {
    expect(html).toContain("Nothing below is real data yet.");
    const tail = html.slice(html.indexOf("inert"));
    expect(html).toContain(' inert=""');
    for (const region of REGIONS) expect(tail, region).toContain(`>${region}<`);
    expect(tail).toContain('aria-label="Season averages"');
    // The strip's day-zero hint, and a dash where each region's values go.
    expect(tail).toContain("After your first match");
    expect(marks(tail)).toBeGreaterThan(75);
  });

  test("no title row, no skeleton, no figure", () => {
    expect(html).not.toContain("<h1");
    expect(html).not.toContain("data-pending-bar");
    expect(html).not.toContain('aria-label="Loading');
    expect(text(html)).not.toMatch(/\d%/);
    expect(html).not.toContain("No matches fit these filters");
  });

  test("a match sent and not yet back says so, in the offer and the strip", () => {
    const awaiting = render(
      load(),
      "statistics-day-zero.tsx",
      "StatisticsDayZero",
      { awaitingReport: true },
    );
    expect(awaiting).toContain("Your first report is on its way.");
    expect(awaiting).toContain("When the report lands");
    expect(awaiting).not.toContain("After your first match");
    expect(awaiting).toMatch(/<a href="\/dashboard\/matches"/);
  });
});

test.describe("a season that filters to nothing", () => {
  // Nobody in the fixture plays a one-handed backhand.
  const html = render(
    load("backhand=one-handed&window=3"),
    "statistics-page-content.tsx",
    "StatisticsPageContent",
    { matches: SEASON, points: [] },
  );

  test("says so once, with a way back", () => {
    expect(count(html, "No matches fit these filters.")).toBe(1);
    expect(html).toContain(">Clear filters</button>");
    // The Opponent-type trigger states the cut in the Matches page's words.
    expect(html).toContain("Opponents with a one-handed backhand");
  });

  test("keeps the page: every region, its labels, and a dash per value", () => {
    for (const region of REGIONS) expect(html, region).toContain(`>${region}<`);
    // The strip's own empty anatomy, with the page's reason under each rule.
    expect(html).toContain('aria-label="Season averages"');
    expect(html).toContain("No matches fit these filters</p>");
    // The table's fifteen rows by four figure columns are dashes on their own.
    expect(html).toContain("First serve points won");
    expect(html).toContain("Rolling 3");
    expect(marks(html)).toBeGreaterThan(75);
    expect(html).toContain("—");
    expect(html).toContain("0 matches");
  });

  test("is neither the day zero nor a skeleton, and invents no figure", () => {
    expect(html).not.toContain("Every match you send adds to these numbers.");
    expect(html).not.toContain("inert");
    expect(html).not.toContain("After your first match");
    expect(html).not.toContain("data-pending-bar");
    expect(html).not.toContain('aria-label="Loading');
    expect(text(html)).not.toMatch(/\d%/);
  });
});

test.describe("StatisticsPageContent's provider", () => {
  /** The body, replaced by a probe that reports what the context holds. */
  function probe(query: string, points: unknown = []) {
    let seen: StatisticsContextValue | null = null;
    const loader = load(query);
    const provider = loader.load(DIR + "statistics-provider.tsx") as {
      useStatistics: () => StatisticsContextValue;
    };
    const withProbe = createLoader({
      stubs: {
        "next/navigation": {
          useSearchParams: () => new URLSearchParams(query),
          usePathname: () => "/dashboard/statistics",
          useRouter: () => ({
            replace: (href: string, options: unknown) => {
              replaced = { href, options };
            },
          }),
        },
        "@/components/dashboard/statistics/statistics-provider": provider,
        "@/components/dashboard/statistics/statistics-body": {
          StatisticsBody: () => {
            seen = provider.useStatistics();
            return null;
          },
        },
      },
      globals: { URLSearchParams },
    });
    const { StatisticsPageContent } = withProbe.load(
      DIR + "statistics-page-content.tsx",
    ) as {
      StatisticsPageContent: React.ComponentType<Record<string, unknown>>;
    };
    renderToStaticMarkup(
      React.createElement(StatisticsPageContent, { matches: SEASON, points }),
    );
    return seen as unknown as StatisticsContextValue;
  }

  test("provides all, filtered, points and the parsed state", () => {
    const value = probe("hand=right&matches=5&stat=aces");
    expect(value.all.map((m) => m.id)).toEqual(["a", "b", "c"]);
    expect(value.filtered.map((m) => m.id)).toEqual(["a", "c"]);
    expect(value.points).toEqual([]);
    expect(value.state).toMatchObject({
      hand: "right",
      matches: 5,
      stat: "aces",
      window: 5,
    });
  });

  test("a failed points read reaches the regions as null", () => {
    expect(probe("", null).points).toBeNull();
  });

  test("setState replaces the URL with the merged, serialized state", () => {
    const value = probe("hand=left&stat=aces");
    replaced = null;
    value.setState({ window: null, hand: null });
    expect(replaced).toEqual({
      href: "/dashboard/statistics?window=off&stat=aces",
      options: { scroll: false },
    });
    // Back at rest the URL is bare, not a trailing "?".
    value.setState({ hand: null, stat: "firstServeWinPct" });
    expect(replaced).toMatchObject({ href: "/dashboard/statistics" });
  });
});

test.describe("the title row", () => {
  const { statisticsSummary } = load().load(
    DIR + "statistics-title-row.tsx",
  ) as {
    statisticsSummary: (
      matches: { date: string | null; won: boolean | null }[],
      now?: Date,
    ) => string;
  };
  const NOW = new Date("2026-10-07T12:00:00Z");
  const match = (date: string | null, won: boolean | null = null) => ({
    date,
    won,
  });

  test("counts, the season's first and last date, and the wins", () => {
    expect(
      statisticsSummary(
        [
          match("2026-01-18", true),
          match("2026-05-02", false),
          match("2026-09-28", true),
        ],
        NOW,
      ),
    ).toBe("3 analyzed matches · Jan 18 – Sep 28 · 2 won");
  });

  test("one match is singular and one date; an undecided result is not a win", () => {
    expect(statisticsSummary([match("2026-09-28")], NOW)).toBe(
      "1 analyzed match · Sep 28 · 0 won",
    );
  });

  test("a date is read as the calendar day it names, whatever the zone", () => {
    // Parsed as local time, the first of a month prints as the day before
    // anywhere west of Greenwich.
    expect(
      statisticsSummary([match("2026-03-01"), match("2026-08-01")], NOW),
    ).toContain("Mar 1 – Aug 1");
  });

  test("names the year only where the reader could not supply it", () => {
    expect(
      statisticsSummary([match("2025-11-03"), match("2026-09-28")], NOW),
    ).toContain("Nov 3, 2025 – Sep 28, 2026");
    expect(
      statisticsSummary([match("2025-02-03"), match("2025-09-28")], NOW),
    ).toContain("Feb 3 – Sep 28, 2025");
  });

  test("undated matches are counted and left out of the range", () => {
    expect(
      statisticsSummary([match(null, true), match("2026-09-28", true)], NOW),
    ).toBe("2 analyzed matches · Sep 28 · 2 won");
    expect(statisticsSummary([match(null, true)], NOW)).toBe(
      "1 analyzed match · 1 won",
    );
  });
});

test.describe("loading", () => {
  const loader = load();
  const frame = render(loader, "statistics-skeleton.tsx", "StatisticsSkeleton");
  const region = render(loader, "statistics-skeleton.tsx", "StatisticsPending");

  test("one status each, on the page's ground or inside its column", () => {
    for (const html of [frame, region]) {
      expect(count(html, 'role="status"')).toBe(1);
      expect(html).toContain('role="status" aria-label="Loading statistics"');
    }
    expect(frame).toContain("bg-[var(--surface-card)]");
  });

  test("what the page already knows is real text; what is arriving is a bar", () => {
    for (const html of [frame, region]) {
      expect(html).toContain(">Statistics</h1>");
      for (const name of REGIONS) expect(html, name).toContain(`>${name}<`);
      expect(html).toContain("Second serve returns won");
      expect(count(html, "data-pending-bar")).toBeGreaterThan(75);
      // A bar, never a dash and never a figure: nothing is known to be empty.
      expect(html).not.toContain("—");
      expect(text(html)).not.toMatch(/\d%/);
      expect(html).not.toContain("<button");
      expect(html).not.toContain("<a ");
    }
  });

  test("the route fallback and the page fallback draw the same body", () => {
    // From the title down, less the wrappers' closing tags and the ids
    // `useId` mints per tree.
    const body = (html: string) =>
      html
        .slice(html.indexOf("<h1"))
        .replace(/(<\/div>)+$/, "")
        .replace(/ (id|aria-labelledby)="[^"]*"/g, "");
    expect(body(region)).toBe(body(frame));
  });
});
