"use client";

import { useState, useMemo } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { ChartColumnIncreasing } from "lucide-react";
import type { SelectableMatch, StatisticsPageData } from "@/lib/data/statistics-server";
import { computeStatistics } from "@/lib/data/statistics-client";
import { MatchSelector } from "./match-selector";
import { WinRateChart } from "./win-rate-chart";
import { SurfaceChart } from "./surface-chart";
import { StatsGrid } from "./stats-grid";
import { RallyBreakdown } from "./rally-breakdown";
import { PerformanceRatingsCard } from "./performance-ratings-card";

const EASE_CURVE = [0.25, 0.46, 0.45, 0.94] as const;

interface StatisticsPageContentProps {
  initialData: StatisticsPageData;
  allMatches: SelectableMatch[];
}

export function StatisticsPageContent({
  initialData,
  allMatches,
}: StatisticsPageContentProps): React.JSX.Element {
  const shouldReduceMotion = useReducedMotion();

  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    () => new Set(allMatches.map((m) => m.id))
  );

  const isFiltered = selectedIds.size < allMatches.length;

  const filteredMatches = useMemo(
    () => allMatches.filter((m) => selectedIds.has(m.id)),
    [allMatches, selectedIds]
  );

  const data: StatisticsPageData = useMemo(
    () => (isFiltered ? computeStatistics(filteredMatches) : initialData),
    [filteredMatches, isFiltered, initialData]
  );

  const isEmpty = allMatches.length === 0;

  const kpiItems = [
    { label: "Total Matches", value: String(data.totalMatches), accent: false },
    { label: "Win Rate", value: `${data.winRate}%`, accent: data.winRate >= 50 },
    {
      label: "Current Streak",
      value: data.currentStreak,
      accent: data.currentStreak.includes("W"),
    },
    {
      label: "Avg Duration",
      value: data.avgDurationMinutes ? `${data.avgDurationMinutes}m` : "—",
      accent: false,
    },
  ];

  function kpiAnim(i: number) {
    if (shouldReduceMotion) return { initial: false, animate: { opacity: 1 }, transition: { duration: 0 } };
    return {
      initial: { opacity: 0, y: 12 },
      animate: { opacity: 1, y: 0 },
      transition: { duration: 0.4, delay: i * 0.07, ease: EASE_CURVE },
    };
  }

  function sectionAnim(i: number) {
    if (shouldReduceMotion) return { initial: false, animate: { opacity: 1 }, transition: { duration: 0 } };
    return {
      initial: { opacity: 0, y: 12 },
      animate: { opacity: 1, y: 0 },
      transition: { duration: 0.4, delay: 0.15 + i * 0.07, ease: EASE_CURVE },
    };
  }

  if (isEmpty) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <div className="h-16 w-16 rounded-full bg-[#F5F5F5] flex items-center justify-center mb-4">
          <ChartColumnIncreasing className="h-8 w-8 text-[#CCCCCC]" aria-hidden="true" />
        </div>
        <p className="font-medium text-[#0D0D0D] mb-1">No statistics yet</p>
        <p className="text-[12px] font-normal text-[#71717A] max-w-xs">
          Upload your first match to see your performance analytics here.
        </p>
      </div>
    );
  }

  return (
    <>
      {/* KPI row */}
      <div className="flex gap-3 w-full mb-6">
        {kpiItems.map((item, i) => (
          <motion.div
            key={item.label}
            {...kpiAnim(i)}
            className="flex-1 flex flex-col gap-3 bg-white border border-[#F3F3F3] rounded-[14px] shadow-[0px_4px_16px_0px_rgba(0,0,0,0.1)] p-5 overflow-hidden min-w-0 transition-[box-shadow,border-color,transform] duration-200 hover:shadow-[0px_8px_24px_0px_rgba(0,0,0,0.12)] hover:border-[#E7E7E7] hover:scale-[1.008]"
          >
            <p className="text-[9px] font-normal text-[#AAAAAA] uppercase tracking-[2px] whitespace-nowrap">
              {item.label}
            </p>
            <div className="flex items-center gap-1.5">
              {item.accent && (
                <span className="w-1.5 h-1.5 rounded-full bg-[#5DB955] shrink-0" />
              )}
              <p className="text-[28px] font-light text-[#0D0D0D] tracking-[-0.5px] leading-none tabular-nums">
                {item.value}
              </p>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Match selector */}
      <motion.div {...sectionAnim(0)}>
        <MatchSelector
          matches={allMatches}
          selectedIds={selectedIds}
          onSelectionChange={setSelectedIds}
        />
      </motion.div>

      {/* Charts + sidebar */}
      <div className="grid grid-cols-1 lg:grid-cols-[5fr_2fr] gap-8">
        {/* Left column */}
        <div className="flex flex-col gap-6 min-w-0">
          <motion.div {...sectionAnim(1)}>
            <WinRateChart data={data.monthlyTrend} />
          </motion.div>
          <motion.div {...sectionAnim(2)}>
            <SurfaceChart data={data.surfaceBreakdown} />
          </motion.div>
          <motion.div {...sectionAnim(3)}>
            <StatsGrid data={data} />
          </motion.div>
        </div>

        {/* Right column */}
        <div className="flex flex-col gap-5">
          <motion.div {...sectionAnim(4)}>
            <PerformanceRatingsCard
              serveRating={data.serveRating}
              returnRating={data.returnRating}
              underPressureRating={data.underPressureRating}
            />
          </motion.div>
          <motion.div {...sectionAnim(5)}>
            <RallyBreakdown
              shortPct={data.shortRallyWonPct}
              mediumPct={data.mediumRallyWonPct}
              longPct={data.longRallyWonPct}
            />
          </motion.div>
        </div>
      </div>
    </>
  );
}
