import { notFound } from "next/navigation";
import dynamic from "next/dynamic";
import { createClient } from "@/lib/supabase/server";
import { reconcileBeforePageRead } from "@/lib/services/splitstep/reconcile";

import { getMatchDetailData } from "@/lib/data/match-detail-server";
import { getSavedViews } from "@/lib/data/saved-views-server";
import { getBandSettings } from "@/lib/data/viz-bands-server";
import { getPreferences } from "@/lib/data/preferences-server";
import { DEFAULT_BANDS } from "@/lib/data/viz-bands";
import { hasComparisonBaseline } from "@/lib/data/match-stats-server";
import { getWorkspaceContext } from "@/lib/workspace/active-workspace-server";
import { canEditBandsFor } from "@/lib/workspace/types";
import {
  isAnalysisFailed,
  isInFlight,
  withStatsPublished,
} from "@/lib/data/match-analysis";
import {
  analysisFor,
  loadMatchAnalysis,
} from "@/lib/data/match-analysis-server";
import { MatchAnalysisProgress } from "@/components/dashboard/matches/match-detail/match-analysis-progress";
import { MarkReportSeen } from "@/components/dashboard/matches/match-detail/mark-report-seen";

// The report's parts, by their named exports rather than the `MatchReport`
// namespace object: this file is a Server Component, and dotting into a
// `"use client"` module's object export from the server throws ("You cannot
// dot into a client module from a server component"). The parts that live in
// their own files are imported from there for the same reason —
// `match-report.tsx` puts them on the object but does not re-export them.
import {
  MatchReportFrame,
  MatchReportPane,
  MatchReportProvider,
  MatchReportRail,
  MatchReportRailFooter,
  MatchReportSpacer,
  MatchReportWhen,
} from "@/components/dashboard/matches/match-detail/match-report";
import { MatchReportScoreboard } from "@/components/dashboard/matches/match-detail/report-scoreboard";
import { MatchReportViewSwitcher } from "@/components/dashboard/matches/match-detail/report-view-switcher";
import {
  MatchReportTitle,
  MatchReportTitleActions,
  MatchReportTitleRow,
} from "@/components/dashboard/matches/match-detail/report-title-row";
import { MatchReportFacts } from "@/components/dashboard/matches/match-detail/report-facts";
import { MatchReportCompareButton } from "@/components/dashboard/matches/match-detail/report-compare-button";
import { MatchReportMoreMenu } from "@/components/dashboard/matches/match-detail/report-more-menu";
import {
  ShareMatchButton,
  ShareRailTrigger,
} from "@/components/dashboard/matches/match-detail/share-match-button";
import { StatisticsView } from "@/components/dashboard/matches/match-detail/statistics-view";
import { getMatchSides } from "@/components/dashboard/matches/match-detail/use-match-sides";
import { getMatchVideo } from "@/lib/data/match-video-server";
import { getMatchFilmEntry } from "@/lib/data/match-film-entry-server";

// Statistics is the default view and loads eagerly with the page; Shots and
// Film are each a substantial subtree (filters, an SVG court, a video
// player) that a visitor landing on Statistics never needs — code-split so
// their JS is fetched only once the view is actually opened.
const ShotsTab = dynamic(() =>
  import("@/components/dashboard/matches/match-detail/shots/shots-tab").then(
    (m) => m.ShotsTab,
  ),
);
const FilmTab = dynamic(() =>
  import("@/components/dashboard/matches/match-detail/film/film-tab").then(
    (m) => m.FilmTab,
  ),
);

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
  // null for every imported match and every video job with no playable file
  // left (neither our upload nor an older vendor copy), which is most of them.
  //
  // `filmEntry` rides along for the same reason and answers what `video`
  // structurally cannot: whether an attachment EXISTS (a null `video` is not
  // the same fact), and which of Add / Replace / Adjust this viewer may take.
  // Both are server decisions — see `match-film-entry-server.ts`.
  // `getWorkspaceContext()` is `cache()`-wrapped and the layout above this
  // page already called it once to gate sign-in, so this rides the same
  // request-scoped result rather than a second query.
  const [data, jobs, video, filmEntry, workspace, preferences] =
    await Promise.all([
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
      getMatchFilmEntry(matchId),
      getWorkspaceContext(),
      getPreferences(),
    ]);
  const unit = preferences.unit;

  if (!data) notFound();

  // The layout above this route already redirects a signed-out visitor to
  // /login before this page ever renders, so `workspace` is only null here
  // if the session expired between the two — treated as a personal-workspace
  // reader with no saved views rather than a 404, since the rest of the page
  // still has everything it needs from `data`.
  const activeWorkspace = workspace?.active ?? null;
  // The least-privileged role, not "owner": this only falls back on a lost
  // session between the layout's own check and here, and `workspaceRole`
  // feeds `canManage(view)` — an authorization input should never default
  // permissively.
  const workspaceRole = activeWorkspace?.role ?? "player";
  // Same fallback shape as `workspaceRole` above — the same lost-session
  // race, and `save-view-dialog.tsx`'s "Share with team" row keys off both:
  // it only renders in a team workspace, so a "personal" default keeps it
  // hidden rather than showing a row that names an empty workspace.
  const workspaceKind = activeWorkspace?.kind ?? "personal";
  const workspaceName = activeWorkspace?.name ?? "";
  // Fix round 1: fed from `activeWorkspace?.kind` directly, NOT the
  // already-defaulted `workspaceKind` above — that default exists so
  // OTHER UI (the "Share with team" row) reads as a quiet personal
  // workspace on a lost session, but feeding it here would make a lost
  // session look like a personal owner and show an ENABLED bands editor
  // whose Save then always fails RLS. `canEditBandsFor` itself reads a
  // missing/unrecognised `kind` as "cannot edit" — restrictive, the same
  // direction `workspaceRole`'s own `?? "player"` fallback already takes.
  const canEditBands = canEditBandsFor(activeWorkspace?.kind, workspaceRole);

  const { match, statsResult, insights, kpiHistory } = data;

  // The single attribution point (guardrails §4): every you/opp decision on
  // this page routes through `getMatchSides`, keyed on `match.isUserPlayer1`.
  const sides = getMatchSides(match, statsResult);

  const userInsights = sides.pick(insights?.player1, insights?.player2);
  // Synthesized prose insight (home-quality), generated once at upload. It
  // reaches the report as `meta.summary` and is drawn by the Statistics view's
  // insight card and nowhere else; a match with no stored insight gets no
  // card, never a stand-in paragraph (spec › Decisions 4).
  const summary = userInsights?.summary?.trim() || null;

  const p1 = statsResult?.statistics?.player1Stats;
  const p2 = statsResult?.statistics?.player2Stats;

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

  // Fetched only once there's a view switcher to show it in — the
  // awaiting-analysis branch below never renders `ShotsTab`, so a match still
  // analysing skips both queries entirely. Run together: neither depends on
  // the other's result.
  const [savedViews, bandSettings] =
    !isAwaitingAnalysis && activeWorkspace
      ? await Promise.all([
          getSavedViews(activeWorkspace.id),
          getBandSettings(activeWorkspace.id),
        ])
      : [[], DEFAULT_BANDS];

  // The rail's foot on both variants: the share popover opening upward from
  // its full-width trigger (F1).
  const share = (
    <MatchReportRailFooter>
      {/* The COMPONENT, not `<ShareRailTrigger />`. This file is a Server
          Component, and an element handed across the RSC boundary into
          `PopoverTrigger asChild` is dropped without a word whenever React
          has not resolved it yet — see `ShareMatchButton`'s `trigger`. */}
      <ShareMatchButton trigger={ShareRailTrigger} side="top" align="start" />
    </MatchReportRailFooter>
  );

  if (isAwaitingAnalysis) {
    // Guardrails §3.3 — the short-circuit gate. The scoreboard renders fine
    // from `match` (the score the player entered); the pane holds the pipeline
    // state and nothing else. No view switcher — there are no views yet — no
    // title row, and no stat section that would draw zeroes
    // (spec › Decisions 9).
    return (
      <MatchReportProvider
        matchId={matchId}
        summary={null}
        canCompare={false}
        isDerived={isDerived}
        statsPublished={false}
        // No view switcher on this branch — ShotsTab never renders — so an
        // empty list here costs nothing and skips fetching saved views before
        // the match even has anything to visualize.
        savedViews={[]}
        workspaceRole={workspaceRole}
        workspaceKind={workspaceKind}
        workspaceName={workspaceName}
        // Same reasoning as `savedViews` above — `ShotsTab` never renders on
        // this branch, so the default is enough and skips the query.
        bandSettings={DEFAULT_BANDS}
        canEditBands={canEditBands}
        unit={unit}
      >
        <MatchReportFrame>
          <MatchReportRail>
            <MatchReportScoreboard />
            <MatchReportSpacer />
            {share}
          </MatchReportRail>
          <MatchReportPane>
            <MatchAnalysisProgress analysis={analysis} matchId={matchId} />
          </MatchReportPane>
        </MatchReportFrame>
      </MatchReportProvider>
    );
  }

  return (
    <>
      <MarkReportSeen matchId={matchId} />
      <MatchReportProvider
        matchId={matchId}
        summary={summary}
        // Compare is drawn only once a second analysed match exists to compare
        // against. `buildKpiHistory` already leaves this match out of the
        // baseline, so a non-empty one is exactly that; `kpiHistory !== null`
        // would be wrong on a first match, whose own stat row keeps the
        // history non-null.
        canCompare={hasComparisonBaseline(kpiHistory)}
        isDerived={isDerived}
        statsPublished={statsPublished}
        savedViews={savedViews}
        workspaceRole={workspaceRole}
        workspaceKind={workspaceKind}
        workspaceName={workspaceName}
        bandSettings={bandSettings}
        canEditBands={canEditBands}
        unit={unit}
      >
        <MatchReportFrame>
          <MatchReportRail>
            <MatchReportScoreboard />
            <MatchReportViewSwitcher />
            <MatchReportSpacer />
            {share}
          </MatchReportRail>

          <MatchReportPane>
            <MatchReportTitleRow>
              {/* `min-w-0` (F1): a long facts line shrinks its block rather
                  than pushing the actions out of the row. */}
              <div className="min-w-0">
                <MatchReportTitle />
                <MatchReportFacts />
              </div>
              <MatchReportTitleActions>
                <MatchReportCompareButton />
                <MatchReportMoreMenu />
              </MatchReportTitleActions>
            </MatchReportTitleRow>

            <MatchReportWhen view="statistics">
              <StatisticsView />
            </MatchReportWhen>
            <MatchReportWhen view="shots">
              <ShotsTab />
            </MatchReportWhen>
            <MatchReportWhen view="film" scrollsInside>
              {/* `video` is the short-lived playback SAS, or null when there
                  is no file to serve. `entry` says which no-video case that
                  is — genuinely none, or a storage problem over a match that
                  has one — and which actions this viewer may take. Points
                  come from `MatchDataProvider`. */}
              <FilmTab video={video} entry={filmEntry} unit={unit} />
            </MatchReportWhen>
          </MatchReportPane>
        </MatchReportFrame>
      </MatchReportProvider>
    </>
  );
}
