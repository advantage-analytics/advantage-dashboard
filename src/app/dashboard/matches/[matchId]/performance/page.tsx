"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { PerformanceTracker } from "@/components/dashboard/matches/performance-tracker";
import { useMatchData } from "@/components/dashboard/matches/match-data-provider";

export default function PerformancePage() {
  const { matchId } = useParams<{ matchId: string }>();
  const { match, statsResult, points } = useMatchData();

  return (
    <div className="px-8 py-10">
      <div className="flex flex-col gap-2 mb-8">
        <div className="flex items-center gap-1.5 text-[10px] font-medium text-[#AAAAAA] uppercase tracking-[3px]">
          <Link
            href={`/dashboard/matches/${matchId}`}
            className="hover:text-[#888888] transition-colors duration-200"
          >
            {match.player1.name} vs {match.player2.name}
          </Link>
          <span className="text-[#CCCCCC]">/</span>
          <span>Performance</span>
        </div>
        <h1 className="text-[32px] font-light text-[#0A0A0C] leading-[48px] tracking-[-0.5px]">
          Match Momentum
        </h1>
      </div>
      <PerformanceTracker
        points={points}
        player1Name={statsResult?.player1Name ?? "Player 1"}
        player2Name={statsResult?.player2Name ?? "Player 2"}
        matchId={matchId}
      />
    </div>
  );
}
