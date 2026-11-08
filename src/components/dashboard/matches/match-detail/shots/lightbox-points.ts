/**
 * Which match points stand behind the marks on an opened card — the
 * lightbox's Points list, its "matched / total" count and "Watch these N
 * points". Pure; it only reads `VizDot`s `computeViz` already produced.
 *
 * A mark is a shot, not a point: a return card can draw two marks for one
 * point, and a serve that went out is a fault, not a point — the rally
 * carries on with the second serve (canvas S07: "A fault isn't a point, so
 * there is no clip"). So the list is the distinct `meta.pointId`s of the
 * marks, in match order, leaving out serve marks that missed.
 */

import type { MatchPoint } from "@/lib/data/match-points-server";
import type { Cut, VizDot } from "./viz-model";

/** The mark stands for a point you could play: it is not a missed serve. */
export function markIsPoint(cut: Cut, dot: VizDot): boolean {
  return !(cut === "serve" && dot.outcome === "miss");
}

/**
 * The points behind `dots`, distinct and in the match's own order (the
 * order `points` holds them in). A dot without a `pointId` is skipped.
 */
export function pointsBehind(
  cut: Cut,
  dots: readonly VizDot[],
  points: readonly MatchPoint[],
): MatchPoint[] {
  const ids = new Set<string>();
  for (const dot of dots) {
    const id = dot.meta?.pointId;
    if (id && markIsPoint(cut, dot)) ids.add(id);
  }
  return points.filter((p) => ids.has(p.id));
}

/** A point with a clip in the match video. */
export function isPlayable(point: MatchPoint): boolean {
  return point.videoTime !== null && Number.isFinite(point.videoTime);
}

/**
 * The lightbox legend's one choice (canvas S06/S07): Won · Lost · Out · Ace.
 * It narrows the drawn marks by the outcome fields `computeViz` already set —
 * no new data. Won includes aces (an ace is a point won); Out is a miss, in
 * the net or past a line.
 */
export type LegendPick = "won" | "lost" | "out" | "ace";

export const LEGEND_PICKS: { key: LegendPick; label: string }[] = [
  { key: "won", label: "Won" },
  { key: "lost", label: "Lost" },
  { key: "out", label: "Out" },
  { key: "ace", label: "Ace" },
];

export function dotMatchesPick(dot: VizDot, pick: LegendPick): boolean {
  if (pick === "ace") return dot.shape === "star";
  if (pick === "out") return dot.outcome === "miss";
  return dot.outcome === pick;
}

/** How many marks each legend key would keep. */
export function legendCounts(
  dots: readonly VizDot[],
): Record<LegendPick, number> {
  const counts: Record<LegendPick, number> = {
    won: 0,
    lost: 0,
    out: 0,
    ace: 0,
  };
  for (const dot of dots)
    for (const { key } of LEGEND_PICKS)
      if (dotMatchesPick(dot, key)) counts[key]++;
  return counts;
}
