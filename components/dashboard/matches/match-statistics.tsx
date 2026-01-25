"use client";

import { motion } from "framer-motion";
import { getMatchById, getMatchStatistics } from "@/lib/data/match-utils";
import { SummaryStatsRow } from "./statistics/summary-stats-row";
import { PlayerComparisonHeader } from "./statistics/player-comparison-header";
import { StatComparisonBar } from "./statistics/stat-comparison-bar";

interface MatchStatisticsProps {
  matchId: string;
}

interface StatConfig {
  key: string;
  label: string;
  player1Key: keyof typeof playerStatsKeys;
  isPercentage?: boolean;
}

const playerStatsKeys = {
  aces: "aces",
  doubleFaults: "doubleFaults",
  firstServePercentage: "firstServePercentage",
  breakpointsWon: "breakpointsWon",
  tiebreaksWon: "tiebreaksWon",
  servicePointsWon: "servicePointsWon",
  serviceGamesWon: "serviceGamesWon",
  returnPointsWon: "returnPointsWon",
  returnGamesWon: "returnGamesWon",
} as const;

const statsConfig: StatConfig[] = [
  { key: "aces", label: "Aces", player1Key: "aces" },
  { key: "doubleFaults", label: "Double Faults", player1Key: "doubleFaults" },
  {
    key: "firstServePercentage",
    label: "First Serve %",
    player1Key: "firstServePercentage",
    isPercentage: true,
  },
  {
    key: "breakpointsWon",
    label: "Breakpoints Won",
    player1Key: "breakpointsWon",
  },
  { key: "tiebreaksWon", label: "Tiebreaks Won", player1Key: "tiebreaksWon" },
  {
    key: "servicePointsWon",
    label: "Service Points Won",
    player1Key: "servicePointsWon",
  },
  {
    key: "serviceGamesWon",
    label: "Service Games Won",
    player1Key: "serviceGamesWon",
  },
  {
    key: "returnPointsWon",
    label: "Return Points Won",
    player1Key: "returnPointsWon",
  },
  {
    key: "returnGamesWon",
    label: "Return Games Won",
    player1Key: "returnGamesWon",
  },
];

export function MatchStatistics({ matchId }: MatchStatisticsProps) {
  const match = getMatchById(matchId);
  const statistics = getMatchStatistics(matchId);

  if (!match || !statistics) {
    return (
      <div className="bg-white p-6 rounded-2xl">
        <h2 className="text-lg font-medium text-[#000000] mb-6">Statistics</h2>
        <p className="text-sm font-normal text-[#999999] text-center">
          Statistics not available for this match.
        </p>
      </div>
    );
  }

  const winner =
    match.score.winner === "player1" ? match.player1.name : match.player2.name;

  return (
    <div className="space-y-6">
      {/* Summary Stats Row */}
      <SummaryStatsRow
        totalPoints={statistics.summary.totalPoints}
        durationMinutes={statistics.summary.durationMinutes}
        longestRally={statistics.summary.longestRally}
        winner={winner}
      />

      {/* Player Comparison Section */}
      <motion.div
        className="bg-white p-6 rounded-2xl"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{
          duration: 0.5,
          delay: 0.3,
          ease: [0.25, 0.46, 0.45, 0.94],
        }}
      >
        <PlayerComparisonHeader
          player1Name={match.player1.name}
          player2Name={match.player2.name}
        />

        <div className="mt-6 space-y-4">
          {statsConfig.map((stat, index) => (
            <StatComparisonBar
              key={stat.key}
              label={stat.label}
              player1Value={
                statistics.player1Stats[
                  stat.player1Key as keyof typeof statistics.player1Stats
                ]
              }
              player2Value={
                statistics.player2Stats[
                  stat.player1Key as keyof typeof statistics.player2Stats
                ]
              }
              index={index}
              isPercentage={stat.isPercentage}
            />
          ))}
        </div>
      </motion.div>
    </div>
  );
}
