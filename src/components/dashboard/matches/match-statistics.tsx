"use client";

import { motion, useReducedMotion } from "framer-motion";
import { shortName } from "@/lib/data/match-utils";
import type { MatchDetailedStats, PlayerStatistics, StatFraction } from "@/lib/data/types";

const EASE_CURVE = [0.25, 0.46, 0.45, 0.94] as const;

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

const SECTIONS = [
  { id: "serve", label: "Serve", stats: SERVE_STATS },
  { id: "return", label: "Return", stats: RETURN_STATS },
  { id: "other", label: "Other", stats: OTHER_STATS },
] as const;

function formatValue(
  value: number,
  stat: StatConfig,
  fraction?: StatFraction
): React.ReactNode {
  if (stat.isFraction && fraction) {
    return <span className="tabular-nums">{fraction.made}/{fraction.attempts}</span>;
  }
  if (stat.isPercentage) {
    return fraction ? (
      <>
        <span className="tabular-nums">{value}%</span>
        <span className="text-[8px] text-[#AAAAAA] ml-0.5">({fraction.made}/{fraction.attempts})</span>
      </>
    ) : (
      <span className="tabular-nums">{value}%</span>
    );
  }
  return <span className="tabular-nums">{value}</span>;
}

function StatRow({
  stat,
  p1Stats,
  p2Stats,
  delay,
  reduced,
}: {
  stat: StatConfig;
  p1Stats: PlayerStatistics;
  p2Stats: PlayerStatistics;
  delay: number;
  reduced: boolean;
}) {
  const p1Value = p1Stats[stat.key] as number;
  const p2Value = p2Stats[stat.key] as number;
  const maxVal = stat.isPercentage ? 100 : Math.max(p1Value, p2Value, 1);
  const p1Pct = Math.max((p1Value / maxVal) * 100, 1.5);
  const p2Pct = Math.max((p2Value / maxVal) * 100, 1.5);

  const barTransition = reduced
    ? { duration: 0 }
    : { duration: 0.5, ease: EASE_CURVE, delay: delay + 0.1 };

  return (
    <motion.div
      className="flex flex-col gap-0.5"
      initial={{ opacity: 0, y: reduced ? 0 : 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: EASE_CURVE, delay }}
    >
      <span className="text-[11px] text-[#525252] text-center leading-none">{stat.label}</span>

      <div className="grid grid-cols-[1fr_1fr] items-center gap-1.5">
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-semibold text-[#3B82F6] min-w-[60px] text-left shrink-0">
            {formatValue(p1Value, stat, p1Stats.fractions[stat.key])}
          </span>
          <div className="flex-1 h-[4px] rounded-full bg-[#F0F0F0] overflow-hidden flex justify-end">
            <motion.div
              className="h-full rounded-full bg-[#3B82F6]"
              initial={{ width: 0 }}
              animate={{ width: `${p1Pct}%` }}
              transition={barTransition}
            />
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <div className="flex-1 h-[4px] rounded-full bg-[#F0F0F0] overflow-hidden">
            <motion.div
              className="h-full rounded-full bg-[#F38439]"
              initial={{ width: 0 }}
              animate={{ width: `${p2Pct}%` }}
              transition={barTransition}
            />
          </div>
          <span className="text-[10px] font-semibold text-[#F38439] min-w-[60px] text-right shrink-0">
            {formatValue(p2Value, stat, p2Stats.fractions[stat.key])}
          </span>
        </div>
      </div>
    </motion.div>
  );
}

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
  const reduced = useReducedMotion() ?? false;

  if (!statistics) {
    return (
      <div className="py-16">
        <p className="text-[12px] text-[#525252] text-center">
          Statistics not available for this match.
        </p>
      </div>
    );
  }

  const p1Short = shortName(player1Name, 18);
  const p2Short = shortName(player2Name, 18);

  let rowIndex = 0;

  return (
    <motion.div
      className="flex flex-col"
      initial={{ opacity: 0, y: reduced ? 0 : 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: EASE_CURVE }}
    >
      {/* Player legend — anchored to the grid alignment */}
      <div className="grid grid-cols-[1fr_1fr] gap-1.5 mb-6">
        <div className="flex items-center justify-end gap-1.5 pr-1">
          <span className="w-1.5 h-1.5 rounded-full bg-[#3B82F6]" />
          <span className="text-[10px] font-medium text-[#0D0D0D]">{p1Short}</span>
        </div>
        <div className="flex items-center gap-1.5 pl-1">
          <span className="text-[10px] font-medium text-[#0D0D0D]">{p2Short}</span>
          <span className="w-1.5 h-1.5 rounded-full bg-[#F38439]" />
        </div>
      </div>

      {/* Sections */}
      {SECTIONS.map((section, sectionIdx) => (
        <section key={section.id} className="flex flex-col">
          {sectionIdx > 0 && (
            <div className="h-px bg-[#F0F0F0] mx-auto w-12 mb-6" />
          )}
          <h3 className="text-[9px] font-semibold uppercase tracking-[2.5px] text-[#AAAAAA] text-center mb-3.5">
            {section.label}
          </h3>
          <div className="flex flex-col gap-3">
            {section.stats.map((stat) => {
              const delay = rowIndex++ * 0.04;
              return (
                <StatRow
                  key={stat.key}
                  stat={stat}
                  p1Stats={statistics.player1Stats}
                  p2Stats={statistics.player2Stats}
                  delay={delay}
                  reduced={reduced}
                />
              );
            })}
          </div>
          {sectionIdx < SECTIONS.length - 1 && <div className="h-6" />}
        </section>
      ))}
    </motion.div>
  );
}
