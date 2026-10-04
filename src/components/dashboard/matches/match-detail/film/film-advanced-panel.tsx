"use client";

import { useCallback } from "react";

import { FiltersPanel } from "../match-filters/filters-panel";
import {
  serializeMatchFilters,
  type MatchFilters,
} from "../match-filters/model";
import {
  useFiltersPanelData,
  useMatchFilters,
} from "../match-filters/provider";
import { filmDraftCount, type FilmListFilters } from "./film-list-filters";
import type { FilmListTone } from "./point-list";

/**
 * Advanced filters in the point list's own column — the fullscreen film
 * room's host for the shared `FiltersPanel` (frame R4). In the report the
 * same panel opens in the 340px filters drawer instead (`FilterRail`,
 * `match-filters/filter-rail.tsx`); in the room that drawer would sit under
 * the room where it could not be reached, so the room's points drawer swaps
 * this in where its list was — never a modal over the film, which keeps
 * playing behind every filter operation.
 *
 * "Show N points" writes the shared filters and returns to the list; the X
 * returns without touching them. The panel's draft seeds on mount, so it is
 * keyed on the applied filters: a quick pick made while it is open re-seeds
 * it rather than leaving a stale draft. A landed statistic's `MatchFilters`
 * half IS in here (its pills pressed); its Film-only remainder and "Saved
 * only" are not — never part of `MatchFilters` — but the footer's count
 * honours them (`filmDraftCount`), so "Show 9 points" is exactly what the
 * list will show.
 *
 * `tone="dark"` opens the design system's `.dark` token scope inside the
 * room's 320px sheet.
 */

export interface FilmAdvancedPanelProps {
  /** The list's filter layers — the shared half seeds the draft. */
  filmFilters: FilmListFilters;
  /** Back to the list, the filters untouched. */
  onClose: () => void;
  /** Paint only. "dark" is the fullscreen room's drawer column (frame R4). */
  tone?: FilmListTone;
}

export function FilmAdvancedPanel({
  filmFilters,
  onClose,
  tone = "light",
}: FilmAdvancedPanelProps) {
  const { context } = useMatchFilters();
  const { points, availability, youName, oppName, total } =
    useFiltersPanelData();
  const { shared, setShared, remainder, savedOnly } = filmFilters;
  const countFor = useCallback(
    (draft: MatchFilters) =>
      filmDraftCount(points, draft, { remainder, savedOnly }, context),
    [points, remainder, savedOnly, context],
  );

  return (
    <div
      aria-label="Advanced filters"
      role="region"
      className="flex min-h-0 flex-1 flex-col"
    >
      <FiltersPanel
        key={serializeMatchFilters(shared)}
        className="min-h-0 flex-1"
        tone={tone}
        filters={shared}
        availability={availability}
        youName={youName}
        oppName={oppName}
        countFor={countFor}
        total={total}
        filmCut={remainder?.label ?? null}
        onApply={(next) => {
          setShared(next);
          onClose();
        }}
        onClose={onClose}
      />
    </div>
  );
}
