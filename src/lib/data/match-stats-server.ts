import { createClient } from "@/lib/supabase/server";
import type { MatchDetailedStats, PlayerStatistics, StatFraction } from "./types";

interface DbMatchStatsView {
  is_player1: boolean;
  aces: number | null;
  double_faults: number | null;
  first_serve_pct: string | null;
  first_serve_won_pct: string | null;
  second_serve_won_pct: string | null;
  break_points_converted: number | null;
  first_serve_points_won: number | null;
  second_serve_points_won: number | null;
  service_games_won: number | null;
  service_games_won_pct: string | null;
  first_return_points_won: number | null;
  second_return_points_won: number | null;
  return_games_won: number | null;
  first_return_in_pct: string | null;
  second_return_in_pct: string | null;
  first_returns_in: number | null;
  second_returns_in: number | null;
  first_return_won_pct: string | null;
  second_return_won_pct: string | null;
  return_games_won_pct: string | null;
  break_points_converted_pct: string | null;
  total_points: number | null;
  total_points_won: number | null;
  serve_rating: number | null;
  return_rating: string | null;
  under_pressure_rating: string | null;
  short_rally_won_pct: string | null;
  medium_rally_won_pct: string | null;
  long_rally_won_pct: string | null;
  serve_wide_pct: string | null;
  serve_body_pct: string | null;
  serve_t_pct: string | null;
  return_cross_court_pct: string | null;
  return_down_the_line_pct: string | null;
  return_middle_pct: string | null;
  return_contact_inside_pct: string | null;
  return_contact_middle_pct: string | null;
  return_contact_deep_pct: string | null;
  winners: number | null;
  unforced_errors: number | null;
  net_points_appearances: number | null;
  net_points_won: number | null;
  first_serves: number | null;
  first_serves_in: number | null;
  second_serves_in: number | null;
  service_games: number | null;
  break_points_faced: number | null;
  break_points_saved: number | null;
  break_point_opportunities: number | null;
  first_returns: number | null;
  second_returns: number | null;
  return_games: number | null;
  short_rally_won: number | null;
  short_rally_total: number | null;
  medium_rally_won: number | null;
  medium_rally_total: number | null;
  long_rally_won: number | null;
  long_rally_total: number | null;
}

interface DbMatchScore {
  player1: number[];
  player2: number[];
  player1_tiebreaks?: (number | null)[];
  player2_tiebreaks?: (number | null)[];
}

export interface MatchStatisticsResult {
  statistics: MatchDetailedStats;
  player1Name: string;
  player2Name: string;
}

interface TiebreakCounts {
  player1Tiebreaks: number;
  player2Tiebreaks: number;
}

/* ── Cross-match averages for player1 ──────────────────── */

export async function getPlayerAverageStats(
  userId: string,
): Promise<Partial<PlayerStatistics> | null> {
  const supabase = await createClient();

  const { data: matches } = await supabase
    .from("matches")
    .select("id")
    .eq("player1_id", userId);

  if (!matches?.length) return null;

  const matchIds = matches.map((m) => m.id);

  const { data: rows } = await supabase
    .from("match_stats_with_percentages")
    .select(
      "first_serve_pct, first_serve_won_pct, second_serve_won_pct, service_games_won_pct, break_points_converted_pct, first_return_won_pct, second_return_won_pct, return_games_won_pct, net_points_won, net_points_appearances, short_rally_won_pct, medium_rally_won_pct, long_rally_won_pct, aces, double_faults, winners, unforced_errors, total_points_won, total_points",
    )
    .in("match_id", matchIds)
    .eq("is_player1", true);

  if (!rows?.length) return null;

  const avgPct = (field: string) => {
    const vals = rows
      .map((r) => parseFloat((r as Record<string, string | null>)[field] ?? "0"))
      .filter((v) => !isNaN(v) && v > 0);
    return vals.length
      ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length)
      : 0;
  };

  const avgNum = (field: string) => {
    const vals = rows
      .map((r) => Number((r as Record<string, number | null>)[field] ?? 0))
      .filter((v) => !isNaN(v));
    return vals.length
      ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length)
      : 0;
  };

  const netWon = rows.reduce(
    (a, r) => a + ((r as Record<string, number | null>).net_points_won ?? 0),
    0,
  );
  const netTotal = rows.reduce(
    (a, r) =>
      a + ((r as Record<string, number | null>).net_points_appearances ?? 0),
    0,
  );

  return {
    firstServeInPct: avgPct("first_serve_pct"),
    firstServeWinPct: avgPct("first_serve_won_pct"),
    secondServeWinPct: avgPct("second_serve_won_pct"),
    serviceGamesWonPct: avgPct("service_games_won_pct"),
    breakpointsWonPct: avgPct("break_points_converted_pct"),
    firstReturnWonPct: avgPct("first_return_won_pct"),
    secondReturnWonPct: avgPct("second_return_won_pct"),
    returnGamesWonPct: avgPct("return_games_won_pct"),
    netPointsWonPct: netTotal > 0 ? Math.round((netWon / netTotal) * 100) : 0,
    shortRallyWonPct: avgPct("short_rally_won_pct"),
    mediumRallyWonPct: avgPct("medium_rally_won_pct"),
    longRallyWonPct: avgPct("long_rally_won_pct"),
    aces: avgNum("aces"),
    doubleFaults: avgNum("double_faults"),
    winners: avgNum("winners"),
    unforcedErrors: avgNum("unforced_errors"),
    totalPointsWon: avgNum("total_points_won"),
    totalPoints: avgNum("total_points"),
  } as Partial<PlayerStatistics>;
}

/* ── Single-match stats ────────────────────────────────── */

export async function getMatchStatisticsFromSupabase(
  matchId: string
): Promise<MatchStatisticsResult | null> {
  const supabase = await createClient();

  const [statsResult, matchResult] = await Promise.all([
    supabase
      .from("match_stats_with_percentages")
      .select(
        "is_player1, aces, double_faults, first_serve_pct, first_serve_won_pct, second_serve_won_pct, break_points_converted, first_serve_points_won, second_serve_points_won, service_games_won, service_games_won_pct, first_return_points_won, second_return_points_won, return_games_won, first_return_in_pct, second_return_in_pct, first_returns_in, second_returns_in, first_return_won_pct, second_return_won_pct, return_games_won_pct, break_points_converted_pct, total_points, total_points_won, serve_rating, return_rating, under_pressure_rating, short_rally_won_pct, medium_rally_won_pct, long_rally_won_pct, serve_wide_pct, serve_body_pct, serve_t_pct, return_cross_court_pct, return_down_the_line_pct, return_middle_pct, return_contact_inside_pct, return_contact_middle_pct, return_contact_deep_pct, winners, unforced_errors, net_points_appearances, net_points_won, first_serves, first_serves_in, second_serves_in, service_games, break_points_faced, break_points_saved, break_point_opportunities, first_returns, second_returns, return_games, short_rally_won, short_rally_total, medium_rally_won, medium_rally_total, long_rally_won, long_rally_total"
      )
      .eq("match_id", matchId),
    supabase
      .from("matches")
      .select("score, player1_name, player2_name")
      .eq("id", matchId)
      .single(),
  ]);

  if (statsResult.error || !statsResult.data?.length) return null;

  const player1Row = statsResult.data.find(
    (r) => r.is_player1
  ) as DbMatchStatsView | undefined;
  const player2Row = statsResult.data.find(
    (r) => !r.is_player1
  ) as DbMatchStatsView | undefined;
  const score = matchResult.data?.score as DbMatchScore | null;
  const player1Name = matchResult.data?.player1_name ?? "Player 1";
  const player2Name = matchResult.data?.player2_name ?? "Player 2";

  const { player1Tiebreaks, player2Tiebreaks } = countTiebreaksWon(score);

  return {
    statistics: {
      summary: { totalPoints: 0, durationMinutes: 0, longestRally: 0 },
      player1Stats: transformToPlayerStats(player1Row, player1Tiebreaks),
      player2Stats: transformToPlayerStats(player2Row, player2Tiebreaks),
    },
    player1Name,
    player2Name,
  };
}

function countTiebreaksWon(score: DbMatchScore | null): TiebreakCounts {
  if (!score?.player1_tiebreaks || !score?.player2_tiebreaks) {
    return { player1Tiebreaks: 0, player2Tiebreaks: 0 };
  }

  let player1Tiebreaks = 0;
  let player2Tiebreaks = 0;

  for (let i = 0; i < score.player1_tiebreaks.length; i++) {
    const p1 = score.player1_tiebreaks[i] ?? 0;
    const p2 = score.player2_tiebreaks[i] ?? 0;
    if (p1 > p2) player1Tiebreaks++;
    else if (p2 > p1) player2Tiebreaks++;
  }

  return { player1Tiebreaks, player2Tiebreaks };
}

const DEFAULT_STATS: PlayerStatistics = {
  aces: 0,
  doubleFaults: 0,
  firstServeInPct: 0,
  firstServeWinPct: 0,
  secondServeWinPct: 0,
  breakpointsWon: 0,
  tiebreaksWon: 0,
  servicePointsWon: 0,
  serviceGamesWon: 0,
  serviceGamesWonPct: 0,
  returnPointsWon: 0,
  firstReturnPointsWon: 0,
  secondReturnPointsWon: 0,
  returnGamesWon: 0,
  firstReturnInPct: 0,
  secondReturnInPct: 0,
  firstReturnWonPct: 0,
  secondReturnWonPct: 0,
  returnGamesWonPct: 0,
  breakpointsWonPct: 0,
  totalPoints: 0,
  totalPointsWon: 0,
  serveRating: 0,
  returnRating: 0,
  underPressureRating: 0,
  shortRallyWonPct: 0,
  mediumRallyWonPct: 0,
  longRallyWonPct: 0,
  winners: 0,
  unforcedErrors: 0,
  netPointsAppearances: 0,
  netPointsWon: 0,
  netPointsWonPct: 0,
  breakpointsSaved: 0,
  fractions: {},
  serveWidePct: 0,
  serveBodyPct: 0,
  serveTpct: 0,
  returnCrossCourtPct: 0,
  returnDownTheLinePct: 0,
  returnMiddlePct: 0,
  returnContactInsidePct: 0,
  returnContactMiddlePct: 0,
  returnContactDeepPct: 0,
};

function frac(made: number | null, attempts: number | null): StatFraction | null {
  const m = made ?? 0;
  const a = attempts ?? 0;
  return a > 0 ? { made: m, attempts: a } : null;
}

function buildFractions(row: DbMatchStatsView): Partial<Record<string, StatFraction>> {
  const result: Partial<Record<string, StatFraction>> = {};

  const entries: [string, StatFraction | null][] = [
    ["firstServeInPct", frac(row.first_serves_in, row.first_serves)],
    ["firstServeWinPct", frac(row.first_serve_points_won, row.first_serves_in)],
    ["secondServeWinPct", frac(row.second_serve_points_won, row.second_serves_in)],
    ["breakpointsSaved", frac(row.break_points_saved, row.break_points_faced)],
    ["servicePointsWon", frac(
      (row.first_serve_points_won ?? 0) + (row.second_serve_points_won ?? 0),
      row.first_serves,
    )],
    ["serviceGamesWonPct", frac(row.service_games_won, row.service_games)],
    ["firstReturnInPct", frac(row.first_returns_in, row.first_returns)],
    ["secondReturnInPct", frac(row.second_returns_in, row.second_returns)],
    ["firstReturnWonPct", frac(row.first_return_points_won, row.first_returns)],
    ["secondReturnWonPct", frac(row.second_return_points_won, row.second_returns)],
    ["breakpointsWonPct", frac(row.break_points_converted, row.break_point_opportunities)],
    ["returnPointsWon", frac(
      (row.first_return_points_won ?? 0) + (row.second_return_points_won ?? 0),
      (row.first_returns ?? 0) + (row.second_returns ?? 0),
    )],
    ["returnGamesWonPct", frac(row.return_games_won, row.return_games)],
    ["netPointsWonPct", frac(row.net_points_won, row.net_points_appearances)],
    ["shortRallyWonPct", frac(row.short_rally_won, row.short_rally_total)],
    ["mediumRallyWonPct", frac(row.medium_rally_won, row.medium_rally_total)],
    ["longRallyWonPct", frac(row.long_rally_won, row.long_rally_total)],
  ];

  for (const [key, val] of entries) {
    if (val) result[key] = val;
  }

  return result;
}

function transformToPlayerStats(
  row: DbMatchStatsView | undefined,
  tiebreaksWon: number
): PlayerStatistics {
  if (!row) return DEFAULT_STATS;

  return {
    aces: row.aces ?? 0,
    doubleFaults: row.double_faults ?? 0,
    firstServeInPct: Math.round(parseFloat(row.first_serve_pct ?? "0")),
    firstServeWinPct: Math.round(parseFloat(row.first_serve_won_pct ?? "0")),
    secondServeWinPct: Math.round(parseFloat(row.second_serve_won_pct ?? "0")),
    breakpointsWon: row.break_points_converted ?? 0,
    tiebreaksWon,
    servicePointsWon:
      (row.first_serve_points_won ?? 0) + (row.second_serve_points_won ?? 0),
    serviceGamesWon: row.service_games_won ?? 0,
    serviceGamesWonPct: Math.round(parseFloat(row.service_games_won_pct ?? "0")),
    returnPointsWon:
      (row.first_return_points_won ?? 0) + (row.second_return_points_won ?? 0),
    firstReturnPointsWon: row.first_return_points_won ?? 0,
    secondReturnPointsWon: row.second_return_points_won ?? 0,
    returnGamesWon: row.return_games_won ?? 0,
    firstReturnInPct: Math.round(parseFloat(row.first_return_in_pct ?? "0")),
    secondReturnInPct: Math.round(parseFloat(row.second_return_in_pct ?? "0")),
    firstReturnWonPct: Math.round(parseFloat(row.first_return_won_pct ?? "0")),
    secondReturnWonPct: Math.round(parseFloat(row.second_return_won_pct ?? "0")),
    returnGamesWonPct: Math.round(parseFloat(row.return_games_won_pct ?? "0")),
    breakpointsWonPct: Math.round(parseFloat(row.break_points_converted_pct ?? "0")),
    totalPoints: row.total_points ?? 0,
    totalPointsWon: row.total_points_won ?? 0,
    serveRating: parseFloat(String(row.serve_rating ?? 0)),
    returnRating: Math.round(parseFloat(row.return_rating ?? "0")),
    underPressureRating: Math.round(parseFloat(row.under_pressure_rating ?? "0")),
    shortRallyWonPct: Math.round(parseFloat(row.short_rally_won_pct ?? "0")),
    mediumRallyWonPct: Math.round(parseFloat(row.medium_rally_won_pct ?? "0")),
    longRallyWonPct: Math.round(parseFloat(row.long_rally_won_pct ?? "0")),
    winners: row.winners ?? 0,
    unforcedErrors: row.unforced_errors ?? 0,
    netPointsAppearances: row.net_points_appearances ?? 0,
    netPointsWon: row.net_points_won ?? 0,
    netPointsWonPct: (row.net_points_appearances ?? 0) > 0
      ? Math.round(((row.net_points_won ?? 0) / (row.net_points_appearances ?? 1)) * 100)
      : 0,
    breakpointsSaved: row.break_points_saved ?? 0,
    fractions: buildFractions(row),
    serveWidePct: Math.round(parseFloat(row.serve_wide_pct ?? "0")),
    serveBodyPct: Math.round(parseFloat(row.serve_body_pct ?? "0")),
    serveTpct: Math.round(parseFloat(row.serve_t_pct ?? "0")),
    returnCrossCourtPct: Math.round(parseFloat(row.return_cross_court_pct ?? "0")),
    returnDownTheLinePct: Math.round(parseFloat(row.return_down_the_line_pct ?? "0")),
    returnMiddlePct: Math.round(parseFloat(row.return_middle_pct ?? "0")),
    returnContactInsidePct: Math.round(parseFloat(row.return_contact_inside_pct ?? "0")),
    returnContactMiddlePct: Math.round(parseFloat(row.return_contact_middle_pct ?? "0")),
    returnContactDeepPct: Math.round(parseFloat(row.return_contact_deep_pct ?? "0")),
  };
}
