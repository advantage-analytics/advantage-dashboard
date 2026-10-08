import { Suspense } from "react";
import type { Metadata } from "next";
import dynamic from "next/dynamic";

import { createClient } from "@/lib/supabase/server";
import { getWorkspaceContext } from "@/lib/workspace/active-workspace-server";
import { getPreferences } from "@/lib/data/preferences-server";
import { DEFAULT_BANDS } from "@/lib/data/viz-bands";
import {
  SAMPLE_MATCH_ID,
  sampleMatchData,
  sampleMatchVideo,
} from "@/lib/sample-match";
import { NO_FILM_ENTRY } from "@/lib/match-video/film-entry";

import { MatchDataProvider } from "@/components/dashboard/matches/match-data-provider";
// By their named exports, not the `MatchReport` object — this is a Server
// Component, and dotting into a `"use client"` module's object export throws
// on the server. Same reason as `(detail)/[matchId]/page.tsx`.
import {
  MatchReportFrame,
  MatchReportPane,
  MatchReportProvider,
  MatchReportRail,
  MatchReportSpacer,
  MatchReportWhen,
} from "@/components/dashboard/matches/match-detail/match-report";
import { resolveDefaultView } from "@/components/dashboard/matches/match-detail/report-view";
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
  VisualizationsPanePending,
} from "@/components/dashboard/loading/match-report-pending";
import { MatchReportSkeleton } from "@/components/dashboard/loading/match-report-skeleton";
import { SampleBanner } from "@/components/dashboard/onboarding/sample-banner";
import { TourRunner } from "@/components/dashboard/onboarding/tour-runner";

/**
 * The sample match (`/dashboard/matches/sample`): an anonymised, bundled
 * report a new player can read and tour before their own exists.
 *
 * The same report as `(detail)/[matchId]/page.tsx`'s full-report branch,
 * built from the same parts — the rail scoreboard and view switcher, the
 * title row, the Statistics, Visualizations and Video views — over
 * `MatchReportProvider readOnly sample`. What differs is where the data comes
 * from and what is left out:
 *
 * - **Data.** `sampleMatchData()` (`src/lib/sample-match`), a committed
 *   fixture whose placeholder ids name no row. Nothing here reads `matches`,
 *   `processing_jobs`, saved views or bands, and the page never calls
 *   `getMatchDetailData()`; the video is `sampleMatchVideo()`, renewed through
 *   `GET /api/sample-match/video` (`playbackEndpoint`) rather than the match's
 *   own route. The analysis short-circuit, the reconcile-before-read and the
 *   failed-points throw have no equivalent: a static fixture is always a
 *   finished match with its points.
 * - **Chrome.** No Share footer, no title-row actions (Compare, the More
 *   menu with Review score and Delete): under `readOnly` each of those parts
 *   returns `null`, and `MatchReportTitleActions` would still draw its
 *   wrapper around nothing — so the cluster is left out, as `/m/[token]`
 *   leaves it out. No `MarkReportSeen` (no row to mark). `SampleBanner` sits
 *   at the top of the pane instead, so nobody mistakes this for their data.
 * - **Layout.** This static segment sits outside `(detail)`, so the detail
 *   layout's fixed-height box and `MatchDataProvider` are provided here. The
 *   `[matchId]` layout's status hint, its skeleton choice and
 *   `ClearRetryOnSuccess` are all about a match that may still be analysing
 *   or may have failed, which the fixture cannot be.
 *
 * The tour (`TourRunner tour="sample"`) opens when the URL asks for it
 * (`?tour=1`) or the viewer has never finished it (`users.sample_tour_done_at`
 * is null) — and only in a personal workspace. A team workspace reaching the
 * URL renders the same read-only report with no tour: no entry point links a
 * team here, and the tour's "you" is a solo player's. A failed read of the
 * column is treated as "unknown", not as "never seen": only `?tour=1` opens
 * it then, so a transient error cannot push the tour at someone who already
 * dismissed it. The report is the thing; the tour is a courtesy over it.
 *
 * `robots: noindex` — a signed-in page carrying a fixture, not content.
 */
export const metadata: Metadata = {
  title: "Sample match",
  robots: { index: false, follow: false },
};

// Statistics loads eagerly; Shots and Film are code-split exactly as the
// match page splits them, each behind its pane's skeleton.
const ShotsTab = dynamic(
  () =>
    import("@/components/dashboard/matches/match-detail/shots/shots-tab").then(
      (m) => m.ShotsTab,
    ),
  { loading: () => <VisualizationsPanePending /> },
);
const FilmTab = dynamic(
  () =>
    import("@/components/dashboard/matches/match-detail/film/film-tab").then(
      (m) => m.FilmTab,
    ),
  { loading: () => <FilmPanePending /> },
);

/** Where the Video view renews the sample clip's playback credential. */
const SAMPLE_PLAYBACK_ENDPOINT = "/api/sample-match/video";

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/**
 * `users.sample_tour_done_at` for the viewer, through the cookie client (the
 * row's own-row RLS). `undefined` is "could not read" — distinct from `null`,
 * "never finished" — and the caller treats it as not knowing.
 */
async function readSampleTourDoneAt(
  viewerId: string,
): Promise<string | null | undefined> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("users")
      .select("sample_tour_done_at")
      .eq("id", viewerId)
      .maybeSingle();
    if (error) throw error;
    return (data?.sample_tour_done_at as string | null | undefined) ?? null;
  } catch (cause) {
    console.error("[sample tour] seen-state read failed", cause);
    return undefined;
  }
}

export default async function SampleMatchPage({ searchParams }: PageProps) {
  // `getWorkspaceContext()` is `cache()`-wrapped and the dashboard layout has
  // already called it to gate sign-in, so this is the same request-scoped
  // result. Preferences ride beside it: the Units setting and "Match report
  // opens at" are the viewer's and apply to the sample as to any report.
  const [query, workspace, preferences] = await Promise.all([
    searchParams,
    getWorkspaceContext(),
    getPreferences(),
  ]);

  const data = sampleMatchData();
  const { match, statsResult, points, keyMoments, insights, kpiHistory } = data;
  const video = sampleMatchVideo();

  // The single attribution point (guardrails §4): every you/opp decision
  // routes through `getMatchSides`, keyed on `match.isUserPlayer1` — which
  // the anonymiser pinned to seat one.
  const sides = getMatchSides(match, statsResult);
  const userInsights = sides.pick(insights?.player1, insights?.player2);
  const summary = userInsights?.summary?.trim() || null;

  const p1 = statsResult?.statistics?.player1Stats;
  const p2 = statsResult?.statistics?.player2Stats;
  const statsPublished = Boolean(p1 && p2);
  const isDerived = match.sourceProvider === "splitstep";

  // The tour: personal workspaces only; then the URL's ask, or never seen.
  // The column is read only when the cheaper fact already allows it.
  const activeWorkspace = workspace?.active ?? null;
  const viewerId = workspace?.viewer.id ?? null;
  const tourAsked = query.tour === "1";
  let startTour = false;
  if (activeWorkspace?.kind === "personal" && viewerId) {
    const sampleTourDoneAt = tourAsked
      ? null
      : await readSampleTourDoneAt(viewerId);
    startTour = tourAsked || sampleTourDoneAt === null;
  }

  return (
    // The same bounded box `(detail)/[matchId]/layout.tsx` draws: the rail
    // and the pane scroll independently only inside a fixed height, and this
    // segment is outside that layout.
    <div className="flex h-[calc(100vh-var(--header-h))] w-full flex-col overflow-hidden bg-white">
      <MatchDataProvider
        key={match.id}
        match={match}
        statsResult={statsResult}
        points={points}
        keyMoments={keyMoments}
        insights={insights}
        kpiHistory={kpiHistory}
      >
        {/* `MatchReportProvider` reads `useSearchParams`, which wants a
            Suspense boundary above it on a page that is not itself a client
            component; the `[matchId]` layout's boundary is not above this
            segment, so the report's own skeleton stands in. */}
        <Suspense fallback={<MatchReportSkeleton />}>
          {/* The applied match filters sit ABOVE the view switch, seeded from
              `?f=` as read here, so the first client render matches this one. */}
          <MatchFiltersProvider initialQuery={query[MATCH_FILTERS_PARAM]}>
            <MatchReportProvider
              matchId={SAMPLE_MATCH_ID}
              summary={summary}
              // No other match of "yours" to compare against.
              canCompare={false}
              isDerived={isDerived}
              statsPublished={statsPublished}
              foldUnreconciled={data.foldUnreconciled}
              hasPlayableVideo
              defaultView={resolveDefaultView(
                preferences.matchReportOpensAt,
                true,
              )}
              // The least-privileged shape, as `/m/[token]` passes: nothing
              // on the sample is the viewer's to save, share or edit, and
              // `readOnly` turns every writer off regardless.
              savedViews={[]}
              workspaceRole="player"
              workspaceKind="personal"
              workspaceName=""
              bandSettings={DEFAULT_BANDS}
              canEditBands={false}
              unit={preferences.unit}
              readOnly
              sample
              playbackEndpoint={SAMPLE_PLAYBACK_ENDPOINT}
            >
              <MatchReportFrame>
                <MatchReportRail>
                  <MatchReportScoreboard />
                  <MatchReportViewSwitcher />
                  <MatchReportSpacer />
                </MatchReportRail>

                <MatchReportPane>
                  <SampleBanner />

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
                  <MatchReportWhen view="film" scrollsInside>
                    {/* `NO_FILM_ENTRY`: no Add / Replace / Align for a clip
                        that is nobody's. Points come from `MatchDataProvider`. */}
                    <FilmTab
                      video={video}
                      entry={NO_FILM_ENTRY}
                      unit={preferences.unit}
                    />
                  </MatchReportWhen>
                </MatchReportPane>
              </MatchReportFrame>
              {/* After the frame, inside the provider: the runner switches
                  views through `useMatchReport()` and anchors on the
                  `[data-tour]` targets the report above has rendered. */}
              <TourRunner tour="sample" start={startTour} />
            </MatchReportProvider>
          </MatchFiltersProvider>
        </Suspense>
      </MatchDataProvider>
    </div>
  );
}
