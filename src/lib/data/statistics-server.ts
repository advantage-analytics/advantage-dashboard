import { createClient } from "@/lib/supabase/server";

export interface MonthlyTrendPoint {
  month: string;
  wins: number;
  losses: number;
  winRate: number;
}

export interface SurfaceBreakdownItem {
  surface: string;
  wins: number;
  losses: number;
}

export interface StatisticsPageData {
  // KPI strip
  totalMatches: number;
  winRate: number;
  currentStreak: string;
  avgDurationMinutes: number | null;

  // Charts
  monthlyTrend: MonthlyTrendPoint[];
  surfaceBreakdown: SurfaceBreakdownItem[];

  // Key Stats Grid (averages)
  avgAces: number | null;
  avgDoubleFaults: number | null;
  avgWinners: number | null;
  avgUnforcedErrors: number | null;
  avgFirstServePct: number | null;
  avgBreakPointsConvertedPct: number | null;

  // Ratings
  serveRating: number;
  returnRating: number;
  underPressureRating: number;

  // Rally breakdown
  shortRallyWonPct: number | null;
  mediumRallyWonPct: number | null;
  longRallyWonPct: number | null;
}

const DEFAULT_DATA: StatisticsPageData = {
  totalMatches: 0,
  winRate: 0,
  currentStreak: "—",
  avgDurationMinutes: null,
  monthlyTrend: [],
  surfaceBreakdown: [],
  avgAces: null,
  avgDoubleFaults: null,
  avgWinners: null,
  avgUnforcedErrors: null,
  avgFirstServePct: null,
  avgBreakPointsConvertedPct: null,
  serveRating: 0,
  returnRating: 0,
  underPressureRating: 0,
  shortRallyWonPct: null,
  mediumRallyWonPct: null,
  longRallyWonPct: null,
};

const MONTH_LABELS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"] as const;

interface DbMatch {
  id: string;
  player1_id: string | null;
  date: string;
  court_type: string | null;
  duration: number | null;
  score: { player1: number[]; player2: number[] } | null;
}

interface DbStat {
  match_id: string;
  is_player1: boolean;
  aces: number | null;
  double_faults: number | null;
  winners: number | null;
  unforced_errors: number | null;
  first_serve_pct: string | null;
  break_points_converted_pct: string | null;
  serve_rating: string | null;
  return_rating: string | null;
  under_pressure_rating: string | null;
  short_rally_won_pct: string | null;
  medium_rally_won_pct: string | null;
  long_rally_won_pct: string | null;
}

function didUserWin(match: DbMatch, userId: string): boolean {
  if (!match.score?.player1 || !match.score?.player2) return false;
  const p1Sets = match.score.player1.filter((s, i) => s > (match.score!.player2[i] ?? 0)).length;
  const p2Sets = match.score.player2.filter((s, i) => s > (match.score!.player1[i] ?? 0)).length;
  const player1Won = p1Sets > p2Sets;
  return match.player1_id === userId ? player1Won : !player1Won;
}

function computeStreak(matches: DbMatch[], userId: string): string {
  if (matches.length === 0) return "—";
  const sorted = [...matches].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  const firstWon = didUserWin(sorted[0], userId);
  let count = 0;
  for (const m of sorted) {
    if (didUserWin(m, userId) === firstWon) count++;
    else break;
  }
  return `${count}${firstWon ? "W" : "L"}`;
}

function buildMonthlyTrend(matches: DbMatch[], userId: string): MonthlyTrendPoint[] {
  const now = new Date();
  const trend: MonthlyTrendPoint[] = [];

  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const year = d.getFullYear();
    const month = d.getMonth();
    const label = MONTH_LABELS[month];

    const monthMatches = matches.filter((m) => {
      const md = new Date(m.date);
      return md.getFullYear() === year && md.getMonth() === month;
    });

    if (monthMatches.length === 0) {
      trend.push({ month: label, wins: 0, losses: 0, winRate: 0 });
      continue;
    }

    let wins = 0;
    for (const m of monthMatches) {
      if (didUserWin(m, userId)) wins++;
    }
    const losses = monthMatches.length - wins;
    const winRate = Math.round((wins / monthMatches.length) * 100);
    trend.push({ month: label, wins, losses, winRate });
  }

  return trend;
}

function buildSurfaceBreakdown(matches: DbMatch[], userId: string): SurfaceBreakdownItem[] {
  const map = new Map<string, { wins: number; losses: number }>();

  for (const m of matches) {
    const surface = m.court_type ?? "Unknown";
    const won = didUserWin(m, userId);
    const existing = map.get(surface) ?? { wins: 0, losses: 0 };
    if (won) existing.wins++;
    else existing.losses++;
    map.set(surface, existing);
  }

  return Array.from(map.entries())
    .map(([surface, { wins, losses }]) => ({ surface, wins, losses }))
    .sort((a, b) => b.wins + b.losses - (a.wins + a.losses));
}

function avgOrNull(values: (number | null)[]): number | null {
  const valid = values.filter((v): v is number => v !== null && !isNaN(v));
  if (valid.length === 0) return null;
  return Math.round((valid.reduce((a, b) => a + b, 0) / valid.length) * 10) / 10;
}

function avgPctOrNull(values: (string | null)[]): number | null {
  const nums = values
    .map((v) => (v !== null ? parseFloat(v) : null))
    .filter((v): v is number => v !== null && !isNaN(v));
  if (nums.length === 0) return null;
  return Math.round(nums.reduce((a, b) => a + b, 0) / nums.length);
}

export interface SelectableMatch {
  id: string;
  isoDate: string;
  displayDate: string;
  isWin: boolean;
  player1Name: string;
  player2Name: string;
  tournamentName: string;
  courtType: string | null;
  durationSeconds: number | null;
  aces: number | null;
  doubleFaults: number | null;
  winners: number | null;
  unforcedErrors: number | null;
  firstServePct: number | null;
  breakPointsConvertedPct: number | null;
  serveRating: number | null;
  returnRating: number | null;
  underPressureRating: number | null;
  shortRallyWonPct: number | null;
  mediumRallyWonPct: number | null;
  longRallyWonPct: number | null;
}

interface DbMatchFull extends DbMatch {
  player1_name: string;
  player2_name: string;
  tournament_name: string | null;
}

export async function getSelectableMatches(): Promise<SelectableMatch[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data: matchRows } = await supabase
    .from("matches")
    .select(
      "id, player1_id, player1_name, player2_name, tournament_name, date, court_type, duration, score"
    )
    .eq("created_by", user.id)
    .order("date", { ascending: false });

  const matches = (matchRows ?? []) as DbMatchFull[];
  if (matches.length === 0) return [];

  const matchIds = matches.map((m) => m.id);
  const isPlayer1Map = new Map<string, boolean>();
  for (const m of matches) isPlayer1Map.set(m.id, m.player1_id === user.id);

  const { data: statRows } = await supabase
    .from("match_stats_with_percentages")
    .select(
      "match_id, is_player1, aces, double_faults, winners, unforced_errors, first_serve_pct, break_points_converted_pct, serve_rating, return_rating, under_pressure_rating, short_rally_won_pct, medium_rally_won_pct, long_rally_won_pct"
    )
    .in("match_id", matchIds);

  const statsMap = new Map<string, DbStat>();
  for (const s of (statRows ?? []) as DbStat[]) {
    const userIsP1 = isPlayer1Map.get(s.match_id);
    if (userIsP1 !== undefined && s.is_player1 === userIsP1) {
      statsMap.set(s.match_id, s);
    }
  }

  const parseNum = (v: string | null | undefined): number | null => {
    if (v == null) return null;
    const n = parseFloat(v);
    return isNaN(n) ? null : n;
  };

  return matches.map((m) => {
    const s = statsMap.get(m.id);
    return {
      id: m.id,
      isoDate: m.date,
      displayDate: new Date(m.date).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      }),
      isWin: didUserWin(m, user.id),
      player1Name: m.player1_name,
      player2Name: m.player2_name,
      tournamentName: m.tournament_name ?? "Unknown Event",
      courtType: m.court_type,
      durationSeconds: m.duration,
      aces: s?.aces ?? null,
      doubleFaults: s?.double_faults ?? null,
      winners: s?.winners ?? null,
      unforcedErrors: s?.unforced_errors ?? null,
      firstServePct: parseNum(s?.first_serve_pct),
      breakPointsConvertedPct: parseNum(s?.break_points_converted_pct),
      serveRating: parseNum(s?.serve_rating),
      returnRating: parseNum(s?.return_rating),
      underPressureRating: parseNum(s?.under_pressure_rating),
      shortRallyWonPct: parseNum(s?.short_rally_won_pct),
      mediumRallyWonPct: parseNum(s?.medium_rally_won_pct),
      longRallyWonPct: parseNum(s?.long_rally_won_pct),
    };
  });
}

export async function getStatisticsPageData(): Promise<StatisticsPageData> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return DEFAULT_DATA;

  // Fetch matches
  const { data: matchRows } = await supabase
    .from("matches")
    .select("id, player1_id, date, court_type, duration, score")
    .eq("created_by", user.id)
    .order("date", { ascending: false });

  const matches = (matchRows ?? []) as DbMatch[];
  if (matches.length === 0) return DEFAULT_DATA;

  const matchIds = matches.map((m) => m.id);

  // Determine if user is player1 for each match
  const isPlayer1Map = new Map<string, boolean>();
  for (const m of matches) {
    isPlayer1Map.set(m.id, m.player1_id === user.id);
  }

  // Fetch stats
  const { data: statRows } = await supabase
    .from("match_stats_with_percentages")
    .select(
      "match_id, is_player1, aces, double_faults, winners, unforced_errors, first_serve_pct, break_points_converted_pct, serve_rating, return_rating, under_pressure_rating, short_rally_won_pct, medium_rally_won_pct, long_rally_won_pct"
    )
    .in("match_id", matchIds);

  const stats = (statRows ?? []) as DbStat[];

  // Filter to user's stats only
  const userStats = stats.filter((s) => {
    const userIsP1 = isPlayer1Map.get(s.match_id);
    return userIsP1 !== undefined && s.is_player1 === userIsP1;
  });

  // KPIs
  let wins = 0;
  for (const m of matches) {
    if (didUserWin(m, user.id)) wins++;
  }
  const totalMatches = matches.length;
  const winRate = Math.round((wins / totalMatches) * 100);
  const currentStreak = computeStreak(matches, user.id);

  // Average duration (duration stored in seconds)
  const durations = matches
    .map((m) => m.duration)
    .filter((d): d is number => d !== null && d > 0);
  const avgDurationMinutes =
    durations.length > 0
      ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length / 60)
      : null;

  // Charts
  const monthlyTrend = buildMonthlyTrend(matches, user.id);
  const surfaceBreakdown = buildSurfaceBreakdown(matches, user.id);

  // Stats grid averages
  const avgAces = avgOrNull(userStats.map((s) => s.aces));
  const avgDoubleFaults = avgOrNull(userStats.map((s) => s.double_faults));
  const avgWinners = avgOrNull(userStats.map((s) => s.winners));
  const avgUnforcedErrors = avgOrNull(userStats.map((s) => s.unforced_errors));
  const avgFirstServePct = avgPctOrNull(userStats.map((s) => s.first_serve_pct));
  const avgBreakPointsConvertedPct = avgPctOrNull(
    userStats.map((s) => s.break_points_converted_pct)
  );

  // Ratings
  const serveRating = avgPctOrNull(userStats.map((s) => s.serve_rating)) ?? 0;
  const returnRating = avgPctOrNull(userStats.map((s) => s.return_rating)) ?? 0;
  const underPressureRating = avgPctOrNull(userStats.map((s) => s.under_pressure_rating)) ?? 0;

  // Rally breakdown
  const shortRallyWonPct = avgPctOrNull(userStats.map((s) => s.short_rally_won_pct));
  const mediumRallyWonPct = avgPctOrNull(userStats.map((s) => s.medium_rally_won_pct));
  const longRallyWonPct = avgPctOrNull(userStats.map((s) => s.long_rally_won_pct));

  return {
    totalMatches,
    winRate,
    currentStreak,
    avgDurationMinutes,
    monthlyTrend,
    surfaceBreakdown,
    avgAces,
    avgDoubleFaults,
    avgWinners,
    avgUnforcedErrors,
    avgFirstServePct,
    avgBreakPointsConvertedPct,
    serveRating,
    returnRating,
    underPressureRating,
    shortRallyWonPct,
    mediumRallyWonPct,
    longRallyWonPct,
  };
}
