/**
 * The lightbox's Statistics row filter (canvas S10/S17): which drawn marks a
 * Statistics row stands for. Pure; every rule is the stats' own, so the row
 * filter keeps exactly the marks the row counted
 * (`tests/stat-row-filter.spec.ts`).
 *
 * A serve row ("Deuce T") is the existing Zone and Court filters' points,
 * less the serves that missed — the in-play serves the zone counts. Every
 * other cut asks `statRowKeyOf` (`viz-model.ts`), the per-mark form of the
 * same bucketing `computeVizStats` does.
 */

import type { MatchPoint } from "@/lib/data/match-points-server";
import type { BandSettings } from "@/lib/data/viz-bands";
import type { MatchFilterContext } from "../match-filters/model";
import {
  computeViz,
  statRowKeyOf,
  type CourtSideValue,
  type Cut,
  type VizDot,
  type VizFilters,
  type ZoneValue,
} from "./viz-model";

export interface StatPick {
  /** The `StatGroup.key` — or, on serve, the court side the row sits in. */
  group: string;
  /** The `StatRow.key`. */
  row: string;
  /** The row's own words, for the applied strip. */
  label: string;
}

export function statPickDotIds(
  points: MatchPoint[],
  cut: Cut,
  filters: VizFilters,
  subjectIsPlayer1: boolean,
  matchCtx: MatchFilterContext | undefined,
  dots: readonly VizDot[],
  pick: StatPick,
  bands: BandSettings,
): Set<string> {
  if (cut === "serve") {
    const [side, zone] = pick.row.split("-") as [CourtSideValue, ZoneValue];
    const zoned = computeViz(
      points,
      "serve",
      { ...filters, zone: [zone], court: [side] },
      subjectIsPlayer1,
      "scatter",
      matchCtx,
    );
    return new Set(
      zoned.dots.filter((d) => d.outcome !== "miss").map((d) => d.id),
    );
  }
  const pointById = new Map(points.map((p) => [p.id, p]));
  return new Set(
    dots
      .filter(
        (d) =>
          statRowKeyOf(
            cut,
            pick.group,
            d,
            d.meta?.pointId ? pointById.get(d.meta.pointId) : undefined,
            bands,
          ) === pick.row,
      )
      .map((d) => d.id),
  );
}

/** The serve cut's six Statistics rows, as `computeVizStats` keys them. */
export const SERVE_ROW_KEYS = [
  "deuce-t",
  "deuce-body",
  "deuce-wide",
  "ad-t",
  "ad-body",
  "ad-wide",
] as const;

/**
 * Every serve row's marks at once — `statPickDotIds` for each of the six
 * rows, so a caller that hovers across them (the lightbox's Statistics
 * column) runs each zone's `computeViz` once per filter state rather than
 * once per hover. Identical sets, row by row.
 */
export function serveRowDotIds(
  points: MatchPoint[],
  filters: VizFilters,
  subjectIsPlayer1: boolean,
  matchCtx: MatchFilterContext | undefined,
  bands: BandSettings,
): Map<string, Set<string>> {
  return new Map(
    SERVE_ROW_KEYS.map((row) => [
      row,
      statPickDotIds(
        points,
        "serve",
        filters,
        subjectIsPlayer1,
        matchCtx,
        [],
        { group: row.split("-")[0], row, label: row },
        bands,
      ),
    ]),
  );
}
