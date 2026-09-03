import { notFound } from "next/navigation";

import { ClearRetryOnSuccess } from "@/components/dashboard/matches/clear-retry-on-success";
import { MatchDataProvider } from "@/components/dashboard/matches/match-data-provider";
import { getMatchDetailData } from "@/lib/data/match-detail-server";

interface MatchLayoutProps {
  children: React.ReactNode;
  params: Promise<{ matchId: string }>;
}

export default async function MatchLayout({
  children,
  params,
}: MatchLayoutProps): Promise<React.JSX.Element> {
  const { matchId } = await params;
  const data = await getMatchDetailData(matchId);

  if (!data) {
    notFound();
  }

  const { match, statsResult, points, keyMoments, insights, playerAverages, kpiHistory } = data;

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
    // `match-detail-shell.tsx`) already carries `min-h-0` correctly; this
    // was the one broken link.
    <div className="flex h-[calc(100vh-var(--header-h))] w-full flex-col overflow-hidden bg-white">
      <MatchDataProvider
        match={match}
        statsResult={statsResult}
        points={points}
        keyMoments={keyMoments}
        insights={insights}
        playerAverages={playerAverages}
        kpiHistory={kpiHistory}
        >
        <ClearRetryOnSuccess matchId={matchId} />
        {children}
      </MatchDataProvider>
    </div>
  );
}
