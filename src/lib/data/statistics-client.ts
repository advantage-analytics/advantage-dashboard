import type {
  SelectableMatch,
  StatisticsPageData,
  MonthlyTrendPoint,
  SurfaceBreakdownItem,
} from "./statistics-server";

const MONTH_LABELS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
] as const;

function avgOrNull(values: (number | null)[]): number | null {
  const valid = values.filter((v): v is number => v !== null && !isNaN(v));
  if (valid.length === 0) return null;
  return Math.round((valid.reduce((a, b) => a + b, 0) / valid.length) * 10) / 10;
}

function avgPctOrNull(values: (number | null)[]): number | null {
  const valid = values.filter((v): v is number => v !== null && !isNaN(v));
  if (valid.length === 0) return null;
  return Math.round(valid.reduce((a, b) => a + b, 0) / valid.length);
}

function computeStreak(matches: SelectableMatch[]): string {
  if (matches.length === 0) return "—";
  const sorted = [...matches].sort((a, b) => b.isoDate.localeCompare(a.isoDate));
  const firstWon = sorted[0].isWin;
  let count = 0;
  for (const m of sorted) {
    if (m.isWin === firstWon) count++;
    else break;
  }
  return `${count}${firstWon ? "W" : "L"}`;
}

function buildMonthlyTrend(matches: SelectableMatch[]): MonthlyTrendPoint[] {
  const now = new Date();
  const trend: MonthlyTrendPoint[] = [];

  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const year = d.getFullYear();
    const month = d.getMonth();

    const monthMatches = matches.filter((m) => {
      const md = new Date(m.isoDate);
      return md.getFullYear() === year && md.getMonth() === month;
    });

    if (monthMatches.length === 0) {
      trend.push({ month: MONTH_LABELS[month], wins: 0, losses: 0, winRate: 0 });
      continue;
    }

    const wins = monthMatches.filter((m) => m.isWin).length;
    const losses = monthMatches.length - wins;
    const winRate = Math.round((wins / monthMatches.length) * 100);
    trend.push({ month: MONTH_LABELS[month], wins, losses, winRate });
  }

  return trend;
}

function buildSurfaceBreakdown(matches: SelectableMatch[]): SurfaceBreakdownItem[] {
  const map = new Map<string, { wins: number; losses: number }>();

  for (const m of matches) {
    const surface = m.courtType ?? "Unknown";
    const existing = map.get(surface) ?? { wins: 0, losses: 0 };
    if (m.isWin) existing.wins++;
    else existing.losses++;
    map.set(surface, existing);
  }

  return Array.from(map.entries())
    .map(([surface, { wins, losses }]) => ({ surface, wins, losses }))
    .sort((a, b) => b.wins + b.losses - (a.wins + a.losses));
}

const EMPTY: StatisticsPageData = {
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

export function computeStatistics(matches: SelectableMatch[]): StatisticsPageData {
  if (matches.length === 0) return EMPTY;

  const wins = matches.filter((m) => m.isWin).length;
  const totalMatches = matches.length;
  const winRate = Math.round((wins / totalMatches) * 100);
  const currentStreak = computeStreak(matches);

  const durations = matches
    .map((m) => m.durationSeconds)
    .filter((d): d is number => d !== null && d > 0);
  const avgDurationMinutes =
    durations.length > 0
      ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length / 60)
      : null;

  return {
    totalMatches,
    winRate,
    currentStreak,
    avgDurationMinutes,
    monthlyTrend: buildMonthlyTrend(matches),
    surfaceBreakdown: buildSurfaceBreakdown(matches),
    avgAces: avgOrNull(matches.map((m) => m.aces)),
    avgDoubleFaults: avgOrNull(matches.map((m) => m.doubleFaults)),
    avgWinners: avgOrNull(matches.map((m) => m.winners)),
    avgUnforcedErrors: avgOrNull(matches.map((m) => m.unforcedErrors)),
    avgFirstServePct: avgPctOrNull(matches.map((m) => m.firstServePct)),
    avgBreakPointsConvertedPct: avgPctOrNull(
      matches.map((m) => m.breakPointsConvertedPct)
    ),
    serveRating: avgPctOrNull(matches.map((m) => m.serveRating)) ?? 0,
    returnRating: avgPctOrNull(matches.map((m) => m.returnRating)) ?? 0,
    underPressureRating:
      avgPctOrNull(matches.map((m) => m.underPressureRating)) ?? 0,
    shortRallyWonPct: avgPctOrNull(matches.map((m) => m.shortRallyWonPct)),
    mediumRallyWonPct: avgPctOrNull(matches.map((m) => m.mediumRallyWonPct)),
    longRallyWonPct: avgPctOrNull(matches.map((m) => m.longRallyWonPct)),
  };
}
