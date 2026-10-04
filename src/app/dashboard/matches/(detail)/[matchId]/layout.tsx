import { Suspense } from "react";
import { notFound } from "next/navigation";

import { AnalysisStepsPending } from "@/components/dashboard/loading/analysis-steps-pending";
import { MatchReportSkeleton } from "@/components/dashboard/loading/match-report-skeleton";
import { ClearRetryOnSuccess } from "@/components/dashboard/matches/clear-retry-on-success";
import { MatchDataProvider } from "@/components/dashboard/matches/match-data-provider";
import { getMatchDetailData } from "@/lib/data/match-detail-server";
import { getMatchPageHint } from "@/lib/data/match-page-hint-server";

interface MatchLayoutProps {
  children: React.ReactNode;
  params: Promise<{ matchId: string }>;
}

/**
 * Two waits, two skeletons. The first is a cheap status hint (one RLS-scoped
 * `matches` row plus its jobs), covered by `(detail)/loading.tsx`'s neutral
 * page ground — a `loading.tsx` never wraps the layout beside it, so that is
 * the nearest boundary. The hint then picks the skeleton for the second, far
 * longer wait — the whole match — so an analysing match flashes the Analysis
 * steps column it resolves to rather than a report it will never draw.
 *
 * The hint is a guess, read before `page.tsx`'s reap/reconcile: it can only
 * change which skeleton flashes. The page gates on its own reconciled read.
 */
export default async function MatchLayout({
  children,
  params,
}: MatchLayoutProps): Promise<React.JSX.Element> {
  const { matchId } = await params;
  const hint = await getMatchPageHint(matchId);

  // Before the Suspense boundary below, as the streaming guide advises. The group
  // `loading.tsx` has already committed the response to 200 by now, so this is
  // a not-found render rather than a status code either way — but a match the
  // viewer cannot see never reaches the match loader.
  if (!hint) {
    notFound();
  }

  return (
    // A self-contained fixed-height box, not a `flex-1`/`min-h-0` relay: the
    // round-46 two-pane page needs a bounded height to scroll its rail and
    // content pane independently, and `dashboard-shell.tsx`'s `<main>` /
    // `page-transition.tsx` (shared by every dashboard route) don't pass one
    // through — they let a tall page grow and have the ancestor scroll it as
    // a whole, which is what every OTHER dashboard page relies on today.
    // Threading `min-h-0` through those shared components instead would
    // change that scroll behavior for every route built on `EventShell`
    // (schedule create/detail pages), which already sets its own bounded
    // `overflow-y-auto` and would suddenly start clipping/pinning where it
    // doesn't today. `calc(100vh-var(--header-h))` + `overflow-hidden` sizes
    // this subtree from the viewport directly, independent of that chain —
    // same pattern as `new-match-wizard/UploadMatchFlow.tsx`'s
    // `min-h-[calc(100vh-44px)]`. Everything below this div (see
    // `MatchReport.Frame` in `match-report.tsx`) already carries `min-h-0`
    // correctly; this was the one broken link. The skeletons fill it too:
    // `PendingFrame` is `flex-1` in this flex column.
    <div className="flex h-[calc(100vh-var(--header-h))] w-full flex-col overflow-hidden bg-white">
      <Suspense
        fallback={
          hint.kind === "steps" ? (
            <AnalysisStepsPending />
          ) : (
            <MatchReportSkeleton />
          )
        }
      >
        <MatchData matchId={matchId}>{children}</MatchData>
      </Suspense>
    </div>
  );
}

/**
 * The match load, inside the layout's `<Suspense>` so its skeleton streams
 * while it runs. Still rendered BY the layout, so a throw here routes to the
 * same error boundary as before (`error.tsx` does not wrap this segment's own
 * layout). `getMatchDetailData` is `cache()`-wrapped: `page.tsx`'s call shares
 * this one's fetch.
 */
async function MatchData({
  matchId,
  children,
}: {
  matchId: string;
  children: React.ReactNode;
}): Promise<React.JSX.Element> {
  const data = await getMatchDetailData(matchId);

  if (!data) {
    notFound();
  }

  const { match, statsResult, points, keyMoments, insights, kpiHistory } = data;

  return (
    <MatchDataProvider
      // The provider now holds the points array the film tab's bookmark
      // toggle writes into, so it must NOT carry one match's saved flags
      // into another: React would otherwise keep this instance's state when
      // only the `[matchId]` param changes.
      key={match.id}
      match={match}
      statsResult={statsResult}
      // `null` is a failed points read; `page.tsx` throws on it so the
      // error boundary replaces the page, and the provider never sees it.
      points={points ?? []}
      keyMoments={keyMoments}
      insights={insights}
      kpiHistory={kpiHistory}
    >
      <ClearRetryOnSuccess matchId={matchId} />
      {children}
    </MatchDataProvider>
  );
}
