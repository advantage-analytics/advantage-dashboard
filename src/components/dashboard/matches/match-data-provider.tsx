"use client";

import { createContext, useContext } from "react";
import type { MatchStatisticsResult } from "@/lib/data/match-stats-server";
import type { MatchPoint } from "@/lib/data/match-points-server";

interface MatchDataContextValue {
  statsResult: MatchStatisticsResult | null;
  points: MatchPoint[];
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
  statsResult: MatchStatisticsResult | null;
  points: MatchPoint[];
  children: React.ReactNode;
}

export function MatchDataProvider({
  statsResult,
  points,
  children,
}: MatchDataProviderProps) {
  return (
    <MatchDataContext.Provider value={{ statsResult, points }}>
      {children}
    </MatchDataContext.Provider>
  );
}
