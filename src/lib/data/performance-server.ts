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

export interface KpiCardData {
  label: string;
  value: string;
  change: number;
  changeLabel: string;
  sparkline: number[];
}

export interface PerformanceProfileDimension {
  label: string;
  current: number;
  previous: number;
}

export interface HeatmapDay {
  date: string;
  count: number;
}

export interface OverallPerformanceData {
  views: WinLossView[];
  performanceRatings: PerformanceRating[];
  recentPerformance: RecentPerformanceStat[];
  kpiCards: KpiCardData[];
  winRate: { value: number; change: number; sparkline: number[] };
  form: ("W" | "L")[];
  matchCount: number;
  heatmap: HeatmapDay[];
  performanceProfile: PerformanceProfileDimension[];
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
  kpiCards: [],
  winRate: { value: 0, change: 0, sparkline: [] },
  form: [],
  matchCount: 0,
  heatmap: [],
  performanceProfile: [
    { label: "SERVE", current: 0, previous: 0 },
    { label: "RETURN", current: 0, previous: 0 },
    { label: "FOREHAND", current: 0, previous: 0 },
    { label: "BACKHAND", current: 0, previous: 0 },
    { label: "NET", current: 0, previous: 0 },
    { label: "DEPTH", current: 0, previous: 0 },
    { label: "CLUTCH", current: 0, previous: 0 },
    { label: "FITNESS", current: 0, previous: 0 },
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

function calculateForm(
  matches: DbMatch[],
  userId: string,
  count: number
): ("W" | "L")[] {
  const form: ("W" | "L")[] = [];
  for (const match of matches) {
    if (form.length >= count) break;
    if (!match.score?.player1 || !match.score?.player2) continue;

    const p1Sets = match.score.player1.filter(
      (s, i) => s > (match.score?.player2[i] ?? 0)
    ).length;
    const p2Sets = match.score.player2.filter(
      (s, i) => s > (match.score?.player1[i] ?? 0)
    ).length;

    const player1Won = p1Sets > p2Sets;
    const isUserPlayer1 = match.player1_id === userId;
    form.push((isUserPlayer1 ? player1Won : !player1Won) ? "W" : "L");
  }
  return form;
}

function calculateHeatmap(matches: DbMatch[]): HeatmapDay[] {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const countMap = new Map<string, number>();
  for (const match of matches) {
    const d = new Date(match.date);
    if (d.getFullYear() === year && d.getMonth() === month) {
      const key = match.date.slice(0, 10);
      countMap.set(key, (countMap.get(key) ?? 0) + 1);
    }
  }

  const result: HeatmapDay[] = [];
  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    result.push({ date: dateStr, count: countMap.get(dateStr) ?? 0 });
  }
  return result;
}

function calculateKpiCards(
  stats: DbMatchStats[],
  matchPlayerMap: Map<string, boolean>,
  orderedMatchIds: string[]
): KpiCardData[] {
  // Build per-match stat values for the user, ordered by date (most recent first)
  const matchStatsList: {
    firstServePct: number;
    serviceGamesWon: number;
    bpSaved: number;
    serviceReturnsWon: number;
    bpConverted: number;
  }[] = [];

  const statByMatch = new Map<string, DbMatchStats>();
  for (const stat of stats) {
    const isUserPlayer1 = matchPlayerMap.get(stat.match_id);
    if (isUserPlayer1 === undefined) continue;
    if (stat.is_player1 !== isUserPlayer1) continue;
    statByMatch.set(stat.match_id, stat);
  }

  for (const matchId of orderedMatchIds) {
    const s = statByMatch.get(matchId);
    if (!s) continue;
    matchStatsList.push({
      firstServePct: parseFloat(s.first_serve_pct ?? "0"),
      serviceGamesWon: parseFloat(s.serve_rating ?? "0") / 2.5, // scale serve_rating to approx %
      bpSaved: parseFloat(s.break_points_saved_pct ?? "0"),
      serviceReturnsWon:
        (parseFloat(s.first_return_won_pct ?? "0") +
          parseFloat(s.second_return_won_pct ?? "0")) /
        2,
      bpConverted: parseFloat(s.break_points_converted_pct ?? "0"),
    });
  }

  if (matchStatsList.length === 0) return [];

  const buildCard = (
    label: string,
    key: keyof (typeof matchStatsList)[0]
  ): KpiCardData => {
    const latest = matchStatsList[0][key];
    const sparkline = matchStatsList
      .slice(0, 8)
      .map((s) => s[key])
      .reverse();

    // Calculate 30-day change (approximate: compare first half vs second half of recent matches)
    let change = 0;
    if (matchStatsList.length >= 2) {
      change =
        Math.round((matchStatsList[0][key] - matchStatsList[1][key]) * 10) / 10;
    }

    return {
      label,
      value: `${Math.round(latest)}%`,
      change,
      changeLabel: "last 30 days",
      sparkline,
    };
  };

  return [
    buildCard("1ST SERVE PERCENTAGE", "firstServePct"),
    buildCard("SERVICE GAMES WON", "serviceGamesWon"),
    buildCard("BREAKPOINTS SAVED", "bpSaved"),
    buildCard("SERVICE RETURNS WON", "serviceReturnsWon"),
    buildCard("BREAKPOINTS CONVERTED", "bpConverted"),
  ];
}

function calculateWinRateSparkline(
  matches: DbMatch[],
  userId: string
): { value: number; change: number; sparkline: number[] } {
  if (matches.length === 0) return { value: 0, change: 0, sparkline: [] };

  // Calculate running win rate for sparkline (reversed to show chronological order)
  const results: boolean[] = [];
  for (const match of [...matches].reverse()) {
    if (!match.score?.player1 || !match.score?.player2) continue;
    const p1Sets = match.score.player1.filter(
      (s, i) => s > (match.score?.player2[i] ?? 0)
    ).length;
    const p2Sets = match.score.player2.filter(
      (s, i) => s > (match.score?.player1[i] ?? 0)
    ).length;
    const player1Won = p1Sets > p2Sets;
    const isUserPlayer1 = match.player1_id === userId;
    results.push(isUserPlayer1 ? player1Won : !player1Won);
  }

  if (results.length === 0) return { value: 0, change: 0, sparkline: [] };

  const sparkline: number[] = [];
  let wins = 0;
  for (let i = 0; i < results.length; i++) {
    if (results[i]) wins++;
    sparkline.push(Math.round((wins / (i + 1)) * 100));
  }

  const currentRate = sparkline[sparkline.length - 1];

  // Calculate change vs 30 days ago
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const recentMatches = matches.filter((m) => new Date(m.date) >= cutoff);
  let recentWins = 0;
  let recentTotal = 0;
  for (const match of recentMatches) {
    if (!match.score?.player1 || !match.score?.player2) continue;
    recentTotal++;
    const p1Sets = match.score.player1.filter(
      (s, i) => s > (match.score?.player2[i] ?? 0)
    ).length;
    const p2Sets = match.score.player2.filter(
      (s, i) => s > (match.score?.player1[i] ?? 0)
    ).length;
    const player1Won = p1Sets > p2Sets;
    const isUserPlayer1 = match.player1_id === userId;
    if (isUserPlayer1 ? player1Won : !player1Won) recentWins++;
  }
  const olderMatches = matches.filter((m) => new Date(m.date) < cutoff);
  let olderWins = 0;
  let olderTotal = 0;
  for (const match of olderMatches) {
    if (!match.score?.player1 || !match.score?.player2) continue;
    olderTotal++;
    const p1Sets = match.score.player1.filter(
      (s, i) => s > (match.score?.player2[i] ?? 0)
    ).length;
    const p2Sets = match.score.player2.filter(
      (s, i) => s > (match.score?.player1[i] ?? 0)
    ).length;
    const player1Won = p1Sets > p2Sets;
    const isUserPlayer1 = match.player1_id === userId;
    if (isUserPlayer1 ? player1Won : !player1Won) olderWins++;
  }

  const recentRate = recentTotal > 0 ? (recentWins / recentTotal) * 100 : 0;
  const olderRate = olderTotal > 0 ? (olderWins / olderTotal) * 100 : 0;
  const change = olderTotal > 0 ? Math.round((recentRate - olderRate) * 10) / 10 : 0;

  return { value: currentRate, change, sparkline: sparkline.slice(-8) };
}

function calculatePerformanceProfile(
  stats: DbMatchStats[],
  matchPlayerMap: Map<string, boolean>,
  orderedMatchIds: string[]
): PerformanceProfileDimension[] {
  const dimensions = [
    "SERVE",
    "RETURN",
    "FOREHAND",
    "BACKHAND",
    "NET",
    "DEPTH",
    "CLUTCH",
    "FITNESS",
  ];

  const userStats: DbMatchStats[] = [];
  for (const matchId of orderedMatchIds) {
    for (const stat of stats) {
      if (stat.match_id !== matchId) continue;
      const isUserPlayer1 = matchPlayerMap.get(stat.match_id);
      if (isUserPlayer1 === undefined) continue;
      if (stat.is_player1 !== isUserPlayer1) continue;
      userStats.push(stat);
    }
  }

  if (userStats.length === 0) {
    return dimensions.map((label) => ({ label, current: 0, previous: 0 }));
  }

  // Current = average of last 3 matches, previous = average of matches 4-6
  const recentStats = userStats.slice(0, Math.min(3, userStats.length));
  const olderStats = userStats.slice(3, Math.min(6, userStats.length));

  const avg = (arr: DbMatchStats[], fn: (s: DbMatchStats) => number) => {
    if (arr.length === 0) return 0;
    return arr.reduce((sum, s) => sum + fn(s), 0) / arr.length;
  };

  const serveScore = (s: DbMatchStats) =>
    Math.min(100, parseFloat(s.serve_rating ?? "0") / 2.5);
  const returnScore = (s: DbMatchStats) =>
    (parseFloat(s.first_return_won_pct ?? "0") +
      parseFloat(s.second_return_won_pct ?? "0")) /
    2;
  const clutchScore = (s: DbMatchStats) =>
    (parseFloat(s.break_points_saved_pct ?? "0") +
      parseFloat(s.break_points_converted_pct ?? "0")) /
    2;

  const currentServe = Math.round(avg(recentStats, serveScore));
  const previousServe = olderStats.length > 0 ? Math.round(avg(olderStats, serveScore)) : currentServe;
  const currentReturn = Math.round(avg(recentStats, returnScore));
  const previousReturn = olderStats.length > 0 ? Math.round(avg(olderStats, returnScore)) : currentReturn;
  const currentClutch = Math.round(avg(recentStats, clutchScore));
  const previousClutch = olderStats.length > 0 ? Math.round(avg(olderStats, clutchScore)) : currentClutch;

  return [
    { label: "SERVE", current: currentServe, previous: previousServe },
    { label: "RETURN", current: currentReturn, previous: previousReturn },
    { label: "FOREHAND", current: 0, previous: 0 },
    { label: "BACKHAND", current: 0, previous: 0 },
    { label: "NET", current: 0, previous: 0 },
    { label: "DEPTH", current: 0, previous: 0 },
    { label: "CLUTCH", current: currentClutch, previous: previousClutch },
    { label: "FITNESS", current: 0, previous: 0 },
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

  const typedMatches = matches as DbMatch[];
  const overall = calculateWinLoss(typedMatches, user.id);
  const last30 = calculateWinLoss(typedMatches, user.id, 30);
  const last7 = calculateWinLoss(typedMatches, user.id, 7);

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

  const typedStats = (stats as DbMatchStats[]) ?? [];
  const orderedMatchIds = matches.map((m) => m.id);

  const ratings = calculateAverageRating(typedStats, user.id, matchPlayerMap);
  const recentPerf = calculateRecentPerformance(
    typedStats,
    matchPlayerMap,
    orderedMatchIds
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
    kpiCards: calculateKpiCards(typedStats, matchPlayerMap, orderedMatchIds),
    winRate: calculateWinRateSparkline(typedMatches, user.id),
    form: calculateForm(typedMatches, user.id, 5),
    matchCount: typedMatches.length,
    heatmap: calculateHeatmap(typedMatches),
    performanceProfile: calculatePerformanceProfile(
      typedStats,
      matchPlayerMap,
      orderedMatchIds
    ),
  };
}
