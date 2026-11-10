import { readFileSync } from "node:fs";

import { expect, test } from "@playwright/test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type { MatchPoint } from "@/lib/data/match-points-server";
import {
  seasonOutcomes,
  type SeasonMatch,
  type SeasonOutcomes,
} from "@/lib/data/player-season";

import { createLoader } from "./fixtures/vm-modules";

/**
 * The team player profile's season How points ended (design Q), rendered
 * offline from the real component through `createLoader()`:
 * `season-point-endings-card.tsx` over the real `PointEndingsBody` it shares
 * with the match report. The tallies come from the real season fold
 * (`lib/data/player-season.ts`); framer-motion is a stand-in that drops the
 * animation props. (The season Performance tracker this file also pinned was
 * replaced by the Game profile radar — `profile-statistics-view.spec.ts`.)
 *
 * What is pinned: the endings card's two rows under the report's chrome with
 * the legend's Double faults entry and the Errors-vs-Unforced/Forced choice;
 * the zero case — the anatomy with a dash, the legend, one sentence, never a
 * `0` or a `0%`; nothing to click; and that no season card reaches the
 * report's film or context machinery.
 */

const PROFILE = "src/components/dashboard/team/player-profile/";
const GAME_PROFILE = PROFILE + "season-game-profile-card.tsx";
const DIFFERENTIAL = PROFILE + "season-differential-card.tsx";
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
  for (const file of [GAME_PROFILE, DIFFERENTIAL, ENDINGS]) {
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
