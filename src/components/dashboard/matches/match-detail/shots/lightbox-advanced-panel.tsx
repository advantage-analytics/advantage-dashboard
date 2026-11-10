"use client";

import { useCallback, useMemo } from "react";
import { FiltersPanel } from "../match-filters/filters-panel";
import type { MatchFilters } from "../match-filters/model";
import type { CountNoun } from "../match-filters/panel-draft";
import type { LightboxAdvancedFilters } from "./lightbox-filters";
import {
  EMPTY_VIZ_FILTERS,
  foldedMatchFilters,
  withFoldedFilters,
  type Cut,
  type VizFilters,
} from "./viz-model";
import { carryFilters, cutAvailability } from "./viz-url";

/**
 * The Video tab's own `FiltersPanel` (Score / Serve / Return / Result /
 * Custom / Then — its catalog, wording and draft-then-Show), embedded in
 * the lightbox's Filters and editing `VizFilters.match`. Its options are the
 * ones this cut keeps for this court (`cutAvailability`), so Show never
 * writes a pick the carry rule then drops.
 *
 * A link's or saved view's pill groups the advanced filters can say exactly
 * (Rally, and the no-constraint Game and Result pairs) open folded into the
 * draft and are written back as advanced filters by Show
 * (`foldedMatchFilters` / `withFoldedFilters`). Set and Score never fold:
 * they are rows of the panel this slides from, which keeps owning them.
 */
export function LightboxAdvancedPanel({
  cut,
  filters,
  setFilters,
  total,
  noun,
  advanced,
  back,
}: {
  cut: Cut;
  filters: VizFilters;
  setFilters: (next: VizFilters) => void;
  total: number;
  noun: CountNoun;
  advanced: LightboxAdvancedFilters;
  back: () => void;
}) {
  const { availability, youName, oppName, count } = advanced;
  // Only the court player decides what the carry rule keeps, so the probe
  // reruns on that alone.
  const player = filters.player;
  const offered = useMemo(
    () => cutAvailability(availability, { ...EMPTY_VIZ_FILTERS, player }, cut),
    [availability, player, cut],
  );
  const fold = useMemo(
    () =>
      foldedMatchFilters(
        filters,
        (key, value) =>
          key !== "sets" &&
          key !== "scoreType" &&
          (offered[key] as ReadonlySet<unknown>).has(value),
      ),
    [filters, offered],
  );
  const { folded } = fold;
  const applied = useCallback(
    (draft: MatchFilters) =>
      carryFilters(withFoldedFilters(filters, draft, folded), cut),
    [filters, folded, cut],
  );
  const countFor = useMemo(
    () => (count ? (draft: MatchFilters) => count(applied(draft)) : undefined),
    [count, applied],
  );
  return (
    <FiltersPanel
      // Re-seeds the draft whenever the applied filters change.
      key={JSON.stringify(filters)}
      embedded
      className="min-h-0 flex-1"
      filters={fold.match}
      availability={offered}
      youName={youName}
      oppName={oppName}
      countFor={countFor}
      total={total}
      noun={noun}
      onApply={(next) => {
        setFilters(applied(next));
        back();
      }}
      onClose={back}
    />
  );
}
