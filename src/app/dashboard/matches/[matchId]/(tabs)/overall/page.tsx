"use client";

import { MatchStatistics } from "@/components/dashboard/matches/match-statistics";
import { PerformanceTracker } from "@/components/dashboard/matches/performance-tracker";
import { useMatchData } from "@/components/dashboard/matches/match-data-provider";

export default function OverallPage(): React.JSX.Element {
  const { statsResult, points } = useMatchData();

  return (
    <div className="space-y-6 mb-64">
      <MatchStatistics
        statistics={statsResult?.statistics ?? null}
        player1Name={statsResult?.player1Name ?? "Player 1"}
        player2Name={statsResult?.player2Name ?? "Player 2"}
      />
      <PerformanceTracker
        points={points}
        player1Name={statsResult?.player1Name ?? "Player 1"}
        player2Name={statsResult?.player2Name ?? "Player 2"}
      />
    </div>
  );
}
