import { expect, test } from "@playwright/test";
import * as React from "react";
import * as jsxRuntime from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";

import type { StatisticsContextValue } from "@/components/dashboard/statistics/statistics-provider";
import {
  applyStatisticsFilters,
  parseStatisticsSearch,
  type StatisticsSearchState,
} from "@/components/dashboard/statistics/statistics-search";
import {
  STATISTIC_GROUPS,
  changeTone,
  statisticsTableRows,
  type StatisticKey,
  type StatisticsMatch,
  type StatisticsTableRow,
} from "@/lib/data/statistics";
import { createLoader } from "./fixtures/vm-modules";

/**
 * The Statistics page's All statistics table, offline.
 *
 * Two halves, as `statistics-trend.spec.ts`: `statisticsTableRows` is pure
 * and is pinned directly — it is every figure the table prints — and the
 * table is rendered through `fixtures/vm-modules` for its own markup: the
 * note, the column labels, the chosen row, the dashes and the sparkline.
 */

const DIR = "src/components/dashboard/statistics/";

type Values = Partial<Record<StatisticKey, number | null>>;

let serial = 0;

/** A match holding only what the table reads: both seats' values. */
function match(values: Values, opponentValues: Values = {}): StatisticsMatch {
  serial += 1;
  return {
    id: `m${serial}`,
    date: `2026-03-${String((serial % 28) + 1).padStart(2, "0")}`,
    opponentName: `Opponent ${serial}`,
    opponentHand: null,
    opponentBackhand: null,
    courtType: null,
    values,
    opponentValues,
  } as unknown as StatisticsMatch;
}

/** One match per entry, oldest → newest, each holding the same keys. */
const season = (
  length: number,
  values: (index: number) => Values,
  opponentValues: (index: number) => Values = () => ({}),
) =>
  Array.from({ length }, (_, index) =>
    match(values(index), opponentValues(index)),
  );

const rowOf = (
  groups: ReturnType<typeof statisticsTableRows>,
  key: StatisticKey,
) =>
  groups
    .flatMap((group) => group.rows)
    .find((row) => row.key === key) as StatisticsTableRow;

/**
 * Ten matches, the newest five unlike the five before:
 *   double faults 4 → 2 (fewer, which is better) · aces 2 → 3 ·
 *   first serve in 66 → 60 · unforced errors 10 → 14 · winners level at 20.
 * First serve points won is measured in nine of the ten.
 */
const TEN = season(
  10,
  (index) => ({
    doubleFaults: index < 5 ? 4 : 2,
    aces: index < 5 ? 2 : 3,
    firstServeInPct: index < 5 ? 66 : 60,
    unforcedErrors: index < 5 ? 10 : 14,
    winners: 20,
    firstServeWinPct: index === 3 ? null : 60 + index,
  }),
  (index) => ({ doubleFaults: 3, firstServeInPct: index < 5 ? 58 : 62 }),
);

test.describe("statisticsTableRows", () => {
  test("Serve, Return, Points — the catalogue's groups, rows and labels, in its order", () => {
    const groups = statisticsTableRows(TEN, 5);
    expect(groups.map((group) => group.title)).toEqual([
      "Serve",
      "Return",
      "Points",
    ]);
    expect(
      groups.map((group) => ({
        title: group.title,
        rows: group.rows.map((row) => [row.key, row.label]),
      })),
    ).toEqual(
      STATISTIC_GROUPS.map((group) => ({
        title: group.title,
        rows: group.statistics.map((each) => [each.key, each.label]),
      })),
    );
    expect(groups.flatMap((group) => group.rows)).toHaveLength(15);
  });

  test("a row is its average, newest rolling value, change, tone, spark and opponents", () => {
    const groups = statisticsTableRows(TEN, 5);
    expect(rowOf(groups, "doubleFaults")).toEqual({
      key: "doubleFaults",
      label: "Double faults",
      average: 3,
      rolling: 2,
      change: -2,
      tone: "good",
      spark: [4, 4, 4, 2, 2, 2, 2, 2],
      opponents: 3,
    });
    expect(rowOf(groups, "firstServeInPct")).toMatchObject({
      average: 63,
      rolling: 60,
      change: -6,
      tone: "bad",
      opponents: 60,
    });
  });

  test("a lower-is-better decrease reads as good, and its rise as bad", () => {
    const groups = statisticsTableRows(TEN, 5);
    // Fewer double faults: the number fell and the player is better for it.
    expect(rowOf(groups, "doubleFaults")).toMatchObject({
      change: -2,
      tone: "good",
    });
    expect(rowOf(groups, "unforcedErrors")).toMatchObject({
      change: 4,
      tone: "bad",
    });
    // Where higher is better the same directions read the other way.
    expect(rowOf(groups, "aces")).toMatchObject({ change: 1, tone: "good" });
    expect(rowOf(groups, "firstServeInPct").tone).toBe("bad");
    expect(rowOf(groups, "winners")).toMatchObject({ change: 0, tone: "flat" });

    expect(changeTone(-0.5, true)).toBe("good");
    expect(changeTone(0.5, true)).toBe("bad");
    expect(changeTone(0.5, false)).toBe("good");
    expect(changeTone(-0.5, false)).toBe("bad");
    expect(changeTone(0, true)).toBe("flat");
    expect(changeTone(0, false)).toBe("flat");
  });

  test("Off: rolling, change and tone are null; the rest is unmoved", () => {
    const off = statisticsTableRows(TEN, null);
    for (const row of off.flatMap((group) => group.rows)) {
      expect(row.rolling, row.key).toBeNull();
      expect(row.change, row.key).toBeNull();
      expect(row.tone, row.key).toBeNull();
    }
    expect(rowOf(off, "doubleFaults")).toMatchObject({
      average: 3,
      spark: [4, 4, 4, 2, 2, 2, 2, 2],
      opponents: 3,
    });
  });

  test("short of one window there is no rolling value; short of two, no change", () => {
    const four = statisticsTableRows(TEN.slice(0, 4), 5);
    expect(rowOf(four, "aces")).toMatchObject({
      average: 2,
      rolling: null,
      change: null,
      tone: null,
    });
    const seven = statisticsTableRows(TEN.slice(0, 7), 5);
    expect(rowOf(seven, "aces")).toMatchObject({
      rolling: 2.4,
      change: null,
      tone: null,
    });
  });

  test("the spark is the last eight MEASURED values, oldest first", () => {
    // Nine measured of ten: index 3 is the gap, so the last eight start at 1.
    expect(
      rowOf(statisticsTableRows(TEN, 5), "firstServeWinPct").spark,
    ).toEqual([61, 62, 64, 65, 66, 67, 68, 69]);
    expect(
      rowOf(statisticsTableRows(TEN.slice(0, 2), 5), "firstServeWinPct").spark,
    ).toEqual([60, 61]);
  });

  test("a statistic nothing measured is null throughout, and no match is still fifteen rows", () => {
    expect(rowOf(statisticsTableRows(TEN, 5), "returnWinners")).toEqual({
      key: "returnWinners",
      label: "Return winners",
      average: null,
      rolling: null,
      change: null,
      tone: null,
      spark: [],
      opponents: null,
    });
    const none = statisticsTableRows([], 5).flatMap((group) => group.rows);
    expect(none).toHaveLength(15);
    for (const row of none) {
      expect(row).toMatchObject({ average: null, rolling: null, spark: [] });
    }
  });
});

/* ── The table ────────────────────────────────────────────────────────────── */

type RowProps = {
  "data-statistic": StatisticKey;
  "aria-selected": boolean;
  onClick: () => void;
  onKeyDown: (event: unknown) => void;
};

/**
 * Renders the table and returns its markup, what `setState` was handed, and
 * the props each statistic's row was drawn with — read off the JSX runtime,
 * since static markup carries no handlers.
 */
function draw(query: string, all: StatisticsMatch[]) {
  const rows: RowProps[] = [];
  const patches: Partial<StatisticsSearchState>[] = [];
  const spy =
    (create: (...args: unknown[]) => unknown) =>
    (...args: unknown[]) => {
      const props = args[1] as Partial<RowProps> | null;
      if (props?.["data-statistic"]) rows.push(props as RowProps);
      return create(...args);
    };
  const runtime = jsxRuntime as unknown as Record<
    string,
    (...args: unknown[]) => unknown
  >;
  const loader = createLoader({
    stubs: {
      "react/jsx-runtime": {
        ...runtime,
        jsx: spy(runtime.jsx),
        jsxs: spy(runtime.jsxs),
      },
    },
  });
  const { AllStatisticsTable } = loader.load(
    DIR + "all-statistics-table.tsx",
  ) as { AllStatisticsTable: React.ComponentType };
  const { StatisticsProvider } = loader.load(
    DIR + "statistics-provider.tsx",
  ) as {
    StatisticsProvider: React.ComponentType<{
      value: StatisticsContextValue;
      children?: React.ReactNode;
    }>;
  };
  const state = parseStatisticsSearch(new URLSearchParams(query));
  const value: StatisticsContextValue = {
    all,
    filtered: applyStatisticsFilters(all, state),
    points: [],
    state,
    setState: (patch) => patches.push(patch),
  };
  const html = renderToStaticMarkup(
    React.createElement(
      StatisticsProvider,
      { value },
      React.createElement(AllStatisticsTable),
    ),
  );
  return { html, rows, patches };
}

const render = (query: string, all: StatisticsMatch[]) => draw(query, all).html;

/** What a reader sees, sr-only text included. */
const text = (html: string) =>
  html
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const count = (html: string, needle: string) => html.split(needle).length - 1;

/** One statistic's row: its own element, opening tag to closing. */
function rowHtml(html: string, key: StatisticKey): string {
  const at = html.indexOf(`data-statistic="${key}"`);
  expect(at, key).toBeGreaterThan(-1);
  const next = html.indexOf('role="row"', at);
  return html.slice(
    html.lastIndexOf("<div", at),
    next === -1 ? undefined : html.lastIndexOf("<div", next),
  );
}

const GRID = "grid-cols-[minmax(200px,1fr)_72px_72px_64px_96px_88px]";
const DASH = ">—<";

/** The line beside the eyebrow. */
const note = (html: string) =>
  html.match(/<span class="text-micro tabular[^"]*">([^<]*)<\/span>/)?.[1];

const headers = (html: string) =>
  [...html.matchAll(/role="columnheader"[^>]*>(.*?)<\/span>/g)].map((found) =>
    text(found[1]),
  );

test.describe("the table, drawn", () => {
  const html = render("", TEN);

  test("the card, its eyebrow and the note of what is compared over how many", () => {
    expect(html).toContain("surface-card");
    expect(html).toMatch(/<h2[^>]*class="eyebrow"[^>]*>All statistics<\/h2>/);
    expect(note(html)).toBe("Last 5 matches against the 5 before · 10 matches");
    expect(note(render("window=3", TEN))).toBe(
      "Last 3 matches against the 3 before · 10 matches",
    );
    expect(note(render("", TEN.slice(0, 1)))).toBe(
      "Last 5 matches against the 5 before · 1 match",
    );
  });

  test("a 720px column the card scrolls, eyebrow and note inside it", () => {
    expect(html).toMatch(/<section[^>]*class="[^"]*overflow-x-auto/);
    const column = html.indexOf("min-w-[720px]");
    expect(column).toBeGreaterThan(-1);
    expect(html.indexOf("All statistics")).toBeGreaterThan(column);
    expect(html.indexOf("Last 5 matches against")).toBeGreaterThan(column);
  });

  test("column labels: Statistic for a reader, then the five measures, on the grid", () => {
    expect(headers(html)).toEqual([
      "Statistic",
      "Average",
      "Rolling 5",
      "Change",
      "Last 8",
      "Opponents",
    ]);
    expect(headers(render("window=10", TEN))[2]).toBe("Rolling 10");
    // The header row and each of the fifteen rows share one set of tracks.
    expect(count(html, GRID)).toBe(16);
    // No header left the grid: the sr-only label sits inside its cell.
    expect(html).toContain(
      '<span role="columnheader"><span class="sr-only">Statistic</span></span>',
    );
  });

  test("group header rows over their statistics, in the catalogue's order", () => {
    expect(
      [
        ...html.matchAll(
          /<span role="rowheader" class="eyebrow-sm">([^<]+)<\/span>/g,
        ),
      ].map((found) => found[1]),
    ).toEqual(["Serve", "Return", "Points"]);
    expect(
      [...html.matchAll(/data-statistic="(\w+)"/g)].map((found) => found[1]),
    ).toEqual(
      STATISTIC_GROUPS.flatMap((group) =>
        group.statistics.map((each) => each.key),
      ),
    );
  });

  test("figures are rounded at print, tabular, and a count carries no %", () => {
    const faults = rowHtml(html, "doubleFaults");
    expect(text(faults)).toContain("Double faults 3.0 2.0 ↓ 2");
    expect(text(faults)).toMatch(/3\.0$/);
    expect(faults).not.toContain("%");
    expect(count(faults, 'class="tabular')).toBe(4);

    const firstIn = rowHtml(html, "firstServeInPct");
    expect(text(firstIn)).toContain("First serve in 63% 60% ↓ 6");
    expect(text(firstIn)).toMatch(/60%$/);
  });

  test("Change: the arrow is the direction, the colour whether that is good", () => {
    const change = (key: StatisticKey) =>
      rowHtml(html, key).match(
        /font-medium" style="color:(var\(--[\w-]+\))"><span aria-hidden="true">([^<]*)</,
      );
    expect(change("doubleFaults")?.slice(1)).toEqual([
      "var(--viz-good)",
      "↓ 2",
    ]);
    expect(change("unforcedErrors")?.slice(1)).toEqual([
      "var(--viz-bad)",
      "↑ 4",
    ]);
    expect(change("aces")?.slice(1)).toEqual(["var(--viz-good)", "↑ 1"]);
    expect(change("firstServeInPct")?.slice(1)).toEqual([
      "var(--viz-bad)",
      "↓ 6",
    ]);
    expect(change("winners")?.slice(1)).toEqual(["var(--ink-500)", "→ 0"]);
    expect(text(rowHtml(html, "doubleFaults"))).toContain(
      "Down 2 on the 5 matches before",
    );
  });

  test("Last 8: an inline sparkline in --viz-you, read out for a screen reader", () => {
    const row = rowHtml(html, "firstServeWinPct");
    expect(row).toMatch(
      /<svg viewBox="0 0 80 24" width="80" height="24" aria-hidden="true"/,
    );
    expect(row).toContain('stroke="var(--viz-you)"');
    // Eight values, lowest at the foot of the box and highest at its head.
    const d = row.match(/ d="([^"]+)"/)?.[1] ?? "";
    expect(d.split("L")).toHaveLength(8);
    expect(d.startsWith("M1 22 ")).toBe(true);
    expect(d.endsWith("L79 2")).toBe(true);
    expect(row).not.toContain("kpi-empty-line");
    expect(text(row)).toContain("From 61% to 69% over the last 8 measured");
    // A row that never moved is a level line, not a division by zero.
    expect(rowHtml(html, "winners")).toContain("M1 12 ");
    expect(html).not.toContain("NaN");
  });

  test("Opponents is the quiet column: its label and its figures in ink-600", () => {
    expect(html).toMatch(
      /role="columnheader" class="[^"]*text-\[var\(--ink-600\)\]">Opponents</,
    );
    expect(rowHtml(html, "doubleFaults")).toMatch(
      /text-\[var\(--ink-600\)\]">3\.0<\/span>/,
    );
  });

  test("no chevron, no link, no button: a row chooses, it does not travel", () => {
    expect(html).not.toContain("<a ");
    expect(html).not.toContain("<button");
    expect(html).not.toContain("lucide");
  });
});

test.describe("the chosen row", () => {
  test('carries aria-selected="true", and is the only one that does', () => {
    const html = render("", TEN);
    expect(html).toContain('role="grid" aria-label="All statistics"');
    expect(count(html, 'aria-selected="true"')).toBe(1);
    expect(count(html, 'aria-selected="false"')).toBe(14);
    expect(html).toMatch(
      /role="row" data-statistic="firstServeWinPct" aria-selected="true" tabindex="0"/,
    );
    // The wash persists on it (table law 3: nothing to travel to).
    expect(rowHtml(html, "firstServeWinPct")).toMatch(
      /^[^>]*hover:bg-\[var\(--surface-muted\)\] bg-\[var\(--surface-muted\)\]/,
    );
    expect(rowHtml(html, "aces")).not.toMatch(
      /^[^>]*hover:bg-\[var\(--surface-muted\)\] bg-\[var\(--surface-muted\)\]/,
    );

    const other = render("stat=doubleFaults", TEN);
    expect(count(other, 'aria-selected="true"')).toBe(1);
    expect(other).toContain(
      'data-statistic="doubleFaults" aria-selected="true"',
    );
  });

  test("a click sets stat through the provider", () => {
    const { rows, patches } = draw("", TEN);
    expect(rows).toHaveLength(15);
    rows.find((row) => row["data-statistic"] === "doubleFaults")!.onClick();
    expect(patches).toEqual([{ stat: "doubleFaults" }]);
  });

  test("so do Enter and Space on the row; other keys and its children do not", () => {
    const { rows, patches } = draw("", TEN);
    const aces = rows.find((row) => row["data-statistic"] === "aces")!;
    const target = {};
    let prevented = 0;
    const press = (key: string, on: unknown = target) =>
      aces.onKeyDown({
        key,
        target: on,
        currentTarget: target,
        preventDefault: () => {
          prevented += 1;
        },
      });

    press("Enter");
    expect(patches).toEqual([{ stat: "aces" }]);
    press(" ");
    expect(patches).toEqual([{ stat: "aces" }, { stat: "aces" }]);
    // Space would otherwise scroll the page.
    expect(prevented).toBe(2);

    press("a");
    press("Tab");
    press("Enter", {});
    expect(patches).toHaveLength(2);
  });

  test("choosing the row already chosen writes nothing", () => {
    const { rows, patches } = draw("stat=aces", TEN);
    rows.find((row) => row["data-statistic"] === "aces")!.onClick();
    expect(patches).toEqual([]);
  });
});

test.describe("the dashes", () => {
  test("Return winners: a dash in every numeric cell, whatever the season", () => {
    for (const html of [render("", TEN), render("window=off", TEN)]) {
      const row = rowHtml(html, "returnWinners");
      // Average · Rolling · Change · Opponents; Last 8 holds no number.
      expect(count(row, DASH)).toBe(4);
      expect(text(row)).not.toMatch(/\d%|\d\.\d|[↑↓→]/);
      expect(row).not.toContain("var(--viz-you)");
      expect(row).toContain("kpi-empty-line");
    }
    expect(text(rowHtml(render("", TEN), "returnWinners"))).toBe(
      "Return winners — No average for return winners yet — No rolling average for return winners yet — Not enough matches to compare 5 against the 5 before Not enough matches to draw return winners yet — No opponent average for return winners yet",
    );
  });

  test("Off: Rolling and Change are dashes on every row, and the note says so", () => {
    const html = render("window=off", TEN);
    expect(note(html)).toBe("Rolling window off · 10 matches");
    expect(headers(html)[2]).toBe("Rolling");
    expect(html).not.toMatch(/[↑↓→]/);
    const faults = rowHtml(html, "doubleFaults");
    expect(text(faults)).toContain(
      "Double faults 3.0 — Rolling window off — Rolling window off",
    );
    expect(count(faults, DASH)).toBe(2);
    // The average, the sparkline and the opponents do not need a window.
    expect(faults).toContain('stroke="var(--viz-you)"');
    expect(text(faults)).toMatch(/3\.0$/);
  });

  test("short: Rolling dashes under one window, Change under two", () => {
    const four = rowHtml(render("", TEN.slice(0, 4)), "aces");
    expect(text(four)).toContain(
      "Aces 2.0 — No rolling average for aces yet — Not enough matches to compare 5 against the 5 before",
    );
    const seven = rowHtml(render("", TEN.slice(0, 7)), "aces");
    expect(text(seven)).toContain(
      "Aces 2.3 2.4 — Not enough matches to compare 5 against the 5 before",
    );
    // Change, and Opponents: no opponent in the fixture served an ace.
    expect(count(seven, DASH)).toBe(2);
  });

  test("under two values the sparkline is the grey placeholder, never a line through one point", () => {
    const one = rowHtml(render("", TEN.slice(0, 1)), "aces");
    expect(one).toContain("kpi-empty-line");
    expect(one).not.toContain("var(--viz-you)");
    expect(text(one)).toContain("Not enough matches to draw aces yet");
    const two = rowHtml(render("", TEN.slice(0, 2)), "aces");
    expect(two).toContain('stroke="var(--viz-you)"');
    expect(two).not.toContain("kpi-empty-line");
  });

  test("the placeholder's gradient ids are the table's own, one per row", () => {
    const html = render("", []);
    const ids = [...html.matchAll(/id="(kpi-empty-line-\d+)"/g)].map(
      (found) => found[1],
    );
    expect(ids).toHaveLength(15);
    expect(new Set(ids).size).toBe(15);
    // 0–4 are the season strip's, on the same page.
    for (const id of ids)
      expect(Number(id.split("-").pop())).toBeGreaterThan(4);
  });

  test("no matches: every row, sixty dashes, no figure and no skeleton", () => {
    for (const html of [render("", []), render("opponent=Nobody", TEN)]) {
      expect(note(html)).toBe(
        "Last 5 matches against the 5 before · 0 matches",
      );
      expect(count(html, "data-statistic=")).toBe(15);
      expect(count(html, DASH)).toBe(60);
      expect(text(html)).not.toMatch(/\d%|\d\.\d/);
      expect(html).not.toContain("var(--viz-you)");
      expect(html).not.toContain("data-pending-bar");
    }
  });
});
