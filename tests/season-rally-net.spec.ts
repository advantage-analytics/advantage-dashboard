import { expect, test } from "@playwright/test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type { MatchPoint, MatchShot } from "@/lib/data/match-points-server";
import {
  seasonNetGame,
  seasonRallyBands,
  type SeasonMatch,
  type SeasonNetGame,
  type SeasonRallyBands,
} from "@/lib/data/player-season";

import { createLoader } from "./fixtures/vm-modules";

/**
 * The team player profile's season Rally length and Net game (design Q),
 * rendered offline from the real components through `createLoader()`:
 * `season-rally-length-card.tsx` over the real `RallyLengthBody` and
 * `season-net-game-card.tsx` over the real `NetGameBody`, the bodies the
 * match report's cards draw with. The tallies come from the real season fold
 * (`lib/data/player-season.ts`); framer-motion is a stand-in that drops the
 * animation props.
 *
 * What is pinned: the Rally length bands' widths add up to the whole bar and
 * each is its band's share of the banded total, the season's shots average,
 * the player's surname against "Opponents"; the Net game rows from the
 * summed tallies, Lobbed only when every match knew its lobs; nothing to
 * click on either card; and both zero cases — the anatomy with dashes and
 * empty tracks and one sentence, never a `0` or a `0%`.
 */

const PROFILE = "src/components/dashboard/team/player-profile/";
const RALLY = PROFILE + "season-rally-length-card.tsx";
const NET = PROFILE + "season-net-game-card.tsx";

const passThrough = ({ children }: { children?: React.ReactNode }) =>
  React.createElement(React.Fragment, null, children);

function loader() {
  return createLoader({
    stubs: {
      "@/components/ui/tooltip": {
        Tooltip: passThrough,
        TooltipTrigger: passThrough,
        TooltipContent: passThrough,
      },
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
                ...rest
              }: Record<string, unknown>) =>
                React.createElement(String(tag), rest),
          },
        ),
      },
    },
  });
}

function renderRally(props: {
  playerName: string;
  analyzed: number;
  rallyBands: SeasonRallyBands;
}): string {
  const { SeasonRallyLengthCard } = loader().load(RALLY) as {
    SeasonRallyLengthCard: React.ComponentType<typeof props>;
  };
  return renderToStaticMarkup(
    React.createElement(SeasonRallyLengthCard, props),
  );
}

function renderNet(props: {
  playerName: string;
  analyzed: number;
  netGame: SeasonNetGame;
}): string {
  const { SeasonNetGameCard } = loader().load(NET) as {
    SeasonNetGameCard: React.ComponentType<typeof props>;
  };
  return renderToStaticMarkup(React.createElement(SeasonNetGameCard, props));
}

/* ── Fixture: two analyzed matches, the player in either seat ──────────── */

let shotId = 0;
function shot(
  shotNumber: number,
  isPlayer1: boolean,
  shotType: string,
  contactY: number,
  landingY: number | null = null,
): MatchShot {
  shotId += 1;
  return {
    id: `s${shotId}`,
    shotNumber,
    isPlayer1,
    shotType,
    spinType: null,
    speedMph: null,
    zone: null,
    result: "In",
    videoTime: shotNumber * 1.3,
    bounceVideoTime: null,
    contactX: 0,
    contactY,
    landingX: 0,
    landingY,
  };
}

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

/** Player 1 serves, player 2 returns, player 1 volleys a winner from the low end. */
const p1ServeVolley = (id: string) =>
  point({
    id,
    resultType: "Volley Winner",
    wonByPlayer1: true,
    serverIsPlayer1: true,
    shots: [
      shot(1, true, "First Serve", 0, 17),
      shot(2, false, "Backhand", 22, 7),
      shot(3, true, "Forehand Volley", 9),
    ],
  });

/** The mirror: player 2 serves and volleys a winner from the high end. */
const p2ServeVolley = (id: string) =>
  point({
    id,
    resultType: "Volley Winner",
    player: "player2",
    wonByPlayer1: false,
    serverIsPlayer1: false,
    shots: [
      shot(1, false, "First Serve", 23.77, 7),
      shot(2, true, "Backhand", 1.5, 17),
      shot(3, false, "Forehand Volley", 14.8),
    ],
  });

function match(
  matchId: string,
  isPlayer1: boolean,
  points: MatchPoint[],
  lobKeys: ReadonlySet<number> | null = null,
): SeasonMatch {
  return {
    matchId,
    date: "2026-09-12",
    opponent: "Sam Okafor",
    isPlayer1,
    points,
    isDerived: false,
    errorSplitJudged: true,
    lobKeys,
    youStats: { fractions: {} },
    oppStats: { fractions: {} },
  };
}

/**
 * Chen is PLAYER 1: she serves and volleys (3 shots, won), loses a 10-shot
 * rally, wins a 6-shot one, and one point has no shot count.
 */
const A = (lobs: ReadonlySet<number> | null = null) =>
  match(
    "a",
    true,
    [
      p1ServeVolley("a1"),
      point({ id: "a2", rallyLength: 10, wonByPlayer1: false }),
      point({ id: "a3", rallyLength: 6, wonByPlayer1: true }),
      point({ id: "a4", rallyLength: 0, wonByPlayer1: true }),
    ],
    lobs,
  );

/**
 * Chen is PLAYER 2: her serve and volley (won, so `wonByPlayer1` false), and
 * a 2-shot point player 1 won — lost by Chen.
 */
const B = (lobs: ReadonlySet<number> | null = null) =>
  match(
    "b",
    false,
    [
      p2ServeVolley("b1"),
      point({ id: "b2", rallyLength: 2, wonByPlayer1: true }),
    ],
    lobs,
  );

const count = (html: string, needle: string) => html.split(needle).length - 1;
const EMPTY_LOBS: ReadonlySet<number> = new Set();

/* ── Rally length ──────────────────────────────────────────────────────── */

test.describe("SeasonRallyLengthCard", () => {
  test("bands from the season's points, each seat its own", () => {
    const rallyBands = seasonRallyBands([A(), B()]);
    // Short: a1 (won), b1 (won), b2 (lost). Medium: a3 (won). Long: a2 (lost).
    expect(rallyBands.bands).toEqual([
      { key: "short", count: 3, youWon: 2, oppWon: 1 },
      { key: "medium", count: 1, youWon: 1, oppWon: 0 },
      { key: "long", count: 1, youWon: 0, oppWon: 1 },
    ]);
    expect(rallyBands.total).toBe(5);
    // (3 + 10 + 6 + 3 + 2) / 5; the shot-count-less a4 is out of both.
    expect(rallyBands.avgShots).toBeCloseTo(4.8);
  });

  test("band widths add up to the banded total; nothing to click", () => {
    const rallyBands = seasonRallyBands([A(), B()]);
    const html = renderRally({
      playerName: "Maya Chen",
      analyzed: 2,
      rallyBands,
    });
    expect(html).not.toContain('data-testid="rally-length-empty"');
    expect(html).toContain('aria-labelledby="season-rally-length-heading"');
    expect(html).toContain("4.8 shots average");

    // The mosaic's bands are the focusable cells; each is as wide as its
    // share of the banded points, and together they fill the bar.
    const widths = [
      ...html.matchAll(/style="width:([\d.]+)%[^"]*" tabindex="0"/g),
    ].map((m) => Number(m[1]));
    expect(widths).toHaveLength(3);
    rallyBands.bands.forEach((band, i) =>
      expect(widths[i]).toBeCloseTo((band.count / rallyBands.total) * 100),
    );
    expect(widths.reduce((sum, w) => sum + w, 0)).toBeCloseTo(100);

    // The counts under the bar are the bands', and add up to the total.
    const counts = [
      ...html.matchAll(/text-\[10px\] text-\[var\(--ink-400\)\]">(\d+)</g),
    ].map((m) => Number(m[1]));
    expect(counts).toEqual([3, 1, 1]);
    expect(counts.reduce((sum, c) => sum + c, 0)).toBe(rallyBands.total);

    expect(html).toContain("Chen won");
    expect(html).toContain("Opponents won");
    expect(html).toContain("percent of the season.");
    expect(html).not.toContain("percent of the match");
    // Static: no band is a button, none says it opens Video.
    expect(html).not.toContain('role="button"');
    expect(html).not.toContain("cursor-pointer");
    expect(html).not.toContain("watch in Video");
  });

  test("zero analyzed: the anatomy with dashes and one sentence, no 0%", () => {
    const html = renderRally({
      playerName: "Maya Chen",
      analyzed: 0,
      rallyBands: seasonRallyBands([]),
    });
    expect(html).toContain('data-testid="rally-length-empty"');
    expect(html).toContain("Rally length");
    for (const band of ["Short", "Medium", "Long"])
      expect(html).toContain(`>${band}<`);
    expect(html).toContain("shots average");
    // The average and the three bands: a dash each, never a zero.
    expect(count(html, ">—<")).toBe(4);
    expect(count(html, "<p ")).toBe(1);
    expect(html).toContain(
      "Rally lengths add up here once one of Chen&#x27;s matches is analyzed.",
    );
    expect(html).not.toContain(">0<");
    // No "0%" in any text (the hatch fills carry percentages in their style).
    expect(html).not.toMatch(/>[^<]*\b0%/);
    expect(html).not.toContain("animate-pulse");
  });

  test("analyzed but no shot count: the same anatomy, the other sentence", () => {
    const html = renderRally({
      playerName: "Maya Chen",
      analyzed: 1,
      rallyBands: seasonRallyBands([
        match("c", true, [point({ rallyLength: 0 })]),
      ]),
    });
    expect(html).toContain('data-testid="rally-length-empty"');
    expect(html).toContain(
      "No point in these matches records its rally length.",
    );
    expect(html).not.toContain(">0<");
  });
});

/* ── Net game ──────────────────────────────────────────────────────────── */

test.describe("SeasonNetGameCard", () => {
  test("rows from the summed tallies, the player's first", () => {
    const netGame = seasonNetGame([A(), B()]);
    // One serve and volley a side in each match: Chen's two, the opponents'
    // none (every net point in the fixture is Chen's).
    expect(netGame.you.total).toBe(2);
    expect(netGame.you.entries["serve-volley"]).toBe(2);
    expect(netGame.you.endings.winner).toBe(2);
    expect(netGame.opp.total).toBe(0);
    expect(netGame.hasLobs).toBe(false);

    const html = renderNet({ playerName: "Maya Chen", analyzed: 2, netGame });
    expect(html).toContain('data-testid="net-game-card"');
    expect(html).toContain('aria-labelledby="season-net-game-heading"');
    expect(html.indexOf(">Chen<")).toBeLessThan(html.indexOf(">Opponents<"));
    expect(html).toContain("Came in by · Serve and volley 2");
    // Lobs unknown somewhere: Passed reads "Passed or lobbed", no Lobbed.
    expect(html).toContain("Passed or lobbed");
    expect(html).not.toContain(">Lobbed<");
    // Static.
    expect(html).not.toContain('role="button"');
    expect(html).not.toContain("cursor-pointer");
  });

  test("Lobbed only when every analyzed match knew its lobs", () => {
    const all = seasonNetGame([A(EMPTY_LOBS), B(EMPTY_LOBS)]);
    expect(all.hasLobs).toBe(true);
    const withLobs = renderNet({
      playerName: "Maya Chen",
      analyzed: 2,
      netGame: all,
    });
    expect(withLobs).toContain(">Lobbed<");
    expect(withLobs).not.toContain("Passed or lobbed");

    const one = seasonNetGame([A(EMPTY_LOBS), B(null)]);
    expect(one.hasLobs).toBe(false);
    const html = renderNet({
      playerName: "Maya Chen",
      analyzed: 2,
      netGame: one,
    });
    expect(html).not.toContain(">Lobbed<");
    expect(html).toContain("Passed or lobbed");
  });

  test("zero analyzed: names, a dash per total, empty tracks, one sentence, no 0%", () => {
    const html = renderNet({
      playerName: "Maya Chen",
      analyzed: 0,
      netGame: seasonNetGame([]),
    });
    expect(html).toContain('data-testid="net-game-empty"');
    expect(html).toContain("Net game");
    expect(html).toContain(">Chen<");
    expect(html).toContain(">Opponents<");
    expect(count(html, ">—<")).toBe(2);
    // Two empty tracks, the legend, one sentence.
    expect(count(html, 'aria-hidden="true" class="h-3.5 w-full')).toBe(2);
    expect(html).toContain(">Winner<");
    expect(html).toContain(">Own error<");
    expect(html).not.toContain(">Won<");
    expect(html).not.toContain(">Lost<");
    expect(count(html, "<p ")).toBe(1);
    expect(html).toContain(
      "Net points add up here once one of Chen&#x27;s matches is analyzed.",
    );
    expect(html).not.toContain(">0<");
    // No "0%" in any text (the hatch fills carry percentages in their style).
    expect(html).not.toMatch(/>[^<]*\b0%/);
    expect(html).not.toContain("animate-pulse");
  });

  test("analyzed but nobody came in: the other sentence", () => {
    const html = renderNet({
      playerName: "Maya Chen",
      analyzed: 1,
      netGame: seasonNetGame([match("c", true, [point()])]),
    });
    expect(html).toContain('data-testid="net-game-empty"');
    expect(html).toContain("Neither side came to the net in these matches.");
  });
});
