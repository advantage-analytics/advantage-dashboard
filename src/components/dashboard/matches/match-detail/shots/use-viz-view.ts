"use client";

import { useMemo } from "react";
import { useMatchData } from "@/components/dashboard/matches/match-data-provider";
import { useVizPoints } from "@/components/dashboard/matches/match-detail/shots/use-viz-points";
import {
  useMatchSides,
  type MatchSide,
} from "@/components/dashboard/matches/match-detail/use-match-sides";
import type { MatchPoint } from "@/lib/data/match-points-server";
import type { BandSettings } from "@/lib/data/viz-bands";
import type { DistanceUnit } from "@/lib/format/distance";
import type { MatchFilterContext } from "../match-filters/model";
import { useMatchFilters } from "../match-filters/provider";
import { useVizState } from "./use-viz-state";
import { useVizBands } from "@/components/dashboard/matches/match-detail/shots/viz-bands-context";
import { useVizLobKeys } from "./viz-lob-keys-context";
import {
  bandZonesFor,
  type VizBandZones,
  computeViz,
  computeVizStats,
  subjectFor,
  type Cut,
  type VizResult,
  type VizStats,
} from "./viz-model";
import { activeFilterEntries } from "./viz-url";

/**
 * The ONE data path behind both courts: the focused view
 * (`viz-focused.tsx`) and the fullscreen viewer (`viz-fullscreen.tsx`) read
 * the same points, resolve the same subject and call the same `computeViz`
 * with the same arguments — so for one URL the viewer's mark count, its
 * count/noun and its empty-state copy are necessarily identical to the
 * focused court's. This used to be inline in `viz-focused.tsx`; the viewer
 * duplicating it was exactly how the two would have drifted.
 *
 * Attribution (guardrails §4): "you" is resolved HERE, once, by
 * `useMatchSides()`; `subjectFor(filters, you.isPlayer1)` turns the `player`
 * filter into the boolean `computeViz` needs, and nothing downstream reads
 * player1/player2 off the match.
 *
 * Bands: `stats` is built with `useVizBands().bands` — the
 * workspace's depth/contact bands, loaded once in `page.tsx`, with any
 * OPTIMISTIC override a just-picked preset put in front of them
 * (`viz-bands-context.tsx`). Reading them here is what makes "every return
 * chart follows the bands" true by construction: the focused court's stats
 * card and the fullscreen viewer's overlay are both downstream of this one
 * `computeVizStats` call, so a preset pick moves the band rects and the
 * `% · n` printed on them in the same frame.
 *
 * `cut === null` (the wall) returns `result`/`stats` as `null` — both callers
 * are mounted only alongside a real cut and guard on it, but a render race
 * between a URL commit and an unmount must not throw.
 */
export interface VizView {
  cut: Cut | null;
  /** `computeViz(points, cut, filters, subjectIsPlayer1, chart)`. */
  result: VizResult | null;
  stats: VizStats | null;
  bandZones: VizBandZones | null;
  /** The resolved `subjectIsPlayer1` — pass this down, never re-derive it. */
  subjectIsPlayer1: boolean;
  /** The subject's display name (the `player` filter applied to you/opp). */
  subjectName: string;
  you: MatchSide;
  opp: MatchSide;
  /** Every point in the match. */
  points: MatchPoint[];
  /** At least one filter beyond the defaults is applied. */
  hasFilters: boolean;
  /** The "Create view" blank-court prompt is showing. */
  isDraft: boolean;
  /** The bands `stats` was bucketed with — the overlay draws these exact
   *  dividers, never a second read of `meta.bandSettings`. */
  bands: BandSettings;
  /** The unit every band label in `stats` is written in. */
  unit: DistanceUnit;
}

/**
 * The report's filter context (`useMatchFilters().context`) with the LIVE
 * bands laid in — a band edit applies here before its save lands — so the
 * advanced filters' Contact and Landed in bucket by exactly the bands the
 * court draws and counts with; and the match's lob shots
 * (`viz-lob-keys.tsx`), so the Approaches cut tells a lob from a pass.
 *
 * The ONE context the tab computes with: the wall's cards (`viz-wall.tsx`),
 * the Saved cards (`saved-views-band.tsx`) and the opened view
 * (`viz-lightbox.tsx`, `useVizView`) all read it, so a card and its lightbox
 * cannot disagree. `lobKeys` is left out (not set to `null`) until known —
 * the same "unknown" either way.
 */
export function useVizFilterContext(): MatchFilterContext {
  const { context } = useMatchFilters();
  const { bands, unit } = useVizBands();
  const lobKeys = useVizLobKeys();
  return useMemo(
    () => vizFilterContext(context, bands, unit, lobKeys),
    [context, bands, unit, lobKeys],
  );
}

/** {@link useVizFilterContext}'s merge, pure. */
export function vizFilterContext(
  context: MatchFilterContext,
  bands: BandSettings,
  unit: DistanceUnit,
  lobKeys: ReadonlySet<number> | null,
): MatchFilterContext {
  return lobKeys
    ? { ...context, bands, unit, lobKeys }
    : { ...context, bands, unit };
}

export function useVizView(): VizView {
  const points = useVizPoints(useMatchData());
  const { you, opp } = useMatchSides();
  const { state } = useVizState();
  const { bands, unit, contactHidden } = useVizBands();
  const context = useVizFilterContext();

  const cut = state.cut;
  const subjectIsPlayer1 = subjectFor(state.filters, you.isPlayer1);

  const result = useMemo(
    () =>
      cut
        ? computeViz(
            points,
            cut,
            state.filters,
            subjectIsPlayer1,
            state.chart,
            context,
          )
        : null,
    [points, cut, state.filters, subjectIsPlayer1, state.chart, context],
  );
  const stats = useMemo(
    () =>
      cut
        ? computeVizStats(
            points,
            cut,
            state.filters,
            subjectIsPlayer1,
            result ?? undefined,
            bands,
            unit,
            // The Approaches rail reads hands and lob keys off it, as the
            // court does (`computeViz` above).
            context,
          )
        : null,
    [
      points,
      cut,
      state.filters,
      subjectIsPlayer1,
      result,
      bands,
      unit,
      context,
    ],
  );

  const bandZones = useMemo(
    () => (cut ? bandZonesFor(cut, bands, unit, stats, contactHidden) : null),
    [cut, bands, unit, stats, contactHidden],
  );

  return {
    cut,
    result,
    stats,
    bandZones,
    subjectIsPlayer1,
    subjectName: state.filters.player === "you" ? you.name : opp.name,
    you,
    opp,
    points,
    hasFilters: activeFilterEntries(state).length > 0,
    isDraft: state.draft === true,
    bands,
    unit,
  };
}
