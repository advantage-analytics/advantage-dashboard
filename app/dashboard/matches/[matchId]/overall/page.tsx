import { MatchStatistics } from "@/components/dashboard/matches/match-statistics";
import { MatchInsights } from "@/components/dashboard/matches/match-insights";

interface OverallPageProps {
  params: Promise<{ matchId: string }>;
}

export default async function OverallPage({ params }: OverallPageProps) {
  const { matchId } = await params;

  return (
    <div className="space-y-6 mb-64">
      {/* Summary Stats */}
      {/* <MatchSummaryStats matchId={matchId} /> */}

      {/* Insights */}
      <MatchInsights matchId={matchId} />

      {/* Statistics */}
      <MatchStatistics matchId={matchId} />
    </div>
  );
}
