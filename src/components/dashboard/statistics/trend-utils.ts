import type { SelectableMatch, StatisticsPageData } from "@/lib/data/statistics-server";
import { computeStatistics } from "@/lib/data/statistics-client";

export type TrendDirection = "up" | "down" | "flat";

export interface StatTrend {
  direction: TrendDirection;
  delta: number;
  isPositive: boolean;
  sparkline: number[];
}

export interface TrendData {
  winRate: StatTrend | null;
  // Serve
  aces: StatTrend | null;
  doubleFaults: StatTrend | null;
  firstServePct: StatTrend | null;
  firstServeWonPct: StatTrend | null;
  secondServeWonPct: StatTrend | null;
  breakPointsSavedPct: StatTrend | null;
  serviceGamesWonPct: StatTrend | null;
  // Return
  breakPointsConvertedPct: StatTrend | null;
  firstReturnWonPct: StatTrend | null;
  secondReturnWonPct: StatTrend | null;
  returnGamesWonPct: StatTrend | null;
  // Other
  winners: StatTrend | null;
  unforcedErrors: StatTrend | null;
  netPointsWonPct: StatTrend | null;
  totalPointsWonPct: StatTrend | null;
  shortRallyWonPct: StatTrend | null;
  mediumRallyWonPct: StatTrend | null;
  longRallyWonPct: StatTrend | null;
  // Ratings
  serveRating: StatTrend | null;
  returnRating: StatTrend | null;
  underPressureRating: StatTrend | null;
}

const NULL_TRENDS: TrendData = {
  winRate: null,
  aces: null, doubleFaults: null, firstServePct: null,
  firstServeWonPct: null, secondServeWonPct: null,
  breakPointsSavedPct: null, serviceGamesWonPct: null,
  breakPointsConvertedPct: null, firstReturnWonPct: null,
  secondReturnWonPct: null, returnGamesWonPct: null,
  winners: null, unforcedErrors: null,
  netPointsWonPct: null, totalPointsWonPct: null,
  shortRallyWonPct: null, mediumRallyWonPct: null, longRallyWonPct: null,
  serveRating: null, returnRating: null, underPressureRating: null,
};

function makeTrend(
  recentVal: number | null,
  allTimeVal: number | null,
  matchValues: (number | null)[],
  positiveIsGood: boolean
): StatTrend | null {
  if (recentVal === null || allTimeVal === null) return null;
  const delta = Math.round((recentVal - allTimeVal) * 10) / 10;
  const threshold = Math.max(Math.abs(allTimeVal) * 0.03, 0.5);
  const direction: TrendDirection =
    Math.abs(delta) < threshold ? "flat" : delta > 0 ? "up" : "down";
  const sparkline = matchValues
    .filter((v): v is number => v !== null)
    .reverse();
  return { direction, delta: Math.abs(delta), isPositive: positiveIsGood, sparkline };
}

export function rollingAverage(
  values: (number | null)[],
  window: number
): (number | null)[] {
  return values.map((_, i) => {
    if (i < window - 1) return null;
    const slice = values.slice(i - window + 1, i + 1);
    const valid = slice.filter((v): v is number => v !== null);
    if (valid.length === 0) return null;
    return Math.round((valid.reduce((a, b) => a + b, 0) / valid.length) * 10) / 10;
  });
}

export function computeTrends(
  sortedMatches: SelectableMatch[],
  allTimeData: StatisticsPageData
): TrendData {
  if (sortedMatches.length < 3) return NULL_TRENDS;

  const recent = sortedMatches.slice(0, Math.min(5, sortedMatches.length));
  const recentData = computeStatistics(recent);

  const t = (recent: number | null, allTime: number | null, vals: (number | null)[], pos: boolean) =>
    makeTrend(recent, allTime, vals, pos);
  const m = sortedMatches;

  return {
    winRate: t(recentData.winRate, allTimeData.winRate, m.map((x) => (x.isWin ? 100 : 0)), true),
    // Serve
    aces: t(recentData.avgAces, allTimeData.avgAces, m.map((x) => x.aces), true),
    doubleFaults: t(recentData.avgDoubleFaults, allTimeData.avgDoubleFaults, m.map((x) => x.doubleFaults), false),
    firstServePct: t(recentData.avgFirstServePct, allTimeData.avgFirstServePct, m.map((x) => x.firstServePct), true),
    firstServeWonPct: t(recentData.avgFirstServeWonPct, allTimeData.avgFirstServeWonPct, m.map((x) => x.firstServeWonPct), true),
    secondServeWonPct: t(recentData.avgSecondServeWonPct, allTimeData.avgSecondServeWonPct, m.map((x) => x.secondServeWonPct), true),
    breakPointsSavedPct: t(recentData.avgBreakPointsSavedPct, allTimeData.avgBreakPointsSavedPct, m.map((x) => x.breakPointsSavedPct), true),
    serviceGamesWonPct: t(recentData.avgServiceGamesWonPct, allTimeData.avgServiceGamesWonPct, m.map((x) => x.serviceGamesWonPct), true),
    // Return
    breakPointsConvertedPct: t(recentData.avgBreakPointsConvertedPct, allTimeData.avgBreakPointsConvertedPct, m.map((x) => x.breakPointsConvertedPct), true),
    firstReturnWonPct: t(recentData.avgFirstReturnWonPct, allTimeData.avgFirstReturnWonPct, m.map((x) => x.firstReturnWonPct), true),
    secondReturnWonPct: t(recentData.avgSecondReturnWonPct, allTimeData.avgSecondReturnWonPct, m.map((x) => x.secondReturnWonPct), true),
    returnGamesWonPct: t(recentData.avgReturnGamesWonPct, allTimeData.avgReturnGamesWonPct, m.map((x) => x.returnGamesWonPct), true),
    // Other
    winners: t(recentData.avgWinners, allTimeData.avgWinners, m.map((x) => x.winners), true),
    unforcedErrors: t(recentData.avgUnforcedErrors, allTimeData.avgUnforcedErrors, m.map((x) => x.unforcedErrors), false),
    netPointsWonPct: t(recentData.avgNetPointsWonPct, allTimeData.avgNetPointsWonPct, m.map((x) => x.netPointsWonPct), true),
    totalPointsWonPct: t(recentData.avgTotalPointsWonPct, allTimeData.avgTotalPointsWonPct, m.map((x) => x.totalPointsWonPct), true),
    shortRallyWonPct: t(recentData.shortRallyWonPct, allTimeData.shortRallyWonPct, m.map((x) => x.shortRallyWonPct), true),
    mediumRallyWonPct: t(recentData.mediumRallyWonPct, allTimeData.mediumRallyWonPct, m.map((x) => x.mediumRallyWonPct), true),
    longRallyWonPct: t(recentData.longRallyWonPct, allTimeData.longRallyWonPct, m.map((x) => x.longRallyWonPct), true),
    // Ratings
    serveRating: t(recentData.serveRating, allTimeData.serveRating, m.map((x) => x.serveRating), true),
    returnRating: t(recentData.returnRating, allTimeData.returnRating, m.map((x) => x.returnRating), true),
    underPressureRating: t(recentData.underPressureRating, allTimeData.underPressureRating, m.map((x) => x.underPressureRating), true),
  };
}
