import { Suspense, useEffect } from "react";
import { createRoot } from "react-dom/client";

import { MatchDataProvider } from "@/components/dashboard/matches/match-data-provider";
import { WorkspaceProvider } from "@/components/dashboard/workspace-provider";
import {
  MatchReportFrame,
  MatchReportPane,
  MatchReportProvider,
  MatchReportRail,
  MatchReportSpacer,
  MatchReportWhen,
} from "@/components/dashboard/matches/match-detail/match-report";
import { MatchReportScoreboard } from "@/components/dashboard/matches/match-detail/report-scoreboard";
import { MatchReportViewSwitcher } from "@/components/dashboard/matches/match-detail/report-view-switcher";
import {
  MatchReportTitle,
  MatchReportTitleRow,
} from "@/components/dashboard/matches/match-detail/report-title-row";
import { MatchReportFacts } from "@/components/dashboard/matches/match-detail/report-facts";
import { StatisticsView } from "@/components/dashboard/matches/match-detail/statistics-view";
import { ShotsTab } from "@/components/dashboard/matches/match-detail/shots/shots-tab";
import { FilmTab } from "@/components/dashboard/matches/match-detail/film/film-tab";
import { MatchFiltersProvider } from "@/components/dashboard/matches/match-detail/match-filters/provider";
import { getMatchSides } from "@/components/dashboard/matches/match-detail/use-match-sides";
import { SampleBanner } from "@/components/dashboard/onboarding/sample-banner";
import { TourRunner } from "@/components/dashboard/onboarding/tour-runner";
import { DEFAULT_BANDS } from "@/lib/data/viz-bands";
import { NO_FILM_ENTRY } from "@/lib/match-video/film-entry";
import {
  SAMPLE_MATCH_ID,
  sampleMatchData,
  sampleMatchVideo,
} from "@/lib/sample-match";
import type { WorkspaceContextValue } from "@/lib/workspace/types";

/**
 * T12: the sample page's client composition, in a real browser, from the
 * committed fixture.
 *
 * `src/app/dashboard/matches/sample/page.tsx` is a Server Component — it
 * reads cookies, the workspace and a `users` column — so it cannot be
 * bundled here. What it renders once those reads are done is mirrored below
 * part for part: the same providers in the same order, the same rail and
 * pane, the same views, the banner first in the pane and the runner after
 * the frame. The data is `sampleMatchData()` and the video `sampleMatchVideo()`,
 * exactly as the page builds them. Keep the two in step.
 *
 * The spec aliases `next/navigation` to the address-bar mock (reads
 * `window.location`, re-reads on `popstate`), so the provider's
 * `history.pushState` is real and the patch below turns each push into a
 * `popstate` so the view switch re-renders. `markTourDone` is a recorder;
 * Supabase, `next/dynamic`, `next/link` and `next/image` are the usual
 * harness stand-ins.
 *
 *   ?tour=1   mount the runner with `start` — the page's `?tour=1`, or a
 *             viewer who has never finished the tour
 */

const params = new URLSearchParams(window.location.search);
const START_TOUR = params.get("tour") === "1";
window.__markTourDoneCalls = [];

for (const method of ["pushState", "replaceState"] as const) {
  const original = window.history[method].bind(window.history);
  window.history[method] = (...args) => {
    original(...args);
    window.dispatchEvent(new PopStateEvent("popstate"));
  };
}

/**
 * A personal workspace: the Film view's point list leads the viewer's own
 * rows with the workspace's mark and throws without a provider. In the app
 * `dashboard/layout.tsx` supplies it. Nothing here asserts on the mark.
 */
const WORKSPACE: WorkspaceContextValue = {
  active: {
    id: "viewer-1",
    kind: "personal",
    name: "Personal",
    team: null,
    orgType: null,
    timeZone: "UTC",
    role: "owner",
    mark: "CG",
    iconUrl: null,
    canSubmitVideo: true,
    programStatus: null,
    playersCanUpload: true,
    memberUploadEnabled: true,
    uploadPolicy: "everyone",
    eventsPolicy: "owner",
    myPlayerId: null,
  },
  available: [],
  viewer: {
    id: "viewer-1",
    email: "viewer@example.com",
    name: "Viewer",
    firstName: "Viewer",
    initials: "CG",
    avatarUrl: null,
    plan: "free",
    role: null,
    memberSince: null,
    onboardedAt: null,
    recordingSource: null,
  },
};

const SAMPLE_PLAYBACK_ENDPOINT = "/api/sample-match/video";

function SampleReport() {
  const data = sampleMatchData();
  const { match, statsResult, points, keyMoments, insights, kpiHistory } = data;
  const video = sampleMatchVideo();

  const sides = getMatchSides(match, statsResult);
  const userInsights = sides.pick(insights?.player1, insights?.player2);
  const summary = userInsights?.summary?.trim() || null;

  const p1 = statsResult?.statistics?.player1Stats;
  const p2 = statsResult?.statistics?.player2Stats;
  const statsPublished = Boolean(p1 && p2);
  const isDerived = match.sourceProvider === "splitstep";

  useEffect(() => {
    document.documentElement.dataset.hydrated = "true";
  }, []);

  return (
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
        <Suspense fallback={null}>
          <MatchFiltersProvider initialQuery={params.get("f") ?? undefined}>
            <MatchReportProvider
              matchId={SAMPLE_MATCH_ID}
              summary={summary}
              canCompare={false}
              isDerived={isDerived}
              statsPublished={statsPublished}
              foldUnreconciled={data.foldUnreconciled}
              hasPlayableVideo
              defaultView="statistics"
              savedViews={[]}
              workspaceRole="player"
              workspaceKind="personal"
              workspaceName=""
              bandSettings={DEFAULT_BANDS}
              canEditBands={false}
              unit="ft"
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
                    <FilmTab video={video} entry={NO_FILM_ENTRY} unit="ft" />
                  </MatchReportWhen>
                </MatchReportPane>
              </MatchReportFrame>
              <TourRunner
                tour="sample"
                viewerId={WORKSPACE.viewer.id}
                start={START_TOUR}
                requested={START_TOUR}
              />
            </MatchReportProvider>
          </MatchFiltersProvider>
        </Suspense>
      </MatchDataProvider>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <WorkspaceProvider value={WORKSPACE}>
    <SampleReport />
  </WorkspaceProvider>,
);
