import { expect, test } from "@playwright/test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type { StatisticsContextValue } from "@/components/dashboard/statistics/statistics-provider";
import {
  applyStatisticsFilters,
  parseStatisticsSearch,
} from "@/components/dashboard/statistics/statistics-search";
import {
  opponentSplits,
  type StatisticKey,
  type StatisticsMatch,
} from "@/lib/data/statistics";
import { createLoader } from "./fixtures/vm-modules";

/**
 * The Statistics page's By opponent type card, offline.
 *
 * Two halves, as `statistics-trend.spec.ts`: `opponentSplits` is pure and is
 * pinned directly — it is every figure the card prints — and the card is
 * rendered through `fixtures/vm-modules` for its own markup: the grid, the
 * bars and their two fills, the footer, and the empty anatomy.
 */

const DIR = "src/components/dashboard/statistics/";

interface Against {
  hand?: string | null;
  backhand?: string | null;
  court?: string | null;
}

let serial = 0;

/** A match holding only what the split card reads. */
function match(
  against: Against,
  values: Partial<Record<StatisticKey, number | null>>,
): StatisticsMatch {
  serial += 1;
  return {
    id: `m${serial}`,
    date: `2026-03-${String((serial % 28) + 1).padStart(2, "0")}`,
    opponentName: `Opponent ${serial}`,
    opponentHand: against.hand ?? null,
    opponentBackhand: against.backhand ?? null,
    courtType: against.court ?? null,
    values,
  } as unknown as StatisticsMatch;
}

const KEY: StatisticKey = "firstServeWinPct";
const won = (value: number | null) => ({ [KEY]: value });

test.describe("opponentSplits", () => {
  test("three groups in order, each row its label, n, mean and lead", () => {
    const splits = opponentSplits(
      [
        match(
          { hand: "right", backhand: "two-handed", court: "hard" },
          won(70),
        ),
        match(
          { hand: "right", backhand: "one-handed", court: "clay" },
          won(76),
        ),
        match({ hand: "left", backhand: "two-handed", court: "hard" }, won(60)),
      ],
      KEY,
    );
    expect(splits).toEqual([
      {
        title: "Hand",
        rows: [
          { label: "Right-handed", n: 2, value: 73, leader: true },
          { label: "Left-handed", n: 1, value: 60, leader: false },
        ],
      },
      {
        title: "Backhand",
        rows: [
          { label: "Two-handed", n: 2, value: 65, leader: false },
          { label: "One-handed", n: 1, value: 76, leader: true },
        ],
      },
      {
        title: "Court",
        rows: [
          { label: "Clay", n: 1, value: 76, leader: true },
          { label: "Hard", n: 2, value: 65, leader: false },
        ],
      },
    ]);
  });

  test("a null value is not counted in n, nor averaged as a zero", () => {
    const [hand] = opponentSplits(
      [
        match({ hand: "right" }, won(80)),
        match({ hand: "right" }, won(null)),
        match({ hand: "right" }, {}),
        match({ hand: "left" }, won(50)),
      ],
      KEY,
    );
    expect(hand.rows).toEqual([
      { label: "Right-handed", n: 1, value: 80, leader: true },
      { label: "Left-handed", n: 1, value: 50, leader: false },
    ]);
  });

  test("a row nothing measured is omitted, and a group left with no rows", () => {
    const splits = opponentSplits(
      [
        match({ hand: "right", backhand: "two-handed" }, won(70)),
        // Left-handers were played, and none of those matches measured it.
        match({ hand: "left" }, won(null)),
        // A court was recorded only on a match that did not measure it.
        match({ court: "grass" }, won(null)),
      ],
      KEY,
    );
    expect(splits).toEqual([
      {
        title: "Hand",
        rows: [{ label: "Right-handed", n: 1, value: 70, leader: false }],
      },
      {
        title: "Backhand",
        rows: [{ label: "Two-handed", n: 1, value: 70, leader: false }],
      },
    ]);
  });

  test("no attribute recorded, nothing measured, no matches: no groups", () => {
    expect(opponentSplits([match({}, won(70))], KEY)).toEqual([]);
    expect(opponentSplits([match({ hand: "left" }, won(70))], "aces")).toEqual(
      [],
    );
    expect(opponentSplits([], KEY)).toEqual([]);
  });

  test("courts are one row per distinct surface, whatever its casing", () => {
    const splits = opponentSplits(
      [
        match({ court: "Hard" }, won(60)),
        match({ court: " hard " }, won(70)),
        match({ court: "CLAY" }, won(50)),
        match({ court: "grass" }, won(90)),
        match({ court: "  " }, won(10)),
      ],
      KEY,
    );
    expect(splits).toEqual([
      {
        title: "Court",
        rows: [
          { label: "Clay", n: 1, value: 50, leader: false },
          { label: "Grass", n: 1, value: 90, leader: true },
          { label: "Hard", n: 2, value: 65, leader: false },
        ],
      },
    ]);
  });

  test("hand and backhand match without regard to casing; an unknown value has no row", () => {
    const splits = opponentSplits(
      [
        match({ hand: "Right", backhand: " Two-Handed " }, won(70)),
        match({ hand: "ambidextrous", backhand: "none" }, won(10)),
      ],
      KEY,
    );
    expect(splits.map((g) => [g.title, g.rows.map((r) => r.label)])).toEqual([
      ["Hand", ["Right-handed"]],
      ["Backhand", ["Two-handed"]],
    ]);
  });

  test("the lead is the lowest where lower is better", () => {
    const [hand] = opponentSplits(
      [
        match({ hand: "right" }, { doubleFaults: 4 }),
        match({ hand: "left" }, { doubleFaults: 2 }),
      ],
      "doubleFaults",
    );
    expect(hand.rows.map((row) => [row.label, row.leader])).toEqual([
      ["Right-handed", false],
      ["Left-handed", true],
    ]);
  });

  test("no lead for a single row, nor for a best that is shared", () => {
    const [alone] = opponentSplits([match({ hand: "left" }, won(70))], KEY);
    expect(alone.rows).toEqual([
      { label: "Left-handed", n: 1, value: 70, leader: false },
    ]);

    const [tied] = opponentSplits(
      [match({ hand: "right" }, won(70)), match({ hand: "left" }, won(70))],
      KEY,
    );
    expect(tied.rows.map((row) => row.leader)).toEqual([false, false]);

    const [court] = opponentSplits(
      [
        match({ court: "hard" }, won(70)),
        match({ court: "clay" }, won(70)),
        match({ court: "grass" }, won(40)),
      ],
      KEY,
    );
    expect(court.rows.map((row) => row.leader)).toEqual([false, false, false]);
  });

  test("the mean is averageOf: unrounded inputs, one decimal out", () => {
    const [hand] = opponentSplits(
      [
        match({ hand: "right" }, won(66.666)),
        match({ hand: "right" }, won(70)),
      ],
      KEY,
    );
    expect(hand.rows[0].value).toBe(68.3);
  });
});

/* ── The card ─────────────────────────────────────────────────────────────── */

function render(query: string, all: StatisticsMatch[]) {
  const loader = createLoader();
  const { OpponentSplitCard } = loader.load(
    DIR + "opponent-split-card.tsx",
  ) as {
    OpponentSplitCard: React.ComponentType;
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
      React.createElement(OpponentSplitCard),
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

const GRID = "grid-cols-[minmax(0,1fr)_88px_36px]";
const LEADER = "background:var(--viz-you)";
const OTHER = "background:var(--player-1-bar-tint)";

/** The hairline footer, as read. */
const footer = (html: string) =>
  text(html.slice(html.lastIndexOf("<div", html.indexOf("border-t"))));

/** Each drawn bar: its width and whether it is the leader's fill. */
const bars = (html: string) =>
  [
    ...html.matchAll(/style="width:([\d.]+)%;background:var\((--[\w-]+)\)"/g),
  ].map((found) => [Number(found[1]), found[2]]);

const SEASON: StatisticsMatch[] = [
  match(
    { hand: "right", backhand: "two-handed", court: "hard" },
    { [KEY]: 70, aces: 6 },
  ),
  match(
    { hand: "right", backhand: "one-handed", court: "Clay" },
    { [KEY]: 76.4, aces: 2 },
  ),
  match(
    { hand: "left", backhand: "two-handed", court: "hard" },
    { [KEY]: 60, aces: 3 },
  ),
  // Played and filed, and it never measured either statistic.
  match({ hand: "left", backhand: "two-handed", court: "hard" }, {}),
];

test.describe("the split card, drawn", () => {
  const html = render("", SEASON);
  const seen = text(html);

  test("the card and its title", () => {
    expect(html).toContain("surface-card");
    expect(html).toMatch(/<h2[^>]*class="eyebrow"[^>]*>By opponent type<\/h2>/);
  });

  test("each group's title over its rows, on the label · bar · value grid", () => {
    expect(
      [...html.matchAll(/<h3 class="eyebrow-sm">([^<]+)<\/h3>/g)].map(
        (found) => found[1],
      ),
    ).toEqual(["Hand", "Backhand", "Court"]);
    expect(count(html, GRID)).toBe(6);
    expect(seen).toContain(
      "Hand Right-handed 2 matches 73% Left-handed 1 match 60%",
    );
    expect(seen).toContain(
      "Backhand Two-handed 2 matches 65% One-handed 1 match 76%",
    );
    expect(seen).toContain("Court Clay 1 match 76% Hard 2 matches 65%");
  });

  test("a bar as wide as its value: the leader --viz-you, the rest the tint", () => {
    expect(bars(html)).toEqual([
      [73.2, "--viz-you"],
      [60, "--player-1-bar-tint"],
      [65, "--player-1-bar-tint"],
      [76.4, "--viz-you"],
      [76.4, "--viz-you"],
      [65, "--player-1-bar-tint"],
    ]);
    expect(count(html, LEADER)).toBe(3);
    expect(count(html, OTHER)).toBe(3);
    expect(html).toContain("bg-[var(--ink-100)]");
  });

  test('footer: "<statistic label> · N matches", N the matches that measured it', () => {
    expect(footer(html)).toBe("First serve points won · 3 matches");
    expect(html).toContain("border-t border-[var(--border-hairline)]");
  });

  test("no engine eyebrow, no Ask why, no generated claim, no link out", () => {
    expect(html).not.toContain("Advantage Intelligence");
    expect(html).not.toContain("Ask why");
    expect(html).not.toContain("<a ");
    expect(html).not.toContain("<button");
    expect(html).not.toContain("<p");
    expect(seen).not.toMatch(/You win|widest gap|against (left|right)-handers/);
    expect(html).not.toContain("recorded yet");
  });
});

test.describe("the split card, for a count", () => {
  const html = render("stat=aces", SEASON);
  const seen = text(html);

  test("the number without a percent sign", () => {
    expect(seen).toContain(
      "Hand Right-handed 2 matches 4.0 Left-handed 1 match 3.0",
    );
    expect(seen).not.toContain("%");
    expect(footer(html)).toBe("Aces · 3 matches");
  });

  test("bars are scaled to the largest row in the card, not read as percentages", () => {
    // Rows: 4, 3 · 4.5, 2 · 2, 4.5 — the largest, 4.5, is the full track.
    expect(bars(html).map(([width]) => width)).toEqual([
      (4 / 4.5) * 100,
      (3 / 4.5) * 100,
      100,
      (2 / 4.5) * 100,
      (2 / 4.5) * 100,
      100,
    ]);
  });

  test("lower is better: the lead is the row with fewer", () => {
    const faults = render("stat=doubleFaults", [
      match({ hand: "right" }, { doubleFaults: 4 }),
      match({ hand: "left" }, { doubleFaults: 1 }),
    ]);
    expect(bars(faults)).toEqual([
      [100, "--player-1-bar-tint"],
      [25, "--viz-you"],
    ]);
  });

  test("every row at zero draws no width rather than dividing by it", () => {
    const none = render("stat=aces", [
      match({ hand: "right" }, { aces: 0 }),
      match({ hand: "left" }, { aces: 0 }),
    ]);
    expect(bars(none).map(([width]) => width)).toEqual([0, 0]);
    expect(text(none)).toContain("Right-handed 1 match 0.0");
  });
});

test.describe("the split card follows the filtered set", () => {
  test("a filter narrows the rows and the footer with them", () => {
    const html = render("hand=right", SEASON);
    expect(text(html)).toContain("Hand Right-handed 2 matches 73% Backhand");
    expect(text(html)).not.toContain("Left-handed");
    // One row in the group: nobody to lead.
    expect(bars(html)[0]).toEqual([73.2, "--player-1-bar-tint"]);
    expect(footer(html)).toBe("First serve points won · 2 matches");
  });
});

test.describe("the split card with no group to show", () => {
  const SENTENCE =
    "Opponent hand, backhand and court haven’t been recorded yet";
  const unrecorded = [match({}, won(70)), match({}, won(64))];
  const html = render("", unrecorded);
  const seen = text(html);

  test("keeps its anatomy: the title, both closed lists, the grid, the footer", () => {
    expect(html).toMatch(/<h2[^>]*class="eyebrow"[^>]*>By opponent type<\/h2>/);
    expect(seen).toContain("Hand Right-handed");
    expect(seen).toContain("Backhand Two-handed");
    expect(count(html, GRID)).toBe(4);
    expect(html).toContain("bg-[var(--ink-100)]");
    expect(footer(html)).toBe("First serve points won · 2 matches");
  });

  test("says why in one sentence, and puts a dash where each value goes", () => {
    expect(count(html, SENTENCE)).toBe(1);
    expect(count(html, ">—<")).toBe(4);
    expect(seen).toContain("No figure for left-handed yet");
  });

  test("draws no bar and invents no figure", () => {
    expect(bars(html)).toEqual([]);
    expect(html).not.toContain(LEADER);
    expect(html).not.toContain(OTHER);
    expect(seen).not.toMatch(/\d%/);
    expect(html).not.toContain("data-pending-bar");
    expect(html).not.toContain("Advantage Intelligence");
    expect(html).not.toContain("Ask why");
  });

  test("day zero and a season filtered to nothing are the same card", () => {
    for (const empty of [render("", []), render("hand=left", unrecorded)]) {
      expect(count(empty, SENTENCE)).toBe(1);
      expect(count(empty, ">—<")).toBe(4);
      expect(footer(empty)).toBe("First serve points won · 0 matches");
    }
  });

  test("recorded opponents and an unmeasured statistic is a different sentence", () => {
    // No provider publishes return winners, so this is every season's card.
    const html = render("stat=returnWinners", SEASON);
    expect(html).not.toContain(SENTENCE);
    expect(text(html)).toContain(
      "No match here has measured return winners yet",
    );
    expect(count(html, ">—<")).toBe(4);
    expect(footer(html)).toBe("Return winners · 0 matches");
  });
});
