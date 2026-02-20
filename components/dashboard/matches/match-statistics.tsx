"use client";

import { motion } from "framer-motion";
import { getInitials } from "@/lib/data/match-utils";
import type { MatchDetailedStats, PlayerStatistics } from "@/lib/data/types";

/* ── Animation variants (hoisted) ─────────────────────────── */

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.08,
      delayChildren: 0.1,
    },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 8 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.4,
      ease: [0.25, 0.46, 0.45, 0.94] as const,
    },
  },
};

const EASE_CURVE = [0.25, 0.46, 0.45, 0.94] as const;
const BOUNCE_EASE = [0.34, 1.56, 0.64, 1] as const;

/* ── Private sub-components ───────────────────────────────── */

function PlayerComparisonHeader({
  player1Name,
  player2Name,
}: {
  player1Name: string;
  player2Name: string;
}) {
  const player1Initials = getInitials(player1Name);
  const player2Initials = getInitials(player2Name);

  return (
    <motion.div
      className="grid grid-cols-[1fr_auto_1fr] items-center gap-6 pb-4 border-b border-[#E8E8E8]"
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      {/* Player 1 */}
      <motion.div
        className="flex items-center gap-3"
        variants={itemVariants}
      >
        <div className="w-10 h-10 rounded-full bg-[#4A8AF4] flex items-center justify-center">
          <span className="text-xs font-semibold text-white">
            {player1Initials}
          </span>
        </div>
        <div className="flex flex-col">
          <span className="text-sm font-semibold text-[#0D0D0D]">
            {player1Name}
          </span>
          <div className="flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 rounded-full bg-[#4A8AF4]" />
            <span className="text-[10px] font-medium text-[#999999] uppercase tracking-wider">
              Player 1
            </span>
          </div>
        </div>
      </motion.div>

      {/* Center Divider */}
      <motion.div
        className="flex items-center gap-3"
        variants={itemVariants}
      >
        <div className="w-8 h-[1px] bg-[#D9D9D9]" />
        <span className="text-[10px] font-semibold text-[#BBBBBB] tracking-wider">
          VS
        </span>
        <div className="w-8 h-[1px] bg-[#D9D9D9]" />
      </motion.div>

      {/* Player 2 */}
      <motion.div
        className="flex items-center justify-end gap-3"
        variants={itemVariants}
      >
        <div className="flex flex-col items-end">
          <span className="text-sm font-semibold text-[#0D0D0D]">
            {player2Name}
          </span>
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-medium text-[#999999] uppercase tracking-wider">
              Player 2
            </span>
            <div className="w-1.5 h-1.5 rounded-full bg-[#F38439]" />
          </div>
        </div>
        <div className="w-10 h-10 rounded-full bg-[#F38439] flex items-center justify-center">
          <span className="text-xs font-semibold text-white">
            {player2Initials}
          </span>
        </div>
      </motion.div>
    </motion.div>
  );
}

function getTextColor(isLeading: boolean, isTied: boolean, leadingColor: string): string {
  if (isLeading) return leadingColor;
  if (isTied) return "text-[#666666]";
  return "text-[#999999]";
}

function formatValue(value: number, isPercentage: boolean): string {
  return isPercentage ? `${value}%` : value.toString();
}

function StatComparisonBar({
  label,
  player1Value,
  player2Value,
  index,
  isPercentage = false,
}: {
  label: string;
  player1Value: number;
  player2Value: number;
  index: number;
  isPercentage?: boolean;
}): React.JSX.Element {
  const maxValue = Math.max(player1Value, player2Value);
  const player1Percentage = maxValue > 0 ? (player1Value / maxValue) * 100 : 0;
  const player2Percentage = maxValue > 0 ? (player2Value / maxValue) * 100 : 0;

  const player1IsLeading = player1Value > player2Value;
  const player2IsLeading = player2Value > player1Value;
  const isTied = player1Value === player2Value;

  const baseDelay = 0.15 + index * 0.04;
  const barDelay = 0.25 + index * 0.04;
  const dotDelay = 0.6 + index * 0.04;

  return (
    <motion.div
      className="grid grid-cols-[auto_1fr_auto_1fr_auto] items-center gap-2 sm:gap-4 rounded-xl"
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.4, delay: baseDelay, ease: EASE_CURVE }}
    >
      <div className="flex items-center justify-end gap-1 w-10 sm:w-[70px]">
        {player1IsLeading && (
          <motion.div
            className="w-1.5 h-1.5 rounded-full bg-[#4A8AF4] hidden sm:block"
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ duration: 0.3, delay: dotDelay }}
          />
        )}
        <span
          className={`text-xs sm:text-sm font-semibold tabular-nums transition-colors duration-200 text-right ${getTextColor(player1IsLeading, isTied, "text-[#4A8AF4]")}`}
        >
          {formatValue(player1Value, isPercentage)}
        </span>
      </div>

      <div className="flex justify-end min-w-0">
        <div className="relative w-full h-1.5 bg-[#D9D9D9] rounded-full overflow-hidden">
          <motion.div
            className="absolute right-0 h-full bg-[#4A8AF4] rounded-full"
            initial={{ width: 0 }}
            animate={{ width: `${player1Percentage}%` }}
            transition={{ duration: 0.7, delay: barDelay, ease: BOUNCE_EASE }}
          />
        </div>
      </div>

      <div className="flex items-center justify-center w-16 sm:w-[120px]">
        <span className="text-[10px] sm:text-xs font-medium text-[#999999] text-center leading-tight">
          {label}
        </span>
      </div>

      <div className="flex justify-start min-w-0">
        <div className="relative w-full h-1.5 bg-[#D9D9D9] rounded-full overflow-hidden">
          <motion.div
            className="absolute left-0 h-full bg-[#F38439] rounded-full"
            initial={{ width: 0 }}
            animate={{ width: `${player2Percentage}%` }}
            transition={{ duration: 0.7, delay: barDelay, ease: BOUNCE_EASE }}
          />
        </div>
      </div>

      <div className="flex items-center justify-start gap-1 w-10 sm:w-[70px]">
        <span
          className={`text-xs sm:text-sm font-semibold tabular-nums transition-colors duration-200 text-left ${getTextColor(player2IsLeading, isTied, "text-[#F38439]")}`}
        >
          {formatValue(player2Value, isPercentage)}
        </span>
        {player2IsLeading && (
          <motion.div
            className="w-1.5 h-1.5 rounded-full bg-[#F38439] hidden sm:block"
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ duration: 0.3, delay: dotDelay }}
          />
        )}
      </div>
    </motion.div>
  );
}

/* ── Main component ───────────────────────────────────────── */

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

interface MatchStatisticsProps {
  statistics: MatchDetailedStats | null;
  player1Name: string;
  player2Name: string;
}

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
        ease: EASE_CURVE,
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
