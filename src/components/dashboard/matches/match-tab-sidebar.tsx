"use client";

import { usePathname } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import type { Match } from "@/lib/data/types";
import type { MatchStatisticsResult } from "@/lib/data/match-stats-server";
import type { MatchPoint } from "@/lib/data/match-points-server";
import { MatchOverallSidebar, MatchVisualsSidebar } from "./match-stats-sidebar";
import { MatchVideoSidebar } from "./match-video-sidebar";
import { DEFAULT_FILTERS } from "./video-filters";
import { AnalysisSidebar } from "./analysis-sidebar";
import { useMatchData } from "./match-data-provider";

const EASE_CURVE = [0.25, 0.46, 0.45, 0.94] as const;

interface MatchTabSidebarProps {
  match: Match;
  matchId: string;
  statsResult: MatchStatisticsResult | null;
  points: MatchPoint[];
}

export function MatchTabSidebar({ match, matchId, statsResult, points }: MatchTabSidebarProps) {
  const pathname = usePathname() ?? "";
  const { keyMoments, insights } = useMatchData();

  let tabKey: string;
  let content: React.ReactNode;

  if (pathname.includes("/analysis")) {
    tabKey = "analysis";
    content = (
      <AnalysisSidebar
        match={match}
        statsResult={statsResult}
        keyMoments={keyMoments}
        insights={insights}
      />
    );
  } else if (pathname.includes("/video")) {
    tabKey = "video";
    content = <MatchVideoSidebar match={match} points={points} filters={DEFAULT_FILTERS} />;
  } else if (pathname.includes("/visuals")) {
    tabKey = "visuals";
    content = <MatchVisualsSidebar match={match} statsResult={statsResult} />;
  } else {
    tabKey = "overall";
    content = <MatchOverallSidebar match={match} statsResult={statsResult} />;
  }

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={tabKey}
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        transition={{ duration: 0.3, ease: [...EASE_CURVE] }}
      >
        {content}
      </motion.div>
    </AnimatePresence>
  );
}
