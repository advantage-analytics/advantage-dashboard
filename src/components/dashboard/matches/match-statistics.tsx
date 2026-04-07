"use client";

import { useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { shortName } from "@/lib/data/match-utils";
import type { MatchDetailedStats, PlayerStatistics, StatFraction } from "@/lib/data/types";
import { cn } from "@/lib/utils";

/* ── Animation constants ─────────────────────────────────── */

const EASE_CURVE = [0.25, 0.46, 0.45, 0.94] as const;

/* ── Stat configuration ──────────────────────────────────── */

interface StatConfig {
  key: keyof PlayerStatistics;
  label: string;
  isPercentage?: boolean;
  isFraction?: boolean;
}

const SERVE_STATS: StatConfig[] = [
  { key: "aces", label: "Aces" },
  { key: "doubleFaults", label: "Double Faults" },
  { key: "firstServeInPct", label: "First Serve In %", isPercentage: true },
  { key: "firstServeWinPct", label: "First Serve Won %", isPercentage: true },
  { key: "secondServeWinPct", label: "Second Serve Won %", isPercentage: true },
  { key: "breakpointsSaved", label: "Break Points Saved", isFraction: true },
  { key: "servicePointsWon", label: "Total Serve Points Won", isFraction: true },
  { key: "serviceGamesWonPct", label: "Service Games Won %", isPercentage: true },
];

const RETURN_STATS: StatConfig[] = [
  { key: "firstReturnInPct", label: "First Serve Returns In %", isPercentage: true },
  { key: "firstReturnWonPct", label: "First Serve Returns Won %", isPercentage: true },
  { key: "secondReturnInPct", label: "Second Serve Returns In %", isPercentage: true },
  { key: "secondReturnWonPct", label: "Second Serve Returns Won %", isPercentage: true },
  { key: "breakpointsWonPct", label: "Break Points Converted", isPercentage: true },
  { key: "returnPointsWon", label: "Total Return Points Won", isFraction: true },
  { key: "returnGamesWon", label: "Return Games Won" },
  { key: "returnGamesWonPct", label: "Return Games Won %", isPercentage: true },
];

const OTHER_STATS: StatConfig[] = [
  { key: "winners", label: "Winners" },
  { key: "unforcedErrors", label: "Errors" },
  { key: "netPointsAppearances", label: "Net Points Appearances" },
  { key: "netPointsWonPct", label: "Net Points Won %", isPercentage: true },
  { key: "shortRallyWonPct", label: "Short (1-4 Shots)", isPercentage: true },
  { key: "mediumRallyWonPct", label: "Medium (5-8 Shots)", isPercentage: true },
  { key: "longRallyWonPct", label: "Long (9+ Shots)", isPercentage: true },
  { key: "totalPointsWon", label: "Total Points Won" },
];

const TAB_STATS = {
  serve: SERVE_STATS,
  return: RETURN_STATS,
  other: OTHER_STATS,
} as const;

type Tab = keyof typeof TAB_STATS;

const TAB_OPTIONS = [
  { value: "serve", label: "Serve" },
  { value: "return", label: "Return" },
  { value: "other", label: "Other" },
];

/* ── Helpers ──────────────────────────────────────────────── */

/* ── StatBadge ────────────────────────────────────────────── */

function StatBadge({
  value,
  isPercentage = false,
  isFraction = false,
  fraction,
  color,
}: {
  value: number;
  isPercentage?: boolean;
  isFraction?: boolean;
  fraction?: StatFraction;
  color: "blue" | "orange";
}) {
  const styles =
    color === "blue"
      ? "bg-[#EBF0FE] text-[#4A8AF4]"
      : "bg-[#FEF0E6] text-[#F38439]";

  let display: React.ReactNode;
  if (isPercentage && fraction) {
    display = (
      <>
        <span className="text-[12px] font-medium tabular-nums">{value}%</span>{" "}
        <span className="text-[10px] text-[#888888]">
          ({fraction.made}/{fraction.attempts})
        </span>
      </>
    );
  } else if (isFraction && fraction) {
    display = (
      <span className="text-[12px] font-medium tabular-nums">
        {fraction.made}/{fraction.attempts}
      </span>
    );
  } else if (isPercentage) {
    display = (
      <span className="text-[12px] font-medium tabular-nums">{value}%</span>
    );
  } else {
    display = (
      <span className="text-[12px] font-medium tabular-nums">
        {value}
      </span>
    );
  }

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-1 whitespace-nowrap",
        styles
      )}
    >
      {display}
    </span>
  );
}

/* ── Stat row ─────────────────────────────────────────────── */

function StatRow({
  label,
  player1Value,
  player2Value,
  player1Fraction,
  player2Fraction,
  index,
  isPercentage = false,
  isFraction = false,
  prefersReducedMotion = false,
}: {
  label: string;
  player1Value: number;
  player2Value: number;
  player1Fraction?: StatFraction;
  player2Fraction?: StatFraction;
  index: number;
  isPercentage?: boolean;
  isFraction?: boolean;
  prefersReducedMotion?: boolean;
}) {
  return (
    <motion.div
      className="grid grid-cols-[1fr_120px_120px] sm:grid-cols-[1fr_140px_140px] items-center border-b border-[#F0F0F0] py-3"
      initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: 8 }}
      animate={prefersReducedMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
      transition={{
        duration: 0.3,
        ease: EASE_CURVE,
        delay: index * 0.04,
      }}
    >
      <span className="text-[12px] text-[#525252]">{label}</span>

      <div className="flex justify-start">
        <StatBadge value={player1Value} isPercentage={isPercentage} isFraction={isFraction} fraction={player1Fraction} color="blue" />
      </div>

      <div className="flex justify-start">
        <StatBadge value={player2Value} isPercentage={isPercentage} isFraction={isFraction} fraction={player2Fraction} color="orange" />
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
  const [activeTab, setActiveTab] = useState<Tab>("serve");
  const prefersReducedMotion = useReducedMotion() ?? false;

  if (!statistics) {
    return (
      <div className="bg-white border border-[#F3F3F3] rounded-[14px] shadow-[0px_4px_16px_0px_rgba(0,0,0,0.1)] p-5">
        <h2 className="text-[10px] font-medium uppercase tracking-[2.5px] text-[#AAAAAA] mb-6">
          Match Statistics
        </h2>
        <p className="text-[12px] text-[#525252] text-center">
          Statistics not available for this match.
        </p>
      </div>
    );
  }

  const p1Short = shortName(player1Name, 18);
  const p2Short = shortName(player2Name, 18);
  const activeStats = TAB_STATS[activeTab];

  return (
    <motion.div
      className="bg-white border border-[#F3F3F3] rounded-[14px] shadow-[0px_4px_16px_0px_rgba(0,0,0,0.1)] p-5"
      initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: 20 }}
      animate={prefersReducedMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.3, ease: EASE_CURVE }}
    >
      {/* Card header */}
      <div className="mb-5">
        <h2 className="text-[10px] font-medium uppercase tracking-[2.5px] text-[#AAAAAA]">
          Match Statistics
        </h2>
        <p className="text-[12px] text-[#525252] mt-1">
          Compare {player1Name} and {player2Name} Match Statistics
        </p>
      </div>

      {/* Tab pills */}
      <div className="flex gap-2 mb-5">
        {TAB_OPTIONS.map((option) => {
          const isActive = activeTab === option.value;
          return (
            <button
              key={option.value}
              onClick={() => setActiveTab(option.value as Tab)}
              className={cn(
                "rounded-full h-8 px-3.5 text-[11px] font-medium transition-colors duration-200 active:scale-[0.97]",
                isActive
                  ? "ring-1 ring-inset ring-[#3B82F6] text-[#3B82F6] bg-[#EBF2FD]"
                  : "ring-1 ring-inset ring-[#EAECF0] text-[#525252] bg-white hover:bg-[#EFF6FF] hover:ring-[#3B82F6]/30 hover:text-[#3B82F6]"
              )}
            >
              {option.label}
            </button>
          );
        })}
      </div>

      {/* Table header */}
      <div className="grid grid-cols-[1fr_120px_120px] sm:grid-cols-[1fr_140px_140px] pb-2 mb-1">
        <span className="text-[10px] font-medium text-[#AAAAAA] uppercase tracking-[2.5px]">
          Statistic
        </span>
        <span className="text-[12px] font-medium text-[#0D0D0D] text-left whitespace-nowrap truncate">
          {p1Short}
        </span>
        <span className="text-[12px] font-medium text-[#0D0D0D] text-left whitespace-nowrap truncate">
          {p2Short}
        </span>
      </div>

      {/* Stat rows — re-mount on tab change to replay entrance animation */}
      <div key={activeTab} className="min-h-[320px] [&>:last-child]:border-b-0">
        {activeStats.map((stat, index) => (
          <StatRow
            key={stat.key}
            label={stat.label}
            player1Value={statistics.player1Stats[stat.key] as number}
            player2Value={statistics.player2Stats[stat.key] as number}
            player1Fraction={statistics.player1Stats.fractions[stat.key]}
            player2Fraction={statistics.player2Stats.fractions[stat.key]}
            index={index}
            isPercentage={stat.isPercentage}
            isFraction={stat.isFraction}
            prefersReducedMotion={prefersReducedMotion}
          />
        ))}
      </div>
    </motion.div>
  );
}
