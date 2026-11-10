"use client";

import { useEffect, useRef } from "react";

import { cn } from "@/lib/utils";

import {
  FILTER_SHEET_CLASS,
  FILTER_SHEET_PANEL_CLASS,
  FILTER_SHEET_SCRIM_CLASS,
  filterSheetWidthClass,
  wrapTabInSheet,
} from "../match-filters/filter-sheet";
import type { FilterRailPhase } from "../match-filters/rail-state";
import { LightboxAdvancedPanel } from "./lightbox-advanced-panel";
import { prefersReducedMotion } from "./use-reduced-motion";
import { COUNT_NOUN, type LightboxAdvancedFilters } from "./lightbox-filters";
import type { Cut, VizFilters, VizResult } from "./viz-model";

/** The drawer's id — the specs find it by this. */
const LIGHTBOX_ADVANCED_DRAWER_ID = "viz-advanced-drawer";

/**
 * The lightbox's "Advanced filters" — the Video tab's `FiltersPanel` in the
 * advanced-filters sheet (`match-filters/filter-sheet.ts`), the same one the
 * Video tab opens: 340px on the WINDOW's right edge, its whole height, a
 * layer over the lightbox rather than a panel carved into its box. Behind
 * it the whole window dims under the wash — the box darkens a step over its
 * own scrim — and a click there closes it, not the lightbox.
 *
 * Rendered inside `DialogPrimitive.Content`, so the dialog's focus scope and
 * outside-click rule count it as inside; the box is `fixed` with no
 * transform at rest, so `fixed` here is still the window. The shell makes
 * the rest of the box `inert` while it is open, and Tab wraps inside the
 * sheet. The phases are `rail-state.ts`'s reducer, driven by the shell;
 * reduced motion: no slide, gone at once.
 */
export function LightboxAdvancedDrawer({
  phase,
  onClose,
  onFinish,
  cut,
  filters,
  setFilters,
  result,
  advanced,
}: {
  phase: FilterRailPhase;
  /** The X, Show, Esc and the dimmed window: start closing. */
  onClose: () => void;
  /** The out animation ended — the drawer leaves the DOM. */
  onFinish: () => void;
  cut: Cut;
  filters: VizFilters;
  setFilters: (next: VizFilters) => void;
  result: Pick<VizResult, "total" | "noun">;
  advanced: LightboxAdvancedFilters;
}) {
  const closing = phase === "closing";
  const panelRef = useRef<HTMLDivElement>(null);

  // Take focus on open so Esc and Tab start inside the drawer. A frame
  // late: the Filters popover that opened it is closing in the same commit.
  useEffect(() => {
    if (phase !== "open") return;
    const frame = requestAnimationFrame(() =>
      panelRef.current?.focus({ preventScroll: true }),
    );
    return () => cancelAnimationFrame(frame);
  }, [phase]);

  // `motion-reduce:animate-none` means no `animationend` ever fires, so a
  // closing drawer would sit at width 0 forever — finish it at once instead.
  useEffect(() => {
    if (closing && prefersReducedMotion()) onFinish();
  }, [closing, onFinish]);

  return (
    <>
      <button
        type="button"
        aria-label="Close drawer"
        tabIndex={-1}
        data-lightbox-drawer-scrim=""
        onClick={onClose}
        className={cn(
          FILTER_SHEET_SCRIM_CLASS,
          closing && "pointer-events-none opacity-0",
        )}
      />
      <aside
        id={LIGHTBOX_ADVANCED_DRAWER_ID}
        aria-label="Advanced filters"
        // Shrinking to nothing, it must not stay in the tab order.
        inert={closing}
        // Radix's dialog trap only loops at the box's own edges.
        onKeyDown={(event) => wrapTabInSheet(event, panelRef.current)}
        onAnimationEnd={(event) => {
          if (event.animationName === "roster-drawer-out") onFinish();
        }}
        className={cn(FILTER_SHEET_CLASS, filterSheetWidthClass(closing))}
      >
        <div ref={panelRef} tabIndex={-1} className={FILTER_SHEET_PANEL_CLASS}>
          <LightboxAdvancedPanel
            cut={cut}
            filters={filters}
            setFilters={setFilters}
            total={result.total}
            noun={COUNT_NOUN[result.noun]}
            advanced={advanced}
            onClose={onClose}
          />
        </div>
      </aside>
    </>
  );
}
