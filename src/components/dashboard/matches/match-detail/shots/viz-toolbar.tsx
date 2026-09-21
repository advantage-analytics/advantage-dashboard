"use client";

import { CutMenu } from "./cut-menu";
import { ChartMenu } from "./chart-menu";
import type { SavedViewLite } from "./viz-labels";
import type { FloatMenuTone } from "@/components/ui/float-menu";
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
 */

export function VizToolbar({
  savedViews,
  onSaveRequest,
  cutMenuTriggerRef,
  filtersSlot,
  stripSlot,
  tone = "light",
  side = "bottom",
  className,
}: {
  savedViews: SavedViewLite[];
  onSaveRequest?: () => void;
  /** Passed straight through to `CutMenu` — see its own doc comment. */
  cutMenuTriggerRef?: React.Ref<HTMLButtonElement>;
  filtersSlot?: React.ReactNode;
  stripSlot?: React.ReactNode;
  /** Phase 2A: forwarded to `CutMenu`/`ChartMenu` for the fullscreen
   * viewer's dark bottom slab. Defaults `"light"`; unchanged there. */
  tone?: FloatMenuTone;
  side?: "top" | "bottom";
  /** F5: `viz-focused.tsx` adds `viz-vt-toolbar` — the entrance transition's
   * hook (`globals.css`) for this block staggering in on a wall→focused
   * morph. Merged onto the root, not replacing it. */
  className?: string;
}) {
  return (
    <div className={cn("flex items-center gap-3", className)}>
      <CutMenu
        savedViews={savedViews}
        onSaveRequest={onSaveRequest}
        triggerRef={cutMenuTriggerRef}
        tone={tone}
        side={side}
      />
      <ChartMenu tone={tone} side={side} />
      {stripSlot != null && (
        <>
          <div
            aria-hidden="true"
            className="h-4 w-px shrink-0 bg-[var(--border-hairline)]"
          />
          {stripSlot}
        </>
      )}
      <div className="flex-1" />
      {filtersSlot}
    </div>
  );
}
