"use client";

import { motion } from "framer-motion";
import { PlayerComparisonHeader } from "./statistics/player-comparison-header";
import { StatComparisonBar } from "./statistics/stat-comparison-bar";
import type { MatchDetailedStats, PlayerStatistics } from "@/lib/data/types";

interface MatchStatisticsProps {
  statistics: MatchDetailedStats | null;
  player1Name: string;
  player2Name: string;
}

interface StatConfig {
  key: keyof PlayerStatistics;
  label: string;
  isPercentage?: boolean;
}

const statsConfig: StatConfig[] = [
  { key: "aces", label: "Aces" },
  { key: "doubleFaults", label: "Double Faults" },
  { key: "firstServeInPct", label: "First Serve In %", isPercentage: true },
  { key: "firstServeWinPct", label: "First Serve Win %", isPercentage: true },
  { key: "secondServeWinPct", label: "Second Serve Win %", isPercentage: true },
  { key: "breakpointsWon", label: "Breakpoints Won" },
  { key: "tiebreaksWon", label: "Tiebreaks Won" },
  { key: "servicePointsWon", label: "Service Points Won" },
  { key: "serviceGamesWon", label: "Service Games Won" },
  { key: "returnPointsWon", label: "Return Points Won" },
  { key: "returnGamesWon", label: "Return Games Won" },
];

export function MatchStatistics({
  statistics,
  player1Name,
  player2Name,
}: MatchStatisticsProps) {
  if (!statistics) {
    return (
      <div className="bg-white p-6 rounded-2xl">
        <h2 className="text-lg font-medium text-[#000000] mb-6">Statistics</h2>
        <p className="text-sm font-normal text-[#999999] text-center">
          Statistics not available for this match.
        </p>
      </div>
    );
  }

  return (
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
        player1Name={player1Name}
        player2Name={player2Name}
      />

      <div className="mt-6 space-y-6">
        {statsConfig.map((stat, index) => (
          <StatComparisonBar
            key={stat.key}
            label={stat.label}
            player1Value={statistics.player1Stats[stat.key]}
            player2Value={statistics.player2Stats[stat.key]}
            index={index}
            isPercentage={stat.isPercentage}
          />
        ))}
      </div>
    </motion.div>
  );
}
