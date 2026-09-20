"use client";

import { useState } from "react";
import { BookmarkPlus, Crosshair, ScatterChart } from "lucide-react";
import {
  FloatMenu,
  FloatMenuDivider,
  FloatMenuItem,
  FloatMenuNote,
} from "@/components/ui/float-menu";
import {
  chartAllowedOn,
  type Cut,
  type Chart,
  type VizFilters,
} from "./viz-model";
import { activeFilterEntries, carryFilters } from "./viz-url";
import { useVizState } from "./use-viz-state";
import {
  CHART_LABEL,
  CUT_LABEL,
  VizMenuTrigger,
  type SavedViewLite,
} from "./viz-labels";

function filterCountLabel(cut: Cut, chart: Chart, filters: VizFilters): string {
  const n = activeFilterEntries({ cut, chart, filters, viewId: null }).length;
  if (n === 0) return "no filters";
  return n === 1 ? "1 filter" : `${n} filters`;
}

/**
 * The "View" menu (P1d): switch cuts, jump to a saved view, or save the
 * current one. `savedViews` is the read-only list already resolved by the
 * caller — this component holds no fetch of its own.
 *
 * Switching cuts resets serve-only filter values (`carryFilters`) and drops
 * to `scatter` off serve, since Zones is Serve-only (guardrails: the chart
 * pairing lives here, not duplicated at each call site). Switching to a
 * saved view instead replaces cut/chart/filters wholesale and remembers
 * `viewId`, so the trigger and the "chosen" check both track it.
 */
export function CutMenu({
  savedViews,
  onSaveRequest,
  triggerRef,
}: {
  savedViews: SavedViewLite[];
  onSaveRequest?: () => void;
  /**
   * Forwarded to the trigger button so `save-view-dialog.tsx` can anchor
   * under it (React 19 ref-as-prop, `viz-labels.tsx`'s `VizMenuTrigger`).
   * Unused when nothing anchors to this menu.
   */
  triggerRef?: React.Ref<HTMLButtonElement>;
}) {
  const { state, setState } = useVizState();
  const [open, setOpen] = useState(false);

  function selectCut(cut: Cut) {
    setState((prev) => ({
      ...prev,
      cut,
      // Zones falls back to scatter off serve; heat (allowed on every cut)
      // survives the switch — `chartAllowedOn` is the one pure rule behind
      // this, also used by `parseVizState` and `validateVizInput`.
      chart: chartAllowedOn(cut, prev.chart) ? prev.chart : "scatter",
      filters: carryFilters(prev.filters, cut),
      viewId: null,
    }));
    setOpen(false);
  }

  function selectSavedView(view: SavedViewLite) {
    setState((prev) => ({
      ...prev,
      cut: view.cut,
      chart: view.chart,
      filters: view.filters,
      viewId: view.id,
    }));
    setOpen(false);
  }

  const triggerIcon = state.cut === "serve" ? Crosshair : ScatterChart;
  const triggerLabel = state.cut ? CUT_LABEL[state.cut] : "View";

  return (
    <FloatMenu
      open={open}
      onOpenChange={setOpen}
      width={300}
      sideOffset={6}
      align="start"
      label="View"
      trigger={
        <VizMenuTrigger
          icon={triggerIcon}
          label={triggerLabel}
          open={open}
          ref={triggerRef}
        />
      }
    >
      {savedViews.length > 0 && (
        <>
          <p className="px-2.5 pt-1 pb-1 text-[11px] text-[var(--ink-400)]">
            Saved views
          </p>
          {savedViews.map((view) => (
            <FloatMenuItem
              key={view.id}
              label={view.name}
              description={`${CUT_LABEL[view.cut]} · ${CHART_LABEL[view.chart]} · ${filterCountLabel(view.cut, view.chart, view.filters)}`}
              chosen={state.viewId === view.id}
              onSelect={() => selectSavedView(view)}
            />
          ))}
          <FloatMenuDivider />
        </>
      )}

      <p className="px-2.5 pt-1 pb-1 text-[11px] text-[var(--ink-400)]">
        All views
      </p>
      <FloatMenuItem
        label="Serve placement"
        description="Where the serve lands, by zone"
        chosen={state.cut === "serve"}
        onSelect={() => selectCut("serve")}
      />
      <FloatMenuItem
        label="Return placement"
        description="Where the return lands"
        chosen={state.cut === "returnPlacement"}
        onSelect={() => selectCut("returnPlacement")}
      />
      <FloatMenuItem
        label="Return contact"
        description="Where the return is struck"
        chosen={state.cut === "returnContact"}
        onSelect={() => selectCut("returnContact")}
      />
      <FloatMenuItem
        label="Rally position"
        description="Where every rally shot was struck"
        chosen={state.cut === "rallyPosition"}
        onSelect={() => selectCut("rallyPosition")}
      />

      <FloatMenuDivider />

      {onSaveRequest && (
        <FloatMenuItem
          label="Save this view…"
          icon={
            <BookmarkPlus
              className="size-[13px] shrink-0"
              strokeWidth={1.5}
              aria-hidden="true"
            />
          }
          className="[&_span]:text-[var(--blue)]"
          onSelect={() => {
            setOpen(false);
            onSaveRequest();
          }}
        />
      )}

      <FloatMenuNote>
        A view saves the cut, the chart and the filters. Depth bands are not
        part of it — they belong to the workspace.
      </FloatMenuNote>
    </FloatMenu>
  );
}
