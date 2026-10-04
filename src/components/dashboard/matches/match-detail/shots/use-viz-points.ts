"use client";

import { useMemo } from "react";

import {
  isDerivedMatch,
  isUnreturnedServe,
} from "@/components/dashboard/matches/match-detail/match-filters/model";
import type { MatchPoint } from "@/lib/data/match-points-server";
import type { Match } from "@/lib/data/types";

/**
 * The points the Visualizations tab reads, with a derived match's aces named.
 *
 * `viz-model.ts` and `serve-zones.ts` find an ace by `resultType === "Ace"`
 * (the Result filter, the star glyph, the zone tiles' ace count). The
 * Advantage Intelligence derivation never writes "Ace" — every unreturned
 * serve is a "Service Winner" — yet the head-to-head Aces row and Serve ›
 * Result "Ace" count exactly those (`isUnreturnedServe`, product decision
 * 2026-09-29). Relabelling them once here, rather than threading a flag
 * through every model call, keeps this tab's aces the head-to-head's aces.
 * SwingVision points pass through untouched, and so does the array.
 */
export function vizPoints(
  points: MatchPoint[],
  isDerived: boolean,
): MatchPoint[] {
  if (!isDerived) return points;
  return points.map((p) =>
    isUnreturnedServe(p) && p.resultType !== "Ace"
      ? { ...p, resultType: "Ace" }
      : p,
  );
}

/**
 * `useMatchData()`'s points through {@link vizPoints}, memoised per match.
 * Takes the provider's value rather than reading it, so this module imports
 * no provider and offline harnesses can load it for real.
 */
export function useVizPoints({
  match,
  points,
}: {
  match: Pick<Match, "sourceProvider">;
  points: MatchPoint[];
}): MatchPoint[] {
  const isDerived = isDerivedMatch(match);
  return useMemo(() => vizPoints(points, isDerived), [points, isDerived]);
}
