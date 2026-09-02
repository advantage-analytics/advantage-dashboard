"use client";

import { createContext, useContext } from "react";
import type { MatchKpiHistory, MatchStatisticsResult } from "@/lib/data/match-stats-server";
import type { MatchPoint } from "@/lib/data/match-points-server";
import type { Match } from "@/lib/data/types";

interface MatchDataContextValue {
  match: Match;
  statsResult: MatchStatisticsResult | null;
  points: MatchPoint[];
  keyMoments: Array<{ moment: string; description: string }>;
  insights: {
    player1?: { strengths?: Array<{ name: string; value: number; description: string }>; weaknesses?: Array<{ name: string; value: number; description: string }> };
    player2?: { strengths?: Array<{ name: string; value: number; description: string }>; weaknesses?: Array<{ name: string; value: number; description: string }> };
  } | null;
  playerAverages: Partial<import("@/lib/data/types").PlayerStatistics> | null;
  kpiHistory: MatchKpiHistory | null;
}

const MatchDataContext = createContext<MatchDataContextValue | null>(null);

export function useMatchData(): MatchDataContextValue {
  const ctx = useContext(MatchDataContext);
  if (!ctx) {
    throw new Error("useMatchData must be used within a MatchDataProvider");
  }
  return ctx;
}

interface MatchDataProviderProps {
  match: Match;
  statsResult: MatchStatisticsResult | null;
  points: MatchPoint[];
  keyMoments?: Array<{ moment: string; description: string }>;
  insights?: {
    player1?: { strengths?: Array<{ name: string; value: number; description: string }>; weaknesses?: Array<{ name: string; value: number; description: string }> };
    player2?: { strengths?: Array<{ name: string; value: number; description: string }>; weaknesses?: Array<{ name: string; value: number; description: string }> };
  } | null;
  playerAverages?: Partial<import("@/lib/data/types").PlayerStatistics> | null;
  kpiHistory?: MatchKpiHistory | null;
  children: React.ReactNode;
}

export function MatchDataProvider({
  match,
  statsResult,
  points,
  keyMoments = [],
  insights = null,
  playerAverages = null,
  kpiHistory = null,
  children,
}: MatchDataProviderProps) {
  return (
    <MatchDataContext.Provider value={{ match, statsResult, points, keyMoments, insights, playerAverages, kpiHistory }}>
      {children}
    </MatchDataContext.Provider>
  );
}
