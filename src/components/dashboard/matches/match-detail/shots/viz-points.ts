import { isUnreturnedServe } from "@/components/dashboard/matches/match-detail/match-filters/model";
import type { MatchPoint } from "@/lib/data/match-points-server";

/**
 * The points the Visualizations tab reads, with a derived match's aces named.
 *
 * `viz-model.ts` and `serve-zones.ts` find an ace by `resultType === "Ace"`
 * (the Result filter, the star glyph, the zone tiles' ace count). The
 * Advantage Intelligence derivation never writes "Ace" — every unreturned
 * serve is a "Service Winner", like a missed return — yet the head-to-head
 * Aces row and Serve › Result "Ace" count exactly those (`isUnreturnedServe`,
 * product decision 2026-09-29). Relabelling them once here, rather than
 * threading a flag through every model call, keeps this tab's aces the
 * head-to-head's aces. SwingVision points pass through untouched, and so
 * does the array.
 *
 * Plain TypeScript, no directive: the match report reads it through
 * `useVizPoints` (`use-viz-points.ts`, a client module) and the player
 * profile's season fold (`lib/data/player-season-viz.ts`) calls it on the
 * server, per match — a `"use client"` module's exports are client
 * references there, not functions.
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
