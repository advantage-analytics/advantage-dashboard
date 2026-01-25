import { MatchStatistics } from "@/components/dashboard/matches/match-statistics";
import { MatchInsights } from "@/components/dashboard/matches/match-insights";

interface OverallPageProps {
  params: Promise<{ matchId: string }>;
}

export default async function OverallPage({ params }: OverallPageProps) {
  const { matchId } = await params;

  return (
    <div className="mb-64">
      {/* Statistics */}
      <MatchStatistics matchId={matchId} />

      {/* Insights */}
      <MatchInsights matchId={matchId} />
    </div>
  );
}
