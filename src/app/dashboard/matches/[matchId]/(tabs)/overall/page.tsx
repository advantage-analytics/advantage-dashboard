"use client";

import { MatchInsights } from "@/components/dashboard/matches/match-insights";
import { MatchStatistics } from "@/components/dashboard/matches/match-statistics";
import { useMatchData } from "@/components/dashboard/matches/match-data-provider";

export default function OverallPage(): React.JSX.Element {
  const { statsResult } = useMatchData();

  return (
    <div className="space-y-6 mb-64">
      <MatchInsights />
      <MatchStatistics
        statistics={statsResult?.statistics ?? null}
        player1Name={statsResult?.player1Name ?? "Player 1"}
        player2Name={statsResult?.player2Name ?? "Player 2"}
      />
    </div>
  );
}
