import { createClient } from "@/lib/supabase/server";

interface WinLossView {
  wins: number;
  losses: number;
  label: string;
}

interface PerformanceRating {
  label: string;
  value: number;
  barColor: string;
}

interface RecentPerformanceStat {
  label: string;
  value: number;
  change: number;
}

export interface OverallPerformanceData {
  views: WinLossView[];
  performanceRatings: PerformanceRating[];
  recentPerformance: RecentPerformanceStat[];
}

interface DbMatch {
  id: string;
  date: string;
  player1_id: string | null;
  score: {
    player1: number[];
    player2: number[];
  } | null;
}

interface DbMatchStats {
  match_id: string;
  is_player1: boolean;
  first_serve_pct: string | null;
  first_serve_won_pct: string | null;
  second_serve_won_pct: string | null;
  serve_rating: string | null;
  first_return_won_pct: string | null;
  second_return_won_pct: string | null;
  break_points_saved_pct: string | null;
  break_points_converted_pct: string | null;
}

const DEFAULT_PERFORMANCE: OverallPerformanceData = {
  views: [
    { wins: 0, losses: 0, label: "Overall Record" },
    { wins: 0, losses: 0, label: "Last 30 Days" },
    { wins: 0, losses: 0, label: "Last 7 Days" },
  ],
  performanceRatings: [
    { label: "Serve Rating", value: 0, barColor: "#666666" },
    { label: "Return Rating", value: 0, barColor: "#4A90E2" },
    { label: "Under Pressure Rating", value: 0, barColor: "#666666" },
  ],
  recentPerformance: [
    { label: "First Serve In Percentage", value: 0, change: 0 },
    { label: "First Serve Won Percentage", value: 0, change: 0 },
    { label: "Second Serve Won Percentage", value: 0, change: 0 },
  ],
};

function calculateWinLoss(
  matches: DbMatch[],
  userId: string,
  daysAgo?: number
): { wins: number; losses: number } {
  const cutoffDate = daysAgo
    ? new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000)
    : null;

  let wins = 0;
  let losses = 0;

  for (const match of matches) {
    if (cutoffDate && new Date(match.date) < cutoffDate) continue;
    if (!match.score?.player1 || !match.score?.player2) continue;

    const p1Sets = match.score.player1.filter(
      (s, i) => s > (match.score?.player2[i] ?? 0)
    ).length;
    const p2Sets = match.score.player2.filter(
      (s, i) => s > (match.score?.player1[i] ?? 0)
    ).length;

    const player1Won = p1Sets > p2Sets;
    const isUserPlayer1 = match.player1_id === userId;
    const userWon = isUserPlayer1 ? player1Won : !player1Won;

    if (userWon) wins++;
    else losses++;
  }

  return { wins, losses };
}

function calculateAverageRating(
  stats: DbMatchStats[],
  userId: string,
  matchPlayerMap: Map<string, boolean>
): { serve: number; return_: number; pressure: number } {
  if (stats.length === 0) return { serve: 0, return_: 0, pressure: 0 };

  let serveSum = 0;
  let returnSum = 0;
  let pressureSum = 0;
  let count = 0;

  for (const stat of stats) {
    const isUserPlayer1 = matchPlayerMap.get(stat.match_id);
    if (isUserPlayer1 === undefined) continue;
    if (stat.is_player1 !== isUserPlayer1) continue;

    const serveRating = parseFloat(stat.serve_rating ?? "0");
    const returnWonPct =
      (parseFloat(stat.first_return_won_pct ?? "0") +
        parseFloat(stat.second_return_won_pct ?? "0")) /
      2;
    const pressurePct =
      (parseFloat(stat.break_points_saved_pct ?? "0") +
        parseFloat(stat.break_points_converted_pct ?? "0")) /
      2;

    serveSum += serveRating;
    returnSum += returnWonPct * 3; // Scale to ~150-200 range
    pressureSum += pressurePct * 3;
    count++;
  }

  if (count === 0) return { serve: 0, return_: 0, pressure: 0 };

  return {
    serve: Math.round(serveSum / count),
    return_: Math.round(returnSum / count),
    pressure: Math.round(pressureSum / count),
  };
}

function calculateRecentPerformance(
  stats: DbMatchStats[],
  matchPlayerMap: Map<string, boolean>,
  orderedMatchIds: string[]
): RecentPerformanceStat[] {
  if (stats.length === 0) {
    return DEFAULT_PERFORMANCE.recentPerformance;
  }

  // Build a map of matchId → user's stats
  const matchStatsMap = new Map<
    string,
    { firstServeIn: number; firstServeWon: number; secondServeWon: number }
  >();
  for (const stat of stats) {
    const isUserPlayer1 = matchPlayerMap.get(stat.match_id);
    if (isUserPlayer1 === undefined) continue;
    if (stat.is_player1 !== isUserPlayer1) continue;

    matchStatsMap.set(stat.match_id, {
      firstServeIn: parseFloat(stat.first_serve_pct ?? "0"),
      firstServeWon: parseFloat(stat.first_serve_won_pct ?? "0"),
      secondServeWon: parseFloat(stat.second_serve_won_pct ?? "0"),
    });
  }

  // Find the two most recent matches that have stats
  let latestStats: (typeof matchStatsMap extends Map<string, infer V> ? V : never) | undefined;
  let previousStats: (typeof matchStatsMap extends Map<string, infer V> ? V : never) | undefined;
  for (const matchId of orderedMatchIds) {
    const s = matchStatsMap.get(matchId);
    if (!s) continue;
    if (!latestStats) {
      latestStats = s;
    } else {
      previousStats = s;
      break;
    }
  }

  if (!latestStats) return DEFAULT_PERFORMANCE.recentPerformance;

  const firstServeInChange = previousStats
    ? latestStats.firstServeIn - previousStats.firstServeIn
    : 0;
  const firstServeWonChange = previousStats
    ? latestStats.firstServeWon - previousStats.firstServeWon
    : 0;
  const secondServeWonChange = previousStats
    ? latestStats.secondServeWon - previousStats.secondServeWon
    : 0;

  return [
    {
      label: "First Serve In Percentage",
      value: Math.round(latestStats.firstServeIn),
      change: Math.round(firstServeInChange * 10) / 10,
    },
    {
      label: "First Serve Won Percentage",
      value: Math.round(latestStats.firstServeWon),
      change: Math.round(firstServeWonChange * 10) / 10,
    },
    {
      label: "Second Serve Won Percentage",
      value: Math.round(latestStats.secondServeWon),
      change: Math.round(secondServeWonChange * 10) / 10,
    },
  ];
}

export async function getOverallPerformance(): Promise<OverallPerformanceData> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return DEFAULT_PERFORMANCE;

  const { data: matches } = await supabase
    .from("matches")
    .select("id, date, player1_id, score")
    .eq("created_by", user.id)
    .order("date", { ascending: false });

  if (!matches || matches.length === 0) return DEFAULT_PERFORMANCE;

  const overall = calculateWinLoss(matches as DbMatch[], user.id);
  const last30 = calculateWinLoss(matches as DbMatch[], user.id, 30);
  const last7 = calculateWinLoss(matches as DbMatch[], user.id, 7);

  const matchIds = matches.map((m) => m.id);
  const matchPlayerMap = new Map<string, boolean>();
  for (const m of matches) {
    matchPlayerMap.set(m.id, m.player1_id === user.id);
  }

  const { data: stats } = await supabase
    .from("match_stats_with_percentages")
    .select(
      "match_id, is_player1, first_serve_pct, first_serve_won_pct, second_serve_won_pct, serve_rating, first_return_won_pct, second_return_won_pct, break_points_saved_pct, break_points_converted_pct"
    )
    .in("match_id", matchIds);

  const ratings = calculateAverageRating(
    (stats as DbMatchStats[]) ?? [],
    user.id,
    matchPlayerMap
  );
  const recentPerf = calculateRecentPerformance(
    (stats as DbMatchStats[]) ?? [],
    matchPlayerMap,
    matches.map((m) => m.id)
  );

  return {
    views: [
      { ...overall, label: "Overall Record" },
      { ...last30, label: "Last 30 Days" },
      { ...last7, label: "Last 7 Days" },
    ],
    performanceRatings: [
      { label: "Serve Rating", value: ratings.serve, barColor: "#666666" },
      { label: "Return Rating", value: ratings.return_, barColor: "#4A90E2" },
      { label: "Under Pressure Rating", value: ratings.pressure, barColor: "#666666" },
    ],
    recentPerformance: recentPerf,
  };
}
