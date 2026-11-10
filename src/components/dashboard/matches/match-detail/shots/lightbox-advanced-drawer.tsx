"use client";

import { useEffect, useRef } from "react";

import { cn } from "@/lib/utils";

import type { FilterRailPhase } from "../match-filters/rail-state";
import { LightboxAdvancedPanel } from "./lightbox-advanced-panel";
import { prefersReducedMotion } from "./use-reduced-motion";
import { COUNT_NOUN, type LightboxAdvancedFilters } from "./lightbox-filters";
import type { Cut, VizFilters, VizResult } from "./viz-model";

/** The drawer's id — the specs find it by this. */
const LIGHTBOX_ADVANCED_DRAWER_ID = "viz-advanced-drawer";

/** What Tab may land on inside the drawer. */
const TABBABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * The lightbox's "Advanced filters" — the Video tab's `FiltersPanel` in a
 * 340px drawer INSIDE the lightbox's box, the report's filters drawer
 * (`match-filters/filter-rail.tsx`) brought into the dialog: anchored to the
 * box's right edge over the Statistics / Points column, the box's whole
 * height (the rail is its host's whole height too, and has its own header
 * with the X, so the lightbox's X is not left standing beside a second one).
 * White surface, hairline left edge, `--shadow-dropdown`, the box's 14px
 * radius on its outer corners.
 *
 * The same shell as the rail and the roster's drawer: the WIDTH runs
 * `roster-drawer-in` / `-out` (200ms `--ease-primary`) and the drawer leaves
 * the DOM when the out animation ends. Reduced motion: no slide, gone at
 * once. The phases are `rail-state.ts`'s reducer, driven by the shell.
 *
 * Behind it the rest of the box dims with the peek drawers' wash
 * (`DrawerScrim`, `shared/drawer-sheet.tsx` — `bg-black/20`, fading with the
 * drawer) and a click there closes it. Not a second dialog and no second
 * full-screen scrim: the shell makes the rest of the box `inert` while it is
 * open, and Tab wraps inside the drawer.
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
  /** The X, Show, Esc and the dimmed box: start closing. */
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

  // Tab and Shift+Tab wrap inside the drawer. The rest of the box is
  // `inert`, but Radix's dialog trap only loops at the box's own edges.
  function onKeyDown(event: React.KeyboardEvent<HTMLElement>) {
    if (event.key !== "Tab" || event.altKey || event.metaKey || event.ctrlKey)
      return;
    const items = [
      ...event.currentTarget.querySelectorAll<HTMLElement>(TABBABLE),
    ].filter((el) => el.getClientRects().length > 0);
    if (items.length === 0) return;
    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement;
    const atEdge = event.shiftKey
      ? active === first || active === panelRef.current
      : active === last;
    if (!atEdge) return;
    event.preventDefault();
    event.stopPropagation();
    (event.shiftKey ? last : first).focus();
  }

  return (
    <>
      <button
        type="button"
        aria-label="Close drawer"
        tabIndex={-1}
        data-lightbox-drawer-scrim=""
        onClick={onClose}
        className={cn(
          "absolute inset-0 z-40 cursor-default rounded-[14px] bg-black/20 transition-opacity duration-200 ease-[var(--ease-primary)] motion-reduce:transition-none starting:opacity-0",
          closing && "pointer-events-none opacity-0",
        )}
      />
      <aside
        id={LIGHTBOX_ADVANCED_DRAWER_ID}
        aria-label="Advanced filters"
        // Shrinking to nothing, it must not stay in the tab order.
        inert={closing}
        onKeyDown={onKeyDown}
        onAnimationEnd={(event) => {
          if (event.animationName === "roster-drawer-out") onFinish();
        }}
        className={cn(
          "absolute inset-y-0 right-0 z-50 overflow-hidden rounded-r-[14px] border-l border-[var(--border-hairline)] bg-[var(--surface-card)] shadow-[var(--shadow-dropdown)] motion-reduce:animate-none",
          closing
            ? "w-0 animate-[roster-drawer-out_200ms_var(--ease-primary)_both]"
            : "w-[340px] animate-[roster-drawer-in_200ms_var(--ease-primary)_both]",
        )}
      >
        <div
          ref={panelRef}
          tabIndex={-1}
          className="flex h-full w-[340px] flex-col outline-none"
        >
          <LightboxAdvancedPanel
            cut={cut}
            filters={filters}
            setFilters={setFilters}
            total={result.total}
            noun={COUNT_NOUN[result.noun]}
            advanced={advanced}
            onClose={onClose}
            onCloseTooltipEscape={onClose}
          />
        </div>
      </aside>
    </>
  );
}
