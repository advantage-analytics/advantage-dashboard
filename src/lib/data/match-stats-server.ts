import { createClient } from "@/lib/supabase/server";
import type { MatchDetailedStats, PlayerStatistics } from "./types";

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

export async function getMatchStatisticsFromSupabase(
  matchId: string
): Promise<MatchStatisticsResult | null> {
  const supabase = await createClient();

  const [statsResult, matchResult] = await Promise.all([
    supabase
      .from("match_stats_with_percentages")
      .select(
        "is_player1, aces, double_faults, first_serve_pct, first_serve_won_pct, second_serve_won_pct, break_points_converted, first_serve_points_won, second_serve_points_won, service_games_won, service_games_won_pct, first_return_points_won, second_return_points_won, return_games_won, first_return_won_pct, second_return_won_pct, return_games_won_pct, break_points_converted_pct, total_points, total_points_won, serve_rating, return_rating, under_pressure_rating, short_rally_won_pct, medium_rally_won_pct, long_rally_won_pct, serve_wide_pct, serve_body_pct, serve_t_pct, return_cross_court_pct, return_down_the_line_pct, return_middle_pct, return_contact_inside_pct, return_contact_middle_pct, return_contact_deep_pct"
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
