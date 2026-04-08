"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { motion, useReducedMotion } from "framer-motion";
import { MatchVideoPanel } from "@/components/dashboard/matches/match-video-panel";
import { MatchVideoSidebar } from "@/components/dashboard/matches/match-video-sidebar";
import { VideoFilterBar } from "@/components/dashboard/matches/video-filter-bar";
import { useMatchData } from "@/components/dashboard/matches/match-data-provider";
import type { VideoFilters } from "@/components/dashboard/matches/video-filters";
import { DEFAULT_FILTERS } from "@/components/dashboard/matches/video-filters";

export default function VideoPage() {
  const { matchId } = useParams<{ matchId: string }>();
  const prefersReduced = useReducedMotion();
  const { match, statsResult, points } = useMatchData();
  const [filters, setFilters] = useState<VideoFilters>(DEFAULT_FILTERS);

  const player1Name = statsResult?.player1Name ?? match.player1.name;
  const player2Name = statsResult?.player2Name ?? match.player2.name;

  const ease = [0.25, 0.46, 0.45, 0.94] as [number, number, number, number];
  const motionProps = (delay: number) => ({
    initial: prefersReduced ? { opacity: 0 } : { opacity: 0, y: 12 },
    animate: { opacity: 1, y: 0 } as const,
    transition: { duration: 0.35, delay, ease },
  });

  return (
    <div className="px-8 py-10">
      {/* Page header */}
      <div className="flex flex-col gap-2 mb-8">
        <div className="flex items-center gap-1.5 text-[10px] font-medium text-[#AAAAAA] uppercase tracking-[3px]">
          <Link
            href={`/dashboard/matches/${matchId}`}
            className="hover:text-[#888888] transition-colors duration-200"
          >
            {match.player1.name} vs {match.player2.name}
          </Link>
          <span className="text-[#CCCCCC]">/</span>
          <span>Video</span>
        </div>
        <h1 className="text-[32px] font-light text-[#0A0A0C] leading-[48px] tracking-[-0.5px]">
          Video Review
        </h1>
      </div>

      {/* Filter bar */}
      <motion.div {...motionProps(0)} className="mb-4">
        <VideoFilterBar
          filters={filters}
          onFiltersChange={setFilters}
          player1Name={player1Name}
          player2Name={player2Name}
        />
      </motion.div>

      {/* Main content: video + point list */}
      <div className="flex gap-[15px] items-start">
        <motion.div className="flex-1 min-w-0" {...motionProps(0.06)}>
          <MatchVideoPanel matchId={matchId} />
        </motion.div>
        <motion.div className="shrink-0 w-[360px]" {...motionProps(0.12)}>
          <MatchVideoSidebar
            match={match}
            points={points}
            filters={filters}
            onClearFilters={() => setFilters(DEFAULT_FILTERS)}
          />
        </motion.div>
      </div>
    </div>
  );
}
