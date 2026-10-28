import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import nextDynamic from "next/dynamic";
import { AdminReportStrip } from "@/components/admin/matches/admin-report-strip";
import { MatchDataProvider } from "@/components/dashboard/matches/match-data-provider";
import { AnalysisSteps } from "@/components/dashboard/matches/match-detail/analysis-steps-column";
import {
  MatchReportFrame,
  MatchReportPane,
  MatchReportProvider,
  MatchReportRail,
  MatchReportSpacer,
  MatchReportWhen,
} from "@/components/dashboard/matches/match-detail/match-report";
import type { ReportView } from "@/components/dashboard/matches/match-detail/report-view";
import { MatchReportScoreboard } from "@/components/dashboard/matches/match-detail/report-scoreboard";
import { MatchReportViewSwitcher } from "@/components/dashboard/matches/match-detail/report-view-switcher";
import {
  MatchReportTitle,
  MatchReportTitleRow,
} from "@/components/dashboard/matches/match-detail/report-title-row";
import { MatchReportFacts } from "@/components/dashboard/matches/match-detail/report-facts";
import { StatisticsView } from "@/components/dashboard/matches/match-detail/statistics-view";
import { MatchFiltersProvider } from "@/components/dashboard/matches/match-detail/match-filters/provider";
import { MATCH_FILTERS_PARAM } from "@/components/dashboard/matches/match-detail/match-filters/model";
import { getMatchSides } from "@/components/dashboard/matches/match-detail/use-match-sides";
import {
  FilmPanePending,
  MatchReportPending,
  VisualizationsPanePending,
} from "@/components/dashboard/loading/match-report-pending";
import { getAdminMatchReport } from "@/lib/data/admin-matches-server";
import { isStatsUnavailable, matchPageKind } from "@/lib/data/match-analysis";
import { getSharedMatchVideo } from "@/lib/data/match-video-server";
import { getPreferences } from "@/lib/data/preferences-server";
import { DEFAULT_BANDS } from "@/lib/data/viz-bands";
import { playedSets } from "@/lib/ui/score-format";

/**
 * Admin › Matches › one match: the player's report inside the admin chrome,
 * read-only, loaded through the service-role client behind
 * `requireAdminOrNotFound()` (`getAdminMatchReport`).
 *
 * Built from the same parts as `/dashboard/matches/[matchId]` under
 * `MatchReportProvider readOnly` — the public share page's recipe — so Share,
 * Ask and the ⋯ menu are not drawn, and the film room records no view
 * (`FilmTab readOnly` never sends `/video/viewed`). PostHog counts this visit
 * under `/admin/matches/…`, a path the match's view count never reads.
 *
 * The analysing short-circuit stands (guardrails §3.3): a match still in
 * flight, or failed, renders the analysis steps — never a report of zeroes —
 * decided by the same `matchPageKind` the dashboard page uses. The admin
 * cannot cancel or resend from here (`canAct` false).
 *
 * Nothing here writes: no reap, no vendor reconcile, no "report seen" stamp.
 */
export const dynamic = "force-dynamic";

const ShotsTab = nextDynamic(
  () =>
    import("@/components/dashboard/matches/match-detail/shots/shots-tab").then(
      (m) => m.ShotsTab,
    ),
  { loading: () => <VisualizationsPanePending /> },
);
const FilmTab = nextDynamic(
  () =>
    import("@/components/dashboard/matches/match-detail/film/film-tab").then(
      (m) => m.FilmTab,
    ),
  { loading: () => <FilmPanePending /> },
);

interface PageProps {
  params: Promise<{ matchId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateMetadata({
  params,
}: Pick<PageProps, "params">): Promise<Metadata> {
  const { matchId } = await params;
  const report = await getAdminMatchReport(matchId).catch(() => null);
  if (!report) return { title: "Match" };
  const { match } = report.detail;
  return { title: `${match.player1.name} vs ${match.player2.name}` };
}

export default async function AdminMatchReportPage({
  params,
  searchParams,
}: PageProps) {
  const [{ matchId }, query] = await Promise.all([params, searchParams]);
  const report = await getAdminMatchReport(matchId);
  if (!report) notFound();

  const { detail, analysis, workspace, labelHref } = report;
  const { match, statsResult, insights } = detail;

  // The single attribution point (guardrails §4), as on the dashboard page.
  const sides = getMatchSides(match, statsResult);
  const lineSets = playedSets(sides.sets);
  const setsYou = lineSets.filter((s) => s.player1 > s.player2).length;
  const setsOpp = lineSets.filter((s) => s.player2 > s.player1).length;
  // A score whose played sets are level decides nobody: no result mark.
  const lineWon = setsYou === setsOpp ? null : match.won;

  const isAwaitingAnalysis = matchPageKind(analysis) === "steps";
  if (detail.points === null && !isAwaitingAnalysis) {
    throw new Error(`Failed to load points for match ${matchId}`);
  }
  const points = detail.points ?? [];

  const strip = (
    <AdminReportStrip
      matchId={match.id}
      player={sides.you.name}
      opponent={sides.opp.name}
      won={lineWon}
      sets={lineSets}
      workspace={workspace}
      labelHref={labelHref}
      job={
        analysis.jobId ? { id: analysis.jobId, status: analysis.status } : null
      }
    />
  );

  if (isAwaitingAnalysis) {
    return (
      <div className="flex h-[calc(100dvh-var(--header-h))] w-full flex-col overflow-hidden bg-[var(--surface-card)]">
        {strip}
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
          <AnalysisSteps
            analysis={analysis}
            canAct={false}
            matchId={match.id}
            match={{
              player: sides.you.name,
              opponent: sides.opp.name,
              won: lineWon,
              sets: lineSets,
            }}
          />
        </div>
      </div>
    );
  }

  // Signed only for a match with points, as the share page does: an empty
  // film list would say no points were detected. A storage failure costs the
  // Video view, never the report.
  const [video, preferences] = await Promise.all([
    points.length > 0
      ? getSharedMatchVideo(match.id).catch((cause: unknown) => {
          console.error("[admin report] could not resolve the video", {
            matchId: match.id,
            cause,
          });
          return null;
        })
      : Promise.resolve(null),
    getPreferences().catch(() => null),
  ]);
  const unit = preferences?.unit ?? "ft";

  const p1 = statsResult?.statistics?.player1Stats;
  const p2 = statsResult?.statistics?.player2Stats;
  const statsPublished = Boolean(p1 && p2);
  const userInsights = sides.pick(insights?.player1, insights?.player2);
  const summary = userInsights?.summary?.trim() || null;
  const views: readonly ReportView[] = [
    "statistics",
    "shots",
    ...(video ? (["film"] as const) : []),
  ];

  return (
    <div className="flex h-[calc(100dvh-var(--header-h))] w-full flex-col overflow-hidden bg-[var(--surface-card)]">
      {strip}
      <div className="flex min-h-0 flex-1 flex-col">
        <MatchDataProvider
          key={match.id}
          match={match}
          statsResult={statsResult}
          points={points}
          keyMoments={detail.keyMoments}
          insights={insights}
          kpiHistory={null}
        >
          <Suspense fallback={<MatchReportPending view="statistics" />}>
            <MatchFiltersProvider initialQuery={query[MATCH_FILTERS_PARAM]}>
              <MatchReportProvider
                matchId={match.id}
                summary={summary}
                isDerived={match.sourceProvider === "splitstep"}
                statsPublished={statsPublished}
                statsUnavailable={isStatsUnavailable(analysis)}
                foldUnreconciled={detail.foldUnreconciled}
                hasPlayableVideo={video !== null}
                defaultView="statistics"
                views={views}
                savedViews={[]}
                workspaceRole="player"
                workspaceKind="personal"
                workspaceName=""
                bandSettings={DEFAULT_BANDS}
                canEditBands={false}
                unit={unit}
                readOnly
              >
                <MatchReportFrame>
                  <MatchReportRail>
                    <MatchReportScoreboard />
                    <MatchReportViewSwitcher />
                    <MatchReportSpacer />
                    <p className="m-0 border-t border-[var(--border-hairline)] px-5 py-4 text-[12px] text-[var(--ink-600)]">
                      Share and Ask are hidden while viewing as admin.
                    </p>
                  </MatchReportRail>

                  <MatchReportPane>
                    <MatchReportTitleRow>
                      <div className="min-w-0">
                        <MatchReportTitle />
                        <MatchReportFacts />
                      </div>
                    </MatchReportTitleRow>

                    <MatchReportWhen view="statistics">
                      <StatisticsView />
                    </MatchReportWhen>
                    <MatchReportWhen view="shots">
                      <ShotsTab />
                    </MatchReportWhen>
                    {video && (
                      <MatchReportWhen view="film" scrollsInside>
                        <FilmTab
                          video={video}
                          unit={unit}
                          readOnly
                          playbackEndpoint={`/admin/matches/${encodeURIComponent(match.id)}/playback`}
                        />
                      </MatchReportWhen>
                    )}
                  </MatchReportPane>
                </MatchReportFrame>
              </MatchReportProvider>
            </MatchFiltersProvider>
          </Suspense>
        </MatchDataProvider>
      </div>
    </div>
  );
}
