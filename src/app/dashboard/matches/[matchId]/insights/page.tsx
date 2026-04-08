"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { motion, useReducedMotion } from "framer-motion";
import { AIAnalysisPanel } from "@/components/dashboard/matches/ai-analysis-panel";
import { useMatchData } from "@/components/dashboard/matches/match-data-provider";

export default function InsightsPage() {
  const { matchId } = useParams<{ matchId: string }>();
  const { match } = useMatchData();
  const prefersReduced = useReducedMotion();
  const ease = [0.25, 0.46, 0.45, 0.94] as [number, number, number, number];

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
          <span>Insights</span>
        </div>
        <h1 className="text-[32px] font-light text-[#0A0A0C] leading-[48px] tracking-[-0.5px]">
          AI Analysis & Key Moments
        </h1>
      </div>
      <motion.div
        initial={prefersReduced ? { opacity: 0 } : { opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease }}
      >
        <AIAnalysisPanel />
      </motion.div>
    </div>
  );
}
