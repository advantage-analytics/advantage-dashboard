import { notFound } from "next/navigation";

import { getMatchDetailData } from "@/lib/data/match-detail-server";
import { shortName } from "@/lib/data/match-utils";

import { MatchSummaryRow } from "@/components/dashboard/matches/match-detail/match-summary-row";
import { MatchDetailHero } from "@/components/dashboard/matches/match-detail-hero";
import { PerformanceTrackerCard } from "@/components/dashboard/matches/match-detail/performance-tracker-card";
import {
  MatchStatisticsCard,
  type StatRow,
} from "@/components/dashboard/matches/match-detail/match-statistics-card";
import { ServePlacementCard } from "@/components/dashboard/matches/match-detail/serve-placement-card";
import { AiInsightCard } from "@/components/dashboard/ai-insight-card";
import { PerformanceProfileCard } from "@/components/dashboard/matches/match-detail/performance-profile-card";
import { KeyMomentsCard } from "@/components/dashboard/matches/match-detail/key-moments-card";
import { PressurePointsCard } from "@/components/dashboard/matches/match-detail/pressure-points-card";
import { SectionsStagger } from "@/components/dashboard/matches/match-detail/sections-stagger";
import type { PlayerStatistics } from "@/lib/data/types";

const RADAR_STATS: { key: keyof PlayerStatistics; label: string }[] = [
  { key: "firstServeInPct", label: "First Serve In" },
  { key: "firstServeWinPct", label: "First Serve Won" },
  { key: "secondServeWinPct", label: "Second Serve Won" },
  { key: "serviceGamesWonPct", label: "Service Games Won" },
  { key: "breakpointsWonPct", label: "Break Points Converted" },
  { key: "firstReturnWonPct", label: "First Serve Returns Won" },
  { key: "secondReturnWonPct", label: "Second Serve Return Points Won" },
  { key: "returnGamesWonPct", label: "Return Games Won" },
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

interface PageProps {
  params: Promise<{ matchId: string }>;
}

export default async function MatchDetailPage({ params }: PageProps) {
  const { matchId } = await params;
  const data = await getMatchDetailData(matchId);

  if (!data) notFound();

  const { match, statsResult, points, keyMoments, insights } = data;

  const userInsights = match.isUserPlayer1
    ? insights?.player1
    : insights?.player2;
  const topInsight =
    userInsights?.weaknesses?.[0] ?? userInsights?.strengths?.[0] ?? null;

  const p1 = statsResult?.statistics?.player1Stats;
  const p2 = statsResult?.statistics?.player2Stats;
  const p1Name = statsResult?.player1Name ?? match.player1.name;
  const p2Name = statsResult?.player2Name ?? match.player2.name;
  const p1Short = shortName(p1Name, 14);
  const p2Short = shortName(p2Name, 14);

  const matchDurationSec = (() => {
    const m = match.duration?.match(/^(\d+):(\d{1,2})$/);
    if (!m) return null;
    return parseInt(m[1], 10) * 3600 + parseInt(m[2], 10) * 60;
  })();

  const radarData =
    p1 && p2
      ? RADAR_STATS.map((stat) => ({
          stat: stat.label,
          p1: (p1[stat.key] as number) ?? 0,
          p2: (p2[stat.key] as number) ?? 0,
        }))
      : [];

  const statSections =
    p1 && p2
      ? [
          { title: "Serve", rows: buildStatRows(SERVE_STATS, p1, p2) },
          { title: "Return", rows: buildStatRows(RETURN_STATS, p1, p2) },
          { title: "Other", rows: buildStatRows(OTHER_STATS, p1, p2) },
        ]
      : [];

  return (
    <div className="flex-1 w-full bg-white">
      <div className="px-8 py-10">
        <SectionsStagger className="flex flex-col">
        <MatchDetailHero match={match} />

        <div className="mt-8">
          <MatchSummaryRow match={match} p1Name={p1Name} p2Name={p2Name} />
        </div>

        <div className="mt-10 grid grid-cols-1 lg:grid-cols-[5fr_2fr] gap-8">
          <main
            aria-label="Match details"
            className="min-w-0 flex flex-col gap-6 order-1"
          >
            <PerformanceTrackerCard
              points={points}
              p1Name={p1Short}
              p2Name={p2Short}
              matchDurationSec={matchDurationSec}
            />

            {statSections.some((s) => s.rows.length > 0) && (
              <MatchStatisticsCard
                sections={statSections}
                p1Name={p1Short}
                p2Name={p2Short}
              />
            )}

            <div id="match-serve-placement" className="scroll-mt-6">
              <ServePlacementCard />
            </div>
          </main>

          <aside
            aria-label="Match insights"
            className="flex flex-col gap-6 min-w-0 order-2"
          >
            <AiInsightCard
              storageKey={`advantage-ai-insight-dismissed:${matchId}`}
            >
              {topInsight ? (
                <div className="flex flex-col gap-1.5">
                  <p className="text-[12px] font-medium text-[var(--color-text-primary)] leading-[18px]">
                    {topInsight.name}
                  </p>
                  <p className="text-[12px] font-normal text-[var(--color-text-body)] leading-[19.8px]">
                    {topInsight.description}
                  </p>
                </div>
              ) : (
                <p className="text-[12px] font-normal text-[var(--color-text-body)] leading-[19.8px]">
                  Insights will appear here once this match is fully analyzed.
                </p>
              )}
            </AiInsightCard>
            <PerformanceProfileCard
              data={radarData}
              p1Name={p1Short}
              p2Name={p2Short}
            />
            <KeyMomentsCard points={points} narrativeMoments={keyMoments} />
            <PressurePointsCard points={points} />
          </aside>
          </div>
        </SectionsStagger>
      </div>
    </div>
  );
}
