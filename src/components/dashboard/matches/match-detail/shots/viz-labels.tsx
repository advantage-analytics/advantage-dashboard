"use client";

import type { LucideIcon } from "lucide-react";
import { ChevronDown, ChevronUp } from "lucide-react";
import type { Cut, Chart, VizFilters } from "./viz-model";
import { filterKeysFor } from "./viz-model";
import type { VizState } from "./viz-url";
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
  rallyPlacement: "Rally placement",
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
 *
 * `glyph: "ramp"` (G3b) is the one heat-chart entry — it carries no
 * meaningful `color`/`label`/`outline` (the render site draws the "Fewer" ·
 * 4 swatches · "More" ramp itself off the token, not off this item's
 * fields), it only exists so `legendItemsFor` stays the single place that
 * decides "what does this (cut, chart) legend show".
 */
export interface LegendItem {
  key: string;
  glyph: "circle" | "triangle" | "star" | "ramp";
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

// G3b: the one entry `chart === "heat"` ever returns — see `LegendItem`'s
// own doc comment for why its non-key fields are empty.
const RAMP_ITEM: LegendItem = {
  key: "heat-ramp",
  glyph: "ramp",
  color: "",
  label: "",
};

/**
 * `chart === "heat"` always reads as the ramp — the cells' own shade IS the
 * chart there, same reasoning `chart === "zones"` already gets below, so it
 * takes priority over any per-cut dot legend. Otherwise `chart === "zones"`
 * reads as the outcome trio — the cells ARE the chart there
 * (`court-art.tsx`'s `showZones` branch skips dots entirely), so no
 * dot-shape legend applies regardless of `cut`. Otherwise (scatter) each cut
 * adds the shape(s) its own dots vary on beyond outcome colour: serve adds
 * Ace (the only shape a serve dot takes), the two return cuts add
 * Forehand/Backhand (every return dot is one or the other). Fix round 4A: a
 * netted ball folds into Miss's own glyph (grey circle on serve, the cut's
 * own forehand/backhand shape on the two return cuts) — it's a POSITION
 * fact (`VizDot.atNet`), not a distinct glyph, so it has no legend entry of
 * its own; Miss already covers it.
 *
 * `cut === "rallyPosition"` has no Miss class — a rally shot's own outcome
 * is just the subject's point result (`computeRallyViz` never emits
 * `"miss"`), so drawing a Miss swatch nobody's dot will ever match would be
 * a legend entry with an empty meaning.
 */
export function legendItemsFor(cut: Cut, chart: Chart): LegendItem[] {
  if (chart === "heat") return [RAMP_ITEM];
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

/** Set equality for two filter-group lists — order-independent, mirroring
 * `viz-url.ts`'s own private `sameValues`. */
function sameValues(a: readonly unknown[], b: readonly unknown[]): boolean {
  if (a.length !== b.length) return false;
  const bSet = new Set(b);
  return a.every((v) => bSet.has(v));
}

/**
 * Pure — what the "View" trigger should say (F4b P2e: "The trigger shows the
 * saved view's name with a bookmark glyph once one is loaded"). `viewId` set
 * and still resolvable to a `savedViews` entry: show that view's name, with
 * `bookmark: true` only while cut/chart/every filter for that cut is STILL
 * exactly what the view saved — "Editing anything afterwards keeps the name
 * but the trigger drops the bookmark" (P2e). This deliberately does not
 * reuse `viz-url.ts`'s `sameView`: that function's id-shortcut counts a view
 * as "current" by id alone (by design, for the Views-grid ring — see its own
 * doc comment, "a saved view whose filters were themselves just edited
 * elsewhere still reads as 'current' by id"), which is exactly the case the
 * trigger's bookmark must NOT survive. Anything else (no `viewId`, or a
 * `viewId` that no longer resolves — a view deleted out from under the open
 * tab) falls back to the plain cut label, or "View" on the wall.
 *
 * Moved here (fix round 1, Task 5) from `cut-menu.tsx` — both the focused
 * court's fullscreen door (`viz-focused.tsx`) and the fullscreen viewer's own
 * pristine-view check (`viz-fullscreen.tsx`) need it, and this label module
 * (not `cut-menu.tsx`, a menu component) is the shared, dependency-free home
 * for viz label logic.
 */
export function loadedViewLabel(
  state: Pick<VizState, "cut" | "chart" | "filters" | "viewId">,
  savedViews: SavedViewLite[],
): { label: string; bookmark: boolean } {
  if (state.viewId !== null) {
    const view = savedViews.find((v) => v.id === state.viewId);
    if (view) {
      const bookmark =
        state.cut === view.cut &&
        state.chart === view.chart &&
        filterKeysFor(view.cut).every((key) =>
          key === "player"
            ? state.filters.player === view.filters.player
            : sameValues(state.filters[key], view.filters[key]),
        );
      return { label: view.name, bookmark };
    }
  }
  return {
    label: state.cut ? CUT_LABEL[state.cut] : "View",
    bookmark: false,
  };
}

/**
 * Shared trigger for both menus (P1d step 1): 28px tall, `surface-subtle` at
 * rest, `surface-muted` on hover **and while open**, a 13px leading glyph,
 * 12/500 label and a 12px chevron that flips to `chevron-up` while open.
 *
 * `meta` (Phase 2B) is an optional node between the label and the chevron —
 * the bands trigger's mono scheme name ("THIRDS"), which is not part of the
 * label and must not truncate with it. Absent everywhere else, and the
 * markup is byte-identical when it is: the light toolbar's triggers are
 * unchanged.
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
  meta,
  open,
  haspopup = "menu",
  tone = "light",
  className,
  ref,
  ...buttonProps
}: {
  icon: LucideIcon;
  label: string;
  /** An optional node between the label and the chevron — see the doc
   *  comment. Never truncates; the label gives up width first. */
  meta?: React.ReactNode;
  open: boolean;
  haspopup?: "menu" | "dialog";
  /**
   * Phase 2A: the dark fullscreen-viewer chrome (f4b-report P2d — 28px
   * `rgba(255,255,255,.1)` → `.18` at rest/hover, `.18` + `chevron-up` while
   * open, 13px icon at 70% white, 12/500 white label). Defaults `"light"`;
   * light output is unchanged.
   */
  tone?: "light" | "dark";
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
  const dark = tone === "dark";
  return (
    <button
      ref={ref}
      type="button"
      {...buttonProps}
      aria-haspopup={haspopup}
      aria-expanded={open}
      className={cn(
        "inline-flex h-7 shrink-0 cursor-pointer items-center gap-1.5 px-2 text-[12px] font-medium transition-colors duration-200",
        dark ? "text-white" : "text-[var(--ink-700)]",
        dark
          ? open
            ? "bg-white/[0.18]"
            : "bg-white/10"
          : open
            ? "bg-[var(--surface-muted)]"
            : "bg-[var(--surface-subtle)]",
        !open &&
          (dark ? "hover:bg-white/[0.18]" : "hover:bg-[var(--surface-muted)]"),
        className,
      )}
      style={{ borderRadius: "var(--radius-element)" }}
    >
      <Icon
        className={cn("size-[13px] shrink-0", dark && "text-white/70")}
        strokeWidth={1.5}
        aria-hidden="true"
      />
      <span className="truncate">{label}</span>
      {meta}
      <Chevron
        className={cn("size-3 shrink-0", dark && "text-white/70")}
        strokeWidth={1.5}
        aria-hidden="true"
      />
    </button>
  );
}
