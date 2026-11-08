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
