"use client";

import { useState } from "react";
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
}

const SERVE_STATS: StatConfig[] = [
  { key: "aces", label: "Aces" },
  { key: "doubleFaults", label: "Double Faults" },
  { key: "firstServeInPct", label: "First Serve In %", isPercentage: true },
  { key: "firstServeWinPct", label: "First Serve Won %", isPercentage: true },
  { key: "secondServeWinPct", label: "Second Serve Won %", isPercentage: true },
  { key: "servicePointsWon", label: "Service Points Won" },
  { key: "serviceGamesWon", label: "Service Games Won" },
];

const RETURN_STATS: StatConfig[] = [
  { key: "breakpointsWon", label: "Break Points Won" },
  { key: "breakpointsWonPct", label: "Break Points Won %", isPercentage: true },
  { key: "firstReturnWonPct", label: "First Return Won %", isPercentage: true },
  { key: "secondReturnWonPct", label: "Second Return Won %", isPercentage: true },
  { key: "returnPointsWon", label: "Return Points Won" },
  { key: "returnGamesWon", label: "Return Games Won" },
];

const OTHER_STATS: StatConfig[] = [
  { key: "shortRallyWonPct", label: "Short Rally Win %", isPercentage: true },
  { key: "mediumRallyWonPct", label: "Medium Rally Win %", isPercentage: true },
  { key: "longRallyWonPct", label: "Long Rally Win %", isPercentage: true },
  { key: "tiebreaksWon", label: "Tiebreaks Won" },
];

const TAB_STATS = {
  serve: SERVE_STATS,
  return: RETURN_STATS,
  other: OTHER_STATS,
} as const;

type Tab = keyof typeof TAB_STATS;

/* ── Helpers ──────────────────────────────────────────────── */

function formatValue(value: number, isPercentage: boolean): string {
  return isPercentage ? `${value}%` : value.toString();
}

/* ── StatBadge ────────────────────────────────────────────── */

function StatBadge({
  value,
  isPercentage = false,
  color,
}: {
  value: number;
  isPercentage?: boolean;
  color: "blue" | "orange";
}) {
  const styles =
    color === "blue"
      ? "bg-[#EBF2FD] text-[#4A8AF4]"
      : "bg-[#FEF2E8] text-[#F38439]";

  return (
    <span
      className={`inline-block min-w-[48px] text-center rounded-full px-3 py-1 text-sm font-medium tabular-nums ${styles}`}
    >
      {formatValue(value, isPercentage)}
    </span>
  );
}

/* ── Stat row ─────────────────────────────────────────────── */

function StatRow({
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
}) {
  return (
    <motion.div
      className="grid grid-cols-[1fr_130px_130px] sm:grid-cols-[1fr_150px_150px] items-center border-b border-[#F0F0F0] py-3"
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: 0.06 + index * 0.04, ease: EASE_CURVE }}
    >
      <span className="text-xs font-medium uppercase tracking-[0.12em] text-[#999999]">
        {label}
      </span>

      <div className="flex justify-center">
        <StatBadge value={player1Value} isPercentage={isPercentage} color="blue" />
      </div>

      <div className="flex justify-center">
        <StatBadge value={player2Value} isPercentage={isPercentage} color="orange" />
      </div>
    </motion.div>
  );
}

/* ── Tab button ───────────────────────────────────────────── */

function TabButton({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-4 py-1.5 text-sm font-medium cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-[#0D0D0D] ${
        active
          ? "bg-[#0D0D0D] text-white"
          : "border border-[#E8E8E8] text-[#666666] bg-white hover:border-[#999999]"
      }`}
    >
      {label}
    </button>
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

  if (!statistics) {
    return (
      <div className="bg-white p-6 rounded-2xl border border-[rgba(0,0,0,0.06)] shadow-[0px_4px_16px_0px_rgba(0,0,0,0.1)]">
        <h2 className="text-lg font-semibold text-[#0D0D0D] mb-6">
          Match Statistics
        </h2>
        <p className="text-sm text-[#999999] text-center">
          Statistics not available for this match.
        </p>
      </div>
    );
  }

  const p1Short = shortName(player1Name, 12);
  const p2Short = shortName(player2Name, 12);
  const activeStats = TAB_STATS[activeTab];

  return (
    <motion.div
      className="bg-white p-6 rounded-2xl border border-[rgba(0,0,0,0.06)] shadow-[0px_4px_16px_0px_rgba(0,0,0,0.1)]"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.3, ease: EASE_CURVE }}
    >
      {/* Card header */}
      <div className="mb-5">
        <h2 className="text-lg font-semibold text-[#0D0D0D]">
          Match Statistics
        </h2>
        <p className="text-sm text-[#999999] mt-1">
          Compare {player1Name} and {player2Name} Match Statistics
        </p>
      </div>

      {/* Tab pills */}
      <div className="flex gap-2 mb-5">
        <TabButton
          label="Serve"
          active={activeTab === "serve"}
          onClick={() => setActiveTab("serve")}
        />
        <TabButton
          label="Return"
          active={activeTab === "return"}
          onClick={() => setActiveTab("return")}
        />
        <TabButton
          label="Other"
          active={activeTab === "other"}
          onClick={() => setActiveTab("other")}
        />
      </div>

      {/* Table header */}
      <div className="grid grid-cols-[1fr_130px_130px] sm:grid-cols-[1fr_150px_150px] border-b border-[#E8E8E8] pb-2 mb-1">
        <span className="text-xs font-semibold text-[#999999] uppercase tracking-[0.12em]">
          Statistic
        </span>
        <span className="text-xs font-semibold text-[#4A8AF4] text-center whitespace-nowrap truncate">
          {p1Short}
        </span>
        <span className="text-xs font-semibold text-[#F38439] text-center whitespace-nowrap truncate">
          {p2Short}
        </span>
      </div>

      {/* Stat rows — re-mount on tab change to replay entrance animation */}
      <motion.div key={activeTab}>
        {activeStats.map((stat, index) => (
          <StatRow
            key={stat.key}
            label={stat.label}
            player1Value={statistics.player1Stats[stat.key]}
            player2Value={statistics.player2Stats[stat.key]}
            index={index}
            isPercentage={stat.isPercentage}
          />
        ))}
      </motion.div>
    </motion.div>
  );
}
