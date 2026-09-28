"use client";

import { useMemo } from "react";

import { useMatchData } from "@/components/dashboard/matches/match-data-provider";
import { useMatchSides } from "@/components/dashboard/matches/match-detail/use-match-sides";

import { FiltersPanel } from "../match-filters/filters-panel";
import {
  optionAvailability,
  serializeMatchFilters,
  type MatchFilters,
} from "../match-filters/model";
import { useMatchFilters } from "../match-filters/provider";
import type { FilmListTone } from "./point-list";

/**
 * Advanced filters, in the point list's own column (handoff P4) — since T7 a
 * thin host for the shared `FiltersPanel`, the same panel the Statistics tab
 * opens in its filters rail, editing the same `MatchFilters`.
 *
 * Not a dialog, not a popover and not the report's frame-level rail: the
 * caller swaps this in where the list was, so the film keeps playing behind
 * every filter operation. That holds in the fullscreen room too (frame R4) —
 * it opens in the drawer's own column through the same branch, never as a
 * modal over the film, and the report's rail sits under the room where it
 * could not be reached. So Film keeps one in-column host in both tones, and
 * what it hosts is the one shared panel.
 *
 * Apply writes the shared filters (the Statistics cards follow) and returns
 * to the list; Cancel returns without touching them. The panel's draft seeds
 * on mount, so it is keyed on the applied filters: a chip removed or a quick
 * pick made while it is open re-seeds it rather than leaving a stale draft.
 * A statistic's cut and "Saved only" are not in here — they are Film-only
 * layers, never part of `MatchFilters`, and each has its own control.
 *
 * `tone="dark"` is the fullscreen room's drawer: the panel opens the design
 * system's `.dark` token scope, and the host pads it to the drawer's header
 * inset. The light host pads it inside the report column's card.
 */

const HOST_TONE = {
  // The list's card already draws the surface and its 10px/8px padding.
  light: "flex min-h-0 flex-1 flex-col px-1.5 pt-1",
  // The drawer draws the 320px sheet; line up with its header's inset.
  dark: "flex min-h-0 flex-1 flex-col px-3.5 pt-[13px] pb-3",
} satisfies Record<FilmListTone, string>;

export interface FilmAdvancedPanelProps {
  /** The applied shared filters — the panel's draft starts here. */
  filters: MatchFilters;
  /** Commit the draft to the shared filters. */
  onApply: (next: MatchFilters) => void;
  /** Back to the list, the filters untouched. */
  onClose: () => void;
  /** Paint only. "dark" is the fullscreen room's drawer column (frame R4). */
  tone?: FilmListTone;
}

export function FilmAdvancedPanel({
  filters,
  onApply,
  onClose,
  tone = "light",
}: FilmAdvancedPanelProps) {
  const { points } = useMatchData();
  const sides = useMatchSides();
  const { context } = useMatchFilters();
  // Over the WHOLE match, never the filtered subset: options must not vanish
  // as you pick (`optionAvailability`'s contract).
  const availability = useMemo(
    () => optionAvailability(points, context),
    [points, context],
  );

  return (
    <div
      aria-label="Advanced filters"
      role="region"
      className={HOST_TONE[tone]}
    >
      <FiltersPanel
        key={serializeMatchFilters(filters)}
        className="min-h-0 flex-1"
        tone={tone}
        filters={filters}
        availability={availability}
        youName={sides.you.shortName}
        oppName={sides.opp.shortName}
        onApply={(next) => {
          onApply(next);
          onClose();
        }}
        onCancel={onClose}
      />
    </div>
  );
}
