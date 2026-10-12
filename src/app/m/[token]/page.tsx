import { Suspense } from "react";
import type { Metadata } from "next";
import nextDynamic from "next/dynamic";
import Link from "next/link";
import { ClaimActions, CLAIM_BUTTON } from "@/components/claim/claim-shell";
import { JoinPane } from "@/components/join/join-pane";
import { MatchDataProvider } from "@/components/dashboard/matches/match-data-provider";
import {
  MatchReportFrame,
  MatchReportPane,
  MatchReportProvider,
  MatchReportRail,
  MatchReportSpacer,
  MatchReportWhen,
} from "@/components/dashboard/matches/match-detail/match-report";
import { MatchReportViewSwitcher } from "@/components/dashboard/matches/match-detail/report-view-switcher";
import type { ReportView } from "@/components/dashboard/matches/match-detail/report-view";
import { MatchFiltersProvider } from "@/components/dashboard/matches/match-detail/match-filters/provider";
import { MATCH_FILTERS_PARAM } from "@/components/dashboard/matches/match-detail/match-filters/model";
import { getSharedMatchVideo } from "@/lib/data/match-video-server";
import { MatchReportScoreboard } from "@/components/dashboard/matches/match-detail/report-scoreboard";
import {
  MatchReportTitle,
  MatchReportTitleRow,
} from "@/components/dashboard/matches/match-detail/report-title-row";
import { MatchReportFacts } from "@/components/dashboard/matches/match-detail/report-facts";
import { StatisticsView } from "@/components/dashboard/matches/match-detail/statistics-view";
import { SharedByFooter } from "@/components/public/shared-by-footer";
import {
  FilmPanePending,
  MatchReportPending,
  VisualizationsPanePending,
} from "@/components/dashboard/loading/match-report-pending";
import { getSharedMatchData } from "@/lib/data/match-share-server";
import { readShareToken } from "@/lib/data/match-share-format";
import { formatScoreText, playedSets } from "@/lib/ui/score-format";

/**
 * A match report anyone with the link can read (`/m/[token]`).
 *
 * The same report the sharer sees under `/dashboard/matches/[matchId]`, built
 * from the same parts — the rail scoreboard, the title row, the Statistics
 * view — under `MatchReportProvider readOnly`. What is left out is everything
 * that acts or leads back into the app: Share, Compare, the More menu (review
 * score, delete), and the awaiting-analysis progress with its retry.
 *
 * The Visualizations view is on the page when the link's maker left it on
 * (`includesVisualizations`), and the rail then grows the view switcher with
 * those two rows. It is the dashboard's `ShotsTab` under `readOnly`: the
 * default cuts, filters and the fullscreen viewer, with nothing a workspace
 * owns (saved views, band editing). A link without it has one view and no
 * switcher, as before.
 *
 * The Video view is on the page only when the link carries the video, whoever
 * made the link may still share it (`videoShared`) and a playable file exists
 * (`getSharedMatchVideo`). It is the dashboard's `FilmTab` under `readOnly` —
 * it plays, steps and filters, with no bookmarks and nothing to add, replace
 * or adjust — and it renews its thirty-minute URL through
 * `/api/share/<token>/video`, the token-gated twin of the match's own route.
 * No video, no Video row: an anonymous reader is never shown an empty player. A match still analysing draws
 * the scoreboard and an empty Statistics view rather than a pipeline state.
 *
 * `force-dynamic`: the answer depends on a row that is deleted the moment the
 * sharer turns the link off. Unknown, mistyped and revoked tokens all land on
 * one screen, so a bad token cannot learn whether it was ever a good one.
 * `robots: noindex` — a share link is for the people it was sent to.
 */
export const dynamic = "force-dynamic";

// Code-split as on the dashboard page: a reader who stays on Statistics, or
// whose link has no visualizations, never fetches the court.
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

/** The views a link offers, in rail order. Statistics is always there. */
function sharedViews(
  includesVisualizations: boolean,
  hasVideo: boolean,
): readonly ReportView[] {
  return [
    "statistics",
    ...(includesVisualizations ? (["shots"] as const) : []),
    ...(hasVideo ? (["film"] as const) : []),
  ];
}

interface PageProps {
  params: Promise<{ token: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

async function load(rawToken: string) {
  return getSharedMatchData(readShareToken(rawToken));
}

export async function generateMetadata({
  params,
}: Pick<PageProps, "params">): Promise<Metadata> {
  const { token } = await params;
  const data = await load(token);
  if (!data) {
    return {
      title: { absolute: "Match report · Advantage" },
      robots: { index: false, follow: false },
    };
  }
  const { match } = data;
  const title = `${match.player1.name} vs ${match.player2.name} · Advantage`;
  const score = formatScoreText(playedSets(match.score.sets));
  const description = [score, match.date, match.tournamentName]
    .filter((part) => part && part.trim())
    .join(" · ");
  return {
    title: { absolute: title },
    description,
    robots: { index: false, follow: false },
    openGraph: { title, description, type: "article" },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function SharedMatchPage({
  params,
  searchParams,
}: PageProps) {
  const [{ token }, query] = await Promise.all([params, searchParams]);
  const data = await load(token);

  if (!data) {
    return (
      <JoinPane
        width={440}
        eyebrow="Match report"
        title="That link isn't valid"
        body="It may have been turned off by whoever shared it. Ask them for a new one."
      >
        <ClaimActions>
          <Link href="/login" className={CLAIM_BUTTON}>
            Go to Advantage
          </Link>
        </ClaimActions>
      </JoinPane>
    );
  }

  const {
    match,
    statsResult,
    points,
    summary,
    sharedBy,
    includesVisualizations,
    videoShared,
    bandSettings,
  } = data;
  // Signed here and nowhere above: the layout, the metadata and the preview
  // image share `getSharedMatchData` and play nothing. A storage failure costs
  // the Video view, never the report.
  //
  // And only for a match that has points. One still being analysed (or whose
  // analysis failed) can already have a file, but the film room would open on
  // an empty list that says no points were detected — the dashboard never
  // shows that, because it stops at the analysis steps first (guardrails
  // §3.3). No points, no Video row.
  const video =
    videoShared && points.length > 0
      ? await getSharedMatchVideo(match.id).catch((cause) => {
          console.error("[match-share] could not resolve the shared video", {
            matchId: match.id,
            cause,
          });
          return null;
        })
      : null;
  const views = sharedViews(includesVisualizations, video !== null);
  const p1 = statsResult?.statistics?.player1Stats;
  const p2 = statsResult?.statistics?.player2Stats;
  const statsPublished = Boolean(p1 && p2);
  const isDerived = match.sourceProvider === "splitstep";

  return (
    <MatchDataProvider
      key={match.id}
      match={match}
      statsResult={statsResult}
      points={points}
    >
      {/* `MatchReportProvider` reads `useSearchParams`, which needs a
          Suspense boundary above it on a page that is not itself a client
          component. */}
      <Suspense fallback={<MatchReportPending view="statistics" />}>
        {/* The Visualizations view's filters read hands and serve order from
            this context, and the Video view's filters live in it — seeded
            from `?f=` as on the dashboard, so a reload or a forwarded URL
            keeps the cut it names. Statistics takes no filters. */}
        <MatchFiltersProvider initialQuery={query[MATCH_FILTERS_PARAM]}>
          <MatchReportProvider
            matchId={match.id}
            summary={summary}
            canCompare={false}
            isDerived={isDerived}
            statsPublished={statsPublished}
            hasPlayableVideo={video !== null}
            savedViews={[]}
            workspaceRole="player"
            workspaceKind="personal"
            workspaceName=""
            bandSettings={bandSettings}
            views={views}
            canEditBands={false}
            unit="ft"
            defaultView="statistics"
            readOnly
          >
            <MatchReportFrame>
              <MatchReportRail>
                <MatchReportScoreboard />
                {views.length > 1 && <MatchReportViewSwitcher />}
                <MatchReportSpacer />
                <SharedByFooter
                  sharedBy={sharedBy}
                  includesVisualizations={includesVisualizations}
                  includesVideo={video !== null}
                />
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
                {includesVisualizations && (
                  <MatchReportWhen view="shots">
                    <ShotsTab />
                  </MatchReportWhen>
                )}
                {video && (
                  <MatchReportWhen view="film" scrollsInside>
                    <FilmTab
                      video={video}
                      unit="ft"
                      readOnly
                      playbackEndpoint={`/api/share/${encodeURIComponent(token)}/video`}
                    />
                  </MatchReportWhen>
                )}
              </MatchReportPane>
            </MatchReportFrame>
          </MatchReportProvider>
        </MatchFiltersProvider>
      </Suspense>
    </MatchDataProvider>
  );
}
