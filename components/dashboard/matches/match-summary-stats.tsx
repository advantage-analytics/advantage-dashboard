"use client";

import { getMatchById, getMatchStatistics } from "@/lib/data/match-utils";
import { SummaryStatsRow } from "./statistics/summary-stats-row";

interface MatchSummaryStatsProps {
  matchId: string;
}

export function MatchSummaryStats({ matchId }: MatchSummaryStatsProps) {
  const match = getMatchById(matchId);
  const statistics = getMatchStatistics(matchId);

  if (!match || !statistics) {
    return null;
  }

  const winner =
    match.score.winner === "player1" ? match.player1.name : match.player2.name;

  return (
    <SummaryStatsRow
      totalPoints={statistics.summary.totalPoints}
      durationMinutes={statistics.summary.durationMinutes}
      longestRally={statistics.summary.longestRally}
      winner={winner}
    />
  );
}
