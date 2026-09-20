"use client";

import type { LucideIcon } from "lucide-react";
import { ChevronDown, ChevronUp } from "lucide-react";
import type { Cut, Chart, VizFilters } from "./viz-model";
import { ACE_STAR_FILL } from "./court-art";
import { cn } from "@/lib/utils";

/**
 * Shared vocabulary for the toolbar's two menus (`cut-menu.tsx`,
 * `chart-menu.tsx`) and anything that needs to name a cut or chart in text
 * (`viz-focused.tsx`'s eyebrow). Pulled out of `viz-toolbar.tsx` so those menus
 * — which `viz-toolbar.tsx` renders — don't import back from it: `viz-toolbar`
 * imported `CutMenu`/`ChartMenu` while `cut-menu`/`chart-menu` imported
 * `CUT_LABEL`/`CHART_LABEL`/`VizMenuTrigger` from `viz-toolbar`, a circular
 * import that happened to resolve at build time but was one refactor away from
 * not. This file has no dependents inside the cycle, so it breaks it cleanly.
 */

export const CUT_LABEL: Record<Cut, string> = {
  serve: "Serve placement",
  returnPlacement: "Return placement",
  returnContact: "Return contact",
  rallyPosition: "Rally position",
};

export const CHART_LABEL: Record<Chart, string> = {
  scatter: "Scatter",
  zones: "Zones",
  heat: "Heat",
};

/**
 * G2b: the focused court's legend, one entry per glyph `court-art.tsx`
 * actually draws for the given (cut, chart) — built here instead of
 * hardcoded in `viz-focused.tsx` so the encoding is spelled out once and the
 * legend can never drift from what's on the court.
 *
 * `outline: true` marks a shape-only entry (Forehand/Backhand): those encode
 * STROKE, an axis orthogonal to outcome, so they draw as a neutral ink
 * outline rather than a won/lost/miss fill — otherwise a plain circle in
 * `--ink-500` would read as a fourth outcome next to Miss's `--ink-300`.
 */
export interface LegendItem {
  key: string;
  glyph: "circle" | "triangle" | "star";
  color: string;
  label: string;
  outline?: boolean;
}

const WON_ITEM: LegendItem = {
  key: "won",
  glyph: "circle",
  color: "var(--viz-good)",
  label: "Point won",
};
const LOST_ITEM: LegendItem = {
  key: "lost",
  glyph: "circle",
  color: "var(--viz-bad)",
  label: "Lost",
};
const MISS_ITEM: LegendItem = {
  key: "miss",
  glyph: "circle",
  color: "var(--ink-300)",
  label: "Miss",
};
const OUTCOME_ITEMS: LegendItem[] = [WON_ITEM, LOST_ITEM, MISS_ITEM];

// Imports `court-art.tsx`'s own `ACE_STAR_FILL` rather than a second literal
// — one hex, one allowlist entry, and the legend swatch can never drift from
// the court's actual fill.
const ACE_ITEM: LegendItem = {
  key: "ace",
  glyph: "star",
  color: ACE_STAR_FILL,
  label: "Ace",
};

const FOREHAND_ITEM: LegendItem = {
  key: "forehand",
  glyph: "circle",
  color: "var(--ink-500)",
  label: "Forehand",
  outline: true,
};
const BACKHAND_ITEM: LegendItem = {
  key: "backhand",
  glyph: "triangle",
  color: "var(--ink-500)",
  label: "Backhand",
  outline: true,
};

/**
 * `chart === "zones"` always reads as the outcome trio — the cells ARE the
 * chart there (`court-art.tsx`'s `showZones` branch skips dots entirely), so
 * no dot-shape legend applies regardless of `cut`. Otherwise (scatter) each
 * cut adds the shape its own dots vary on beyond outcome colour: serve adds
 * Ace (the only shape a serve dot takes), the two return cuts add
 * Forehand/Backhand (every return dot is one or the other).
 *
 * G3a: `chart === "heat"` isn't special-cased here — the ramp legend that
 * chart wants instead of this dot-shape legend is G3b's (Drawing's) call to
 * make, at the render site, since `legendItemsFor` only ever describes dot
 * glyphs. Falling through to the ordinary per-cut legend keeps this
 * function total (never throws) in the meantime.
 *
 * `cut === "rallyPosition"` has no Miss class — a rally shot's own outcome
 * is just the subject's point result (`computeRallyViz` never emits
 * `"miss"`), so drawing a Miss swatch nobody's dot will ever match would be
 * a legend entry with an empty meaning.
 */
export function legendItemsFor(cut: Cut, chart: Chart): LegendItem[] {
  if (chart === "zones") return OUTCOME_ITEMS;
  if (cut === "rallyPosition") {
    return [WON_ITEM, LOST_ITEM, FOREHAND_ITEM, BACKHAND_ITEM];
  }
  if (cut === "serve") return [...OUTCOME_ITEMS, ACE_ITEM];
  return [...OUTCOME_ITEMS, FOREHAND_ITEM, BACKHAND_ITEM];
}

/**
 * Design handoff P1a/P1c/P1f: tile filter pills, applied-filter tokens and
 * Filters-popover pills are full pills (`--radius-pill`). Buttons stay
 * `rounded-[6px]`.
 */
export const VIZ_PILL_RADIUS = "rounded-full";

/**
 * F4 fix round 2: the one 3-column tile grid — the wall's default-cuts rows,
 * the wall-variant `SavedViewsBand`'s saved-views grid, and the focused
 * view's "Views" grid (which replaced an earlier horizontally-scrolling row
 * design, corrected after live review: the frame's "5 views" with three
 * tiles visible meant a second GRID ROW below the fold, not a scroll axis).
 * Pulled out here, once, so the three call sites (`viz-wall.tsx`,
 * `saved-views-band.tsx` twice) can never draw a different column count or
 * gap — `className` for the grid + gap, `style` for the column template
 * (Tailwind has no arbitrary-value shorthand for `repeat(3, minmax(0,1fr))`
 * that stays this readable).
 */
export const VIZ_TILE_GRID_CLASS = "grid gap-4";
export const VIZ_TILE_GRID_STYLE = {
  gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
} as const;

/**
 * At most `max` pill labels, with a trailing `"+n"` standing in for the
 * rest — `saved-views-band.tsx`'s tile pill row, so a view with many active
 * filters still draws a fixed-height tile rather than growing with the
 * filter count. Pure and unrelated to `activeFilterEntries` (`viz-url.ts`),
 * which decides WHICH labels apply; this only decides how many of an
 * already-resolved list to show.
 */
export function truncatePillLabels(labels: string[], max = 3): string[] {
  if (labels.length <= max) return labels;
  return [...labels.slice(0, max), `+${labels.length - max}`];
}

/**
 * A saved view as the menu needs it — just enough to render a row and switch
 * to it. The full saved-view record (with its id's storage/ownership) lives
 * wherever views are persisted; this is the read shape.
 */
export interface SavedViewLite {
  id: string;
  name: string;
  cut: Cut;
  chart: Chart;
  filters: VizFilters;
}

/**
 * Shared trigger for both menus (P1d step 1): 28px tall, `surface-subtle` at
 * rest, `surface-muted` on hover **and while open**, a 13px leading glyph,
 * 12/500 label and a 12px chevron that flips to `chevron-up` while open.
 *
 * `haspopup` defaults to `"menu"` (the `cut-menu`/`chart-menu` shape); pass
 * `"dialog"` for a trigger that opens a `role="dialog"` panel instead —
 * `filters-popover.tsx`'s Filters trigger opens a form, not a `role="menu"`
 * list, and `aria-haspopup` needs to say so. It is applied AFTER
 * `...buttonProps` (which the prop type excludes it from anyway) so nothing
 * can shadow it back to the hardcoded default.
 */
export function VizMenuTrigger({
  icon: Icon,
  label,
  open,
  haspopup = "menu",
  className,
  ref,
  ...buttonProps
}: {
  icon: LucideIcon;
  label: string;
  open: boolean;
  haspopup?: "menu" | "dialog";
  className?: string;
  /**
   * React 19 ref-as-prop — `save-view-dialog.tsx` anchors under this exact
   * button (`cut-menu.tsx` forwards its own `triggerRef` here) rather than
   * hand-rolling a second position. Unused by `chart-menu.tsx`/
   * `filters-popover.tsx`, which have nothing anchoring to them.
   */
  ref?: React.Ref<HTMLButtonElement>;
} & Omit<
  React.ButtonHTMLAttributes<HTMLButtonElement>,
  "type" | "aria-expanded" | "aria-haspopup"
>) {
  const Chevron = open ? ChevronUp : ChevronDown;
  return (
    <button
      ref={ref}
      type="button"
      {...buttonProps}
      aria-haspopup={haspopup}
      aria-expanded={open}
      className={cn(
        "inline-flex h-7 shrink-0 cursor-pointer items-center gap-1.5 px-2 text-[12px] font-medium text-[var(--ink-700)] transition-colors duration-200",
        open ? "bg-[var(--surface-muted)]" : "bg-[var(--surface-subtle)]",
        !open && "hover:bg-[var(--surface-muted)]",
        className,
      )}
      style={{ borderRadius: "var(--radius-element)" }}
    >
      <Icon
        className="size-[13px] shrink-0"
        strokeWidth={1.5}
        aria-hidden="true"
      />
      <span className="truncate">{label}</span>
      <Chevron
        className="size-3 shrink-0"
        strokeWidth={1.5}
        aria-hidden="true"
      />
    </button>
  );
}
