"use client";

import { MatchStatistics } from "@/components/dashboard/matches/match-statistics";
import { useMatchData } from "@/components/dashboard/matches/match-data-provider";

export function MatchStatisticsWidget() {
  const { statsResult } = useMatchData();

  return (
    <MatchStatistics
      statistics={statsResult?.statistics ?? null}
      player1Name={statsResult?.player1Name ?? "Player 1"}
      player2Name={statsResult?.player2Name ?? "Player 2"}
    />
  );
}
