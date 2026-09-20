"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useMatchData } from "@/components/dashboard/matches/match-data-provider";
import { useMatchSides } from "@/components/dashboard/matches/match-detail/use-match-sides";
import type { SavedViewRow } from "@/lib/data/saved-views-server";
import type { WorkspaceKind } from "@/lib/workspace/types";
import { APRON_FILL, CourtArt } from "./court-art";
import { StatsCard } from "./stats-card";
import { VizToolbar } from "./viz-toolbar";
import { useVizState } from "./use-viz-state";
import {
  EMPTY_VIZ_FILTERS,
  availableSets,
  computeViz,
  computeVizStats,
  subjectFor,
  type Cut,
} from "./viz-model";
import { activeFilterEntries } from "./viz-url";
import { CUT_LABEL } from "./viz-labels";
import { AppliedStrip } from "./applied-strip";
import { FiltersPopover } from "./filters-popover";
import { SaveViewDialog } from "./save-view-dialog";

/**
 * The focused court view (Task 5): the toolbar row, then a wide court card
 * (header, art, legend) beside the 292px zone card. Replaces the pre-redesign
 * `LegacyShots` body — `shots-tab.tsx` mounts this whenever `state.cut` is
 * set.
 *
 * Attribution (guardrails §4): "you" is resolved once, by `useMatchSides()`
 * in this file; `subjectFor(state.filters, you.isPlayer1)` turns the
 * `player` filter into the boolean `computeViz` needs, and nothing below this
 * reads player1/player2 off the match.
 */

const LEGEND_CAPTION: Record<Cut, string> = {
  serve: "Half court · landing point",
  returnPlacement: "Far half · landing point",
  returnContact: "Near half · contact point",
};

export function VizFocused({
  savedViews,
  savedViewsBand,
  workspaceKind,
  workspaceName,
}: {
  savedViews: SavedViewRow[];
  savedViewsBand?: ReactNode;
  /** Save-dialog needs (Task 9): "Share with team" only exists in a team
   * workspace, and its micro copy names the workspace it shares into. */
  workspaceKind: WorkspaceKind;
  workspaceName: string;
}) {
  const { points } = useMatchData();
  const { you, opp } = useMatchSides();
  const { state, setState } = useVizState();

  // Everyone — including players — may save a view, so this is always on;
  // the ref is what lets the dialog anchor under the SAME button that opens
  // the cut menu, via `VizToolbar`'s `cutMenuTriggerRef` pass-through.
  const cutMenuTriggerRef = useRef<HTMLButtonElement>(null);
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);

  const cut = state.cut;

  // F4 fix round 2: land on the court, not wherever the viewer scrolled the
  // "Views" grid to click a tile. Keyed on `cut` alone — a stable string id
  // of which court is shown, not the full `VizState` — so a Filters-popover
  // edit (same cut, different filters, `viewId` cleared) never re-triggers
  // this; only an actual tile click (a different cut) does. `behavior:
  // "auto"` here; an animated version is a later task's to add.
  useEffect(() => {
    document
      .getElementById("match-report-pane")
      ?.scrollTo({ top: 0, behavior: "auto" });
  }, [cut]);

  const subject = subjectFor(state.filters, you.isPlayer1);
  const result = useMemo(
    () => (cut ? computeViz(points, cut, state.filters, subject) : null),
    [points, cut, state.filters, subject],
  );
  const stats = useMemo(
    () => (cut ? computeVizStats(points, cut, state.filters, subject) : null),
    [points, cut, state.filters, subject],
  );

  if (cut === null || result === null || stats === null) {
    // Guarded by `shots-tab.tsx` (`state.cut === null ? <VizWall/> : <VizFocused/>`);
    // this only fires on a race between renders, never in steady state.
    return null;
  }

  const subjectName = state.filters.player === "you" ? you.name : opp.name;
  const hasFilters = activeFilterEntries(state).length > 0;

  function backToWall() {
    setState(() => ({
      cut: null,
      chart: "scatter",
      filters: EMPTY_VIZ_FILTERS,
      viewId: null,
    }));
  }

  function clearFilters() {
    setState((prev) => ({ ...prev, filters: EMPTY_VIZ_FILTERS, viewId: null }));
  }

  return (
    <div className="flex flex-col gap-4">
      <VizToolbar
        savedViews={savedViews}
        onSaveRequest={() => setSaveDialogOpen(true)}
        cutMenuTriggerRef={cutMenuTriggerRef}
        filtersSlot={
          <FiltersPopover
            count={result.count}
            total={result.total}
            noun={result.noun}
            sets={availableSets(points)}
            youName={you.name}
            opponentName={opp.name}
          />
        }
        stripSlot={hasFilters ? <AppliedStrip /> : undefined}
      />

      <div className="flex items-start gap-4">
        <div
          className="flex min-w-[360px] flex-1 flex-col overflow-hidden rounded-[var(--radius-card)] border"
          style={{
            borderColor: "var(--border-hairline)",
            backgroundColor: "var(--surface-card)",
            boxShadow: "var(--shadow-card)",
          }}
        >
          <div className="flex items-center justify-between gap-3 px-4 pt-[14px] pb-3">
            <span
              className="text-micro truncate"
              style={{ color: "var(--ink-400)" }}
            >
              {subjectName} · {CUT_LABEL[cut]}
            </span>
            <button
              type="button"
              onClick={backToWall}
              className="shrink-0 cursor-pointer text-[11px] font-medium whitespace-nowrap text-[var(--blue)] hover:text-[var(--blue-hover)]"
            >
              Back to wall
            </button>
          </div>

          <div
            className="relative w-full"
            style={{ backgroundColor: APRON_FILL }}
          >
            <CourtArt
              cut={cut}
              dots={result.dots}
              zones={
                state.chart === "zones" && cut === "serve"
                  ? (result.zoneStats ?? undefined)
                  : undefined
              }
              labels
              // The court area spans the card's full width, capped at 400px
              // tall, with the apron green painted behind it — so any
              // letterboxing `preserveAspectRatio` (`xMidYMid meet`) leaves is
              // green, never the white the card background used to show
              // through. The cap lives on the SVG itself (`max-h-[400px]
              // w-full`, no `fill`): `width` is definite (100%) and `height`
              // is auto, so the replaced-element sizing algorithm derives a
              // height from the viewBox's intrinsic ratio and only THEN
              // clamps it to 400px — capping height on the wrapper instead
              // (an indefinite-height box) resolves the svg's `height:100%`
              // to `auto`, which lays it out at its full intrinsic height and
              // lets the wrapper's `overflow-hidden` crop it top and bottom
              // (round 1's regression).
              className="block max-h-[400px] w-full"
            />
            {result.count === 0 && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center px-6">
                <div
                  className="pointer-events-auto flex flex-col items-center gap-2 rounded-[var(--radius-card)] border px-5 py-4 text-center"
                  style={{
                    borderColor: "var(--border-hairline)",
                    backgroundColor: "var(--surface-card)",
                    boxShadow: "var(--shadow-card-emphasis)",
                  }}
                >
                  <p
                    className="text-[12px]"
                    style={{ color: "var(--ink-600)" }}
                  >
                    {hasFilters
                      ? `No ${result.noun} match these filters`
                      : `No ${result.noun} recorded for ${subjectName} yet`}
                  </p>
                  {hasFilters && (
                    <button
                      type="button"
                      onClick={clearFilters}
                      className="cursor-pointer text-[11px] font-medium text-[var(--blue)] hover:text-[var(--blue-hover)]"
                    >
                      Clear
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center gap-3 px-4 pt-[10px] pb-[14px]">
            <LegendDot color="var(--viz-good)" label="Point won" />
            <LegendDot color="var(--viz-bad)" label="Lost" />
            <LegendDot color="var(--ink-300)" label="Miss" />
            <div className="flex-1" />
            <span className="text-micro" style={{ color: "var(--ink-400)" }}>
              {LEGEND_CAPTION[cut]}
            </span>
          </div>
        </div>

        <StatsCard stats={stats} />
      </div>

      {savedViewsBand}

      <SaveViewDialog
        open={saveDialogOpen}
        onOpenChange={setSaveDialogOpen}
        anchorRef={cutMenuTriggerRef}
        cut={cut}
        chart={state.chart}
        filters={state.filters}
        savedViews={savedViews}
        workspaceKind={workspaceKind}
        workspaceName={workspaceName}
        onSaved={(view) => setState((prev) => ({ ...prev, viewId: view.id }))}
      />
    </div>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-[6px]">
      {/* An SVG circle, not a CSS dot: the legend mark carries the same
          0.4px black stroke as the court's own marks (`court-art.tsx`'s
          `DOT_STROKE`/`DOT_STROKE_W`), which a plain `background-color` div
          can't reproduce. */}
      <svg
        aria-hidden="true"
        width={8}
        height={8}
        viewBox="0 0 8 8"
        className="shrink-0"
      >
        <circle
          cx={4}
          cy={4}
          r={3.6}
          fill={color}
          stroke="#000"
          strokeWidth={0.4}
        />
      </svg>
      <span className="text-micro" style={{ color: "var(--ink-500)" }}>
        {label}
      </span>
    </span>
  );
}
