import { expect, test } from "@playwright/test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  outcomeTally,
  rallyBands,
  type TallyPoint,
} from "@/components/dashboard/matches/match-detail/match-filters/model";
import type { StatisticsContextValue } from "@/components/dashboard/statistics/statistics-provider";
import type { StatisticsMatch } from "@/lib/data/statistics";
import type { StatisticsPoint } from "@/lib/data/statistics-server";
import {
  outcomeTalliesAcross,
  rallyBandsAcross,
  type TallySeat,
} from "@/lib/data/point-tallies";
import { createLoader } from "./fixtures/vm-modules";

/**
 * The Statistics page's Rally length and How points ended cards, offline.
 *
 * Two halves, as `statistics-trend.spec.ts`: the tallies are pure and are
 * pinned directly — `rallyBands` and `outcomeTally` are the match report's
 * own (one implementation each), and `rallyBandsAcross` /
 * `outcomeTalliesAcross` sum them per match with that match's seat — and
 * the two summaries are rendered through `fixtures/vm-modules` for their
 * own markup: the honest-zero anatomy, the populated card, and the `null`
 * read that must reach the slot's boundary.
 *
 * What goes wrong here never shows on the card: a season tallied with one
 * seat for every point credits the viewer's wins to the opponent in every
 * match they sat on the other side of, and the bars still draw.
 */

const DIR = "src/components/dashboard/statistics/";

function point(overrides: Partial<TallyPoint> = {}): TallyPoint {
  return {
    resultType: "",
    wonByPlayer1: true,
    serverIsPlayer1: true,
    rallyLength: 0,
    ...overrides,
  };
}

/* ── rallyBands ───────────────────────────────────────────────────────────── */

test.describe("rallyBands", () => {
  test("band edges: 1–4 short, 5–8 medium, 9+ long; 0 and null in no band", () => {
    const { bands, total, shots, avgShots } = rallyBands(
      [1, 4, 5, 8, 9, 30, 0, null].map((rallyLength) => point({ rallyLength })),
      true,
    );
    expect(bands.map((b) => [b.key, b.count])).toEqual([
      ["short", 2],
      ["medium", 2],
      ["long", 2],
    ]);
    expect(total).toBe(6);
    expect(shots).toBe(57);
    expect(avgShots).toBeCloseTo(57 / 6);
  });

  test("youWon follows the seat handed in, never player1", () => {
    const points = [
      point({ rallyLength: 2, wonByPlayer1: true }),
      point({ rallyLength: 3, wonByPlayer1: false }),
      point({ rallyLength: 6, wonByPlayer1: false }),
    ];
    const asPlayer1 = rallyBands(points, true);
    expect(asPlayer1.bands.map((b) => [b.youWon, b.oppWon])).toEqual([
      [1, 1],
      [0, 1],
      [0, 0],
    ]);
    const asPlayer2 = rallyBands(points, false);
    expect(asPlayer2.bands.map((b) => [b.youWon, b.oppWon])).toEqual([
      [1, 1],
      [1, 0],
      [0, 0],
    ]);
  });

  test("no points: all three bands at zero, no average", () => {
    expect(rallyBands([], true)).toEqual({
      total: 0,
      shots: 0,
      avgShots: 0,
      bands: [
        { key: "short", count: 0, youWon: 0, oppWon: 0 },
        { key: "medium", count: 0, youWon: 0, oppWon: 0 },
        { key: "long", count: 0, youWon: 0, oppWon: 0 },
      ],
    });
  });
});

/* ── outcomeTally ─────────────────────────────────────────────────────────── */

test.describe("outcomeTally", () => {
  test("each outcome to the side that owns it", () => {
    const points = [
      point({ resultType: "Ace", serverIsPlayer1: true }),
      point({ resultType: "Double Fault", serverIsPlayer1: false }),
      // No shot rows: the winner is the point's winner, the error its loser.
      point({ resultType: "Forehand Winner", wonByPlayer1: false }),
      point({ resultType: "Backhand Unforced Error", wonByPlayer1: true }),
      // A service winner is the server's.
      point({
        resultType: "Service Winner",
        serverIsPlayer1: false,
        wonByPlayer1: false,
        rallyLength: 1,
      }),
      // Not one of the four: counted nowhere.
      point({ resultType: "Forced Error", wonByPlayer1: true }),
    ];
    expect(outcomeTally(points, true, false)).toEqual({
      winners: 0,
      aces: 1,
      unforcedErrors: 0,
      doubleFaults: 0,
    });
    expect(outcomeTally(points, false, false)).toEqual({
      winners: 2,
      aces: 0,
      unforcedErrors: 1,
      doubleFaults: 1,
    });
  });

  test("derived aces: an unreturned serve the server won is an ace, not a winner", () => {
    const unreturned = point({
      resultType: "Service Winner",
      rallyLength: 1,
      serverIsPlayer1: true,
      wonByPlayer1: true,
    });
    // The same point with a stroke in between stays a winner.
    const returned = point({
      resultType: "Service Winner",
      rallyLength: 2,
      serverIsPlayer1: true,
      wonByPlayer1: true,
    });
    expect(outcomeTally([unreturned, returned], true, true)).toEqual({
      winners: 1,
      aces: 1,
      unforcedErrors: 0,
      doubleFaults: 0,
    });
    expect(outcomeTally([unreturned, returned], true, false)).toEqual({
      winners: 2,
      aces: 0,
      unforcedErrors: 0,
      doubleFaults: 0,
    });
    // A derived match never carries the 'Ace' label; were one to arrive it
    // reads as a one-shot serve the server won, i.e. still an ace.
    expect(
      outcomeTally([point({ resultType: "Ace", rallyLength: 1 })], true, true)
        .aces,
    ).toBe(1);
  });
});

/* ── Across matches ───────────────────────────────────────────────────────── */

/** The viewer is seat one in `m1`, seat two in `m2`; `m2` is video-derived. */
const SEATS: TallySeat[] = [
  { id: "m1", isPlayer1: true, isDerived: false },
  { id: "m2", isPlayer1: false, isDerived: true },
];

function seasonPoint(
  matchId: string,
  overrides: Partial<TallyPoint> = {},
): StatisticsPoint {
  return { matchId, ...point(overrides) };
}

const SEASON: StatisticsPoint[] = [
  // m1 — the viewer is player1: wins one short, loses one long.
  seasonPoint("m1", { rallyLength: 3, wonByPlayer1: true, resultType: "Ace" }),
  seasonPoint("m1", {
    rallyLength: 12,
    wonByPlayer1: false,
    resultType: "Forehand Winner",
  }),
  // m2 — the viewer is player2: wins one short as the server (a derived
  // ace), loses one medium to their own unforced error.
  seasonPoint("m2", {
    rallyLength: 1,
    serverIsPlayer1: false,
    wonByPlayer1: false,
    resultType: "Service Winner",
  }),
  seasonPoint("m2", {
    rallyLength: 6,
    serverIsPlayer1: true,
    wonByPlayer1: true,
    resultType: "Backhand Unforced Error",
  }),
  // A match outside the set: counted nowhere.
  seasonPoint("m3", { rallyLength: 2, wonByPlayer1: true, resultType: "Ace" }),
];

test.describe("rallyBandsAcross", () => {
  test("each match tallied with its own seat, then summed", () => {
    const { bands, total, avgShots } = rallyBandsAcross(SEASON, SEATS);
    expect(bands).toEqual([
      { key: "short", count: 2, youWon: 2, oppWon: 0 },
      { key: "medium", count: 1, youWon: 0, oppWon: 1 },
      { key: "long", count: 1, youWon: 0, oppWon: 1 },
    ]);
    expect(total).toBe(4);
    expect(avgShots).toBeCloseTo((3 + 12 + 1 + 6) / 4);
  });

  test("one seat for every point would get m2 backwards", () => {
    // The wrong way: `rallyBands` over the whole season as player1. The
    // viewer's m2 win lands on the opponent's side and the loss on theirs.
    const wrong = rallyBands(SEASON, true);
    expect(wrong.bands.map((b) => b.youWon)).toEqual([2, 1, 0]);
    expect(rallyBandsAcross(SEASON, SEATS).bands.map((b) => b.youWon)).toEqual([
      2, 0, 0,
    ]);
  });

  test("the filtered set narrows what is counted", () => {
    const only = rallyBandsAcross(SEASON, [SEATS[1]]);
    expect(only.total).toBe(2);
    expect(only.bands.map((b) => [b.count, b.youWon])).toEqual([
      [1, 1],
      [1, 0],
      [0, 0],
    ]);
    expect(rallyBandsAcross(SEASON, []).total).toBe(0);
  });
});

test.describe("outcomeTalliesAcross", () => {
  test("each match tallied with its own seat and derived rule, then summed", () => {
    expect(outcomeTalliesAcross(SEASON, SEATS)).toEqual({
      you: { winners: 0, aces: 2, unforcedErrors: 1, doubleFaults: 0 },
      opp: { winners: 1, aces: 0, unforcedErrors: 0, doubleFaults: 0 },
      matchesWithPoints: 2,
    });
  });

  test("the derived rule is per match: m2's unreturned serve is an ace only there", () => {
    const sameButImported = SEATS.map((seat) => ({
      ...seat,
      isDerived: false,
    }));
    expect(outcomeTalliesAcross(SEASON, sameButImported).you).toEqual({
      winners: 1,
      aces: 1,
      unforcedErrors: 1,
      doubleFaults: 0,
    });
  });

  test("a match with no points is not a divisor", () => {
    const { matchesWithPoints } = outcomeTalliesAcross(SEASON, [
      ...SEATS,
      { id: "m9", isPlayer1: true, isDerived: false },
    ]);
    expect(matchesWithPoints).toBe(2);
  });
});

/* ── The cards, drawn ─────────────────────────────────────────────────────── */

function match(seat: TallySeat): StatisticsMatch {
  return {
    id: seat.id,
    isPlayer1: seat.isPlayer1,
    isDerived: seat.isDerived,
    date: "2026-03-01",
    opponentName: `Opponent ${seat.id}`,
    opponentHand: null,
    opponentBackhand: null,
    courtType: null,
    won: null,
    values: {},
    opponentValues: {},
    profile: {},
  } as unknown as StatisticsMatch;
}

const MATCHES = SEATS.map(match);

function render(
  file: string,
  exportName: string,
  filtered: StatisticsMatch[],
  points: StatisticsPoint[] | null,
) {
  const loader = createLoader();
  const exports = loader.load(DIR + file) as Record<
    string,
    React.ComponentType
  >;
  const { StatisticsProvider } = loader.load(
    DIR + "statistics-provider.tsx",
  ) as {
    StatisticsProvider: React.ComponentType<{
      value: StatisticsContextValue;
      children?: React.ReactNode;
    }>;
  };
  const value: StatisticsContextValue = {
    all: MATCHES,
    filtered,
    points,
    state: {
      stat: "firstServeWinPct",
      window: 5,
    } as StatisticsContextValue["state"],
    setState: () => {},
  };
  return renderToStaticMarkup(
    React.createElement(
      StatisticsProvider,
      { value },
      React.createElement(exports[exportName]),
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

const RALLY = ["rally-length-summary.tsx", "RallyLengthSummary"] as const;
const ENDINGS = ["point-endings-summary.tsx", "PointEndingsSummary"] as const;

test.describe("Rally length, drawn", () => {
  const html = render(...RALLY, MATCHES, SEASON);
  const seen = text(html);

  test("the card, its average and the band labels with their share", () => {
    expect(html).toMatch(/<h2[^>]*class="eyebrow"[^>]*>Rally length<\/h2>/);
    // (3 + 12 + 1 + 6) / 4
    expect(seen).toContain("5.5 shots");
    expect(seen).toContain("Short 1–4 · 50%");
    expect(seen).toContain("Medium 5–8 · 25%");
    expect(seen).toContain("Long 9+ · 25%");
    expect(seen).toContain("You won");
    expect(seen).toContain("Opponents won");
    expect(seen).toContain("Width is how often");
  });

  test("the viewer's side on top of every band, by each match's seat", () => {
    // Short: both won by the viewer (m1 as player1, m2 as player2).
    expect(html).toContain(
      "Short rallies · 1–4 shots. 2 points, 50 percent of all points. You won 2, Opponents won 0.",
    );
    expect(html).toContain(
      "Medium rallies · 5–8 shots. 1 points, 25 percent of all points. You won 0, Opponents won 1.",
    );
    expect(count(html, "background:var(--viz-you-mid)")).toBeGreaterThanOrEqual(
      3,
    );
  });

  test("no film cuts: nothing is a button, nothing says Watch", () => {
    expect(html).not.toContain('role="button"');
    expect(html).not.toContain("Watch in Video");
    expect(html).not.toContain("cursor-pointer");
    expect(count(html, "cursor-default")).toBe(3);
  });

  test("follows the filtered set", () => {
    const one = text(render(...RALLY, [MATCHES[1]], SEASON));
    expect(one).toContain("3.5 shots");
    expect(one).toContain("Short 1–4 · 50%");
    expect(one).not.toContain("Long 9+");
  });
});

test.describe("Rally length, empty", () => {
  test("day zero: the anatomy with a dash per figure, no sentence, no skeleton", () => {
    const html = render(...RALLY, [], []);
    const seen = text(html);
    expect(html).toMatch(/<h2[^>]*class="eyebrow"[^>]*>Rally length<\/h2>/);
    expect(count(html, ">—<")).toBe(4);
    expect(seen).toContain("No average rally length yet");
    expect(seen).toContain("Short 1–4 ·");
    expect(seen).toContain("Medium 5–8 ·");
    expect(seen).toContain("Long 9+ ·");
    expect(seen).toContain("Width is how often");
    expect(seen).not.toMatch(/\d%/);
    expect(seen).not.toContain("0.0 shots");
    expect(html).not.toContain("data-pending-bar");
    expect(html).not.toContain("animate-pulse");
    expect(html).not.toContain("recorded on these");
  });

  test("matches here, none with a rally length: the same anatomy and one sentence", () => {
    const html = render(...RALLY, MATCHES, [
      seasonPoint("m1", { rallyLength: 0 }),
      seasonPoint("m2", { rallyLength: null }),
    ]);
    expect(count(html, ">—<")).toBe(4);
    expect(count(html, "No rally lengths were recorded")).toBe(1);
  });

  test("a season filtered to nothing is day zero's card", () => {
    const html = render(...RALLY, [], SEASON);
    expect(count(html, ">—<")).toBe(4);
    expect(html).not.toContain("recorded on these");
  });

  test("a failed read reaches the boundary, never an empty tally", () => {
    expect(() => render(...RALLY, MATCHES, null)).toThrow(
      /could not be loaded/,
    );
  });
});

test.describe("How points ended, drawn", () => {
  const html = render(...ENDINGS, MATCHES, SEASON);
  const seen = text(html);

  test("the card, both sides with a per-match mean, the legend with shares", () => {
    expect(html).toMatch(/<h2[^>]*class="eyebrow"[^>]*>How points ended<\/h2>/);
    expect(seen).toContain("Per match");
    // You: 2 aces + 1 unforced error over 2 matches; opponents: 1 winner.
    expect(seen).toContain("You 2 pts");
    expect(seen).toContain("Opponents 1 pts");
    expect(seen).toContain("Winners 0%");
    expect(seen).toContain("Aces 67%");
    expect(seen).toContain("Unforced errors 33%");
    expect(seen).toContain("Double faults 0%");
  });

  test("segments by each match's seat and derived rule", () => {
    expect(html).toContain("Aces. You 2, Opponents 0.");
    expect(html).toContain("Unforced errors. You 1, Opponents 0.");
    expect(html).toContain("Winners. Opponents 1, You 0.");
    expect(html).not.toContain("Double faults. ");
  });

  test("no film cuts: nothing is a button, nothing says Watch", () => {
    expect(html).not.toContain('role="button"');
    expect(html).not.toContain("Watch in Video");
    expect(html).not.toContain("cursor-pointer");
    expect(count(html, "cursor-default")).toBe(3);
  });
});

test.describe("How points ended, empty", () => {
  test("day zero: both sides with a dash, the legend with a dash per share", () => {
    const html = render(...ENDINGS, [], []);
    const seen = text(html);
    expect(seen).toContain("Per match");
    expect(seen).toContain("You — No points counted for you yet pts");
    expect(seen).toContain(
      "Opponents — No points counted for opponents yet pts",
    );
    for (const label of ["Winners", "Aces", "Unforced errors", "Double faults"])
      expect(seen).toContain(`${label} —`);
    expect(count(html, ">—<")).toBe(6);
    expect(seen).not.toMatch(/\d%/);
    expect(seen).not.toContain("0 pts");
    expect(html).not.toContain("data-pending-bar");
    expect(html).not.toContain("records how it ended");
  });

  test("matches here, none with an ending: the same anatomy and one sentence", () => {
    const html = render(...ENDINGS, MATCHES, [
      seasonPoint("m1", { resultType: "", rallyLength: 4 }),
    ]);
    expect(count(html, ">—<")).toBe(6);
    expect(count(html, "No point on these matches records how it ended.")).toBe(
      1,
    );
  });

  test("a failed read reaches the boundary, never an empty tally", () => {
    expect(() => render(...ENDINGS, MATCHES, null)).toThrow(
      /could not be loaded/,
    );
  });
});
