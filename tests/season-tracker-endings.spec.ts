import { readFileSync } from "node:fs";

import { expect, test } from "@playwright/test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type { MatchPoint } from "@/lib/data/match-points-server";
import {
  seasonOutcomes,
  seasonPerMatch,
  type SeasonMatch,
  type SeasonOutcomes,
  type SeasonPerMatch,
} from "@/lib/data/player-season";

import { createLoader } from "./fixtures/vm-modules";

/**
 * The team player profile's season Performance tracker and How points ended
 * (design Q), rendered offline from the real components through
 * `createLoader()`: the tracker from `season-performance-tracker.tsx`, the
 * endings card from `season-point-endings-card.tsx` over the real
 * `PointEndingsBody` it shares with the match report. The samples and the
 * tallies come from the real season fold (`lib/data/player-season.ts`);
 * framer-motion is a stand-in that drops the animation props.
 *
 * What is pinned: one mark per analyzed match in date order, the readout's
 * words (opponent, "Won N of M points", the day), no break lines or set
 * labels; the endings card's two rows under the report's chrome with the
 * legend's Double faults entry and the Errors-vs-Unforced/Forced choice; and
 * both zero cases — the anatomy with a dash or an empty plot, the legend, one
 * sentence, never a `0` or a `0%`; nothing to click on either card.
 */

const PROFILE = "src/components/dashboard/team/player-profile/";
const TRACKER = PROFILE + "season-performance-tracker.tsx";
const ENDINGS = PROFILE + "season-point-endings-card.tsx";

const passThrough = ({ children }: { children?: React.ReactNode }) =>
  React.createElement(React.Fragment, null, children);

function loader() {
  // Packages load for real (`cn` needs clsx and tailwind-merge); only Radix
  // and framer-motion are stood in for.
  return createLoader({
    stubs: {
      "@/components/ui/tooltip": {
        Tooltip: passThrough,
        TooltipTrigger: passThrough,
        TooltipContent: passThrough,
      },
      "framer-motion": {
        useReducedMotion: () => true,
        // `motion.*` → a plain element that drops the animation props.
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
}

function renderTracker(props: {
  playerName: string;
  perMatch: SeasonPerMatch[];
}): string {
  const { SeasonPerformanceTracker } = loader().load(TRACKER) as {
    SeasonPerformanceTracker: React.ComponentType<typeof props>;
  };
  return renderToStaticMarkup(
    React.createElement(SeasonPerformanceTracker, props),
  );
}

function renderEndings(props: {
  playerName: string;
  analyzed: number;
  outcomes: SeasonOutcomes;
}): string {
  const { SeasonPointEndingsCard } = loader().load(ENDINGS) as {
    SeasonPointEndingsCard: React.ComponentType<typeof props>;
  };
  return renderToStaticMarkup(
    React.createElement(SeasonPointEndingsCard, props),
  );
}

/* ── Fixture: three analyzed matches, the player in either seat ─────────── */

function point(overrides: Partial<MatchPoint> = {}): MatchPoint {
  return {
    id: "p",
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
    rallyLength: 3,
    duration: null,
    videoTime: null,
    saved: false,
    savedBy: [],
    ...overrides,
  };
}

function match(
  m: Pick<SeasonMatch, "matchId" | "date" | "opponent" | "isPlayer1">,
  points: MatchPoint[],
  errorSplitJudged = true,
): SeasonMatch {
  return {
    ...m,
    points,
    isDerived: false,
    errorSplitJudged,
    lobKeys: null,
    youStats: { fractions: {} },
    oppStats: { fractions: {} },
  };
}

/** Chen is PLAYER 1: 1 of 4 points — an ace, then a winner against, an unforced error, a double fault. */
const A = match(
  { matchId: "a", date: "2026-09-12", opponent: "Sam Okafor", isPlayer1: true },
  [
    point({ id: "a1", resultType: "Ace" }),
    point({ id: "a2", resultType: "Forehand Winner", wonByPlayer1: false }),
    point({
      id: "a3",
      resultType: "Backhand Unforced Error",
      wonByPlayer1: false,
    }),
    point({ id: "a4", resultType: "Double Fault", wonByPlayer1: false }),
  ],
);

/** Chen is PLAYER 2: 2 of 3 — her ace and winner, a service winner against. */
const B = match(
  { matchId: "b", date: "2026-10-03", opponent: "Dana Lee", isPlayer1: false },
  [
    point({
      id: "b1",
      resultType: "Ace",
      serverIsPlayer1: false,
      wonByPlayer1: false,
    }),
    point({ id: "b2", resultType: "Forehand Winner", wonByPlayer1: false }),
    point({ id: "b3", resultType: "Service Winner" }),
  ],
);

/** Chen is PLAYER 1, the match's errors unjudged: 2 of 2. */
const C = (judged: boolean) =>
  match(
    {
      matchId: "c",
      date: "2026-08-20",
      opponent: "Ivan Hale",
      isPlayer1: true,
    },
    [
      point({ id: "c1", resultType: "Forehand Forced Error" }),
      point({ id: "c2", resultType: "Backhand Winner" }),
    ],
    judged,
  );

/** Listed out of date order, so the fold's sort is what the chart draws. */
const SEASON = [A, B, C(false)];

const count = (html: string, needle: string) => html.split(needle).length - 1;

/* ── The tracker ───────────────────────────────────────────────────────── */

test.describe("SeasonPerformanceTracker", () => {
  test("one mark per analyzed match, oldest first", () => {
    const perMatch = seasonPerMatch(SEASON);
    const html = renderTracker({ playerName: "Maya Chen", perMatch });
    expect(html).toContain('data-testid="season-performance-tracker"');
    expect(count(html, 'data-sample="')).toBe(SEASON.length);
    // Aug 20 (c), Sep 12 (a), Oct 3 (b) — never the array's order.
    expect(
      [...html.matchAll(/data-sample="([^"]+)"/g)].map((m) => m[1]),
    ).toEqual(["c", "a", "b"]);
    // Each mark's fill reads the match: Chen lost more than she won against
    // Okafor (1 of 4), won more against the other two.
    const fills = [
      ...html.matchAll(
        /data-sample="([^"]+)"[^>]*background:var\((--viz-[a-z]+)\)/g,
      ),
    ].map((m) => [m[1], m[2]]);
    expect(fills).toEqual([
      ["c", "--viz-you"],
      ["a", "--viz-opp"],
      ["b", "--viz-you"],
    ]);
    expect(html).toContain(
      'aria-label="Points won match by match across 3 analyzed matches. Chen above the midline, opponents below."',
    );
    // Two areas and two lines, clipped at the midline as the report's are.
    expect(count(html, "<path")).toBe(4);
    expect(count(html, "<clipPath")).toBe(2);
  });

  for (const n of [1, 2]) {
    test(`${n} analyzed: ${n} mark${n === 1 ? "" : "s"}, the series still drawn`, () => {
      const perMatch = seasonPerMatch(SEASON.slice(0, n));
      const html = renderTracker({ playerName: "Maya Chen", perMatch });
      expect(count(html, 'data-sample="')).toBe(n);
      expect(html).not.toContain(
        'data-testid="season-performance-tracker-empty"',
      );
      expect(html).toContain(
        `across ${n} analyzed ${n === 1 ? "match" : "matches"}.`,
      );
    });
  }

  test("the readout names the opponent, the day and N of M points", () => {
    const perMatch = seasonPerMatch(SEASON);
    const { sampleReadout } = loader().load(TRACKER) as {
      sampleReadout: typeof import("../src/components/dashboard/team/player-profile/season-performance-tracker").sampleReadout;
    };
    expect(sampleReadout(perMatch[0])).toEqual({
      opponent: "Ivan Hale",
      points: "Won 2 of 2 points",
      date: "Aug 20, 2026",
    });
    expect(sampleReadout(perMatch[1])).toEqual({
      opponent: "Sam Okafor",
      points: "Won 1 of 4 points",
      date: "Sep 12, 2026",
    });
    // No readable date: no date line, rather than a blank one.
    expect(sampleReadout({ ...perMatch[2], date: null }).date).toBe("");

    // The same words, one line a match, for a screen reader.
    const html = renderTracker({ playerName: "Maya Chen", perMatch });
    expect(html).toContain(
      "<li>Aug 20, 2026, Ivan Hale, Won 2 of 2 points.</li>",
    );
    expect(html).toContain(
      "<li>Sep 12, 2026, Sam Okafor, Won 1 of 4 points.</li>",
    );
    expect(html).toContain(
      "<li>Oct 3, 2026, Dana Lee, Won 2 of 3 points.</li>",
    );
    // The dark readout is there to receive them (closed until a hover).
    expect(html).toMatch(/rounded-\[12px\][^>]*style="[^"]*opacity:0/);
  });

  test("chrome: the report's eyebrow, the canvas micro, the legend; no breaks, sets or clicks", () => {
    for (const perMatch of [[], seasonPerMatch(SEASON)]) {
      const html = renderTracker({ playerName: "Maya Chen", perMatch });
      expect(html).toContain(
        '<span id="season-performance-tracker-heading" class="eyebrow">Performance tracker</span>',
      );
      expect(html).toContain(
        'aria-labelledby="season-performance-tracker-heading"',
      );
      expect(html).toContain(">Points won, match by match<");
      expect(html).toContain(">Chen ahead<");
      expect(html).toContain(">Opponents ahead<");
      expect(html).not.toContain("Maya Chen");
      // A season has no sets and no breaks of serve.
      expect(html).not.toContain("stroke-dasharray");
      expect(html).not.toMatch(/>Set \d/);
      expect(html).not.toContain("Break");
      // Nothing to click: no film behind a season.
      expect(html).not.toContain("<button");
      expect(html).not.toContain("cursor-pointer");
      expect(html).not.toContain("Watch");
      expect(html).not.toContain("in Video");
      expect(html).not.toContain("animate-pulse");
    }
  });

  test("zero analyzed: the empty plot (midline alone), the legend, one sentence, no figure", () => {
    const html = renderTracker({ playerName: "Maya Chen", perMatch: [] });
    expect(html).toContain('data-testid="season-performance-tracker-empty"');
    expect(count(html, "<line")).toBe(1);
    expect(html).not.toContain("<path");
    expect(html).not.toContain("data-sample");
    expect(html).toContain(">Chen ahead<");
    expect(html).toContain(
      "Each analyzed match adds a mark: the points Chen won against the points lost.",
    );
    // Never a zero where nothing was measured.
    expect(html).not.toMatch(/>\d[\d.]*%?</);
    expect(html).not.toContain("<ul");
  });
});

/* ── How points ended ──────────────────────────────────────────────────── */

test.describe("SeasonPointEndingsCard", () => {
  test("both rows from the summed tallies, under the report's chrome", () => {
    const outcomes = seasonOutcomes(SEASON);
    const html = renderEndings({
      playerName: "Maya Chen",
      analyzed: 3,
      outcomes,
    });
    expect(html).not.toContain('data-testid="point-endings-empty"');
    expect(html).toContain(
      '<span id="season-point-endings-heading" class="eyebrow">How points ended</span>',
    );
    expect(html).toContain('aria-labelledby="season-point-endings-heading"');
    expect(html).toContain(">Own outcomes<");
    // Chen: 2 winners, 2 aces, 1 error, 1 double fault = 6 own outcomes;
    // the opponents: a winner, a service winner, an error = 3.
    expect(outcomes.you).toEqual({
      winners: 2,
      aces: 2,
      serviceWinners: 0,
      unforcedErrors: 1,
      forcedErrors: 0,
      doubleFaults: 1,
    });
    expect(html).toMatch(
      />Chen<\/span><div class="flex-1"><\/div><span class="mono tabular text-\[10px\] text-\[var\(--ink-400\)\]">6</,
    );
    expect(html).toMatch(
      />Opponents<\/span><div class="flex-1"><\/div><span class="mono tabular text-\[10px\] text-\[var\(--ink-400\)\]">3</,
    );
    // One segment per non-zero bucket: four for Chen, three against.
    expect(count(html, "cursor-default")).toBe(7);
    // The dark readout's cross-reference, as the report writes it.
    expect(html).toContain(">Chen 2 · Opponents 1<");
    expect(html).toContain('aria-label="Winners. Chen 2, Opponents 1."');
    // The legend, Double faults included.
    for (const label of ["Winners", "Aces", "Service winners", "Double faults"])
      expect(html).toContain(`>${label}</span>`);
    expect(html).not.toContain("Maya Chen");
  });

  test("the errors segment follows the fold's split", () => {
    const unjudged = renderEndings({
      playerName: "Maya Chen",
      analyzed: 3,
      outcomes: seasonOutcomes(SEASON),
    });
    expect(unjudged).toContain(">Errors</span>");
    expect(unjudged).not.toContain(">Unforced<");
    expect(unjudged).not.toContain(">Forced<");

    const judged = renderEndings({
      playerName: "Maya Chen",
      analyzed: 3,
      outcomes: seasonOutcomes([A, B, C(true)]),
    });
    expect(judged).toContain(">Unforced</span>");
    expect(judged).toContain(">Forced</span>");
    expect(judged).not.toContain(">Errors<");
    expect(judged).toContain(
      'aria-label="Forced errors. Opponents 1, Chen 0."',
    );
  });

  test("zero analyzed: both names with a dash, empty tracks, the legend, one sentence", () => {
    const html = renderEndings({
      playerName: "Maya Chen",
      analyzed: 0,
      outcomes: seasonOutcomes([]),
    });
    expect(html).toContain('data-testid="point-endings-empty"');
    expect(html).toContain('aria-labelledby="season-point-endings-heading"');
    expect(html).toContain(">Chen</span>");
    expect(html).toContain(">Opponents</span>");
    expect(html.match(/>—</g)?.length).toBe(2);
    expect(count(html, "background:var(--ink-100)")).toBe(2);
    // The legend stays, Double faults included; unjudged until something is
    // judged, so "Errors".
    for (const label of [
      "Winners",
      "Aces",
      "Service winners",
      "Errors",
      "Double faults",
    ])
      expect(html).toContain(`>${label}</span>`);
    expect(html).not.toContain(">Unforced<");
    expect(html).toContain(
      "Winners, aces and errors add up here once one of Chen&#x27;s matches is analyzed.",
    );
    // Never a zero or a percentage.
    expect(html).not.toMatch(/>\d[\d.]*%?</);
    expect(html).not.toContain("animate-pulse");
  });

  test("analyzed, but no point records how it ended: the same anatomy, a different sentence", () => {
    const html = renderEndings({
      playerName: "Maya Chen",
      analyzed: 1,
      outcomes: seasonOutcomes([
        match(
          { matchId: "d", date: "2026-09-01", opponent: "X", isPlayer1: true },
          [point({ id: "d1", resultType: "" })],
        ),
      ]),
    });
    expect(html).toContain('data-testid="point-endings-empty"');
    expect(html).toContain("No point in these matches records how it ended.");
    expect(html).not.toContain("once one of");
  });

  test("no cuts and no Watch readouts: nothing to click", () => {
    for (const outcomes of [seasonOutcomes([]), seasonOutcomes(SEASON)]) {
      const html = renderEndings({
        playerName: "Maya Chen",
        analyzed: 3,
        outcomes,
      });
      expect(html).not.toContain("<button");
      expect(html).not.toContain('role="button"');
      expect(html).not.toContain("cursor-pointer");
      expect(html).not.toContain("Watch");
      expect(html).not.toContain("in Video");
    }
  });
});

/* ── Scope ─────────────────────────────────────────────────────────────── */

test("the season cards reach none of the report's film or context machinery", () => {
  for (const file of [TRACKER, ENDINGS]) {
    const source = readFileSync(file, "utf8");
    expect(source, file).not.toMatch(
      /watchCut|film-cut|useMatchReport|useMatchData|useMatchSides|useMatchFilters/,
    );
  }
  // The body knows no cut either: `watch` is handed in by the report's card,
  // and nothing from the report's context or cut modules is imported.
  const body = readFileSync(
    "src/components/dashboard/matches/match-detail/point-endings-body.tsx",
    "utf8",
  );
  expect(body).not.toMatch(
    /from "@\/components\/dashboard\/matches\/match-detail\/(match-report-context|match-data-provider|use-match-sides|match-filters\/provider|point-endings-card)"/,
  );
  expect(body).not.toMatch(/outcomeCut\(/);
});
