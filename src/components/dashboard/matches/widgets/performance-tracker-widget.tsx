"use client";

import Link from "next/link";
import { MomentumChartCompact } from "@/components/dashboard/matches/performance-tracker";
import { useMatchData } from "@/components/dashboard/matches/match-data-provider";

interface PerformanceTrackerWidgetProps {
  matchId: string;
}

export function PerformanceTrackerWidget({ matchId }: PerformanceTrackerWidgetProps) {
  const { statsResult, points } = useMatchData();

  return (
    <div className="bg-white border border-[#F3F3F3] rounded-[14px] shadow-[0px_2px_8px_0px_rgba(0,0,0,0.06)] overflow-hidden p-5 flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-medium text-[#767676] uppercase tracking-[2.5px] leading-[15px]">
          Performance Tracker
        </p>
        <Link
          href={`/dashboard/matches/${matchId}`}
          className="text-[10px] font-medium text-[#3B82F6] uppercase tracking-[2.5px] leading-[15px] hover:text-[#2563EB] transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3B82F6]/40"
        >
          VIEW ALL
        </Link>
      </div>

      {/* Momentum chart only — no sub-heading, no background */}
      <MomentumChartCompact
        points={points}
        player1Name={statsResult?.player1Name ?? "Player 1"}
        player2Name={statsResult?.player2Name ?? "Player 2"}
      />
    </div>
  );
}
