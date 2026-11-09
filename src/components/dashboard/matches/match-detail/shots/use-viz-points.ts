"use client";

import { useMemo } from "react";

import { isDerivedMatch } from "@/components/dashboard/matches/match-detail/match-filters/model";
import type { MatchPoint } from "@/lib/data/match-points-server";
import type { Match } from "@/lib/data/types";
import { vizPoints } from "./viz-points";

// The pure relabelling lives in `viz-points.ts` (no directive) so the player
// profile's season fold can call it on the server; re-exported here so every
// existing `import { vizPoints } from "./use-viz-points"` keeps working.
export { vizPoints };

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
