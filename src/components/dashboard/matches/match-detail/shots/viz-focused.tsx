"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useMatchData } from "@/components/dashboard/matches/match-data-provider";
import { useMatchSides } from "@/components/dashboard/matches/match-detail/use-match-sides";
import type { SavedViewRow } from "@/lib/data/saved-views-server";
import type { WorkspaceKind } from "@/lib/workspace/types";
import { APRON_FILL, CourtArt } from "./court-art";
import { trianglePointsFor, starPoints } from "./court-geometry";
import { StatsCard } from "./stats-card";
import { VizToolbar } from "./viz-toolbar";
import { useVizState } from "./use-viz-state";
import { usePrefersReducedMotion } from "./use-reduced-motion";
import {
  EMPTY_VIZ_FILTERS,
  availableSets,
  computeViz,
  computeVizStats,
  subjectFor,
  type Cut,
} from "./viz-model";
import { activeFilterEntries, viewIdentityKey } from "./viz-url";
import { CUT_LABEL, legendItemsFor, type LegendItem } from "./viz-labels";
import { AppliedStrip } from "./applied-strip";
import { FiltersPopover } from "./filters-popover";
import { SaveViewDialog } from "./save-view-dialog";
import {
  VIZ_COURT_TRANSITION_NAME,
  VIZ_FOCUSED_COURT_MORPH_TARGET,
  VIZ_FOCUSED_HEADING_ID,
  courtTileDomId,
} from "./viz-court-transition";

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
 *
 * F5: the big court's art box carries this view's `view-transition-name`
 * whenever it's the morph's destination (`morphTargetKey` matching this
 * view's own `viewIdentityKey`) — the wall/Views-grid tile that was clicked
 * grows into it. "Back to wall" runs the reverse through the same
 * `runCourtMorph`, using this court itself (`courtArtRef`) as the morph's
 * source. The eyebrow (`VIZ_FOCUSED_HEADING_ID`, `tabIndex={-1}`) is
 * `runCourtMorph`'s focus-landing target for every morph that arrives here.
 */

const LEGEND_CAPTION: Record<Cut, string> = {
  serve: "Half court · landing point",
  returnPlacement: "Far half · landing point",
  returnContact: "Near half · contact point",
  // rallyPosition renders through the returnContact frame (G3's Drawing
  // task, not yet built) — same caption, since it's the same half.
  rallyPosition: "Near half · contact point",
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
  const {
    state,
    setState,
    runCourtMorph,
    morphTargetKey,
    externalCourtSwap,
    clearExternalCourtSwap,
  } = useVizState();
  const reducedMotion = usePrefersReducedMotion();

  // Everyone — including players — may save a view, so this is always on;
  // the ref is what lets the dialog anchor under the SAME button that opens
  // the cut menu, via `VizToolbar`'s `cutMenuTriggerRef` pass-through.
  const cutMenuTriggerRef = useRef<HTMLButtonElement>(null);
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const courtArtRef = useRef<HTMLDivElement>(null);

  const cut = state.cut;
  const ownKey = viewIdentityKey(state);

  // F4 fix round 2, F5 fix: land on the court, not wherever the viewer
  // scrolled the "Views" grid to click a tile. Keyed on `viewIdentityKey`
  // (`cut` + subject + `viewId`, not `cut` alone as the original F4 fix
  // had it) — a Filters-popover edit (same court, different filters) still
  // never re-triggers this; but a Views-grid click that changes the
  // SUBJECT or lands on a different saved view without changing `cut` now
  // correctly does, closing the gap the original round left (that version
  // scrolled only on a `cut` change, silently skipping a same-cut
  // player/view switch). `behavior: "auto"` — the shared-element morph
  // itself is what visually carries the viewer to the top; this is a
  // plain safety net for whenever no transition ran (reduced motion,
  // unsupported browser, or a direct URL/hard navigation).
  useEffect(() => {
    document
      .getElementById("match-report-pane")
      ?.scrollTo({ top: 0, behavior: "auto" });
  }, [ownKey]);

  // F5: this court swap arrived from outside `runCourtMorph` (browser
  // back/forward — see `VizStateContextValue.externalCourtSwap`'s doc
  // comment for why that path can't run the shared-element morph). Opt
  // into the plain crossfade fallback for exactly this one render, then
  // clear the flag so it doesn't replay on a later, unrelated render.
  const [fallbackFadeIn] = useState(externalCourtSwap);
  // M6: keyed on the flag itself, not `[]`. This component stays mounted
  // across a focused→focused navigation (only props change), so a
  // `[]`-deps effect only ever clears whatever the flag was at the FIRST
  // mount — a later external swap (browser Back over a real `push`) that
  // sets the flag while still mounted here would never get cleared, and
  // the stale `true` would play a spurious fade on some later, unrelated
  // mount. `fallbackFadeIn` is unaffected: it's `useState`'s initial value
  // and never reacts to later prop/flag changes, so this can't re-trigger
  // the fade it already applied.
  useEffect(() => {
    if (externalCourtSwap) clearExternalCourtSwap();
  }, [externalCourtSwap, clearExternalCourtSwap]);

  const subject = subjectFor(state.filters, you.isPlayer1);
  const result = useMemo(
    () =>
      cut ? computeViz(points, cut, state.filters, subject, state.chart) : null,
    [points, cut, state.filters, subject, state.chart],
  );
  const stats = useMemo(
    () =>
      cut
        ? computeVizStats(
            points,
            cut,
            state.filters,
            subject,
            result ?? undefined,
          )
        : null,
    [points, cut, state.filters, subject, result],
  );

  if (cut === null || result === null || stats === null) {
    // Guarded by `shots-tab.tsx` (`state.cut === null ? <VizWall/> : <VizFocused/>`);
    // this only fires on a race between renders, never in steady state.
    return null;
  }

  const subjectName = state.filters.player === "you" ? you.name : opp.name;
  const hasFilters = activeFilterEntries(state).length > 0;

  function backToWall() {
    // F5: the reverse morph. `targetKey` is the WALL TILE's dom id for
    // THIS view (the one being left) — not `viewIdentityKey` of the wall
    // state we're going TO (which is always `null`, the wall has no single
    // court) — so the wall can find and re-mark the one tile that matches
    // where we came from. `court-tile.tsx` compares by this same id, not by
    // `viewIdentityKey`, for the reason `VIZ_FOCUSED_COURT_MORPH_TARGET`'s
    // doc comment explains.
    runCourtMorph({
      sourceEl: courtArtRef.current,
      next: {
        cut: null,
        chart: "scatter",
        filters: EMPTY_VIZ_FILTERS,
        viewId: null,
      },
      targetKey: ownKey !== null ? courtTileDomId(ownKey) : null,
      reducedMotion,
    });
  }

  function clearFilters() {
    setState((prev) => ({ ...prev, filters: EMPTY_VIZ_FILTERS, viewId: null }));
  }

  // The big court is the ONE legitimate destination for every forward morph
  // (a wall or Views-grid tile growing into the focused view) — compared
  // against the sentinel, not `ownKey`, because a Views-grid tile can share
  // this view's `viewIdentityKey` (the "current" ring) without being the
  // morph's destination. See `VIZ_FOCUSED_COURT_MORPH_TARGET`'s doc comment.
  const isMorphTarget = morphTargetKey === VIZ_FOCUSED_COURT_MORPH_TARGET;

  return (
    <div
      className={
        fallbackFadeIn
          ? "viz-crossfade-in flex flex-col gap-4"
          : "flex flex-col gap-4"
      }
    >
      <VizToolbar
        className="viz-vt-toolbar"
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
              id={VIZ_FOCUSED_HEADING_ID}
              tabIndex={-1}
              className="text-micro truncate outline-none"
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
            ref={courtArtRef}
            className="relative w-full"
            style={{
              backgroundColor: APRON_FILL,
              viewTransitionName: isMorphTarget
                ? VIZ_COURT_TRANSITION_NAME
                : undefined,
            }}
          >
            <CourtArt
              cut={cut}
              dots={result.dots}
              chart={state.chart}
              heat={result.heat}
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
            {legendItemsFor(cut, state.chart).map((item) =>
              item.glyph === "ramp" ? (
                <HeatRampLegend key={item.key} />
              ) : (
                <LegendMark key={item.key} item={item} />
              ),
            )}
            <div className="flex-1" />
            <span className="text-micro" style={{ color: "var(--ink-400)" }}>
              {LEGEND_CAPTION[cut]}
            </span>
          </div>
        </div>

        <StatsCard stats={stats} className="viz-vt-stats-card" />
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

// G3b (P2i): the heat chart's legend — a micro "Fewer" caption, four 22x8
// swatches drawn as one joined pill (no gap between them, rounded only at
// the outer ends via the wrapping span's own `overflow-hidden` pill), then
// micro "More" — replacing the outcome legend entirely (`legendItemsFor`
// returns exactly this one item for `chart === "heat"`).
const HEAT_RAMP_SWATCH_W = 22;
const HEAT_RAMP_SWATCH_H = 8;

function HeatRampLegend() {
  return (
    <span className="inline-flex items-center gap-[6px]">
      <span className="text-micro" style={{ color: "var(--ink-500)" }}>
        Fewer
      </span>
      <span
        className="inline-flex shrink-0 overflow-hidden"
        style={{ borderRadius: "var(--radius-pill)" }}
        aria-hidden="true"
      >
        {[0, 1, 2, 3].map((i) => (
          <span
            key={i}
            style={{
              width: HEAT_RAMP_SWATCH_W,
              height: HEAT_RAMP_SWATCH_H,
              backgroundColor: `var(--viz-heatmap-${i})`,
            }}
          />
        ))}
      </span>
      <span className="text-micro" style={{ color: "var(--ink-500)" }}>
        More
      </span>
    </span>
  );
}

// Sized to fill the same 8x8 box the old plain circle used, roughly matching
// its visual weight: r=3.6 for the circle, and outer radii picked so the
// triangle/star glyphs read at a comparable size (not area-matched to the
// circle the way `court-art.tsx`'s real marks are — this is just a legend
// key, not a measurement).
const LEGEND_GLYPH_R = 3.6;
const LEGEND_TRIANGLE_SIZE = 2.2;
const LEGEND_STAR_OUTER_R = 3.6;

/**
 * One legend key — circle, triangle or star, reusing `court-art.tsx`'s own
 * point maths (`trianglePointsFor`/`starPoints`) so a glyph here is drawn
 * exactly the way the court draws it, not a hand-rolled near-miss.
 * `item.outline` (Forehand/Backhand) skips the fill and draws a neutral ink
 * stroke instead of the court's 0.4px black hairline — these encode STROKE,
 * not an outcome colour, so they shouldn't look like a fourth outcome dot.
 */
function LegendMark({ item }: { item: LegendItem }) {
  const fill = item.outline ? "none" : item.color;
  const stroke = item.outline ? item.color : "#000";
  const strokeWidth = item.outline ? 1 : 0.4;
  return (
    <span className="inline-flex items-center gap-[6px]">
      <svg
        aria-hidden="true"
        width={8}
        height={8}
        viewBox="0 0 8 8"
        className="shrink-0"
      >
        {item.glyph === "circle" && (
          <circle
            cx={4}
            cy={4}
            r={LEGEND_GLYPH_R}
            fill={fill}
            stroke={stroke}
            strokeWidth={strokeWidth}
          />
        )}
        {item.glyph === "triangle" && (
          <polygon
            points={trianglePointsFor("serve", 4, 4, LEGEND_TRIANGLE_SIZE)}
            fill={fill}
            stroke={stroke}
            strokeWidth={strokeWidth}
          />
        )}
        {item.glyph === "star" && (
          <polygon
            points={starPoints(4, 4, LEGEND_STAR_OUTER_R)}
            fill={item.color}
            stroke="#000"
            strokeWidth={0.4}
          />
        )}
      </svg>
      <span className="text-micro" style={{ color: "var(--ink-500)" }}>
        {item.label}
      </span>
    </span>
  );
}
