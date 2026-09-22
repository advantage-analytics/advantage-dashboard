"use client";

import {
  createContext,
  use,
  useCallback,
  useRef,
  useState,
  type RefObject,
} from "react";
import type {
  MatchKpiHistory,
  MatchStatisticsResult,
} from "@/lib/data/match-stats-server";
import type { MatchPoint } from "@/lib/data/match-points-server";
import type { Match } from "@/lib/data/types";

interface MatchDataContextValue {
  match: Match;
  statsResult: MatchStatisticsResult | null;
  /**
   * The match's points, INCLUDING every bookmark toggled since the page
   * loaded.
   *
   * The server's array seeds this once; after that the film tab's optimistic
   * write path owns it (`setPoints` below). It lives here rather than in the
   * tab because `MatchReportWhen` unmounts an inactive view: with the state
   * inside the tab, switching to Statistics and back re-seeded it from the
   * page's original server render and every bookmark made since vanished from
   * the UI (the rows were in `point_bookmarks` all along — only a hard reload
   * brought them back).
   */
  points: MatchPoint[];
  /**
   * The authoritative copy for a write path, in sync with `points` at all
   * times.
   *
   * `setPoints`' state update lands on the NEXT render, so a handler that
   * computed a new flag and then built the UPDATE a line later would still be
   * holding the old value. Reading and writing through the ref keeps the
   * optimistic value, the value sent to Postgres, and the value reverted to
   * identical even when somebody clicks two bookmarks in the same tick.
   */
  pointsRef: RefObject<MatchPoint[]>;
  /** Replace the points array; writes the ref and the state together. */
  setPoints: (next: MatchPoint[]) => void;
  keyMoments: Array<{ moment: string; description: string }>;
  insights: {
    player1?: {
      strengths?: Array<{ name: string; value: number; description: string }>;
      weaknesses?: Array<{ name: string; value: number; description: string }>;
    };
    player2?: {
      strengths?: Array<{ name: string; value: number; description: string }>;
      weaknesses?: Array<{ name: string; value: number; description: string }>;
    };
  } | null;
  playerAverages: Partial<import("@/lib/data/types").PlayerStatistics> | null;
  kpiHistory: MatchKpiHistory | null;
}

const MatchDataContext = createContext<MatchDataContextValue | null>(null);

export function useMatchData(): MatchDataContextValue {
  const ctx = use(MatchDataContext);
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
    player1?: {
      strengths?: Array<{ name: string; value: number; description: string }>;
      weaknesses?: Array<{ name: string; value: number; description: string }>;
    };
    player2?: {
      strengths?: Array<{ name: string; value: number; description: string }>;
      weaknesses?: Array<{ name: string; value: number; description: string }>;
    };
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
  // Seeded once, then owned by the film tab's bookmark toggle. The match
  // layout gives this provider a `key={match.id}`, so moving to another match
  // remounts it and the seed is taken again rather than carried over.
  const [livePoints, setLivePoints] = useState<MatchPoint[]>(points);
  const pointsRef = useRef<MatchPoint[]>(points);
  const setPoints = useCallback((next: MatchPoint[]) => {
    pointsRef.current = next;
    setLivePoints(next);
  }, []);

  return (
    <MatchDataContext
      value={{
        match,
        statsResult,
        points: livePoints,
        pointsRef,
        setPoints,
        keyMoments,
        insights,
        playerAverages,
        kpiHistory,
      }}
    >
      {children}
    </MatchDataContext>
  );
}
