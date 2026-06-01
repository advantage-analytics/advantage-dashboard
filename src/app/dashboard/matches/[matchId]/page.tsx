import { notFound } from "next/navigation";

import {
  getAdjacentMatchIds,
  getMatchDetailData,
} from "@/lib/data/match-detail-server";
import { shortName } from "@/lib/data/match-utils";

import { MatchSummaryRow } from "@/components/dashboard/matches/match-detail/match-summary-row";
import { MatchKpiRow } from "@/components/dashboard/matches/match-detail/match-kpi-row";
import { MatchDetailHero } from "@/components/dashboard/matches/match-detail-hero";
import { PerformanceTrackerCard } from "@/components/dashboard/matches/match-detail/performance-tracker-card";
import {
  MatchStatisticsCard,
  type StatRow,
} from "@/components/dashboard/matches/match-detail/match-statistics-card";
import { ServePlacementCard } from "@/components/dashboard/matches/match-detail/serve-placement-card";
import { AiInsightCard } from "@/components/dashboard/ai-insight-card";
import { InsightStatChip } from "@/components/dashboard/shared/insight-stat-chip";
import { PerformanceProfileCard } from "@/components/dashboard/matches/match-detail/performance-profile-card";
import { KeyMomentsCard } from "@/components/dashboard/matches/match-detail/key-moments-card";
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
  { key: "firstServeInPct", label: "First Serves In", isPercentage: true, fractionKey: "firstServeInPct" },
  { key: "firstServeWinPct", label: "First Serve Points Won", isPercentage: true, fractionKey: "firstServeWinPct" },
  { key: "secondServeWinPct", label: "Second Serve Points Won", isPercentage: true, fractionKey: "secondServeWinPct" },
  { key: "breakpointsSaved", label: "Break Points Saved", isPercentage: false, fractionKey: "breakpointsSaved" },
  { key: "servicePointsWon", label: "Service Points Won", isPercentage: false, fractionKey: "servicePointsWon" },
  { key: "serviceGamesWon", label: "Service Games Won", isPercentage: false },
];

const RETURN_STATS: StatConfig[] = [
  { key: "firstReturnInPct", label: "First Returns In Play", isPercentage: false },
  { key: "firstReturnWonPct", label: "First Return Points Won", isPercentage: false },
  { key: "secondReturnInPct", label: "Second Returns In Play", isPercentage: true, fractionKey: "secondReturnInPct" },
  { key: "secondReturnWonPct", label: "Second Return Points Won", isPercentage: true, fractionKey: "secondReturnWonPct" },
  { key: "breakpointsWonPct", label: "Break Points Converted", isPercentage: true, fractionKey: "breakpointsWonPct" },
  { key: "returnPointsWon", label: "Return Points Won", isPercentage: false, fractionKey: "returnPointsWon" },
  { key: "returnGamesWonPct", label: "Return Games Won %", isPercentage: true, fractionKey: "returnGamesWonPct" },
  { key: "returnGamesWon", label: "Service Breaks", isPercentage: false },
];

const OTHER_STATS: StatConfig[] = [
  { key: "winners", label: "Winners", isPercentage: false },
  { key: "unforcedErrors", label: "Unforced Errors", isPercentage: false },
  { key: "netPointsAppearances", label: "Net Approaches", isPercentage: false },
  { key: "netPointsWonPct", label: "Net Points Won %", isPercentage: true, fractionKey: "netPointsWonPct" },
  { key: "shortRallyWonPct", label: "Short Rallies (1\u20134)", isPercentage: true, fractionKey: "shortRallyWonPct" },
  { key: "mediumRallyWonPct", label: "Medium Rallies (5\u20138)", isPercentage: true, fractionKey: "mediumRallyWonPct" },
  { key: "longRallyWonPct", label: "Long Rallies (9+)", isPercentage: true, fractionKey: "longRallyWonPct" },
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
  const [data, adjacent] = await Promise.all([
    getMatchDetailData(matchId),
    getAdjacentMatchIds(matchId),
  ]);

  if (!data) notFound();

  const { match, statsResult, points, keyMoments, insights, playerAverages } =
    data;

  const userInsights = match.isUserPlayer1
    ? insights?.player1
    : insights?.player2;
  // Synthesized prose insight (home-quality), generated once at upload. Falls back to
  // the single top strength/weakness for matches processed before summaries existed.
  const summary = userInsights?.summary?.trim() || null;
  const topInsight =
    userInsights?.weaknesses?.[0] ?? userInsights?.strengths?.[0] ?? null;

  const p1 = statsResult?.statistics?.player1Stats;
  const p2 = statsResult?.statistics?.player2Stats;

  // Deterministic evidence chips — real computed match stats for the user, never the
  // LLM-emitted insight `value` (which would reintroduce hallucinated numbers). Each
  // carries a delta vs the player's career average (computed live, always fresh). The
  // delta is only shown when the user is player1, matching how `playerAverages` is
  // computed (over the user's player1_id matches).
  const userStats = match.isUserPlayer1 ? p1 : p2;
  const chipSpecs: { label: string; key: keyof PlayerStatistics; isPct: boolean }[] = [
    { label: "First Serve In", key: "firstServeInPct", isPct: true },
    { label: "Break Points Won", key: "breakpointsWonPct", isPct: true },
    { label: "Winners", key: "winners", isPct: false },
  ];
  const insightChips = userStats
    ? chipSpecs.map((spec) => {
        const matchVal = Math.round(userStats[spec.key] as number);
        const avgVal = playerAverages?.[spec.key];
        const change =
          match.isUserPlayer1 && typeof avgVal === "number" && avgVal > 0
            ? matchVal - Math.round(avgVal)
            : undefined;
        return {
          label: spec.label,
          value: spec.isPct ? `${matchVal}%` : String(matchVal),
          change,
        };
      })
    : [];
  const showAvgCaption = insightChips.some(
    (c) => typeof c.change === "number" && c.change !== 0,
  );
  const p1Name = statsResult?.player1Name ?? match.player1.name;
  const p2Name = statsResult?.player2Name ?? match.player2.name;
  const p1Short = shortName(p1Name, 14);
  const p2Short = shortName(p2Name, 14);

  const matchDurationSec = match.durationSec ?? null;

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
      <div className="mx-auto max-w-screen-2xl px-6 sm:px-8 py-8 sm:py-10">
        <SectionsStagger className="flex flex-col">
        <MatchDetailHero
          match={match}
          previousMatchId={adjacent.previousId}
          nextMatchId={adjacent.nextId}
        />

        <div className="mt-8">
          <MatchSummaryRow
            match={match}
            p1Name={p1Name}
            p2Name={p2Name}
            previousMatchId={adjacent.previousId}
            nextMatchId={adjacent.nextId}
          />
        </div>

        <div className="mt-8">
          <MatchKpiRow
            duration={match.duration}
            matchDurationSec={matchDurationSec}
            playingTimeSec={points.reduce((sum, p) => sum + (p.duration ?? 0), 0)}
            p1Stats={p1}
            p2Stats={p2}
            p1Name={p1Short}
            p2Name={p2Short}
          />
        </div>

        <div className="mt-8 grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_360px] gap-8">
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
              <div className="flex flex-col gap-3.5">
                {summary ? (
                  <p className="text-[12px] font-normal text-[var(--color-text-body)] leading-[19.8px]">
                    {summary}
                  </p>
                ) : topInsight ? (
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
                {insightChips.length > 0 && (
                  <div className="flex flex-col gap-2">
                    {showAvgCaption && (
                      <span className="text-[9px] font-medium uppercase tracking-[2.5px] text-[#AAAAAA]">
                        vs your average
                      </span>
                    )}
                    <div className="flex flex-wrap gap-2">
                      {insightChips.map((chip) => (
                        <InsightStatChip
                          key={chip.label}
                          label={chip.label}
                          value={chip.value}
                          change={chip.change}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </AiInsightCard>
            <PerformanceProfileCard
              data={radarData}
              p1Name={p1Short}
              p2Name={p2Short}
            />
            <KeyMomentsCard
              points={points}
              narrativeMoments={keyMoments}
              p1Name={p1Short}
              p2Name={p2Short}
              className="flex-1"
            />
          </aside>
        </div>

        </SectionsStagger>
      </div>
    </div>
  );
}
