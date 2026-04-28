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

  const { match, statsResult, points, keyMoments, insights, playerAverages } = data;

  return (
    <div className="flex-1 w-full bg-white">
      <MatchDataProvider
        match={match}
        statsResult={statsResult}
        points={points}
        keyMoments={keyMoments}
        insights={insights}
        playerAverages={playerAverages}
        >
        <ClearRetryOnSuccess matchId={matchId} />
        {children}
      </MatchDataProvider>
    </div>
  );
}
