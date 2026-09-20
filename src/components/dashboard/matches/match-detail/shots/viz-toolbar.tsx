"use client";

import { CutMenu, type SavedViewLite } from "./cut-menu";
import { ChartMenu } from "./chart-menu";

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
  filtersSlot,
  stripSlot,
}: {
  savedViews: SavedViewLite[];
  onSaveRequest?: () => void;
  filtersSlot?: React.ReactNode;
  stripSlot?: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3">
      <CutMenu savedViews={savedViews} onSaveRequest={onSaveRequest} />
      <ChartMenu />
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
