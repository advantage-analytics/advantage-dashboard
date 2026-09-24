"use client";

import { CutMenu } from "./cut-menu";
import { ChartMenu } from "./chart-menu";
import type { SavedViewLite } from "./viz-labels";
import { cn } from "@/lib/utils";

/**
 * The Visualizations tab's toolbar row (P1d/P1e): the cut menu, the chart
 * menu, an optional strip (a per-cut control, e.g. depth bands later) behind
 * a hairline, then a spacer and the filters slot.
 *
 * `viz-focused.tsx` mounts this. Its two menus (`cut-menu.tsx`,
 * `chart-menu.tsx`) both read/write `useVizState` directly rather than
 * through props, so this component stays a pure layout shell.
 *
 * `CUT_LABEL`, `CHART_LABEL`, `VizMenuTrigger` and `SavedViewLite` live in
 * `viz-labels.tsx`, not here — see that file's docstring for why.
 *
 * Deliberately has no `tone`/`side`: the fullscreen viewer builds its own
 * bottom slab out of `CutMenu`/`ChartMenu` directly rather than reusing this
 * row, so the two props this file briefly forwarded were never passed by
 * anyone (final review #9, dead code).
 */

export function VizToolbar({
  savedViews,
  onSaveRequest,
  cutMenuTriggerRef,
  filtersSlot,
  stripSlot,
  className,
}: {
  savedViews: SavedViewLite[];
  onSaveRequest?: () => void;
  /** Passed straight through to `CutMenu` — see its own doc comment. */
  cutMenuTriggerRef?: React.Ref<HTMLButtonElement>;
  filtersSlot?: React.ReactNode;
  stripSlot?: React.ReactNode;
  /** F5: `viz-focused.tsx` adds `viz-vt-toolbar` — the entrance transition's
   * hook (`globals.css`) for this block staggering in on a wall→focused
   * morph. Merged onto the root, not replacing it. */
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-x-3 gap-y-2 @min-[560px]:flex-nowrap",
        className,
      )}
    >
      <div className="flex min-w-0 items-center gap-3">
        <CutMenu
          savedViews={savedViews}
          onSaveRequest={onSaveRequest}
          triggerRef={cutMenuTriggerRef}
        />
        <ChartMenu />
      </div>
      {stripSlot != null && (
        <>
          <div
            aria-hidden="true"
            className="hidden h-4 w-px shrink-0 bg-[var(--border-hairline)] @min-[560px]:block"
          />
          <div className="order-last w-full min-w-0 @min-[560px]:order-none @min-[560px]:w-auto">
            {stripSlot}
          </div>
        </>
      )}
      <div className="hidden flex-1 @min-[560px]:block" />
      {filtersSlot}
    </div>
  );
}
