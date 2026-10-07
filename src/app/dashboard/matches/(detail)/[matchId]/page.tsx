import { notFound } from "next/navigation";
import type { Metadata } from "next";
import dynamic from "next/dynamic";
import { createClient } from "@/lib/supabase/server";
import { reconcileBeforePageRead } from "@/lib/services/splitstep/reconcile";

import { getMatchDetailData } from "@/lib/data/match-detail-server";
import { getMatchShareState } from "@/lib/data/match-share-server";
import { getSavedViews } from "@/lib/data/saved-views-server";
import { getBandSettings } from "@/lib/data/viz-bands-server";
import { getPreferences } from "@/lib/data/preferences-server";
import { DEFAULT_BANDS } from "@/lib/data/viz-bands";
import { hasComparisonBaseline } from "@/lib/data/match-stats-server";
import { getWorkspaceContext } from "@/lib/workspace/active-workspace-server";
import { canEditBandsFor } from "@/lib/workspace/types";
import {
  isStatsUnavailable,
  matchPageKind,
  withStatsPublished,
} from "@/lib/data/match-analysis";
import {
  analysisFor,
  loadMatchAnalysis,
} from "@/lib/data/match-analysis-server";
import { AnalysisSteps } from "@/components/dashboard/matches/match-detail/analysis-steps-column";
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
import { resolveDefaultView } from "@/components/dashboard/matches/match-detail/report-view";
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
import { MatchFiltersProvider } from "@/components/dashboard/matches/match-detail/match-filters/provider";
import { MATCH_FILTERS_PARAM } from "@/components/dashboard/matches/match-detail/match-filters/model";
import {
  FilmPanePending,
  VisualizationsPanePending,
} from "@/components/dashboard/loading/match-report-pending";
import { getMatchSides } from "@/components/dashboard/matches/match-detail/use-match-sides";
import { playedSets } from "@/lib/ui/score-format";
import { getMatchVideo } from "@/lib/data/match-video-server";
import { getMatchFilmEntry } from "@/lib/data/match-film-entry-server";
import { countFinishedMatchesFor } from "@/lib/data/finished-match-count-server";
import { firstReportTourEligible } from "@/lib/onboarding/tours";
import { TourRunner } from "@/components/dashboard/onboarding/tour-runner";

// Statistics is the default view and loads eagerly with the page; Shots and
// Film are each a substantial subtree (filters, an SVG court, a video
// player) that a visitor landing on Statistics never needs — code-split so
// their JS is fetched only once the view is actually opened.
// Each carries its pane's skeleton as the chunk fallback: the first click on
// a view otherwise paints nothing at all while its JS downloads. The
// Visualizations fallback draws the wall — the focused court is a `?cut=`
// deep link, and the chunk is sub-second either way.
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

interface PageProps {
  params: Promise<{ matchId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

// `getMatchDetailData` is `cache()`d, so the layout and page reads this shares
// cost no extra query. A match the viewer cannot see falls back to the section name.
export async function generateMetadata({
  params,
}: Pick<PageProps, "params">): Promise<Metadata> {
  const { matchId } = await params;
  // A transient read error must not take the page down for the sake of a tab
  // label: the layout and page own that failure and route it to `error.tsx`.
  const data = await getMatchDetailData(matchId).catch(() => null);
  if (!data) return { title: "Match" };
  return { title: `${data.match.player1.name} vs ${data.match.player2.name}` };
}

export default async function MatchDetailPage({
  params,
  searchParams,
}: PageProps) {
  const [{ matchId }, query] = await Promise.all([params, searchParams]);
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
  // `shareState` rides the same wave: one RLS-scoped row and one permission
  // check, and nothing else here depends on them. No link for every match
  // with sharing off; `canShare` false for a viewer who may see the match
  // but not publish it.
  const [data, jobs, video, filmEntry, workspace, preferences, shareState] =
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
      getMatchShareState(matchId),
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
  // The one failure that does NOT stop the page — a `derivation_failed` our
  // derivation deterministically refused (`stats_unavailable`) — and the gate
  // itself are decided by `match-analysis.ts`'s shared predicates, not here, so
  // the route's skeleton (via `match-page-hint-server.ts`) and this page answer
  // from one function (guardrails §3.2/§3.3). Fed this page's own
  // post-reconcile `analysis`: the hint is a skeleton's guess, never this gate's
  // input. The layout's hint is read before this page's reap/reconcile, so a
  // stale hint can change only which skeleton flashes, never what the page
  // renders. A stats-unavailable match renders like any other and the Statistics
  // view says, once, that no statistics were saved (`meta.statsUnavailable`).
  const statsUnavailable = isStatsUnavailable(analysis);
  const isAwaitingAnalysis = matchPageKind(analysis) === "steps";

  // A failed points read is "no answer", not a match with no points: rendering
  // on would draw a zero-point report that looks like a real one. Thrown here,
  // not in the loader or the layout, because `error.tsx` does not wrap this
  // segment's own layout — this is the throw that reaches its retry surface.
  // A match still analysing renders no points, so that branch never throws.
  if (data.points === null && !isAwaitingAnalysis) {
    throw new Error(`Failed to load points for match ${matchId}`);
  }

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
      <ShareMatchButton
        trigger={ShareRailTrigger}
        side="top"
        align="start"
        share={shareState}
      />
    </MatchReportRailFooter>
  );

  if (isAwaitingAnalysis) {
    // Guardrails §3.3 — the short-circuit gate. The page is the upload
    // wizard's final screen: a centred, card-free column with the title, the
    // match line and the stepper, under the app chrome alone. No rail, no view
    // switcher — there are no views yet — no title row, and no stat section
    // that would draw zeroes (spec › Decisions 9). The report and its rail
    // return once the stats are ready.
    //
    // The match line is oriented by `sides` (guardrails §4), never by raw
    // player1/player2: the viewer's side first, sets already you-first, and the
    // result from the viewer's seat. `match.won` is what the scoreboard shows;
    // a score whose played sets are level decides nobody — a stopped or
    // unfinished match — and gets no result word, as the wizard's own line.
    const lineSets = playedSets(sides.sets);
    const setsYou = lineSets.filter((s) => s.player1 > s.player2).length;
    const setsOpp = lineSets.filter((s) => s.player2 > s.player1).length;
    // Cancel and resend belong to whoever submitted the job: their routes
    // answer everyone else "Job not found", so no one else is offered them.
    // A lost session (no workspace) or a job with no creator reads as false.
    const canAct =
      analysis.createdBy !== undefined &&
      analysis.createdBy === workspace?.viewer.id;
    return (
      <AnalysisSteps
        analysis={analysis}
        canAct={canAct}
        matchId={matchId}
        match={{
          player: sides.you.name,
          opponent: sides.opp.name,
          won: setsYou === setsOpp ? null : match.won,
          sets: lineSets,
        }}
      />
    );
  }

  // The first-report tour (design §8): offered once, on the first report a
  // personal player can read of a match they filed themselves. Decided here,
  // below the short-circuit, because a match still analysing has no report
  // to tour and must not spend these reads. The two facts the pure rule
  // cannot know — how many finished matches the viewer has, and whether they
  // already saw the tour — are read only when the cheaper facts already
  // allow it: a team workspace, a lost session, or a match somebody else
  // filed answers "no" without a query. Both reads are RLS-scoped through
  // the cookie client. A failed read means no tour, never a failed page:
  // the report is the thing, the tour is a courtesy over it.
  const viewerId = workspace?.viewer.id ?? null;
  const isCreator = viewerId !== null && match.createdBy === viewerId;
  let firstReportTour = false;
  if (activeWorkspace?.kind === "personal" && viewerId && isCreator) {
    const [finishedMatchCount, doneAt] = await Promise.all([
      countFinishedMatchesFor(viewerId),
      createClient().then(async (supabase) => {
        const { data: row, error } = await supabase
          .from("users")
          .select("first_report_tour_done_at")
          .eq("id", viewerId)
          .single();
        if (error) throw error;
        return (row.first_report_tour_done_at as string | null) ?? null;
      }),
    ]).catch((cause: unknown) => {
      console.error("[first-report tour] eligibility read failed", cause);
      return [0, null] as const;
    });
    firstReportTour = firstReportTourEligible({
      workspaceKind: "personal",
      isCreator,
      finishedMatchCount,
      doneAt,
    });
  }

  return (
    <>
      <MarkReportSeen matchId={matchId} />
      {/* The applied match filters sit ABOVE the view switch
          (`MatchReportWhen` unmounts an inactive view), so they survive a
          trip to another view and back. Seeded from `?f=` as read here, on
          the server, so the first client render matches this one. */}
      <MatchFiltersProvider initialQuery={query[MATCH_FILTERS_PARAM]}>
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
          statsUnavailable={statsUnavailable}
          foldUnreconciled={data.foldUnreconciled}
          hasPlayableVideo={Boolean(video)}
          // "Match report opens at" (Settings › Preferences), clamped to an
          // available view.
          defaultView={resolveDefaultView(
            preferences.matchReportOpensAt,
            Boolean(video),
          )}
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
          {/* After the frame, inside the provider: the runner reads
              `useMatchReport()` to switch views and finds the `[data-tour]`
              targets the report above has rendered. Mounted only when
              eligible, so every other render carries nothing of it. */}
          {firstReportTour && <TourRunner tour="first-report" start />}
        </MatchReportProvider>
      </MatchFiltersProvider>
    </>
  );
}
