"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { StatisticsMatch } from "@/lib/data/statistics";
import type { StatisticsPoint } from "@/lib/data/statistics-server";
import type { StatisticsSearchState } from "./statistics-search";

/**
 * What every region of the personal Statistics page reads.
 *
 * A context rather than props because the regions are siblings several
 * layouts deep and all read the same four things. It holds no state of its
 * own: `state` is the URL, parsed, and `setState` writes the URL back
 * (`StatisticsPageContent`). This file stays clear of `next/navigation` so a
 * region — and a spec rendering one — needs nothing but a value.
 */
export interface StatisticsContextValue {
  /** Every analyzed match, oldest → newest. */
  all: StatisticsMatch[];
  /** `applyStatisticsFilters(all, state)` — what the regions draw. */
  filtered: StatisticsMatch[];
  /**
   * The points of every match in `all` — not narrowed to `filtered`; a region
   * that tallies points narrows by `matchId` itself. `null` when the read
   * failed, which a region must say rather than draw as an empty tally.
   */
  points: StatisticsPoint[] | null;
  state: StatisticsSearchState;
  /** Merges a patch into `state` and replaces the URL with the result. */
  setState: (patch: Partial<StatisticsSearchState>) => void;
}

const StatisticsContext = createContext<StatisticsContextValue | null>(null);

export function StatisticsProvider({
  value,
  children,
}: {
  value: StatisticsContextValue;
  children: ReactNode;
}) {
  return (
    <StatisticsContext.Provider value={value}>
      {children}
    </StatisticsContext.Provider>
  );
}

export function useStatistics(): StatisticsContextValue {
  const value = useContext(StatisticsContext);
  if (!value) {
    throw new Error("useStatistics must be used inside a StatisticsProvider");
  }
  return value;
}
