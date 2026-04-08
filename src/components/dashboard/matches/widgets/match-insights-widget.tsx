"use client";

import Link from "next/link";
import { useMatchData } from "@/components/dashboard/matches/match-data-provider";

interface MatchInsightsWidgetProps {
  matchId: string;
}

export function MatchInsightsWidget({ matchId }: MatchInsightsWidgetProps) {
  const { keyMoments } = useMatchData();
  const displayMoments = keyMoments.slice(0, 5);

  return (
    <div className="bg-white border border-[#F0F0F0] rounded-[16px] shadow-[0px_4px_16px_0px_rgba(0,0,0,0.1)] overflow-hidden py-[21px] px-px">
      <div className="flex flex-col gap-4">
        {/* Header */}
        <div className="flex items-center justify-between px-5">
          <p className="text-[10px] font-medium text-[#AAAAAA] uppercase tracking-[2.5px]">
            Match Insights
          </p>
          <Link
            href={`/dashboard/matches/${matchId}/insights`}
            className="text-[10px] font-medium text-[#3B82F6] uppercase tracking-[2px] hover:text-[#2563EB] transition-colors duration-200"
          >
            VIEW ALL
          </Link>
        </div>

        {/* Moments list */}
        {displayMoments.length === 0 ? (
          <p className="text-[12px] text-[#888888] text-center py-4 px-5">
            No insights available for this match.
          </p>
        ) : (
          <div className="flex flex-col gap-4">
            {displayMoments.map((moment, i) => (
              <div key={i} className="flex gap-3 items-start pt-1.5 px-5">
                <div
                  className="w-px h-10 rounded-full shrink-0"
                  style={{ backgroundColor: i === 0 ? "#3B82F6" : "#AAAAAA" }}
                  aria-hidden="true"
                />
                <div className="flex flex-col gap-1.5 min-w-0 flex-1">
                  <p className="text-[12px] font-light text-[#71717A] leading-[18px]">
                    {moment.description || moment.moment}
                  </p>
                  <p className="text-[10px] font-normal text-[#AAAAAA] leading-[15px]">
                    {moment.moment}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
