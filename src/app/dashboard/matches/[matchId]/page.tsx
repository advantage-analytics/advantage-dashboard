import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { reconcileBeforePageRead } from "@/lib/services/splitstep/reconcile";

import { getMatchDetailData } from "@/lib/data/match-detail-server";
import { shortName } from "@/lib/data/match-utils";
import {
  isAnalysisFailed,
  isInFlight,
  withStatsPublished,
} from "@/lib/data/match-analysis";
import { analysisFor, loadMatchAnalysis } from "@/lib/data/match-analysis-server";
import { MatchAnalysisProgress } from "@/components/dashboard/matches/match-detail/match-analysis-progress";
import { MarkReportSeen } from "@/components/dashboard/matches/match-detail/mark-report-seen";
import { UnpublishedStatsNotice } from "@/components/dashboard/matches/match-detail/unpublished-stats-notice";
import { DerivedStatsNotice } from "@/components/dashboard/matches/match-detail/derived-stats-notice";

import { MatchDetailShell } from "@/components/dashboard/matches/match-detail/match-detail-shell";
import { MatchRail } from "@/components/dashboard/matches/match-detail/match-rail";
import { getMatchSides } from "@/components/dashboard/matches/match-detail/use-match-sides";
import { PerformanceTrackerCard } from "@/components/dashboard/matches/match-detail/performance-tracker-card";
import {
  MatchStatisticsCard,
  type StatRow,
} from "@/components/dashboard/matches/match-detail/match-statistics-card";
import { ServePlacementCard } from "@/components/dashboard/matches/match-detail/serve-placement-card";
import { AiInsightCard } from "@/components/dashboard/ai-insight-card";
import { InsightStatChip } from "@/components/dashboard/shared/insight-stat-chip";
import { MatchVideoCard } from "@/components/dashboard/matches/match-detail/match-video-card";
import { getMatchVideo } from "@/lib/data/match-video-server";
import type { PlayerStatistics } from "@/lib/data/types";

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
  { key: "shortRallyWonPct", label: "Short Rallies (1–4)", isPercentage: true, fractionKey: "shortRallyWonPct" },
  { key: "mediumRallyWonPct", label: "Medium Rallies (5–8)", isPercentage: true, fractionKey: "mediumRallyWonPct" },
  { key: "longRallyWonPct", label: "Long Rallies (9+)", isPercentage: true, fractionKey: "longRallyWonPct" },
  { key: "totalPointsWon", label: "Total Points Won", isPercentage: false },
];

/** "" is what MatchStatisticsCard treats as missing; 0 is a measurement. */
function statDisplay(value: number | null, isPercentage?: boolean): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "";
  return isPercentage ? `${Math.round(value)}%` : String(Math.round(value));
}

function buildStatRows(
  configs: StatConfig[],
  p1: PlayerStatistics,
  p2: PlayerStatistics,
): StatRow[] {
  return configs.map((c) => {
    const p1Val = p1[c.key] as number | null;
    const p2Val = p2[c.key] as number | null;
    const p1Frac = c.fractionKey ? p1.fractions[c.fractionKey] : undefined;
    const p2Frac = c.fractionKey ? p2.fractions[c.fractionKey] : undefined;

    return {
      label: c.label,
      // An empty display is the card's existing contract for "no data", which
      // it renders as an italic em dash with an explanatory tooltip. Absent must
      // reach here as null rather than 0 — see the mapping in
      // match-stats-server.ts.
      p1Display: statDisplay(p1Val, c.isPercentage),
      p2Display: statDisplay(p2Val, c.isPercentage),
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
  // The job read only needs `matchId`, so it rides along with the other two
  // rather than waiting for a page's worth of stats to come back first.
  // `video` joins the same wave rather than following it: it reads different
  // tables and nothing above depends on it, so awaiting it separately would add
  // a round trip in front of a page that is otherwise ready. It resolves to
  // null for every imported match and every job that produced no trimmed copy,
  // which is most of them.
  const [data, jobs, video] = await Promise.all([
    getMatchDetailData(matchId),
    createClient().then(async (supabase) => {
      // Ask the vendor about jobs that look stuck BEFORE reading, so what the
      // poll learns is what this page renders. Never fatal — and not inside
      // loadMatchAnalysis, which client components import and the
      // reconciler's admin/Azure dependencies must never reach.
      //
      // Gated on an RLS-scoped existence check first. reconcileBeforePageRead
      // runs on the ADMIN client, which enforces no ownership of its own —
      // without this check, this branch races getMatchDetailData's own RLS
      // read rather than waiting for it, so a signed-in user who merely
      // knows or guesses a matchId belonging to another account could force
      // a vendor poll, a status write, and even an auto-resubmission —
      // spending someone else's quota — before the page's 404 ever fires.
      // This SELECT uses the same request-scoped, cookie-authenticated
      // client as everything else here, so it answers exactly what the
      // viewer's own RLS policy would: nothing, if they cannot see this row.
      const { data: accessible } = await supabase
        .from("matches")
        .select("id")
        .eq("id", matchId)
        .maybeSingle();
      if (accessible) {
        await reconcileBeforePageRead([matchId], "match-detail");
      }
      return loadMatchAnalysis(supabase, [matchId], { reap: true });
    }),
    getMatchVideo(matchId),
  ]);

  if (!data) notFound();

  const { match, statsResult, points, insights, playerAverages } = data;

  // The single attribution point (guardrails §4): every you/opp decision on
  // this page routes through `getMatchSides`, keyed on `match.isUserPlayer1`.
  const sides = getMatchSides(match, statsResult);

  const userInsights = sides.pick(insights?.player1, insights?.player2);
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
  const userStats = sides.you.stats;
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
          sides.you.isPlayer1 && typeof avgVal === "number" && avgVal > 0
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

  // A match whose video hasn't finished analysing has no stats to show. Every
  // section below would render zeroes, and an empty serve chart reads as "you
  // hit no serves" rather than "we're still working" — so the page stops at the
  // identity the player entered plus the pipeline state. Failures take the same
  // path: the reason it stopped is more use than a page of zeroes.
  const jobAnalysis = analysisFor(jobs, {
    id: matchId,
    sourceProvider: match.sourceProvider,
    verificationStatus: match.verificationStatus,
  });

  // Derivation produces two things of very different trustworthiness, and the
  // page has to be able to say so. The point timeline is folded from the
  // vendor's score stream and refused unless it reproduces the score the player
  // entered, so every point on it is checkable. The aggregates are not — several
  // families are contaminated by the vendor recording points that ended on the
  // serve as rallies, and aces cannot be told from service winners at all. When
  // the derivation ran but no statistics were published, this resolves to
  // `timeline` and the sections below split accordingly.
  const statsPublished = Boolean(p1 && p2);
  // A video-derived match publishes what it can measure and withholds what it
  // cannot, per statistic rather than per card. Winners and errors are marked
  // approximate because identifying the stroke that ended a point is a model
  // output; aces are absent entirely because an ace cannot be told from a
  // service winner. See suppress_derived_match_stats().
  const isDerived = match.sourceProvider === "splitstep";
  const analysis = {
    ...jobAnalysis,
    status: withStatsPublished(jobAnalysis.status, statsPublished),
  };
  const isAwaitingAnalysis =
    isInFlight(analysis.status) || isAnalysisFailed(analysis.status);

  if (isAwaitingAnalysis) {
    // Guardrails §3.3 — the short-circuit gate. Rail identity renders fine
    // from `match`; the content pane holds the pipeline state and nothing
    // else. No tabs, no stat section that would draw zeroes.
    return (
      <MatchDetailShell rail={<MatchRail aiSummary={summary} film="none" />}>
        <MatchAnalysisProgress analysis={analysis} matchId={matchId} />
      </MatchDetailShell>
    );
  }

  const statSections =
    p1 && p2
      ? [
          { title: "Serve", rows: buildStatRows(SERVE_STATS, p1, p2) },
          { title: "Return", rows: buildStatRows(RETURN_STATS, p1, p2) },
          { title: "Other", rows: buildStatRows(OTHER_STATS, p1, p2) },
        ]
      : [];

  return (
    <>
      <MarkReportSeen matchId={matchId} />
      <MatchDetailShell
        rail={
          <MatchRail
            aiSummary={summary}
            film={
              video
                ? "card"
                // Allowlist, not "not splitstep": `sourceProvider` is also
                // `null` for a match a coach typed in by hand (never
                // imported, never analysed) — see the comment on
                // `source_provider` in `lib/schedule/actions.ts`. Only the
                // exact `swing-vision` value backs the SwingVision claim;
                // every other no-video case gets the neutral copy, which is
                // true for all of them (splitstep missing its trimmed copy,
                // a hand-scored match, or any future provider).
                : match.sourceProvider === "swing-vision"
                  ? "note-swingvision"
                  : "note-neutral"
            }
          />
        }
        tabs={{
          statistics: (
            <>
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

              {!statsPublished && <UnpublishedStatsNotice />}
              {statsPublished && isDerived && <DerivedStatsNotice />}

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
            </>
          ),
          shots: <ServePlacementCard />,
          film: video ? (
            <MatchVideoCard video={video} />
          ) : (
            // Placeholder only — the real 46d empty state lands with the Film
            // room build.
            <div className="flex items-center justify-center rounded-[var(--radius-card)] border border-[var(--border-hairline)] bg-[var(--surface-card)] py-16">
              <span className="text-body-sm">No video for this match</span>
            </div>
          ),
        }}
      />
    </>
  );
}
