"use client";

import { useState, useMemo, useCallback } from "react";
import { motion, useReducedMotion } from "framer-motion";
import type { SelectableMatch, StatisticsPageData } from "@/lib/data/statistics-server";
import { EmptyStatistics } from "./empty-statistics";
import { computeStatistics } from "@/lib/data/statistics-client";
import { MatchSelector } from "./match-selector";
import { PeriodToggle, type Period } from "./period-toggle";
import { computeTrends } from "./trend-utils";

import { RollingFormStrip } from "./rolling-form-strip";
import { StatSummaryStrip } from "./stat-summary-strip";
import { StatProgressionChart } from "./stat-progression-chart";
import { ServePlacementStats } from "./serve-placement-stats";
import { EfficiencyMatrix } from "./efficiency-matrix";
import { OpponentLedger } from "./opponent-ledger";
import { SurfaceDna } from "./surface-dna";
import { InsightsCard } from "./insights-card";

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
  const [period, setPeriod] = useState<Period>("all");

  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    () => new Set(allMatches.map((m) => m.id))
  );

  const sortedMatches = useMemo(
    () => [...allMatches].sort((a, b) => b.isoDate.localeCompare(a.isoDate)),
    [allMatches]
  );

  const handlePeriodChange = useCallback(
    (newPeriod: Period) => {
      setPeriod(newPeriod);
      if (newPeriod === "all") {
        setSelectedIds(new Set(allMatches.map((m) => m.id)));
      } else {
        const n = newPeriod === "last5" ? 5 : 10;
        const recentIds = sortedMatches.slice(0, n).map((m) => m.id);
        setSelectedIds(new Set(recentIds));
      }
    },
    [allMatches, sortedMatches]
  );

  const handleMatchSelectionChange = useCallback((ids: Set<string>) => {
    setSelectedIds(ids);
    setPeriod("all");
  }, []);

  const isFiltered = selectedIds.size < allMatches.length;

  const filteredMatches = useMemo(
    () => allMatches.filter((m) => selectedIds.has(m.id)),
    [allMatches, selectedIds]
  );

  const data: StatisticsPageData = useMemo(
    () => (isFiltered ? computeStatistics(filteredMatches) : initialData),
    [filteredMatches, isFiltered, initialData]
  );

  const trends = useMemo(
    () => computeTrends(sortedMatches, initialData),
    [sortedMatches, initialData]
  );

  const serveMatchIds = useMemo(
    () =>
      [...filteredMatches]
        .sort((a, b) => b.isoDate.localeCompare(a.isoDate))
        .slice(0, 10)
        .map((m) => m.id),
    [filteredMatches]
  );

  if (allMatches.length === 0) {
    return <EmptyStatistics />;
  }

  function anim(i: number) {
    if (shouldReduceMotion)
      return { initial: false as const, animate: { opacity: 1 }, transition: { duration: 0 } };
    return {
      initial: { opacity: 0, y: 12 },
      animate: { opacity: 1, y: 0 },
      transition: { duration: 0.3, delay: i * 0.06, ease: EASE_CURVE },
    };
  }

  return (
    <>
      {/* Controls */}
      <div className="flex items-start justify-between gap-4 mb-5">
        <MatchSelector
          matches={allMatches}
          selectedIds={selectedIds}
          onSelectionChange={handleMatchSelectionChange}
        />
        <PeriodToggle
          value={period}
          onChange={handlePeriodChange}
          matchCount={allMatches.length}
        />
      </div>

      {/* Match Form */}
      <motion.div className="pb-5 mb-5 border-b border-[#F0F0F0]" {...anim(0)}>
        <RollingFormStrip
          matches={filteredMatches}
          totalMatches={data.totalMatches}
          winRate={data.winRate}
          currentStreak={data.currentStreak}
        />
      </motion.div>

      {/* Key Averages */}
      <motion.div className="pb-5 mb-6 border-b border-[#F0F0F0]" {...anim(1)}>
        <StatSummaryStrip data={data} trends={trends} />
      </motion.div>

      {/* Progression */}
      <motion.div className="mb-8" {...anim(2)}>
        <StatProgressionChart matches={filteredMatches} />
      </motion.div>

      {/* Shot Quality */}
      <motion.p
        className="text-[10px] font-medium uppercase tracking-[2.5px] text-[#AAAAAA] mb-4"
        {...anim(3)}
      >
        Shot Quality
      </motion.p>
      <div className="grid grid-cols-12 gap-5 mb-8">
        <motion.div className="col-span-12 lg:col-span-7" {...anim(3)}>
          <ServePlacementStats matchIds={serveMatchIds} />
        </motion.div>
        <motion.div className="col-span-12 lg:col-span-5" {...anim(4)}>
          <EfficiencyMatrix matches={filteredMatches} />
        </motion.div>
      </div>

      {/* Context */}
      <motion.p
        className="text-[10px] font-medium uppercase tracking-[2.5px] text-[#AAAAAA] mb-4"
        {...anim(5)}
      >
        Context
      </motion.p>
      <div className="grid grid-cols-12 gap-5">
        <motion.div className="col-span-12 lg:col-span-4" {...anim(5)}>
          <OpponentLedger matches={filteredMatches} />
        </motion.div>
        <motion.div className="col-span-12 lg:col-span-4" {...anim(6)}>
          <SurfaceDna
            surfaceBreakdown={data.surfaceBreakdown}
            totalMatches={data.totalMatches}
            winRate={data.winRate}
          />
        </motion.div>
        <motion.div className="col-span-12 lg:col-span-4" {...anim(7)}>
          <InsightsCard data={data} trends={trends} />
        </motion.div>
      </div>
    </>
  );
}
