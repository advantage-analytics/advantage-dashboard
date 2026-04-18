"use client";

import { useMemo } from "react";
import Link from "next/link";
import { StatSnapshotCard } from "@/components/dashboard/matches/stat-snapshot-card";
import type { PlayerStatistics } from "@/lib/data/types";

const SNAPSHOT_STATS: {
  key: keyof PlayerStatistics;
  label: string;
  isPercentage: boolean;
}[] = [
  { key: "firstServeInPct", label: "1st Serve %", isPercentage: true },
  { key: "firstServeWinPct", label: "Serve Points Won", isPercentage: true },
  { key: "netPointsWonPct", label: "Net Rating", isPercentage: true },
  { key: "breakpointsWonPct", label: "BP Converted", isPercentage: true },
  { key: "secondServeWinPct", label: "2nd Serve Won", isPercentage: true },
  { key: "returnGamesWonPct", label: "Return Games", isPercentage: true },
  { key: "shortRallyWonPct", label: "Short Rally", isPercentage: true },
  { key: "longRallyWonPct", label: "Long Rally", isPercentage: true },
  { key: "serviceGamesWonPct", label: "Service Games", isPercentage: true },
  { key: "firstReturnWonPct", label: "Return Won", isPercentage: true },
  { key: "mediumRallyWonPct", label: "Medium Rally", isPercentage: true },
  { key: "secondReturnWonPct", label: "2nd Return Won", isPercentage: true },
];

function pickDynamicStats(
  p1: PlayerStatistics,
  p2: PlayerStatistics,
): typeof SNAPSHOT_STATS {
  const scored = SNAPSHOT_STATS.map((stat) => {
    const v1 = (p1[stat.key] as number) ?? 0;
    const v2 = (p2[stat.key] as number) ?? 0;
    return { ...stat, diff: v1 - v2 };
  });

  scored.sort((a, b) => b.diff - a.diff);
  const best = scored.slice(0, 3);
  const worst = scored.slice(-3).reverse();
  return [...best, ...worst];
}

interface StatSnapshotGridProps {
  p1: PlayerStatistics;
  p2: PlayerStatistics;
  playerAverages: Record<string, unknown> | null;
  viewAllHref?: string;
}

export function StatSnapshotGrid({
  p1,
  p2,
  playerAverages,
  viewAllHref = "/dashboard/statistics",
}: StatSnapshotGridProps) {
  const dynamicStats = useMemo(() => pickDynamicStats(p1, p2), [p1, p2]);

  if (dynamicStats.length === 0) return null;

  return (
    <div className="bg-white border border-[#F3F3F3] rounded-[14px] shadow-[0px_2px_8px_0px_rgba(0,0,0,0.06)] p-5">
      <div className="flex items-center justify-between mb-1">
        <p className="text-[10px] font-medium text-[#AAAAAA] uppercase tracking-[2.5px] leading-[15px]">
          Key Statistics Snapshot
        </p>
        <Link
          href={viewAllHref}
          className="text-[10px] font-medium text-[#3B82F6] uppercase tracking-[1.5px] leading-[15px] hover:text-[#2563EB] transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3B82F6]/40 rounded-[4px] px-1 -mx-1"
        >
          View all
        </Link>
      </div>
      <p className="text-[11px] text-[#71717A] leading-[1.5] mb-4">
        Top differentiators vs your opponent
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {dynamicStats.map((stat, i) => (
          <StatSnapshotCard
            key={stat.key}
            label={stat.label}
            value={p1[stat.key] as number}
            opponentValue={p2[stat.key] as number}
            averageValue={
              playerAverages
                ? ((playerAverages[stat.key] as number) ?? null)
                : null
            }
            isPercentage={stat.isPercentage}
            fraction={p1.fractions[stat.key] ?? undefined}
            index={i}
          />
        ))}
      </div>
    </div>
  );
}
