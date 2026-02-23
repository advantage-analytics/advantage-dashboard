"use client";

import { motion } from "framer-motion";
import { shortName } from "@/lib/data/match-utils";
import type { MatchDetailedStats, PlayerStatistics } from "@/lib/data/types";

/* ── Animation constants ─────────────────────────────────── */

const EASE_CURVE = [0.25, 0.46, 0.45, 0.94] as const;

/* ── Stat configuration ──────────────────────────────────── */

interface StatConfig {
  key: keyof PlayerStatistics;
  label: string;
  isPercentage?: boolean;
  lowerIsBetter?: boolean;
}

const statsConfig: StatConfig[] = [
  { key: "aces", label: "Aces" },
  { key: "doubleFaults", label: "Double Faults", lowerIsBetter: true },
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

/* ── Helpers ──────────────────────────────────────────────── */

function formatValue(value: number, isPercentage: boolean): string {
  return isPercentage ? `${value}%` : value.toString();
}

/* ── Stat row ─────────────────────────────────────────────── */

function StatRow({
  label,
  player1Value,
  player2Value,
  index,
  isPercentage = false,
  lowerIsBetter = false,
}: {
  label: string;
  player1Value: number;
  player2Value: number;
  index: number;
  isPercentage?: boolean;
  lowerIsBetter?: boolean;
}) {
  const p1Leads = lowerIsBetter
    ? player1Value < player2Value
    : player1Value > player2Value;
  const p2Leads = lowerIsBetter
    ? player2Value < player1Value
    : player2Value > player1Value;

  const p1Color = p1Leads ? "text-[#4A8AF4] font-semibold" : "text-[#666666]";
  const p2Color = p2Leads ? "text-[#F38439] font-semibold" : "text-[#666666]";

  return (
    <motion.div
      className="grid grid-cols-[1fr_130px_130px] sm:grid-cols-[1fr_150px_150px] items-center border-b border-[#F0F0F0] py-3"
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: 0.12 + index * 0.04, ease: EASE_CURVE }}
    >
      <span className="text-sm text-[#333333]">{label}</span>

      {/* Player 1 value */}
      <div className="text-center">
        <span className={`text-sm tabular-nums ${p1Color}`}>
          {formatValue(player1Value, isPercentage)}
        </span>
        {isPercentage && (
          <div className="mt-1.5 mx-auto w-20 h-1 rounded-full bg-[#F0F0F0] overflow-hidden">
            <motion.div
              className="h-full rounded-full bg-[#4A8AF4]"
              initial={{ width: 0 }}
              animate={{ width: `${player1Value}%` }}
              transition={{ duration: 0.6, delay: 0.3 + index * 0.04, ease: EASE_CURVE }}
            />
          </div>
        )}
      </div>

      {/* Player 2 value */}
      <div className="text-center">
        <span className={`text-sm tabular-nums ${p2Color}`}>
          {formatValue(player2Value, isPercentage)}
        </span>
        {isPercentage && (
          <div className="mt-1.5 mx-auto w-20 h-1 rounded-full bg-[#F0F0F0] overflow-hidden">
            <motion.div
              className="h-full rounded-full bg-[#F38439]"
              initial={{ width: 0 }}
              animate={{ width: `${player2Value}%` }}
              transition={{ duration: 0.6, delay: 0.3 + index * 0.04, ease: EASE_CURVE }}
            />
          </div>
        )}
      </div>
    </motion.div>
  );
}

/* ── Main component ───────────────────────────────────────── */

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
        <h2 className="text-lg font-semibold text-[#0D0D0D] mb-6">
          Head to Head Match Statistics
        </h2>
        <p className="text-sm text-[#999999] text-center">
          Statistics not available for this match.
        </p>
      </div>
    );
  }

  const p1Short = shortName(player1Name, 12);
  const p2Short = shortName(player2Name, 12);

  return (
    <motion.div
      className="bg-white p-6 rounded-2xl"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.3, ease: EASE_CURVE }}
    >
      {/* Section header */}
      <div className="mb-6">
        <h2 className="text-lg font-semibold text-[#0D0D0D]">
          Head to Head Match Statistics
        </h2>
        <p className="text-sm text-[#999999] mt-1">
          {player1Name} vs {player2Name}
        </p>
      </div>

      {/* Section label */}
      <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-[#999999] mb-4">
        Head to Head Statistics
      </p>

      {/* Table header */}
      <div className="grid grid-cols-[1fr_130px_130px] sm:grid-cols-[1fr_150px_150px] border-b border-[#E8E8E8] pb-2 mb-1">
        <span />
        <span className="text-xs font-semibold text-[#4A8AF4] text-center whitespace-nowrap truncate">
          {p1Short}
        </span>
        <span className="text-xs font-semibold text-[#F38439] text-center whitespace-nowrap truncate">
          {p2Short}
        </span>
      </div>

      {/* Stat rows */}
      {statsConfig.map((stat, index) => (
        <StatRow
          key={stat.key}
          label={stat.label}
          player1Value={statistics.player1Stats[stat.key]}
          player2Value={statistics.player2Stats[stat.key]}
          index={index}
          isPercentage={stat.isPercentage}
          lowerIsBetter={stat.lowerIsBetter}
        />
      ))}
    </motion.div>
  );
}
