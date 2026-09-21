"use client";

import { useState } from "react";
import { Bookmark, BookmarkPlus, Crosshair, ScatterChart } from "lucide-react";
import {
  FloatMenu,
  FloatMenuDivider,
  FloatMenuItem,
  FloatMenuLabel,
  FloatMenuNote,
  type FloatMenuTone,
} from "@/components/ui/float-menu";
import {
  chartAllowedOn,
  filterKeysFor,
  type Cut,
  type Chart,
  type VizFilters,
} from "./viz-model";
import { activeFilterEntries, carryFilters, type VizState } from "./viz-url";
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
  width = 300,
  tone = "light",
  side = "bottom",
  showLoadedView = false,
}: {
  savedViews: SavedViewLite[];
  onSaveRequest?: () => void;
  /**
   * Forwarded to the trigger button so `save-view-dialog.tsx` can anchor
   * under it (React 19 ref-as-prop, `viz-labels.tsx`'s `VizMenuTrigger`).
   * Unused when nothing anchors to this menu.
   */
  triggerRef?: React.Ref<HTMLButtonElement>;
  /** The fullscreen viewer's bottom slab uses 312 (Phase 2A). */
  width?: number;
  tone?: FloatMenuTone;
  side?: "top" | "bottom";
  /**
   * RULING (fix round 1): the loaded-saved-view trigger (name + bookmark
   * glyph, `loadedViewLabel`) is opt-in, default `false` — the shipped light
   * toolbar (commit 835e0d40) shows the plain cut label regardless of a
   * loaded `viewId`, unchanged. Only the fullscreen viewer passes `true`.
   */
  showLoadedView?: boolean;
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

  const loaded = showLoadedView ? loadedViewLabel(state, savedViews) : null;
  const triggerIcon =
    (loaded?.bookmark ?? false)
      ? Bookmark
      : state.cut === "serve"
        ? Crosshair
        : ScatterChart;
  const triggerLabel =
    loaded?.label ?? (state.cut ? CUT_LABEL[state.cut] : "View");

  return (
    <FloatMenu
      open={open}
      onOpenChange={setOpen}
      width={width}
      side={side}
      tone={tone}
      sideOffset={6}
      align="start"
      label="View"
      trigger={
        <VizMenuTrigger
          icon={triggerIcon}
          label={triggerLabel}
          open={open}
          tone={tone}
          ref={triggerRef}
        />
      }
    >
      {savedViews.length > 0 && (
        <>
          <FloatMenuLabel>Saved views</FloatMenuLabel>
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

      <FloatMenuLabel>All views</FloatMenuLabel>
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
          // G4: nothing to save while the court is still the "Create view"
          // blank prompt — pick a cut/chart/filter first.
          disabled={state.draft === true}
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
