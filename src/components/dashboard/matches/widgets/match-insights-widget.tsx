"use client";

import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import { useMatchData } from "@/components/dashboard/matches/match-data-provider";

const EASE_CURVE: [number, number, number, number] = [0.25, 0.46, 0.45, 0.94];

interface MatchInsightsWidgetProps {
  matchId: string;
}

export function MatchInsightsWidget({ matchId }: MatchInsightsWidgetProps) {
  const { keyMoments } = useMatchData();
  const displayMoments = keyMoments.slice(0, 5);
  const prefersReduced = useReducedMotion();

  return (
    <div className="bg-white border border-[#F3F3F3] rounded-[14px] shadow-[0px_2px_8px_0px_rgba(0,0,0,0.06)] overflow-hidden">
      <div className="flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 h-14">
          <p className="text-[10px] font-medium text-[#767676] uppercase tracking-[2.5px]">
            Match Insights
          </p>
          <Link
            href={`/dashboard/matches/${matchId}`}
            className="text-[10px] font-medium text-[#3B82F6] uppercase tracking-[2.5px] hover:text-[#2563EB] transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3B82F6]/40"
          >
            VIEW ALL
          </Link>
        </div>

        {/* Moments list */}
        {displayMoments.length === 0 ? (
          <div className="text-center py-4 px-5 flex flex-col gap-1.5">
            <p className="text-[12px] text-[#888888]">
              No insights available for this match.
            </p>
            <p className="text-[12px] text-[#767676]">
              Insights are generated automatically when point-level data is processed.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-0.5 pb-3">
            {displayMoments.map((moment, i) => (
              <motion.div
                key={i}
                className="flex gap-3 items-start py-2 px-5 rounded-lg transition-colors duration-200 hover:bg-[#FAFAFA] group"
                initial={prefersReduced ? false : { opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.3, delay: 0.15 + i * 0.06, ease: EASE_CURVE }}
              >
                <div
                  className="w-px h-5 rounded-full shrink-0 mt-0.5 transition-all duration-200 group-hover:w-[2px]"
                  style={{ backgroundColor: i === 0 ? "#3B82F6" : "#AAAAAA" }}
                  aria-hidden="true"
                />
                <p className="text-[12px] font-normal text-[#71717A] leading-[18px] min-w-0 flex-1">
                  {moment.description || moment.moment}
                </p>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
