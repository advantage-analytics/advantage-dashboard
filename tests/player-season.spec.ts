import { expect, test } from "@playwright/test";

import type { MatchPoint, MatchShot } from "@/lib/data/match-points-server";
import {
  foldSeasonRows,
  foldSeasonTallies,
  seasonErrorSplitJudged,
  seasonHasLobs,
  seasonNetGame,
  seasonOutcomes,
  seasonPerMatch,
  seasonRallyBands,
  seasonRowKind,
  type SeasonGroup,
  type SeasonMatch,
  type SeasonRow,
} from "@/lib/data/player-season";
import {
  H2H_GROUPS,
  NO_LOB_DATA_NOTE,
  NO_PASS_DATA_NOTE,
  buildStatRows,
  h2hGroups,
  rowValue,
  tallySide,
  withPointRows,
  type H2HStats,
} from "@/components/dashboard/matches/match-detail/head-to-head-rows";
import { outcomeTally } from "@/components/dashboard/matches/match-detail/point-endings-card";
import {
  netGameTally,
  type NetGameTally,
} from "@/components/dashboard/matches/match-detail/match-filters/net-game";
import { rallyLengthBandOf } from "@/components/dashboard/matches/match-detail/match-filters/model";

/**
 * The player profile's season fold (`lib/data/player-season.ts`): the match
 * report's Head to head rows and right-column tallies, added up over a
 * player's analyzed matches. Pure and offline.
 *
 * Two matches, built so that every folding rule has something to bite on:
 *
 * - In A the player is PLAYER 1, the match a SwingVision import (published
 *   aces, errors judged) with no ball-paths file.
 * - In B the player is PLAYER 2, the match an Advantage Intelligence one
 *   (aces are its unreturned serves, errors unjudged, `aces`/`doubleFaults`
 *   suppressed to null) with lob keys.
 *
 * So a fold that normalised both matches to one seat, averaged percentages,
 * or read B's aces from its published figure would print a different table.
 *
 * Court frame: player 1 plays the low end (y < the net at 11.885), player 2
 * the high end.
 */

let shotId = 0;
function s(
  shotNumber: number,
  isPlayer1: boolean,
  shotType: string,
  o: { cy?: number; ly?: number; t?: number; result?: string } = {},
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
    result: o.result ?? "In",
    videoTime: o.t ?? shotNumber * 1.3,
    bounceVideoTime: null,
    contactX: 0,
    contactY: o.cy ?? null,
    landingX: 0,
    landingY: o.ly ?? null,
  };
}

function pt(
  id: string,
  o: {
    server: 1 | 2;
    winner: 1 | 2;
    result: string;
    shots: MatchShot[];
    /** Defaults to the shot count; 0 is "none recorded". */
    rally?: number;
    /** The return's recorded result, as the loader's `secondShotResult`. */
    ret?: string;
  },
): MatchPoint {
  return {
    id,
    pointNumber: 1,
    setNumber: 1,
    gameNumber: 1,
    setScore: "0-0",
    gameScore: "0-0",
    pointScore: "0-0",
    resultType: o.result,
    eventType: "",
    description: "",
    player: o.winner === 1 ? "player1" : "player2",
    wonByPlayer1: o.winner === 1,
    serverIsPlayer1: o.server === 1,
    isBreakPoint: false,
    isSetPoint: false,
    isMatchPoint: false,
    rallyLength: o.rally ?? o.shots.length,
    duration: null,
    videoTime: 10,
    saved: false,
    savedBy: [],
    shots: o.shots,
    secondShotResult: o.ret ?? null,
  };
}

const P1_SERVE = () => s(1, true, "First Serve", { cy: 0, ly: 17 });
const P2_SERVE = () => s(1, false, "First Serve", { cy: 23.5, ly: 7 });

/* ── Match A: the player is player 1, SwingVision, judged, no lob keys ──── */

const A_POINTS: MatchPoint[] = [
  // An ace by the player.
  pt("a1", { server: 1, winner: 1, result: "Ace", shots: [P1_SERVE()] }),
  // A return winner by the player.
  pt("a2", {
    server: 2,
    winner: 1,
    result: "Forehand Winner",
    shots: [P2_SERVE(), s(2, true, "Forehand", { cy: 0.5, ly: 20 })],
    ret: "In",
  }),
  // The player approaches off a deep ball and wins on the volley.
  pt("a3", {
    server: 2,
    winner: 1,
    result: "Volley Winner",
    shots: [
      P2_SERVE(),
      s(2, true, "Forehand", { cy: 0.5, ly: 20 }),
      s(3, false, "Backhand", { cy: 22, ly: 2 }),
      s(4, true, "Forehand", { cy: 3, ly: 21 }),
      s(5, false, "Backhand", { cy: 22, ly: 6 }),
      s(6, true, "Forehand Volley", { cy: 9 }),
    ],
    ret: "In",
  }),
  // The player's unforced error.
  pt("a4", {
    server: 1,
    winner: 2,
    result: "Forehand Unforced Error",
    shots: [
      P1_SERVE(),
      s(2, false, "Backhand", { cy: 22, ly: 5 }),
      s(3, true, "Forehand", { cy: 1, result: "Out" }),
    ],
    ret: "In",
  }),
  // The player's double fault — no rally length recorded.
  pt("a5", {
    server: 1,
    winner: 2,
    result: "Double Fault",
    shots: [
      s(1, true, "First Serve", { result: "Out" }),
      s(1, true, "Second Serve", { result: "Out" }),
    ],
    rally: 0,
  }),
  // The opponent's ace.
  pt("a6", { server: 2, winner: 2, result: "Ace", shots: [P2_SERVE()] }),
  // A long rally the opponent ends with a winner.
  pt("a7", {
    server: 2,
    winner: 2,
    result: "Backhand Winner",
    shots: [
      P2_SERVE(),
      s(2, true, "Forehand", { cy: 0.5, ly: 20 }),
      s(3, false, "Backhand", { cy: 23, ly: 3 }),
      s(4, true, "Forehand", { cy: 0.5, ly: 21 }),
      s(5, false, "Forehand", { cy: 23, ly: 4 }),
      s(6, true, "Backhand", { cy: 0.5, ly: 20 }),
      s(7, false, "Forehand", { cy: 23, ly: 3 }),
      s(8, true, "Forehand", { cy: 0.5, ly: 22 }),
      s(9, false, "Backhand", { cy: 23, ly: 2 }),
    ],
    ret: "In",
  }),
];

const A_YOU: H2HStats = {
  aces: 3,
  doubleFaults: 2,
  firstServeInPct: 60,
  firstServeWinPct: 70,
  secondServeWinPct: 50,
  breakpointsSaved: 3,
  serviceGamesWonPct: 80,
  firstReturnWonPct: 30,
  secondReturnWonPct: 50,
  breakpointsWonPct: 50,
  winners: 20,
  unforcedErrors: 10,
  forcedErrors: 4,
  totalPointsWon: 42,
  totalPoints: 70,
  fractions: {
    firstServeInPct: { made: 30, attempts: 50 },
    firstServeWinPct: { made: 21, attempts: 30 },
    secondServeWinPct: { made: 10, attempts: 20 },
    breakpointsSaved: { made: 3, attempts: 4 },
    serviceGamesWonPct: { made: 8, attempts: 10 },
    firstReturnWonPct: { made: 9, attempts: 30 },
    secondReturnWonPct: { made: 5, attempts: 10 },
    breakpointsWonPct: { made: 2, attempts: 4 },
  },
};

const A_OPP: H2HStats = {
  aces: 1,
  doubleFaults: 3,
  firstServeInPct: 50,
  firstServeWinPct: 60,
  secondServeWinPct: 40,
  breakpointsSaved: 2,
  serviceGamesWonPct: 70,
  firstReturnWonPct: 30,
  secondReturnWonPct: 50,
  breakpointsWonPct: 25,
  winners: 15,
  unforcedErrors: 12,
  forcedErrors: 6,
  totalPointsWon: 28,
  totalPoints: 70,
  fractions: {
    firstServeInPct: { made: 20, attempts: 40 },
    firstServeWinPct: { made: 12, attempts: 20 },
    secondServeWinPct: { made: 8, attempts: 20 },
    breakpointsSaved: { made: 2, attempts: 4 },
    serviceGamesWonPct: { made: 7, attempts: 10 },
    firstReturnWonPct: { made: 9, attempts: 30 },
    secondReturnWonPct: { made: 10, attempts: 20 },
    breakpointsWonPct: { made: 1, attempts: 4 },
  },
};

/* ── Match B: the player is player 2, derived, unjudged, lob keys ───────── */

const LOB_T = 30;
const YOU_LOB_T = 40;
const B_LOBS: ReadonlySet<number> = new Set([LOB_T, YOU_LOB_T]);

/** Player 1 approaches and is beaten by player 2's last shot, struck at `t`. */
function p1Approached(id: string, t: number): MatchPoint {
  return pt(id, {
    server: 2,
    winner: 2,
    result: "Forehand Winner",
    shots: [
      P2_SERVE(),
      s(2, true, "Forehand", { cy: 0.5, ly: 20 }),
      s(3, false, "Backhand", { cy: 22, ly: 2 }),
      s(4, true, "Forehand", { cy: 3, ly: 21 }),
      s(5, false, "Backhand", { cy: 22, ly: 6 }),
      s(6, true, "Forehand Volley", { cy: 9, ly: 20 }),
      s(7, false, "Forehand", { cy: 21, ly: 1, t }),
    ],
    ret: "In",
  });
}

const B_POINTS: MatchPoint[] = [
  // Two unreturned serves by the player (player 2) — the derived Aces.
  pt("b1", {
    server: 2,
    winner: 2,
    result: "Service Winner",
    shots: [P2_SERVE()],
  }),
  pt("b2", {
    server: 2,
    winner: 2,
    result: "Service Winner",
    shots: [P2_SERVE()],
  }),
  // One by the opponent.
  pt("b3", {
    server: 1,
    winner: 1,
    result: "Service Winner",
    shots: [P1_SERVE()],
  }),
  // The opponent approaches; the player lobs them (a lob only with lob keys).
  p1Approached("b4", LOB_T),
  // The opponent approaches; the player passes them.
  p1Approached("b5", 50),
  // The player lobs mid-rally and loses the point to the opponent's winner.
  pt("b6", {
    server: 1,
    winner: 1,
    result: "Forehand Winner",
    shots: [
      P1_SERVE(),
      s(2, false, "Backhand", { cy: 22, ly: 7 }),
      s(3, true, "Forehand", { cy: 1, ly: 20 }),
      s(4, false, "Forehand", { cy: 23, ly: 3, t: YOU_LOB_T }),
      s(5, true, "Forehand", { cy: 1, ly: 22 }),
    ],
    ret: "In",
  }),
  // The player's unforced error on the return.
  pt("b7", {
    server: 1,
    winner: 1,
    result: "Backhand Unforced Error",
    shots: [P1_SERVE(), s(2, false, "Backhand", { cy: 22, result: "Out" })],
    ret: "Out",
  }),
  // The player's return winner.
  pt("b8", {
    server: 1,
    winner: 2,
    result: "Backhand Winner",
    shots: [P1_SERVE(), s(2, false, "Backhand", { cy: 22, ly: 2 })],
    ret: "In",
  }),
];

// `suppress_derived_match_stats()` nulls a derived match's aces, double faults
// and second serves in — and with them the second-serve fraction.
const B_YOU: H2HStats = {
  aces: null,
  doubleFaults: null,
  firstServeInPct: 50,
  firstServeWinPct: 60,
  secondServeWinPct: null,
  breakpointsSaved: 1,
  serviceGamesWonPct: 60,
  firstReturnWonPct: 40,
  secondReturnWonPct: 60,
  breakpointsWonPct: 50,
  winners: 10,
  unforcedErrors: 8,
  forcedErrors: null,
  totalPointsWon: 20,
  totalPoints: 50,
  fractions: {
    firstServeInPct: { made: 10, attempts: 20 },
    firstServeWinPct: { made: 6, attempts: 10 },
    breakpointsSaved: { made: 1, attempts: 2 },
    serviceGamesWonPct: { made: 3, attempts: 5 },
    firstReturnWonPct: { made: 8, attempts: 20 },
    secondReturnWonPct: { made: 6, attempts: 10 },
    breakpointsWonPct: { made: 2, attempts: 4 },
  },
};

const B_OPP: H2HStats = {
  aces: null,
  doubleFaults: null,
  firstServeInPct: 40,
  firstServeWinPct: 50,
  secondServeWinPct: null,
  // Faced no break points: a published 0 with no fraction behind it.
  breakpointsSaved: 0,
  serviceGamesWonPct: 40,
  firstReturnWonPct: 30,
  secondReturnWonPct: 40,
  breakpointsWonPct: 33,
  winners: 12,
  unforcedErrors: 9,
  forcedErrors: null,
  totalPointsWon: 30,
  totalPoints: 50,
  fractions: {
    firstServeInPct: { made: 10, attempts: 25 },
    firstServeWinPct: { made: 5, attempts: 10 },
    serviceGamesWonPct: { made: 2, attempts: 5 },
    firstReturnWonPct: { made: 6, attempts: 20 },
    secondReturnWonPct: { made: 4, attempts: 10 },
    breakpointsWonPct: { made: 1, attempts: 3 },
  },
};

const MATCH_A: SeasonMatch = {
  matchId: "a",
  date: "2026-10-05",
  opponent: "Ruiz",
  points: A_POINTS,
  isPlayer1: true,
  isDerived: false,
  errorSplitJudged: true,
  lobKeys: null,
  youStats: A_YOU,
  oppStats: A_OPP,
};

const MATCH_B: SeasonMatch = {
  matchId: "b",
  date: "2026-09-20",
  opponent: "Okafor",
  points: B_POINTS,
  isPlayer1: false,
  isDerived: true,
  errorSplitJudged: false,
  lobKeys: B_LOBS,
  youStats: B_YOU,
  oppStats: B_OPP,
};

const SEASON = [MATCH_A, MATCH_B];

function row(groups: SeasonGroup[], label: string): SeasonRow {
  const found = groups.flatMap((g) => g.rows).find((r) => r.label === label);
  if (!found) throw new Error(`no season row labelled "${label}"`);
  return found;
}

/** The report's own whole-match rows for one match, as `HeadToHeadCard` builds them. */
function reportRows(m: SeasonMatch, judged: boolean) {
  const you = tallySide(m.points, m.isPlayer1, m.lobKeys);
  const opp = tallySide(m.points, !m.isPlayer1, m.lobKeys);
  return h2hGroups(m.isDerived, judged).flatMap((group) =>
    withPointRows(
      group.configs,
      buildStatRows(group.configs, m.youStats!, m.oppStats!),
      you,
      opp,
    ),
  );
}

test.describe("the row set", () => {
  test("is every row of the report's table, in its groups", () => {
    const groups = foldSeasonRows(SEASON);
    expect(groups.map((g) => g.title)).toEqual(H2H_GROUPS.map((g) => g.title));
    expect(groups.map((g) => g.rows.map((r) => r.label))).toEqual(
      h2hGroups(false, false).map((g) => g.configs.map((c) => c.label)),
    );
  });

  test("every row says how it folds, and the rate rows are the percentage rows plus Total points won", () => {
    const groups = foldSeasonRows(SEASON);
    const rates = groups.flatMap((g) =>
      g.rows.filter((r) => r.kind === "rate"),
    );
    expect(rates.map((r) => r.label)).toEqual([
      "First serve in",
      "First serve points won",
      "Second serve points won",
      "Break points saved",
      "Service games won",
      "First serve returns won",
      "Second serve returns won",
      "Break points converted",
      "Net points won",
      "Approach points won",
      "Passed the net player",
      "Lob points won",
      "Drop shot points won",
      "Total points won",
    ]);
    expect(seasonRowKind({ isPercentage: true })).toBe("rate");
    expect(seasonRowKind({ fromFraction: true })).toBe("rate");
    expect(seasonRowKind({ ofKey: "totalPoints" })).toBe("rate");
    expect(seasonRowKind({})).toBe("count");
  });

  test("with no matches every row is still there, with no value on either side", () => {
    const groups = foldSeasonRows([]);
    expect(groups.map((g) => g.rows.length)).toEqual([7, 4, 9]);
    for (const r of groups.flatMap((g) => g.rows)) {
      expect(r.you).toEqual({ value: null, display: "", matches: 0 });
      expect(r.opp).toEqual({ value: null, display: "", matches: 0 });
      expect(r.leader).toBeNull();
    }
    // Nothing has judged anything, so the table says "Errors".
    expect(groups[2].rows.map((r) => r.label)).toContain("Errors");
    expect(groups[2].rows.map((r) => r.label)).not.toContain("Forced errors");
    // And no match knows its lobs.
    expect(row(groups, "Lob points won").note).toBe(NO_LOB_DATA_NOTE);
    expect(row(groups, "Passed the net player").note).toBe(NO_PASS_DATA_NOTE);
  });
});

test.describe("count rows", () => {
  test("average the per-match figures, printed to one decimal", () => {
    const groups = foldSeasonRows(SEASON);
    const aces = row(groups, "Aces");
    // A: the published 3. B: the derived rule — player 2's two unreturned
    // serves, not B's suppressed `aces` and not player 1's one.
    expect(aces.kind).toBe("count");
    expect(aces.you).toEqual({
      value: 2.5,
      display: "2.5",
      detail: "5 in 2 matches",
      matches: 2,
    });
    expect(aces.opp).toEqual({
      value: 1,
      display: "1.0",
      detail: "2 in 2 matches",
      matches: 2,
    });
    expect(aces.leader).toBe("you");

    const winners = row(groups, "Winners");
    expect(winners.you.display).toBe("15.0");
    expect(winners.opp.display).toBe("13.5");

    // Counted from the points in both: one return winner each match.
    const returnWinners = row(groups, "Return winners");
    expect(returnWinners.you).toEqual({
      value: 1,
      display: "1.0",
      detail: "2 in 2 matches",
      matches: 2,
    });
    // The opponents returned in both matches and hit none: a measured 0.
    expect(returnWinners.opp).toEqual({
      value: 0,
      display: "0.0",
      detail: "0 in 2 matches",
      matches: 2,
    });

    const netAttempts = row(groups, "Net point attempts");
    expect(netAttempts.you.display).toBe("0.5");
    expect(netAttempts.opp.display).toBe("1.0");
  });

  test("a match whose figure is withheld is left out, and the detail says so", () => {
    const groups = foldSeasonRows(SEASON);
    // B's double faults are suppressed (null), so only A counts.
    const doubleFaults = row(groups, "Double faults");
    expect(doubleFaults.you).toEqual({
      value: 2,
      display: "2.0",
      detail: "2 in 1 match",
      matches: 1,
    });
    expect(doubleFaults.opp.display).toBe("3.0");
    expect(doubleFaults.lowerIsBetter).toBe(true);
    expect(doubleFaults.leader).toBe("you");
  });

  test("a seat with no stats row sits out of the published rows for that match, never as zeroes", () => {
    // B has points but no stats row for the player's seat.
    const season = [MATCH_A, { ...MATCH_B, youStats: null }];
    const groups = foldSeasonRows(season);

    // A published count: only A's 20 for the player; both matches for the
    // opponents, whose row is there.
    expect(row(groups, "Winners").you).toEqual({
      value: 20,
      display: "20.0",
      detail: "20 in 1 match",
      matches: 1,
    });
    expect(row(groups, "Winners").opp.matches).toBe(2);
    // A published rate: A's 30/50 alone, not pooled with a 0/0 or a 0/n.
    expect(row(groups, "First serve in").you).toMatchObject({
      detail: "30/50",
      matches: 1,
    });
    // Total points won (key of ofKey): A's 42 of 70 alone.
    expect(row(groups, "Total points won").you.detail).toBe("42/70");

    // A row counted from the points still reads B's points for the player.
    const fromPoints = h2hGroups(false, false)
      .flatMap((g) => g.configs)
      .find((c) => c.fromPoints === "returnWinners");
    if (!fromPoints) throw new Error("no return winners row");
    expect(row(groups, fromPoints.label).you.matches).toBe(2);
  });

  test("each per-match figure is the report's own row value", () => {
    // The fold never reads a statistic the report would not print: for every
    // count row, the season sum is the sum of the report's own values.
    const groups = foldSeasonRows(SEASON);
    const judged = seasonErrorSplitJudged(SEASON);
    const perMatch = SEASON.map((m) => reportRows(m, judged));
    for (const r of groups.flatMap((g) => g.rows)) {
      if (r.kind !== "count") continue;
      for (const side of ["you", "opp"] as const) {
        const values = perMatch
          .map((rows) => rows.find((x) => x.label === r.label)![side].value)
          .filter((v): v is number => v !== null);
        const expected =
          values.length === 0
            ? null
            : values.reduce((a, b) => a + b, 0) / values.length;
        expect(r[side].value, `${r.label} ${side}`).toBe(expected);
        expect(r[side].matches, `${r.label} ${side}`).toBe(values.length);
      }
    }
  });
});

test.describe("rate rows", () => {
  test("pool made over attempts across the matches — never a mean of percentages", () => {
    const groups = foldSeasonRows(SEASON);
    const firstServeIn = row(groups, "First serve in");
    expect(firstServeIn.kind).toBe("rate");
    // 30/50 and 10/20 pooled is 40/70 = 57.1%; the mean of 60% and 50% is 55.
    expect(firstServeIn.you.value).toBeCloseTo(57.142857, 5);
    expect(firstServeIn.you.value).not.toBe(55);
    expect(firstServeIn.you).toMatchObject({
      display: "57%",
      detail: "40/70",
      matches: 2,
    });
    expect(firstServeIn.opp).toMatchObject({ display: "46%", detail: "30/65" });
    expect(firstServeIn.leader).toBe("you");

    // Break points saved is the report's fraction-only row.
    const bpSaved = row(groups, "Break points saved");
    expect(bpSaved.you).toMatchObject({
      display: "67%",
      detail: "4/6",
      matches: 2,
    });
    // The opponent faced none in B, so B has no fraction and only A pools.
    expect(bpSaved.opp).toMatchObject({
      display: "50%",
      detail: "2/4",
      matches: 1,
    });

    const serviceGames = row(groups, "Service games won");
    expect(serviceGames.you).toMatchObject({ display: "73%", detail: "11/15" });
  });

  test("a rate the report withholds for a match stays out of the pool", () => {
    const groups = foldSeasonRows(SEASON);
    // Second serve points won is suppressed on the derived match B.
    const second = row(groups, "Second serve points won");
    expect(second.you).toMatchObject({
      value: 50,
      display: "50%",
      detail: "10/20",
      matches: 1,
    });
    expect(second.opp).toMatchObject({ value: 40, detail: "8/20", matches: 1 });
    // And B's published value really is withheld on the report too.
    const config = h2hGroups(true, false)[0].configs.find(
      (c) => c.label === "Second serve points won",
    )!;
    expect(rowValue(config, B_YOU).value).toBeNull();
  });

  test("Total points won is the share of every point played, as the canvas prints it", () => {
    const groups = foldSeasonRows(SEASON);
    const total = row(groups, "Total points won");
    expect(total.kind).toBe("rate");
    // (42 + 20) of (70 + 50), not "31.0 points a match".
    expect(total.you).toMatchObject({
      display: "52%",
      detail: "62/120",
      matches: 2,
    });
    expect(total.opp).toMatchObject({
      display: "48%",
      detail: "58/120",
      matches: 2,
    });
    expect(total.leader).toBe("you");
  });

  test("point-counted rates pool the report's own tallies", () => {
    const groups = foldSeasonRows(SEASON);
    // The player came in once (A) and won; the opponents came in twice (B) and lost both.
    expect(row(groups, "Net points won").you).toMatchObject({
      display: "100%",
      detail: "1/1",
      matches: 1,
    });
    expect(row(groups, "Net points won").opp).toMatchObject({
      display: "0%",
      detail: "0/2",
      matches: 1,
    });
    expect(row(groups, "Approach points won").you.display).toBe("100%");
    expect(row(groups, "Approach points won").opp.display).toBe("0%");
    // Nobody hit a drop shot: no rate, no note (the data could have shown one).
    const drop = row(groups, "Drop shot points won");
    expect(drop.you).toEqual({ value: null, display: "", matches: 0 });
    expect(drop.note).toBeUndefined();
  });
});

test.describe("the Aces row", () => {
  test("follows each match's own config — derived rule on the video match, published count otherwise", () => {
    // Flip B to a SwingVision import with the same points: its aces now come
    // from the published figure, which is suppressed, so only A counts.
    const groups = foldSeasonRows([MATCH_A, { ...MATCH_B, isDerived: false }]);
    expect(row(groups, "Aces").you).toEqual({
      value: 3,
      display: "3.0",
      detail: "3 in 1 match",
      matches: 1,
    });
    // And flip A to derived: its one unreturned serve replaces the published 3.
    const derivedA = foldSeasonRows([{ ...MATCH_A, isDerived: true }, MATCH_B]);
    expect(row(derivedA, "Aces").you).toMatchObject({
      value: 1.5,
      display: "1.5",
    });
  });
});

test.describe("the error rows", () => {
  test("are one Errors row unless every match is judged", () => {
    expect(seasonErrorSplitJudged(SEASON)).toBe(false);
    const groups = foldSeasonRows(SEASON);
    const labels = groups[2].rows.map((r) => r.label);
    expect(labels).toContain("Errors");
    expect(labels).not.toContain("Unforced errors");
    expect(labels).not.toContain("Forced errors");
    // A judged match contributes unforced + forced to the season's Errors
    // (10 + 4), as the report's own Errors row would; B its 8.
    const errors = row(groups, "Errors");
    expect(errors.you).toEqual({
      value: 11,
      display: "11.0",
      detail: "22 in 2 matches",
      matches: 2,
    });
    expect(errors.opp.display).toBe("13.5");
    expect(errors.lowerIsBetter).toBe(true);
    expect(errors.leader).toBe("you");
  });

  test("split into Unforced and Forced once every match is judged", () => {
    const season = [MATCH_A, { ...MATCH_B, errorSplitJudged: true }];
    expect(seasonErrorSplitJudged(season)).toBe(true);
    const groups = foldSeasonRows(season);
    const labels = groups[2].rows.map((r) => r.label);
    expect(labels).not.toContain("Errors");
    expect(labels.indexOf("Forced errors")).toBe(
      labels.indexOf("Unforced errors") + 1,
    );
    expect(row(groups, "Unforced errors").you.display).toBe("9.0");
    // B publishes no forced-error count, so Forced averages over A alone.
    expect(row(groups, "Forced errors").you).toEqual({
      value: 4,
      display: "4.0",
      detail: "4 in 1 match",
      matches: 1,
    });
  });
});

test.describe("the lob rows", () => {
  test("fold only over matches with lob keys", () => {
    const groups = foldSeasonRows(SEASON);
    // B alone: the player lobbed in two points and won one; passed one of the
    // opponent's two net points (the other was the lob).
    const lobs = row(groups, "Lob points won");
    expect(lobs.you).toMatchObject({
      value: 50,
      display: "50%",
      detail: "1/2",
      matches: 1,
    });
    expect(lobs.note).toBeUndefined();
    const passed = row(groups, "Passed the net player");
    expect(passed.you).toMatchObject({
      value: 50,
      display: "50%",
      detail: "1/2",
      matches: 1,
    });
    expect(passed.note).toBeUndefined();
    // The opponents never lobbed and never had the player at the net to pass.
    expect(lobs.opp).toEqual({ value: null, display: "", matches: 0 });
    expect(passed.opp).toEqual({ value: null, display: "", matches: 0 });
  });

  test("with no match knowing its lobs, both rows are a dash with the report's note", () => {
    const groups = foldSeasonRows([MATCH_A, { ...MATCH_B, lobKeys: null }]);
    const lobs = row(groups, "Lob points won");
    expect(lobs.you).toEqual({ value: null, display: "", matches: 0 });
    expect(lobs.opp).toEqual({ value: null, display: "", matches: 0 });
    expect(lobs.note).toBe(NO_LOB_DATA_NOTE);
    const passed = row(groups, "Passed the net player");
    expect(passed.you).toEqual({ value: null, display: "", matches: 0 });
    expect(passed.note).toBe(NO_PASS_DATA_NOTE);
    expect(seasonHasLobs([MATCH_A, { ...MATCH_B, lobKeys: null }])).toBe(false);
  });
});

test.describe("seats", () => {
  test("each match is read from its own seat — flipping B's seat changes the player's figures", () => {
    // Same points, but the player is now player 1 in B: the derived Aces are
    // player 1's one unreturned serve, and the lob points are nobody's.
    const groups = foldSeasonRows([MATCH_A, { ...MATCH_B, isPlayer1: true }]);
    expect(row(groups, "Aces").you).toMatchObject({
      value: 2,
      detail: "4 in 2 matches",
    });
    expect(row(groups, "Lob points won").you.value).toBeNull();
    expect(row(groups, "Lob points won").opp).toMatchObject({
      value: 50,
      detail: "1/2",
    });
  });
});

/* ── The right column's tallies ─────────────────────────────────────────── */

test.describe("per-match points", () => {
  test("are the points the player won of the points played, oldest match first", () => {
    const perMatch = seasonPerMatch(SEASON);
    expect(perMatch).toEqual([
      {
        matchId: "b",
        date: "2026-09-20",
        opponent: "Okafor",
        youWon: 5,
        total: 8,
      },
      {
        matchId: "a",
        date: "2026-10-05",
        opponent: "Ruiz",
        youWon: 3,
        total: 7,
      },
    ]);
    for (const m of SEASON) {
      const { allPoints } = tallySide(m.points, m.isPlayer1, null);
      const sample = perMatch.find((x) => x.matchId === m.matchId)!;
      expect(sample.youWon).toBe(allPoints.won);
      expect(sample.total).toBe(allPoints.total);
    }
  });
});

test.describe("same-day order", () => {
  test("two matches on one day sort by id, whatever order they arrive in", () => {
    const day = "2026-10-05";
    const m = (matchId: string) => ({ ...MATCH_A, matchId, date: day });
    // Newest first, as the loader reads them — the order must not depend on it.
    expect(
      seasonPerMatch([m("m-3"), m("m-1"), m("m-2")]).map((x) => x.matchId),
    ).toEqual(["m-1", "m-2", "m-3"]);
    expect(
      seasonPerMatch([m("m-2"), m("m-3"), m("m-1")]).map((x) => x.matchId),
    ).toEqual(["m-1", "m-2", "m-3"]);
    // The calendar day still comes first.
    expect(
      seasonPerMatch([{ ...m("m-1"), date: "2026-10-06" }, m("m-2")]).map(
        (x) => x.matchId,
      ),
    ).toEqual(["m-2", "m-1"]);
  });
});

test.describe("how points ended", () => {
  test("is the sum of each match's outcomeTally, taken with the season's error split", () => {
    const season = seasonOutcomes(SEASON);
    expect(season.errorSplitJudged).toBe(false);
    for (const side of ["you", "opp"] as const) {
      const parts = SEASON.map((m) =>
        outcomeTally(
          m.points,
          side === "you" ? m.isPlayer1 : !m.isPlayer1,
          m.isDerived,
          false,
        ),
      );
      for (const key of Object.keys(
        season[side],
      ) as (keyof typeof season.you)[]) {
        expect(season[side][key], `${side} ${key}`).toBe(
          parts.reduce((sum, t) => sum + t[key], 0),
        );
      }
    }
    // The player's ace in A plus two unreturned serves in B; every error in
    // the unforced bucket while the season is unjudged.
    expect(season.you).toEqual({
      winners: 5,
      aces: 3,
      serviceWinners: 0,
      unforcedErrors: 2,
      forcedErrors: 0,
      doubleFaults: 1,
    });
    expect(season.opp).toMatchObject({ aces: 2, winners: 2 });
  });

  test("splits the errors once every match is judged", () => {
    const season = seasonOutcomes([
      MATCH_A,
      { ...MATCH_B, errorSplitJudged: true },
    ]);
    expect(season.errorSplitJudged).toBe(true);
    expect(season.you.unforcedErrors).toBe(2);
    expect(season.you.forcedErrors).toBe(0);
  });
});

test.describe("the net game", () => {
  test("is the sum of each match's netGameTally, with lobs only when every match had them", () => {
    const season = seasonNetGame([MATCH_B, { ...MATCH_A, lobKeys: B_LOBS }]);
    expect(season.hasLobs).toBe(true);
    const sum = (parts: NetGameTally[]): NetGameTally => ({
      total: parts.reduce((n, t) => n + t.total, 0),
      endings: {
        winner: parts.reduce((n, t) => n + t.endings.winner, 0),
        "opponent-error": parts.reduce(
          (n, t) => n + t.endings["opponent-error"],
          0,
        ),
        "own-error": parts.reduce((n, t) => n + t.endings["own-error"], 0),
        passed: parts.reduce((n, t) => n + t.endings.passed, 0),
        lobbed: parts.reduce((n, t) => n + t.endings.lobbed, 0),
      },
      entries: {
        "serve-volley": parts.reduce(
          (n, t) => n + t.entries["serve-volley"],
          0,
        ),
        approach: parts.reduce((n, t) => n + t.entries.approach, 0),
        "drawn-in": parts.reduce((n, t) => n + t.entries["drawn-in"], 0),
      },
    });
    const withLobs = [MATCH_B, { ...MATCH_A, lobKeys: B_LOBS }];
    expect(season.you).toEqual(
      sum(withLobs.map((m) => netGameTally(m.points, m.isPlayer1, m.lobKeys))),
    );
    expect(season.opp).toEqual(
      sum(withLobs.map((m) => netGameTally(m.points, !m.isPlayer1, m.lobKeys))),
    );
    // The player came in once and won it on a volley; the opponents came in
    // twice in B and were lobbed once and passed once.
    expect(season.you).toMatchObject({
      total: 1,
      endings: { winner: 1 },
      entries: { approach: 1 },
    });
    expect(season.opp).toMatchObject({
      total: 2,
      endings: { lobbed: 1, passed: 1 },
      entries: { approach: 2 },
    });
    expect(seasonNetGame([MATCH_B]).hasLobs).toBe(true);
  });

  test("without lobs for every match, a found lob is counted among the passes", () => {
    // A has no file, B has one: the card draws no Lobbed segment, so B's lob
    // over the opponent must land in "Passed or lobbed", not vanish.
    const season = seasonNetGame(SEASON);
    expect(season.hasLobs).toBe(false);
    expect(season.opp).toMatchObject({
      total: 2,
      endings: { lobbed: 0, passed: 2 },
    });
    // What the card draws without a Lobbed segment adds up to the total.
    for (const side of [season.you, season.opp]) {
      const { winner, passed } = side.endings;
      const drawn =
        winner + side.endings["opponent-error"] + side.endings["own-error"];
      expect(drawn + passed).toBe(side.total);
    }
    // The match's own tally is untouched — the report keeps its Lobbed.
    expect(netGameTally(B_POINTS, true, B_LOBS).endings.lobbed).toBe(1);
  });
});

test.describe("rally length", () => {
  test("sums each match's bands and the shot counts behind the card's average", () => {
    const season = seasonRallyBands(SEASON);
    // Per match, the report's own band tallies.
    const parts = SEASON.map((m) => tallySide(m.points, m.isPlayer1, null));
    expect(season.bands).toEqual([
      {
        key: "short",
        count: parts.reduce((n, d) => n + d.shortRally.total, 0),
        youWon: parts.reduce((n, d) => n + d.shortRally.won, 0),
        oppWon:
          parts.reduce((n, d) => n + d.shortRally.total, 0) -
          parts.reduce((n, d) => n + d.shortRally.won, 0),
      },
      {
        key: "medium",
        count: parts.reduce((n, d) => n + d.mediumRally.total, 0),
        youWon: parts.reduce((n, d) => n + d.mediumRally.won, 0),
        oppWon:
          parts.reduce((n, d) => n + d.mediumRally.total, 0) -
          parts.reduce((n, d) => n + d.mediumRally.won, 0),
      },
      {
        key: "long",
        count: parts.reduce((n, d) => n + d.longRally.total, 0),
        youWon: parts.reduce((n, d) => n + d.longRally.won, 0),
        oppWon:
          parts.reduce((n, d) => n + d.longRally.total, 0) -
          parts.reduce((n, d) => n + d.longRally.won, 0),
      },
    ]);
    // Nine short, four medium, one long; the double fault's 0 is in no band.
    expect(season.bands.map((b) => [b.count, b.youWon, b.oppWon])).toEqual([
      [9, 5, 4],
      [4, 3, 1],
      [1, 0, 1],
    ]);
    expect(season.total).toBe(14);
    const banded = SEASON.flatMap((m) => m.points).filter(
      (p) => rallyLengthBandOf(p.rallyLength) !== null,
    );
    expect(season.shotSum).toBe(banded.reduce((n, p) => n + p.rallyLength, 0));
    expect(season.shotSum).toBe(48);
    expect(season.avgShots).toBeCloseTo(48 / 14, 10);
  });

  test("has no average with no banded point", () => {
    const none = seasonRallyBands([]);
    expect(none.total).toBe(0);
    expect(none.avgShots).toBeNull();
    expect(none.bands.map((b) => b.count)).toEqual([0, 0, 0]);
  });
});

test("foldSeasonTallies folds the four in one call", () => {
  const tallies = foldSeasonTallies(SEASON);
  expect(tallies.perMatch).toEqual(seasonPerMatch(SEASON));
  expect(tallies.outcomes).toEqual(seasonOutcomes(SEASON));
  expect(tallies.netGame).toEqual(seasonNetGame(SEASON));
  expect(tallies.rallyBands).toEqual(seasonRallyBands(SEASON));
});
