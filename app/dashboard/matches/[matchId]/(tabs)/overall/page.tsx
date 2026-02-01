import { MatchInsights } from "@/components/dashboard/matches/match-insights";
import { MatchStatistics } from "@/components/dashboard/matches/match-statistics";

interface OverallPageProps {
  params: Promise<{ matchId: string }>;
}

export default async function OverallPage({
  params,
}: OverallPageProps): Promise<React.JSX.Element> {
  const { matchId } = await params;

  return (
    <div className="space-y-6 mb-64">
      <MatchInsights />
      <MatchStatistics matchId={matchId} />
    </div>
  );
}
