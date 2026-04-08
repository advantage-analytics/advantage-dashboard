"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { motion, useReducedMotion } from "framer-motion";
import { MatchStatistics } from "@/components/dashboard/matches/match-statistics";
import { useMatchData } from "@/components/dashboard/matches/match-data-provider";

const EASE_CURVE = [0.25, 0.46, 0.45, 0.94] as const;

export default function StatisticsPage() {
  const { matchId } = useParams<{ matchId: string }>();
  const { match, statsResult } = useMatchData();
  const prefersReduced = useReducedMotion();

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
          <span>Statistics</span>
        </div>
        <h1 className="text-[32px] font-light text-[#0A0A0C] leading-[48px] tracking-[-0.5px]">
          Full Statistics
        </h1>
      </div>
      <motion.div
        initial={prefersReduced ? { opacity: 0 } : { opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [...EASE_CURVE] }}
      >
        <MatchStatistics
          statistics={statsResult?.statistics ?? null}
          player1Name={statsResult?.player1Name ?? "Player 1"}
          player2Name={statsResult?.player2Name ?? "Player 2"}
        />
      </motion.div>
    </div>
  );
}
