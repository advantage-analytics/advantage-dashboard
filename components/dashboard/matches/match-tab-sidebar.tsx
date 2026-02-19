"use client";

import { usePathname } from "next/navigation";
import type { Match } from "@/lib/data/types";
import type { MatchStatisticsResult } from "@/lib/data/match-stats-server";
import { MatchOverallSidebar } from "./match-overall-sidebar";
import { MatchVisualsSidebar } from "./match-visuals-sidebar";

interface MatchTabSidebarProps {
  match: Match;
  matchId: string;
  statsResult: MatchStatisticsResult | null;
}

export function MatchTabSidebar({ match, matchId, statsResult }: MatchTabSidebarProps) {
  const pathname = usePathname() ?? "";

  if (pathname.includes("/visuals")) {
    return <MatchVisualsSidebar match={match} matchId={matchId} statsResult={statsResult} />;
  }

  // Default: Overall sidebar (also used for Video until its version is built)
  return <MatchOverallSidebar match={match} statsResult={statsResult} />;
}

