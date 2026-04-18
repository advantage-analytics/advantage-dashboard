import { notFound } from "next/navigation";

import { getMatchDetailData } from "@/lib/data/match-detail-server";
import { shortName } from "@/lib/data/match-utils";

import { Scoreline } from "@/components/dashboard/matches/match-detail/scoreline";
import { SidebarKeyMoments } from "@/components/dashboard/matches/match-detail/sidebar-key-moments";
import { MatchKpiStrip } from "@/components/dashboard/matches/match-detail/match-kpi-strip";
import { PerformanceWidget } from "@/components/dashboard/matches/match-detail/performance-widget";
import {
  MatchStatisticsTable,
  type StatRow,
} from "@/components/dashboard/matches/match-detail/match-statistics-table";
import { CourtVideoRow } from "@/components/dashboard/matches/match-detail/court-video-row";
import { SectionsStagger } from "@/components/dashboard/matches/match-detail/sections-stagger";
import type { PlayerStatistics } from "@/lib/data/types";

/* ── Constants ──────────────────────────────────────────── */

const RADAR_STATS: { key: keyof PlayerStatistics; label: string }[] = [
  { key: "firstServeInPct", label: "First Serve In" },
  { key: "firstServeWinPct", label: "First Serve Points Won" },
  { key: "secondServeWinPct", label: "Second Serve Points Won" },
  { key: "serviceGamesWonPct", label: "Service Games Won" },
  { key: "breakpointsWonPct", label: "Breakpoints Won" },
  { key: "firstReturnWonPct", label: "First Serve Return Won" },
  { key: "secondReturnWonPct", label: "Second Return Points Won" },
  { key: "returnGamesWonPct", label: "Return Games" },
];

type StatConfig = {
  key: keyof PlayerStatistics;
  label: string;
  isPercentage: boolean;
  fractionKey?: string;
};

const SERVE_STATS: StatConfig[] = [
  { key: "aces", label: "Aces", isPercentage: false },
  { key: "doubleFaults", label: "Double Faults", isPercentage: false },
  { key: "firstServeInPct", label: "First Serve In %", isPercentage: true, fractionKey: "firstServeInPct" },
  { key: "firstServeWinPct", label: "First Serve Won %", isPercentage: true, fractionKey: "firstServeWinPct" },
  { key: "secondServeWinPct", label: "Second Serve Won %", isPercentage: true, fractionKey: "secondServeWinPct" },
  { key: "breakpointsSaved", label: "Break Points Saved", isPercentage: false, fractionKey: "breakpointsSaved" },
  { key: "servicePointsWon", label: "Total Serve Points Won", isPercentage: false, fractionKey: "servicePointsWon" },
  { key: "serviceGamesWon", label: "Total Service Games Won", isPercentage: false },
];

const RETURN_STATS: StatConfig[] = [
  { key: "firstReturnInPct", label: "First Serve Return In %", isPercentage: false },
  { key: "firstReturnWonPct", label: "First Serve Returns Won %", isPercentage: false },
  { key: "secondReturnInPct", label: "Second Serve Return In %", isPercentage: true, fractionKey: "secondReturnInPct" },
  { key: "secondReturnWonPct", label: "Second Serve Return Points Won %", isPercentage: true, fractionKey: "secondReturnWonPct" },
  { key: "breakpointsWonPct", label: "Break Points Converted", isPercentage: true, fractionKey: "breakpointsWonPct" },
  { key: "returnPointsWon", label: "Total Return Points Won", isPercentage: false, fractionKey: "returnPointsWon" },
  { key: "returnGamesWonPct", label: "Return Games Won %", isPercentage: true, fractionKey: "returnGamesWonPct" },
  { key: "returnGamesWon", label: "Return Games Won", isPercentage: false },
];

const OTHER_STATS: StatConfig[] = [
  { key: "winners", label: "Winners", isPercentage: false },
  { key: "unforcedErrors", label: "Errors", isPercentage: false },
  { key: "netPointsAppearances", label: "Net Points Appearances", isPercentage: false },
  { key: "netPointsWonPct", label: "Net Points Won", isPercentage: true, fractionKey: "netPointsWonPct" },
  { key: "shortRallyWonPct", label: "Short (1-4 Shots)", isPercentage: true, fractionKey: "shortRallyWonPct" },
  { key: "mediumRallyWonPct", label: "Medium (5-8 Shots)", isPercentage: true, fractionKey: "mediumRallyWonPct" },
  { key: "longRallyWonPct", label: "Long (9+ Shots)", isPercentage: true, fractionKey: "longRallyWonPct" },
  { key: "totalPointsWon", label: "Total Points Won", isPercentage: false },
];

/* ── Helpers ────────────────────────────────────────────── */

function getRatingLabel(score: number): string {
  if (score >= 85) return "Dominant";
  if (score >= 75) return "Excellent";
  if (score >= 65) return "Very Good";
  if (score >= 55) return "Solid";
  if (score >= 45) return "Average";
  if (score >= 35) return "Below Average";
  if (score >= 25) return "Needs Work";
  return "Poor";
}

function buildStatRows(
  configs: StatConfig[],
  p1: PlayerStatistics,
  p2: PlayerStatistics,
): StatRow[] {
  return configs.map((c) => {
    const p1Val = p1[c.key] as number;
    const p2Val = p2[c.key] as number;
    const p1Frac = c.fractionKey ? p1.fractions[c.fractionKey] : undefined;
    const p2Frac = c.fractionKey ? p2.fractions[c.fractionKey] : undefined;

    return {
      label: c.label,
      p1Display: c.isPercentage ? `${Math.round(p1Val)}%` : String(Math.round(p1Val)),
      p2Display: c.isPercentage ? `${Math.round(p2Val)}%` : String(Math.round(p2Val)),
      p1Fraction: p1Frac ? `${p1Frac.made}/${p1Frac.attempts}` : undefined,
      p2Fraction: p2Frac ? `${p2Frac.made}/${p2Frac.attempts}` : undefined,
    };
  });
}

/* ── Page (Server Component) ───────────────────────────── */

interface PageProps {
  params: Promise<{ matchId: string }>;
}

export default async function MatchDetailPage({ params }: PageProps) {
  const { matchId } = await params;
  const data = await getMatchDetailData(matchId);

  if (!data) notFound();

  const { match, statsResult, keyMoments, points } = data;

  const p1 = statsResult?.statistics?.player1Stats;
  const p2 = statsResult?.statistics?.player2Stats;
  const p1Name = statsResult?.player1Name ?? match.player1.name;
  const p2Name = statsResult?.player2Name ?? match.player2.name;
  const p1Short = shortName(p1Name, 14);
  const p2Short = shortName(p2Name, 14);

  /* Radar data */
  const radarData =
    p1 && p2
      ? RADAR_STATS.map((stat) => ({
          stat: stat.label,
          p1: (p1[stat.key] as number) ?? 0,
          p2: (p2[stat.key] as number) ?? 0,
        }))
      : [];

  /* Rating */
  const overallRating = p1
    ? Math.round((p1.serveRating + p1.returnRating + p1.underPressureRating) / 3)
    : null;
  const ratingLabel =
    overallRating !== null ? getRatingLabel(overallRating) : null;

  /* Pre-compute stat rows for the stats table */
  const serveRows = p1 && p2 ? buildStatRows(SERVE_STATS, p1, p2) : [];
  const returnRows = p1 && p2 ? buildStatRows(RETURN_STATS, p1, p2) : [];
  const otherRows = p1 && p2 ? buildStatRows(OTHER_STATS, p1, p2) : [];

  /* Total points */
  const p1TotalPoints = p1?.totalPointsWon ?? 0;
  const p2TotalPoints = p2?.totalPointsWon ?? 0;

  return (
    <div className="px-8 pt-8 pb-12">
      <SectionsStagger className="flex flex-col gap-8">
        {/* At-a-glance KPI strip */}
        <MatchKpiStrip
          overallRating={overallRating}
          ratingLabel={ratingLabel}
          p1={p1}
          p1TotalPoints={p1TotalPoints}
          p2TotalPoints={p2TotalPoints}
        />

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-8">
          {/* ── Main content (left column) ───────────────── */}
          <main className="min-w-0 flex flex-col gap-8">
            {/* Performance — tabbed (Momentum / Sets / Pressure / Comparison) */}
            <PerformanceWidget
              points={points}
              p1Name={p1Name}
              p2Name={p2Name}
              p1Short={p1Short}
              p2Short={p2Short}
              p1TotalPoints={p1TotalPoints}
              p2TotalPoints={p2TotalPoints}
              radarData={radarData}
            />

            {/* Match Statistics Table */}
            {serveRows.length > 0 ? (
              <MatchStatisticsTable
                serveRows={serveRows}
                returnRows={returnRows}
                otherRows={otherRows}
                p1Name={p1Short}
                p2Name={p2Short}
              />
            ) : null}

            {/* Visuals finale — Court + Video */}
            <CourtVideoRow matchId={matchId} />
          </main>

          {/* ── Right column (sidebar) ───────────────────── */}
          <aside className="hidden lg:flex flex-col gap-8">
            <Scoreline match={match} p1Name={p1Name} p2Name={p2Name} />
            <SidebarKeyMoments moments={keyMoments} />
          </aside>
        </div>
      </SectionsStagger>
    </div>
  );
}
