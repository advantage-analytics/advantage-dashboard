"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import { useMatchData } from "@/components/dashboard/matches/match-data-provider";
import { MatchResultWidget } from "@/components/dashboard/matches/widgets/match-result-widget";
import { PerformanceTrackerWidget } from "@/components/dashboard/matches/widgets/performance-tracker-widget";
import { ServePlacementWidget } from "@/components/dashboard/matches/widgets/serve-placement-widget";
import { MatchVideoWidget } from "@/components/dashboard/matches/widgets/match-video-widget";
import { MatchInsightsWidget } from "@/components/dashboard/matches/widgets/match-insights-widget";
import { MatchStatisticsWidget } from "@/components/dashboard/matches/widgets/match-statistics-widget";

const EASE_CURVE = [0.25, 0.46, 0.45, 0.94] as const;

function StaggerItem({
  children,
  index,
  prefersReducedMotion,
}: {
  children: React.ReactNode;
  index: number;
  prefersReducedMotion: boolean;
}) {
  return (
    <motion.div
      initial={prefersReducedMotion ? { opacity: 1 } : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={
        prefersReducedMotion
          ? { duration: 0 }
          : { duration: 0.35, ease: [...EASE_CURVE], delay: index * 0.06 }
      }
    >
      {children}
    </motion.div>
  );
}

export default function MatchDetailPage() {
  const { matchId } = useParams<{ matchId: string }>();
  const { match } = useMatchData();
  const prefersReducedMotion = useReducedMotion() ?? false;

  return (
    <div className="px-8 py-10">
      {/* Page heading */}
      <div className="flex items-end justify-between mb-8">
        <div className="flex flex-col gap-2">
          <p className="text-[10px] font-medium text-[#AAAAAA] uppercase tracking-[3px]">
            MATCH DETAIL
          </p>
          <h1 className="text-[32px] font-light text-[#0A0A0C] leading-[48px] tracking-[-0.5px]">
            {match.player1.name} vs {match.player2.name}
          </h1>
        </div>
        <Link
          href="/dashboard/matches"
          className="flex items-center gap-1.5 text-[11px] font-medium text-[#3B82F6] uppercase tracking-[1px] hover:text-[#2563EB] transition-colors duration-200 rounded-[6px] h-8 px-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3B82F6]/40"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          BACK
        </Link>
      </div>

      {/* Widget grid */}
      <div className="grid grid-cols-1 lg:grid-cols-[5fr_2fr] gap-[15px]">
        {/* Left column */}
        <div className="flex flex-col gap-[15px] min-w-0">
          <StaggerItem index={0} prefersReducedMotion={prefersReducedMotion}>
            <MatchResultWidget />
          </StaggerItem>
          <StaggerItem index={1} prefersReducedMotion={prefersReducedMotion}>
            <PerformanceTrackerWidget matchId={matchId} />
          </StaggerItem>
          <StaggerItem index={2} prefersReducedMotion={prefersReducedMotion}>
            <ServePlacementWidget matchId={matchId} />
          </StaggerItem>
          <StaggerItem index={3} prefersReducedMotion={prefersReducedMotion}>
            <MatchVideoWidget matchId={matchId} />
          </StaggerItem>
        </div>

        {/* Right column */}
        <div className="flex flex-col gap-[15px]">
          <StaggerItem index={0} prefersReducedMotion={prefersReducedMotion}>
            <MatchInsightsWidget matchId={matchId} />
          </StaggerItem>
          <StaggerItem index={1} prefersReducedMotion={prefersReducedMotion}>
            <MatchStatisticsWidget />
          </StaggerItem>
        </div>
      </div>
    </div>
  );
}
