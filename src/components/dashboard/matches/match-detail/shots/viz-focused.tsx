"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Maximize2 } from "lucide-react";
import type { SavedViewRow } from "@/lib/data/saved-views-server";
import type { WorkspaceKind } from "@/lib/workspace/types";
import { overlayIsOpen } from "@/lib/ui/overlay-is-open";
import { isTextEntry } from "@/lib/ui/is-text-entry";
import { ChromeTooltip } from "@/components/dashboard/shared/chrome-tooltip";
import { APRON_FILL, HEAT_APRON_FILL, CourtArt } from "./court-art";
import {
  trianglePointsFor,
  starPoints,
  heatFloorTintRgba,
} from "./court-geometry";
import { StatsCard } from "./stats-card";
import { VizToolbar } from "./viz-toolbar";
import { useVizState, useExternalSwapFadeIn } from "./use-viz-state";
import { usePrefersReducedMotion } from "./use-reduced-motion";
import { useVizView } from "./use-viz-view";
import { EMPTY_VIZ_FILTERS, availableSets, type Cut } from "./viz-model";
import { clearedFilters, viewIdentityKey } from "./viz-url";
import {
  CUT_LABEL,
  legendItemsFor,
  loadedViewLabel,
  type LegendItem,
} from "./viz-labels";
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
  rallyPlacement: "Far half · landing point",
  returnContact: "Near half · contact point",
  // rallyPosition renders through the returnContact frame — same caption,
  // since it's the same half.
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
  // The ONE data path, shared with the fullscreen viewer (`use-viz-view.ts`)
  // — including where "you" is resolved (guardrails §4). Extracted from here
  // rather than copied into the viewer, so the two courts can never draw a
  // different mark count for the same URL.
  const {
    result,
    stats,
    bandZones,
    subjectName,
    you,
    opp,
    points,
    hasFilters,
    isDraft,
  } = useVizView();
  const { state, setState, runCourtMorph, morphTargetKey } = useVizState();
  const reducedMotion = usePrefersReducedMotion();
  // `availableSets` is an O(points) scan; this component re-renders on every
  // filter/cut/chart click via the shared `VizStateProvider`, so it's
  // memoized on `points` alone rather than re-scanning on every one of those.
  const sets = useMemo(() => availableSets(points), [points]);

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
  // back/forward — see `useExternalSwapFadeIn`'s doc comment for why that
  // path can't run the shared-element morph). Opt into the plain crossfade
  // fallback for exactly this one render.
  const fallbackFadeIn = useExternalSwapFadeIn();

  // Task 5: the door. Never `runCourtMorph` — a fullscreen open is neither a
  // wall→focused nor a focused→wall transition (the focused view stays
  // mounted underneath, per `shots-tab.tsx`'s comment), so there is no morph
  // source/target pair to hand it. Plain `setState`, same as the viewer's own
  // `exit()` drops the key.
  function openFullscreen() {
    setState((prev) => ({ ...prev, fullscreen: true }));
  }

  // `F` opens the door, mirroring the viewer's own window-level keys
  // (`viz-fullscreen.tsx`) — same bail-out set (text entry, an open
  // menu/dialog, a modifier held) plus two more specific to this side: draft
  // mode (the door itself is hidden then) and already-fullscreen (the
  // viewer's listener owns the window at that point; this one would otherwise
  // fire a redundant `setState` underneath it on every remount-free re-render
  // race). Declared above the `cut === null` guard below — every Hook in this
  // component must run on every render, guard or not.
  //
  // `isTextEntry`, not the wizard's `isFormControl` — see
  // `@/lib/ui/is-text-entry`'s doc comment: `isFormControl` also treats
  // anything with `aria-haspopup` as a control (every toolbar trigger here),
  // and Radix returns focus to a trigger when its menu closes, so `F` was
  // dead right after closing the cut/chart/filters menu — exactly when a
  // viewer would reach for it.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (isTextEntry(e.target)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key.toLowerCase() !== "f") return;
      if (overlayIsOpen()) return;
      if (isDraft) return;
      if (state.fullscreen === true) return;
      e.preventDefault();
      openFullscreen();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // `openFullscreen` is a stable closure over `setState` (identity-stable —
    // see `viz-state-context.tsx`); the only reactive reads inside `onKey`
    // are `isDraft`/`state.fullscreen`, both already listed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDraft, state.fullscreen]);

  if (cut === null || result === null || stats === null) {
    // Guarded by `shots-tab.tsx` (`state.cut === null ? <VizWall/> : <VizFocused/>`);
    // this only fires on a race between renders, never in steady state.
    return null;
  }

  // `subjectName`/`hasFilters`/`isDraft` (G4's "Create view" blank-court
  // prompt) all come from `useVizView()` above now — the viewer needs the
  // same three, derived the same way.
  // Defect fix: the art box wrapper (the letterbox strips either side of the
  // svg) must follow the court's own desaturation — heat mode desaturates,
  // EXCEPT while drafting, where `CourtArt` below is told to draw normal
  // (non-desaturated) colours regardless of `state.chart`.
  const showHeat = state.chart === "heat" && !isDraft;
  // heat-blob follow-up (I3, "the tint is not consistent on the view"): the
  // filter used to paint its own floor tint, covering only the svg's own
  // content box — a CSS gradient here then tried to match it on any
  // letterbox sliver the svg's `preserveAspectRatio` leaves inside ITSELF,
  // but the two never quite lined up (visibly different greens). The floor
  // now lives ONLY here — a single flat wash div covering the WHOLE art box,
  // above the svg — so there is one tint, not two to keep consistent. No
  // dots ⇒ no wash, plain colour.
  const heatHasDots = showHeat && result.dots.length > 0;
  const artBoxFill = showHeat ? HEAT_APRON_FILL : APRON_FILL;

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
    setState((prev) => clearedFilters(prev));
  }

  // G4: the draft overlay's "Choose a view" CTA opens the SAME cut menu the
  // toolbar's own trigger opens — no second, parallel menu to keep in sync.
  // `CutMenu` (`cut-menu.tsx`) owns its `open` state locally rather than
  // taking a controlled prop, so this drives it the way any other click on
  // the trigger would: a real click on the trigger button itself
  // (`cutMenuTriggerRef`, already forwarded through `VizToolbar` for
  // `SaveViewDialog`'s anchor), which Radix's `PopoverTrigger` (wrapped,
  // `asChild`, inside `FloatMenu`) treats identically to a pointer click.
  function openCutMenu() {
    cutMenuTriggerRef.current?.click();
  }

  // `aria-label`/tooltip name the loaded saved view when one is open (its own
  // name), falling back to the plain cut label otherwise (`CutMenu`'s own
  // trigger label rule, reused rather than re-derived — see
  // `loadedViewLabel`'s doc comment).
  const doorName = loadedViewLabel(state, savedViews).label;

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
          ? "viz-crossfade-in @container flex flex-col gap-4"
          : "@container flex flex-col gap-4"
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
            sets={sets}
            youName={you.name}
            opponentName={opp.name}
          />
        }
        stripSlot={hasFilters ? <AppliedStrip /> : undefined}
      />

      <div className="flex min-w-0 flex-col gap-4 @min-[720px]:flex-row @min-[720px]:items-stretch">
        <div
          className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-[var(--radius-card)] border"
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
              {isDraft ? "Create view" : `${subjectName} · ${CUT_LABEL[cut]}`}
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
            data-viz-focused-art
            className="relative w-full"
            style={{
              backgroundColor: artBoxFill,
              viewTransitionName: isMorphTarget
                ? VIZ_COURT_TRANSITION_NAME
                : undefined,
            }}
          >
            <CourtArt
              cut={cut}
              // G4: the draft prompt never plots — no dots, no heat blobs,
              // normal (non-desaturated) court colours. `computeViz` still
              // ran above (its `count`/`total`/`noun` still feed the
              // toolbar's Filters popover), only its DRAWN output is
              // withheld here.
              dots={isDraft ? [] : result.dots}
              chart={state.chart}
              bandZones={bandZones}
              draft={isDraft}
              zones={
                !isDraft && state.chart === "zones" && cut === "serve"
                  ? (result.zoneStats ?? undefined)
                  : undefined
              }
              labels
              // The plotted court is capped in both dimensions, centred in
              // the card, with the apron filling the remaining width. Size
              // the SVG itself rather than its wrapper: its intrinsic ratio
              // then resolves before the height cap, avoiding the older
              // top-and-bottom cropping regression.
              className="mx-auto block max-h-[340px] w-[88%] max-w-[520px]"
            />
            {heatHasDots && (
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-0"
                style={{ backgroundColor: heatFloorTintRgba() }}
              />
            )}
            {/* Task 5: the door. Hidden in draft mode — there's nothing
                plotted yet to open fullscreen (G4's "Pick what to plot"
                prompt covers the same ground below). */}
            {!isDraft && (
              <div className="absolute top-3 right-3">
                <ChromeTooltip label="Fullscreen" shortcut="F">
                  <button
                    type="button"
                    data-viz-fullscreen-door
                    aria-label={`Open ${doorName} fullscreen`}
                    onClick={openFullscreen}
                    className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-[8px] bg-[rgba(13,13,13,0.72)] text-white transition-colors duration-200 ease-[var(--ease-primary)] hover:bg-[rgba(13,13,13,0.92)]"
                  >
                    <Maximize2
                      className="h-[13px] w-[13px]"
                      strokeWidth={1.6}
                      aria-hidden="true"
                    />
                  </button>
                </ChromeTooltip>
              </div>
            )}
            {isDraft ? (
              <CourtOverlayCard>
                <p
                  className="text-[13px] font-medium"
                  style={{ color: "var(--ink-900)" }}
                >
                  Pick what to plot
                </p>
                <p
                  className="text-micro max-w-[240px]"
                  style={{ color: "var(--ink-600)" }}
                >
                  Choose a view, a chart and filters — then save it.
                </p>
                <button
                  type="button"
                  onClick={openCutMenu}
                  className="cursor-pointer text-[11px] font-medium text-[var(--blue)] hover:text-[var(--blue-hover)]"
                >
                  Choose a view
                </button>
              </CourtOverlayCard>
            ) : (
              result.count === 0 && (
                <CourtOverlayCard>
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
                </CourtOverlayCard>
              )
            )}
          </div>

          {!isDraft && (
            <div className="flex items-center gap-3 px-4 pt-[14px] pb-4">
              {state.chart === "zones" && cut !== "serve" && (
                <span
                  className="text-micro"
                  style={{ color: "var(--ink-600)" }}
                >
                  Count · points won
                </span>
              )}
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
          )}
        </div>

        {!isDraft && (
          <div className="relative w-full min-w-0 shrink-0 @min-[720px]:w-[292px]">
            <StatsCard
              stats={stats}
              cut={cut}
              className="viz-vt-stats-card @min-[720px]:absolute @min-[720px]:inset-0"
            />
          </div>
        )}
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

/**
 * The art box's centred callout card — the draft "Pick what to plot" prompt
 * and the zero-results empty state are the same card shape with different
 * content, so both render through this rather than each carrying its own
 * copy of the wrapper/positioning.
 */
function CourtOverlayCard({ children }: { children: ReactNode }) {
  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center px-6">
      <div
        className="pointer-events-auto flex flex-col items-center gap-2 rounded-[var(--radius-card)] border px-5 py-4 text-center"
        style={{
          borderColor: "var(--border-hairline)",
          backgroundColor: "var(--surface-card)",
          boxShadow: "var(--shadow-card-emphasis)",
        }}
      >
        {children}
      </div>
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

/**
 * The four heatmap swatches alone (`var(--viz-heatmap-0..3)`), with no
 * wrapping caption or pill — `viz-fullscreen.tsx`'s `DarkLegend` renders the
 * same ramp on its own dark chrome and imports this rather than keeping a
 * second copy of the swatch loop.
 */
export function HeatRampSwatches() {
  return (
    <>
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
    </>
  );
}

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
        <HeatRampSwatches />
      </span>
      <span className="text-micro" style={{ color: "var(--ink-500)" }}>
        More
      </span>
    </span>
  );
}

// The ace remains distinct without dominating the 8px ordinary legend keys.
const LEGEND_GLYPH_R = 3.6;
const LEGEND_TRIANGLE_SIZE = 2.2;
const LEGEND_STAR_OUTER_R = 4.2;

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
  const isStar = item.glyph === "star";
  const glyphSize = isStar ? 10 : 8;
  const glyphCenter = glyphSize / 2;
  return (
    <span className="inline-flex items-center gap-[6px]">
      <svg
        aria-hidden="true"
        width={glyphSize}
        height={glyphSize}
        viewBox={`0 0 ${glyphSize} ${glyphSize}`}
        className="shrink-0"
      >
        {item.glyph === "circle" && (
          <circle
            cx={glyphCenter}
            cy={glyphCenter}
            r={LEGEND_GLYPH_R}
            fill={fill}
            stroke={stroke}
            strokeWidth={strokeWidth}
          />
        )}
        {item.glyph === "triangle" && (
          <polygon
            points={trianglePointsFor(
              "serve",
              glyphCenter,
              glyphCenter,
              LEGEND_TRIANGLE_SIZE,
            )}
            fill={fill}
            stroke={stroke}
            strokeWidth={strokeWidth}
          />
        )}
        {item.glyph === "star" && (
          <polygon
            points={starPoints(glyphCenter, glyphCenter, LEGEND_STAR_OUTER_R)}
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
