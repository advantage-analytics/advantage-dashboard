import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { reconcileBeforePageRead } from "@/lib/services/splitstep/reconcile";

import { getMatchDetailData } from "@/lib/data/match-detail-server";
import {
  isAnalysisFailed,
  isInFlight,
  withStatsPublished,
} from "@/lib/data/match-analysis";
import { analysisFor, loadMatchAnalysis } from "@/lib/data/match-analysis-server";
import { MatchAnalysisProgress } from "@/components/dashboard/matches/match-detail/match-analysis-progress";
import { MarkReportSeen } from "@/components/dashboard/matches/match-detail/mark-report-seen";

import { MatchDetailShell } from "@/components/dashboard/matches/match-detail/match-detail-shell";
import { MatchRail } from "@/components/dashboard/matches/match-detail/match-rail";
import { getMatchSides } from "@/components/dashboard/matches/match-detail/use-match-sides";
import { StatisticsTab } from "@/components/dashboard/matches/match-detail/statistics-tab";
import { ServePlacementCard } from "@/components/dashboard/matches/match-detail/serve-placement-card";
import { MatchVideoCard } from "@/components/dashboard/matches/match-detail/match-video-card";
import { getMatchVideo } from "@/lib/data/match-video-server";

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

  const { match, statsResult, points, insights } = data;

  // The single attribution point (guardrails §4): every you/opp decision on
  // this page routes through `getMatchSides`, keyed on `match.isUserPlayer1`.
  const sides = getMatchSides(match, statsResult);

  const userInsights = sides.pick(insights?.player1, insights?.player2);
  // Synthesized prose insight (home-quality), generated once at upload. The
  // rail shows it on every tab but Statistics, where it is the pane's own
  // insight strip instead (artboard 46a).
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
            <StatisticsTab
              matchId={matchId}
              summary={summary}
              statsPublished={statsPublished}
              isDerived={isDerived}
            />
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
