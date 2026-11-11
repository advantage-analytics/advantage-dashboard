import { readFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  countViewerWins,
  type DbRecentMatch,
} from "@/lib/data/home-recent-data";
import { loadHomeServes } from "@/lib/data/home-serve-data";
import {
  baselineMatches,
  buildKpiHistory,
  ownSeatRows,
  type RawStatRow,
  type SeatMatch,
} from "@/lib/data/match-stats-server";
import { buildOverallPerformance } from "@/lib/data/performance-server";
import { buildPersonalSeasonKpis } from "@/lib/data/personal-kpis-server";
import type { DbPersonalMatch } from "@/lib/data/personal-matches-server";
import { utcToday } from "@/lib/data/match-day";

/**
 * Practice never counts toward win–loss, the season record or the season
 * statistics (product decision, no opt-in) — but it is still listed, and its
 * own report still shows its own statistics.
 *
 * Every fixture below is a set of competitive matches, then the same set with
 * ONE practice row added: a win, dated today, with stat rows far from every
 * competitive figure. If any reader let it in, the record, the last-30-days
 * record, the match count or a season average would move. Each assertion is
 * "with practice === without practice".
 */

const VIEWER = "viewer";
const IDS = [VIEWER];

function daysAgo(n: number): string {
  const today = Date.parse(`${utcToday()}T00:00:00.000Z`);
  return new Date(today - n * 86_400_000).toISOString();
}

type Score = NonNullable<DbPersonalMatch["score"]>;
const WIN: Score = { player1: [6, 6], player2: [3, 4] };
const LOSS: Score = { player1: [2, 3], player2: [6, 6] };

function match(
  id: string,
  date: string,
  score: Score,
  matchType: string | null,
  seat: "player1" | "player2" = "player1",
): DbPersonalMatch {
  return {
    id,
    date,
    player1_id: seat === "player1" ? VIEWER : "opp",
    player2_id: seat === "player1" ? "opp" : VIEWER,
    player1_name: seat === "player1" ? "Me" : "Rival",
    player2_name: seat === "player1" ? "Rival" : "Me",
    created_by: VIEWER,
    score:
      seat === "player1"
        ? score
        : { player1: score.player2, player2: score.player1 },
    tournament_name: null,
    round: null,
    result: null,
    match_type: matchType,
    court_type: null,
    verified: null,
    duration: null,
    opponent_hand: null,
    opponent_backhand: null,
  };
}

/** Both sides' stat rows for one match; `level` sets every figure. */
function statRows(matchId: string, level: number): Record<string, unknown>[] {
  return [true, false].map((isPlayer1) => ({
    match_id: matchId,
    is_player1: isPlayer1,
    first_serve_pct: String(level),
    first_serve_won_pct: String(level),
    second_serve_won_pct: String(level),
    service_games_won_pct: String(level),
    break_points_saved_pct: String(level),
    break_points_converted_pct: String(level),
    first_return_won_pct: String(level),
    second_return_won_pct: String(level),
    return_games_won_pct: String(level),
    total_points_won_pct: String(level),
    serve_rating: String(level * 2),
    break_points_converted: level / 10,
    break_point_opportunities: 10,
    service_games: 10,
    service_games_won: level / 10,
    return_games: 10,
    return_games_won: level / 10,
    aces: level / 10,
    double_faults: 1,
    winners: level / 5,
    unforced_errors: 10,
    forced_errors: 2,
    avg_rally_length: 4,
  }));
}

// Two wins and a loss, one of them with the viewer in seat two, all inside 30
// days so the last-30-days record is exercised too.
const COMPETITIVE: DbPersonalMatch[] = [
  match("m-3", daysAgo(2), WIN, "Tournament"),
  match("m-2", daysAgo(9), LOSS, "Dual Match", "player2"),
  match("m-1", daysAgo(20), WIN, null),
];
const COMPETITIVE_STATS = [
  ...statRows("m-3", 60),
  ...statRows("m-2", 50),
  ...statRows("m-1", 40),
];

// A practice WIN, today, at 95% everything — newest, so it would lead every
// newest-first window, and any reader that let it in would move a figure.
// Spelled the legacy way, padded and lower-cased, so the test goes through
// `isPracticeMatch` rather than a literal.
const PRACTICE = match("p-1", daysAgo(0), WIN, "  practice ");
const PRACTICE_STATS = statRows("p-1", 95);

const WITH_PRACTICE = [PRACTICE, ...COMPETITIVE];
const WITH_PRACTICE_STATS = [...PRACTICE_STATS, ...COMPETITIVE_STATS];

test.describe("countViewerWins", () => {
  test("skips a practice row", () => {
    const without = countViewerWins(
      COMPETITIVE as unknown as DbRecentMatch[],
      IDS,
      VIEWER,
    );
    const withPractice = countViewerWins(
      WITH_PRACTICE as unknown as DbRecentMatch[],
      IDS,
      VIEWER,
    );
    expect(without).toBe(2);
    expect(withPractice).toBe(without);
  });

  test("a teammate practice with roster ids in both seats is still skipped", () => {
    // T5 seats a teammate opponent in player2_id, so both seats can name ids.
    const teammate = {
      ...PRACTICE,
      player1_id: VIEWER,
      player2_id: "teammate-roster-id",
    };
    expect(
      countViewerWins(
        [teammate, ...COMPETITIVE] as unknown as DbRecentMatch[],
        IDS,
        VIEWER,
      ),
    ).toBe(2);
  });
});

test.describe("the personal season strip", () => {
  test("gives the same wins, losses and KPI values with a practice row added", () => {
    const without = buildPersonalSeasonKpis(
      COMPETITIVE,
      COMPETITIVE_STATS,
      IDS,
      VIEWER,
    );
    const withPractice = buildPersonalSeasonKpis(
      WITH_PRACTICE,
      WITH_PRACTICE_STATS,
      IDS,
      VIEWER,
    );

    expect(without.wins).toBe(2);
    expect(without.losses).toBe(1);
    expect(without.matchesPlayed).toBe(3);
    expect(without.hasStats).toBe(true);
    expect(without.kpis.length).toBeGreaterThan(0);

    expect(withPractice.wins).toBe(without.wins);
    expect(withPractice.losses).toBe(without.losses);
    expect(withPractice.matchesPlayed).toBe(without.matchesPlayed);
    expect(withPractice.kpis).toEqual(without.kpis);
  });

  test("a practice-only account has an empty strip", () => {
    const strip = buildPersonalSeasonKpis(
      [PRACTICE],
      PRACTICE_STATS,
      IDS,
      VIEWER,
    );
    expect(strip).toMatchObject({ wins: 0, losses: 0, matchesPlayed: 0 });
    expect(strip.kpis).toEqual([]);
  });
});

test.describe("getOverallPerformance (the figures /api/home-insight quotes)", () => {
  const build = (
    matches: DbPersonalMatch[],
    stats: Record<string, unknown>[],
  ) =>
    buildOverallPerformance(
      matches as unknown as Parameters<typeof buildOverallPerformance>[0],
      stats,
      IDS,
      VIEWER,
    );

  test("matchCount, the overall record and the last-30-days record skip practice", () => {
    const without = build(COMPETITIVE, COMPETITIVE_STATS);
    const withPractice = build(WITH_PRACTICE, WITH_PRACTICE_STATS);

    expect(without.matchCount).toBe(3);
    const [overall, last30, last7] = without.views;
    expect(overall).toMatchObject({ wins: 2, losses: 1 });
    expect(last30).toMatchObject({ wins: 2, losses: 1 });
    expect(last7).toMatchObject({ wins: 1, losses: 0 });

    expect(without.kpiCards.length).toBeGreaterThan(0);
    expect(without.form).toHaveLength(3);

    expect(withPractice.matchCount).toBe(without.matchCount);
    expect(withPractice.wonCount).toBe(without.wonCount);
    expect(withPractice.views).toEqual(without.views);
    // The rest of the prompt's inputs: win rate, form, KPI and serve figures.
    expect(withPractice.winRate).toEqual(without.winRate);
    expect(withPractice.form).toEqual(without.form);
    expect(withPractice.kpiCards).toEqual(without.kpiCards);
    expect(withPractice.recentPerformance).toEqual(without.recentPerformance);
    expect(withPractice.performanceRatings).toEqual(without.performanceRatings);
    expect(withPractice.performanceProfile).toEqual(without.performanceProfile);
  });

  test("a practice report still counts as an analysed report", () => {
    const without = build(COMPETITIVE, COMPETITIVE_STATS);
    const withPractice = build(WITH_PRACTICE, WITH_PRACTICE_STATS);
    expect(without.analyzedMatchCount).toBe(3);
    expect(withPractice.analyzedMatchCount).toBe(4);
  });

  test("a practice-only account reads as no matches", () => {
    const only = build([PRACTICE], PRACTICE_STATS);
    expect(only.matchCount).toBe(0);
    expect(only.views[0]).toMatchObject({ wins: 0, losses: 0 });
    expect(only.kpiCards).toEqual([]);
  });
});

test.describe("loadHomeServes", () => {
  /** Records which match ids the points read asked for, and returns none. */
  function fakeClient() {
    const asked: unknown[][] = [];
    function from(table: string) {
      const builder = {
        select: () => builder,
        eq: () => builder,
        is: () => builder,
        limit: () => builder,
        order: () => builder,
        range: () => builder,
        in(column: string, values: unknown[]) {
          if (table === "points" && column === "match_id") asked.push(values);
          return builder;
        },
        then<R>(resolve: (value: { data: unknown[]; error: null }) => R) {
          return Promise.resolve({ data: [], error: null }).then(resolve);
        },
      };
      return builder;
    }
    return { client: { from } as unknown as SupabaseClient, asked };
  }

  test("plots the newest four competitive matches, never a practice one", async () => {
    const rows = [
      { id: "p-new", match_type: "Practice" },
      { id: "c-1", match_type: "Tournament" },
      { id: "p-mid", match_type: "practice" },
      { id: "c-2", match_type: null },
      { id: "c-3", match_type: "Singles" },
      { id: "c-4", match_type: "Dual Match" },
      { id: "c-5", match_type: "Tournament" },
    ];
    const { client, asked } = fakeClient();
    const { matchCount } = await loadHomeServes(client, VIEWER, rows);

    expect(matchCount).toBe(4);
    expect(asked[0]).toEqual(["c-1", "c-2", "c-3", "c-4"]);
  });

  test("practice alone reads no points", async () => {
    const { client, asked } = fakeClient();
    expect(
      await loadHomeServes(client, VIEWER, [
        { id: "p", match_type: "Practice" },
      ]),
    ).toEqual({ dots: [], matchCount: 0 });
    expect(asked).toEqual([]);
  });
});

test.describe("match-page baseline (getPlayerAverageStats / getMatchKpiHistory)", () => {
  const seat = (
    id: string,
    date: string,
    matchType: string | null,
  ): SeatMatch => ({
    id,
    date,
    player1_id: VIEWER,
    player2_id: "opp",
    match_type: matchType,
  });
  const MATCHES: SeatMatch[] = [
    seat("c-1", "2026-03-01", "Tournament"),
    seat("p-1", "2026-03-05", "Practice"),
    seat("c-2", "2026-03-10", null),
    seat("p-2", "2026-03-15", "Practice"),
  ];
  const level: Record<string, number> = {
    "c-1": 50,
    "p-1": 99,
    "c-2": 60,
    "p-2": 90,
  };
  const STATS: RawStatRow[] = MATCHES.flatMap((m) =>
    [true, false].map((isPlayer1) => ({
      match_id: m.id,
      is_player1: isPlayer1,
      first_serve_pct: String(level[m.id]),
    })),
  );

  test("baselineMatches drops practice and keeps only the open match", () => {
    expect(baselineMatches(MATCHES).map((m) => m.id)).toEqual(["c-1", "c-2"]);
    expect(baselineMatches(MATCHES, "p-2").map((m) => m.id)).toEqual([
      "c-1",
      "c-2",
      "p-2",
    ]);
  });

  test("a competitive match's baseline and line never use a practice match", () => {
    const rows = ownSeatRows(baselineMatches(MATCHES, "c-2"), STATS, IDS);
    const history = buildKpiHistory(rows, "c-2");
    expect(history.baseline.firstServeIn).toBe(50);
    expect(history.series.firstServeIn).toEqual([50, 60]);
  });

  test("a practice match's own report still loads its own figures", () => {
    const rows = ownSeatRows(baselineMatches(MATCHES, "p-2"), STATS, IDS);
    const history = buildKpiHistory(rows, "p-2");
    // The line ends on the practice match itself (90)…
    expect(history.series.firstServeIn).toEqual([50, 60, 90]);
    // …against a baseline of competitive matches only (mean of 50 and 60).
    expect(history.baseline.firstServeIn).toBe(55);
  });
});

test("every exclusion goes through isPracticeMatch, never a literal", () => {
  const root = join(__dirname, "..", "src", "lib", "data");
  for (const file of [
    "home-recent-data.ts",
    "personal-kpis-server.ts",
    "performance-server.ts",
    "home-serve-data.ts",
    "match-stats-server.ts",
  ]) {
    const source = readFileSync(join(root, file), "utf8");
    expect(source, file).toContain("isPracticeMatch(");
    expect(source, file).not.toMatch(/===\s*["']practice["']/i);
  }
});
