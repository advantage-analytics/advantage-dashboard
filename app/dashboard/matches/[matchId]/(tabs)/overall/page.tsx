import { MatchInsights } from "@/components/dashboard/matches/match-insights";
import { MatchStatistics } from "@/components/dashboard/matches/match-statistics";
import { getMatchStatisticsFromSupabase } from "@/lib/data/match-stats-server";

interface OverallPageProps {
  params: Promise<{ matchId: string }>;
}

export default async function OverallPage({
  params,
}: OverallPageProps): Promise<React.JSX.Element> {
  const { matchId } = await params;
  const result = await getMatchStatisticsFromSupabase(matchId);

  return (
    <div className="space-y-6 mb-64">
      <MatchInsights />
      <MatchStatistics
        statistics={result?.statistics ?? null}
        player1Name={result?.player1Name ?? "Player 1"}
        player2Name={result?.player2Name ?? "Player 2"}
      />
    </div>
  );
}
