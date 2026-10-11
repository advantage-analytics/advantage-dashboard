import { expect, test } from "@playwright/test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type { KpiDetailPoint } from "@/components/dashboard/shared/kpi-detail-chart";
import type { StatisticsContextValue } from "@/components/dashboard/statistics/statistics-provider";
import {
  applyStatisticsFilters,
  parseStatisticsSearch,
} from "@/components/dashboard/statistics/statistics-search";
import {
  trendSeries,
  type StatisticKey,
  type StatisticsMatch,
} from "@/lib/data/statistics";
import { createLoader } from "./fixtures/vm-modules";

/**
 * The Statistics page's Trend card, offline.
 *
 * Two halves. `trendSeries` is pure and is pinned directly — it is everything
 * the chart is handed. The card is rendered through `fixtures/vm-modules`
 * with `next/dynamic` stubbed to a probe: Recharts draws nothing useful on
 * the server, so what is asserted is the card's own markup (header, readout,
 * legend, empty sentence) and the props the chart received. The dark readout
 * is `KpiDetailChart`'s own tooltip, rendered by calling Recharts' `content`
 * element the way Recharts does.
 */

const DIR = "src/components/dashboard/statistics/";

/** A match holding only what the Trend card reads. */
function match(
  index: number,
  values: Partial<Record<StatisticKey, number | null>>,
  opponentName = `Opponent ${index + 1}`,
): StatisticsMatch {
  return {
    id: `m${index}`,
    date: `2026-03-${String(index + 1).padStart(2, "0")}`,
    opponentName,
    opponentHand: null,
    opponentBackhand: null,
    courtType: null,
    values,
  } as unknown as StatisticsMatch;
}

const season = (
  key: StatisticKey,
  values: (number | null)[],
): StatisticsMatch[] => values.map((v, i) => match(i, { [key]: v }));

test.describe("trendSeries", () => {
  const KEY: StatisticKey = "firstServeWinPct";

  test("points are the measured matches, oldest → newest, with date and opponent", () => {
    const series = trendSeries(season(KEY, [60, null, 70, 80]), KEY, null);
    expect(series.points).toEqual([
      { value: 60, date: "2026-03-01", opponent: "Opponent 1" },
      { value: 70, date: "2026-03-03", opponent: "Opponent 3" },
      { value: 80, date: "2026-03-04", opponent: "Opponent 4" },
    ]);
    expect(series.average).toBe(70);
  });

  test("values stay unrounded; an undated match is an empty date", () => {
    const [undated] = season(KEY, [66.666]);
    const series = trendSeries([{ ...undated, date: null }], KEY, 3);
    expect(series.points).toEqual([
      { value: 66.666, date: "", opponent: "Opponent 1" },
    ]);
    expect(series.average).toBe(66.7);
  });

  test("rolling lines up with the points and is null until a window is full", () => {
    const series = trendSeries(season(KEY, [60, 66, 72, 78, 84, 90]), KEY, 3);
    expect(series.rolling).toEqual([null, null, 66, 72, 78, 84]);
    expect(series.rolling).toHaveLength(series.points.length);
    expect(series.latest).toBe(84);
    // The last three (84) against the three before (66).
    expect(series.change).toBe(18);
  });

  test("the window counts matches, so an unmeasured one still fills its place", () => {
    const series = trendSeries(season(KEY, [60, null, 70, 80, null]), KEY, 3);
    // Windows end at matches 3, 4 and 5: (60,·,70) (·,70,80) (70,80,·).
    expect(series.points.map((p) => p.value)).toEqual([60, 70, 80]);
    expect(series.rolling).toEqual([null, 65, 75]);
    // The newest window ends at the unmeasured last match, which has no dot.
    expect(series.latest).toBe(75);
    expect(series.change).toBeNull();
  });

  test("a window that measured nothing is null at its point's neighbours only", () => {
    const series = trendSeries(
      season(KEY, [50, null, null, null, 70, 90]),
      KEY,
      3,
    );
    expect(series.points.map((p) => p.value)).toEqual([50, 70, 90]);
    expect(series.rolling).toEqual([null, 70, 80]);
    // (50,·,·) → 50 for the first window, then the all-null one, then these.
    expect(series.change).toBe(30);
  });

  test("Off: no rolling value anywhere, no latest and no change", () => {
    const series = trendSeries(season(KEY, [60, 66, 72, 78]), KEY, null);
    expect(series.rolling).toEqual([null, null, null, null]);
    expect(series.latest).toBeNull();
    expect(series.change).toBeNull();
    expect(series.average).toBe(69);
  });

  test("a series shorter than the window has no rolling value; change needs two windows", () => {
    const short = trendSeries(season(KEY, [60, 70]), KEY, 3);
    expect(short.rolling).toEqual([null, null]);
    expect(short.latest).toBeNull();
    expect(short.change).toBeNull();

    const oneWindow = trendSeries(season(KEY, [60, 70, 80, 90]), KEY, 3);
    expect(oneWindow.latest).toBe(80);
    expect(oneWindow.change).toBeNull();
  });

  test("nothing measured: no points, no average", () => {
    const series = trendSeries(season(KEY, [null, null]), "aces", 3);
    expect(series).toEqual({
      points: [],
      average: null,
      rolling: [],
      latest: null,
      change: null,
    });
    expect(trendSeries([], KEY, 5).points).toEqual([]);
  });
});

/* ── The card ─────────────────────────────────────────────────────────────── */

type ChartProps = {
  plotOnly?: boolean;
  label: string;
  points: KpiDetailPoint[];
  format?: string;
  average?: number | null;
  rolling?: (number | null)[];
  rollingWindow?: number | null;
};

/** What the card handed the chart on the last render, or null if it drew none. */
let chart: ChartProps | null = null;

function render(query: string, all: StatisticsMatch[]) {
  chart = null;
  const loader = createLoader({
    stubs: {
      "next/dynamic": {
        __esModule: true,
        default: () => (props: ChartProps) => {
          chart = props;
          return React.createElement("div", { "data-chart": "" });
        },
      },
    },
  });
  const { TrendCard } = loader.load(DIR + "trend-card.tsx") as {
    TrendCard: React.ComponentType;
  };
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
    setState: () => {},
  };
  return renderToStaticMarkup(
    React.createElement(
      StatisticsProvider,
      { value },
      React.createElement(TrendCard),
    ),
  );
}

/** What a reader sees, sr-only text included. */
const text = (html: string) =>
  html
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const count = (html: string, needle: string) => html.split(needle).length - 1;

/** The hairline legend row under the plot, as read. */
const legendRow = (html: string) =>
  text(html.slice(html.lastIndexOf("<div", html.indexOf("border-t"))));

/** Twelve matches climbing two points a match: 60, 62 … 82. */
const CLIMB = [60, 62, 64, 66, 68, 70, 72, 74, 76, 78, 80, 82];

test.describe("the Trend card, drawn", () => {
  const html = render(
    "stat=firstServeWinPct&window=5",
    season("firstServeWinPct", CLIMB),
  );
  const seen = text(html);

  test("header: the eyebrow, the statistic and its average", () => {
    expect(html).toMatch(/<h2[^>]*class="eyebrow"[^>]*>Trend<\/h2>/);
    expect(html).toContain(">First serve points won</span>");
    expect(seen).toContain("Average 71%");
    expect(html).toContain("surface-card");
  });

  test("window readout: the legend, the latest rolling value and the change", () => {
    // Last five average 78; the five before, 68.
    expect(seen).toContain("Rolling 5 78% ↑ 10");
    expect(seen).toContain("Up 10 on the 5 matches before");
    expect(html).toContain('style="color:var(--viz-good)"');
  });

  test("legend row and caption", () => {
    expect(legendRow(html)).toBe("Each match Rolling 5 Average 12 matches");
    expect(html).toContain("border-t border-[var(--border-hairline)]");
  });

  test("the chart is handed exactly trendSeries, and asked for its plot alone", () => {
    const series = trendSeries(
      season("firstServeWinPct", CLIMB),
      "firstServeWinPct",
      5,
    );
    expect(chart).toMatchObject({
      plotOnly: true,
      format: "percent",
      points: series.points,
      average: 71,
      rolling: series.rolling,
      rollingWindow: 5,
    });
    expect(chart?.rolling?.slice(0, 5)).toEqual([null, null, null, null, 64]);
    expect(chart?.label).toContain("First serve points won in each of 12");
    expect(count(html, "data-chart")).toBe(1);
    expect(html).not.toContain("Not enough matches");
  });
});

test.describe("the Trend card's change, by direction", () => {
  const fall = [...CLIMB].reverse();

  test("a fall is ↓ and bad", () => {
    const html = render(
      "stat=firstServeWinPct&window=5",
      season("firstServeWinPct", fall),
    );
    expect(text(html)).toContain("Rolling 5 64% ↓ 10");
    expect(html).toContain('style="color:var(--viz-bad)"');
    expect(html).not.toContain("var(--viz-good)");
  });

  test("lower is better: a fall in double faults is ↓ and good, a rise ↑ and bad", () => {
    const fewer = render(
      "stat=doubleFaults&window=3",
      season("doubleFaults", [6, 6, 6, 3, 3, 4]),
    );
    expect(text(fewer)).toContain("Rolling 3 3.3 ↓ 2.7");
    expect(fewer).toContain('style="color:var(--viz-good)"');
    // A count prints no percent sign, and its mean keeps a decimal.
    expect(text(fewer)).toContain("Average 4.7");
    expect(text(fewer)).not.toContain("%");

    const more = render(
      "stat=doubleFaults&window=3",
      season("doubleFaults", [3, 3, 3, 6, 6, 6]),
    );
    expect(text(more)).toContain("Rolling 3 6.0 ↑ 3");
    expect(more).toContain('style="color:var(--viz-bad)"');
  });

  test("no movement is → in ink, neither good nor bad", () => {
    const html = render(
      "stat=firstServeWinPct&window=3",
      season("firstServeWinPct", [70, 70, 70, 70, 70, 70]),
    );
    expect(text(html)).toContain("Rolling 3 70% → 0");
    expect(html).toContain('style="color:var(--ink-500)"');
    expect(html).not.toContain("var(--viz-good)");
    expect(html).not.toContain("var(--viz-bad)");
  });
});

test.describe("the Trend card's window readout, unmeasured", () => {
  test("Off: a dash for the value and the change, and no rolling line or legend", () => {
    const html = render(
      "stat=firstServeWinPct&window=off",
      season("firstServeWinPct", CLIMB),
    );
    expect(text(html)).toContain("Average 71% Rolling — Rolling window off —");
    expect(text(html)).not.toMatch(/Rolling \d/);
    expect(html).not.toMatch(/[↑↓→]/);
    expect(legendRow(html)).toBe("Each match Average 12 matches");
    expect(chart?.rollingWindow).toBeNull();
    expect(chart?.rolling?.every((v) => v === null)).toBe(true);
    // The chart is still drawn: the matches and their average need no window.
    expect(chart?.points).toHaveLength(12);
  });

  test("a short series: the legend stays, both figures are dashes", () => {
    const html = render(
      "stat=firstServeWinPct&window=5",
      season("firstServeWinPct", [60, 70, 80]),
    );
    expect(text(html)).toContain(
      "Average 70% Rolling 5 — No rolling average yet — Not enough matches to compare 5 against the 5 before",
    );
    expect(html).not.toMatch(/[↑↓→]/);
    expect(chart?.points).toHaveLength(3);
  });

  test("one full window: a value, and a dash for the change", () => {
    const html = render(
      "stat=firstServeWinPct&window=3",
      season("firstServeWinPct", [60, 70, 80, 90]),
    );
    expect(text(html)).toContain("Rolling 3 80% —");
    expect(html).not.toMatch(/[↑↓→]/);
  });

  test("matches that did not measure the statistic are counted apart", () => {
    const html = render(
      "stat=firstServeWinPct&window=off",
      season("firstServeWinPct", [60, null, 80, 70]),
    );
    expect(text(html)).toContain("3 of 4 matches");
  });
});

test.describe("the Trend card with fewer than two measured matches", () => {
  const SENTENCE = "Not enough matches to draw a trend yet";

  for (const [name, all] of [
    ["one match", season("firstServeWinPct", [64])],
    ["no match", []],
    ["matches, none measuring it", season("aces", [3, 5, 4])],
  ] as const) {
    test(`${name}: the card's anatomy, one sentence, no chart`, () => {
      const html = render("stat=firstServeWinPct&window=5", [...all]);
      expect(count(html, SENTENCE)).toBe(1);
      expect(chart).toBeNull();
      expect(html).not.toContain("data-chart");
      // Its own anatomy: eyebrow, statistic, both readouts, the legend row.
      expect(html).toMatch(/<h2[^>]*>Trend<\/h2>/);
      expect(html).toContain(">First serve points won</span>");
      expect(text(html)).toContain("Rolling 5 —");
      expect(text(html)).toContain("Each match Rolling 5 Average");
      // Honest zero: never a bar, never an arrow, never an invented figure.
      expect(html).not.toContain("data-pending-bar");
      expect(html).not.toMatch(/[↑↓→]/);
    });
  }

  test("one match still states its own average; none prints a dash", () => {
    const one = render(
      "stat=firstServeWinPct&window=5",
      season("firstServeWinPct", [64]),
    );
    expect(text(one)).toContain("Average 64%");
    expect(text(one)).toContain("1 match");

    const none = render("stat=firstServeWinPct&window=5", []);
    expect(text(none)).toContain("Average — No average yet");
    expect(text(none)).toContain("0 matches");
    expect(text(none)).not.toMatch(/\d%/);
  });
});

/* ── The chart's dark readout ─────────────────────────────────────────────── */

test.describe("KpiDetailChart", () => {
  /** Every element Recharts was handed, by the stub that stands in for it. */
  type Captured = Record<string, Record<string, unknown>[]>;

  function draw(props: ChartProps) {
    const captured: Captured = {};
    const part = (name: string) =>
      function RechartsPart(p: Record<string, unknown>) {
        (captured[name] ??= []).push(p);
        // SVG elements, so the chart's own `<defs>` sits where it belongs.
        return React.createElement(
          name === "ResponsiveContainer"
            ? "div"
            : name === "AreaChart"
              ? "svg"
              : "g",
          { "data-recharts": name },
          p.children as React.ReactNode,
        );
      };
    const loader = createLoader({
      stubs: {
        recharts: Object.fromEntries(
          [
            "AreaChart",
            "Area",
            "XAxis",
            "YAxis",
            "CartesianGrid",
            "Tooltip",
            "ResponsiveContainer",
            "ReferenceLine",
            "Dot",
          ].map((name) => [name, part(name)]),
        ),
        "framer-motion": { useReducedMotion: () => true },
      },
    });
    const { default: KpiDetailChart } = loader.load(
      "src/components/dashboard/shared/kpi-detail-chart.tsx",
    ) as { default: React.ComponentType<ChartProps> };
    const html = renderToStaticMarkup(
      React.createElement(KpiDetailChart, props),
    );
    return { html, captured };
  }

  /** The readout for the datum at `index`, rendered as Recharts renders it. */
  function readout(captured: Captured, index: number) {
    const data = captured.AreaChart[0].data as Record<string, unknown>[];
    const content = captured.Tooltip[0].content as React.ReactElement;
    return renderToStaticMarkup(
      React.cloneElement(content, {
        active: true,
        payload: [{ payload: data[index] }],
      } as Record<string, unknown>),
    );
  }

  const POINTS: KpiDetailPoint[] = [
    { value: 62.4, date: "2026-08-30", opponent: "Priya Nair" },
    { value: 70, date: "2026-09-07", opponent: "Olivia Opponent" },
    { value: 78.6, date: "2026-09-14", opponent: "Marcus Hale" },
  ];

  test("without the new props it is the popover chart it was", () => {
    const { html, captured } = draw({
      label: "First serve",
      points: POINTS,
      format: "percent",
    });
    expect(html).toContain('<div class="w-[280px]">');
    expect(html).toContain("Last 3 matches");
    expect(captured.ReferenceLine).toBeUndefined();
    expect(captured.Area).toHaveLength(1);
    expect(captured.Area[0]).toMatchObject({
      dataKey: "value",
      strokeWidth: 2,
      fill: "url(#kpiDetailGradient)",
    });
    expect(captured.Area[0].stroke).not.toBe("none");
    expect(captured.AreaChart[0].data).toEqual(
      POINTS.map((p, index) => ({ ...p, index })),
    );
    const tip = readout(captured, 2);
    expect(text(tip)).toMatch(/^Marcus Hale \S+ \d+ 79%$/);
    expect(tip).toContain("rounded-[12px]");
    expect(tip).toContain("background:var(--ink-900)");
  });

  test("average draws a dashed reference line; rolling draws a second series", () => {
    const { html, captured } = draw({
      plotOnly: true,
      label: "First serve points won in each of 3 matches",
      points: POINTS,
      format: "percent",
      average: 70.3,
      rolling: [null, 66.2, 74.3],
      rollingWindow: 2,
    });
    expect(captured.ReferenceLine).toHaveLength(1);
    expect(captured.ReferenceLine[0]).toMatchObject({
      y: 70.3,
      strokeDasharray: "4 4",
    });
    expect(captured.Area.map((a) => a.dataKey)).toEqual(["value", "rolling"]);
    // Each match is a dot alone; the line is the rolling mean.
    expect(captured.Area[0]).toMatchObject({ stroke: "none", fill: "none" });
    expect(captured.Area[0].dot).toBeTruthy();
    expect(captured.Area[1]).toMatchObject({ strokeWidth: 2, dot: false });
    expect(
      (captured.AreaChart[0].data as { rolling: number | null }[]).map(
        (d) => d.rolling,
      ),
    ).toEqual([null, 66.2, 74.3]);
    // The plot alone: named for assistive technology, no 280px box or heading.
    expect(html).toContain(
      'role="img" aria-label="First serve points won in each of 3 matches"',
    );
    expect(html).not.toContain("w-[280px]");
    expect(html).not.toContain("Last 3 matches");
  });

  test("the readout: opponent, date, this match, and the rolling value where one exists", () => {
    const { captured } = draw({
      plotOnly: true,
      label: "Trend",
      points: POINTS,
      format: "percent",
      average: 70.3,
      rolling: [null, 66.2, 74.3],
      rollingWindow: 2,
    });
    const last = readout(captured, 2);
    expect(text(last)).toMatch(
      /^Marcus Hale \S+ \d+ 79% this match 74% rolling 2$/,
    );
    expect(last).toContain("rounded-[12px]");
    expect(last).toContain("background:var(--ink-900)");
    // The window is not full at the first match: no rolling line.
    const first = readout(captured, 0);
    expect(text(first)).toMatch(/^Priya Nair \S+ \d+ 62% this match$/);
    expect(first).not.toContain("rolling");
  });

  test("a count statistic prints no percent sign in the readout", () => {
    const { captured } = draw({
      plotOnly: true,
      label: "Trend",
      points: POINTS.map((p, i) => ({ ...p, value: i + 3 })),
      format: "count",
      average: 4,
      rolling: [null, 3.5, 4.5],
      rollingWindow: 2,
    });
    expect(text(readout(captured, 2))).toMatch(
      /^Marcus Hale \S+ \d+ 5 this match 4\.5 rolling 2$/,
    );
  });

  test("average alone draws the line and leaves the series as it was", () => {
    const { captured } = draw({
      label: "First serve",
      points: POINTS,
      format: "percent",
      average: 70.3,
    });
    expect(captured.ReferenceLine).toHaveLength(1);
    expect(captured.Area).toHaveLength(1);
    expect(text(readout(captured, 2))).not.toContain("this match");
  });

  test("the plot alone draws nothing under two points; the card says why", () => {
    const { html } = draw({
      plotOnly: true,
      label: "Trend",
      points: POINTS.slice(0, 1),
    });
    expect(html).toBe("");
  });
});
