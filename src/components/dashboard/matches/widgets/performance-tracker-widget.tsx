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
    <div className="bg-white border border-[#F3F3F3] rounded-[14px] shadow-[0px_4px_16px_0px_rgba(0,0,0,0.1)] p-[21px] flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-medium text-[#AAAAAA] uppercase tracking-[2.5px] leading-[15px]">
          Performance Tracker
        </p>
        <Link
          href={`/dashboard/matches/${matchId}/performance`}
          className="text-[10px] font-medium text-[#3B82F6] uppercase tracking-[2px] leading-[15px] hover:text-[#2563EB] transition-colors duration-200"
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
