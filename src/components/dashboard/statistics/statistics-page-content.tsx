"use client";

import { useState, useMemo } from "react";
import { ChartColumnIncreasing } from "lucide-react";
import type { SelectableMatch, StatisticsPageData } from "@/lib/data/statistics-server";
import { computeStatistics } from "@/lib/data/statistics-client";
import { MatchSelector } from "./match-selector";
import { WinRateChart } from "./win-rate-chart";
import { SurfaceChart } from "./surface-chart";
import { StatsGrid } from "./stats-grid";
import { RallyBreakdown } from "./rally-breakdown";
import { PerformanceRatingsCard } from "./performance-ratings-card";

interface StatisticsPageContentProps {
  initialData: StatisticsPageData;
  allMatches: SelectableMatch[];
}

export function StatisticsPageContent({
  initialData,
  allMatches,
}: StatisticsPageContentProps): React.JSX.Element {
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

  if (isEmpty) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <div className="h-16 w-16 rounded-2xl bg-[#F5F5F5] flex items-center justify-center mb-4">
          <ChartColumnIncreasing className="h-8 w-8 text-[#CCCCCC]" />
        </div>
        <p className="font-semibold text-[#0D0D0D] mb-1">No statistics yet</p>
        <p className="text-sm text-[#999999] max-w-xs">
          Upload your first match to see your performance analytics here.
        </p>
      </div>
    );
  }

  return (
    <>
      {/* KPI row */}
      <div className="flex items-center gap-3 flex-wrap mb-6">
        {kpiItems.map((item) => (
          <div
            key={item.label}
            className="flex flex-col gap-1 bg-[#F7F7F7] rounded-xl px-4 py-3 min-w-[120px]"
          >
            <span className="text-[10px] font-medium text-[#999999] uppercase tracking-wide">
              {item.label}
            </span>
            <div className="flex items-center gap-1.5">
              {item.accent && (
                <span className="w-1.5 h-1.5 rounded-full bg-[#22C55E] shrink-0" />
              )}
              <span className="text-base font-semibold tabular-nums text-[#0D0D0D]">
                {item.value}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Match selector */}
      <MatchSelector
        matches={allMatches}
        selectedIds={selectedIds}
        onSelectionChange={setSelectedIds}
      />

      {/* Charts + sidebar */}
      <div className="flex flex-row gap-8">
        {/* Left column */}
        <div className="flex-1 min-w-0 flex flex-col gap-6">
          <WinRateChart data={data.monthlyTrend} />
          <SurfaceChart data={data.surfaceBreakdown} />
          <StatsGrid data={data} />
        </div>

        {/* Right column — sticky */}
        <div className="sticky top-8 w-[320px] flex-shrink-0 self-start flex flex-col gap-5">
          <PerformanceRatingsCard
            serveRating={data.serveRating}
            returnRating={data.returnRating}
            underPressureRating={data.underPressureRating}
          />
          <RallyBreakdown
            shortPct={data.shortRallyWonPct}
            mediumPct={data.mediumRallyWonPct}
            longPct={data.longRallyWonPct}
          />
        </div>
      </div>
    </>
  );
}
