"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Maximize, Minus, Plus, SlidersHorizontal, X } from "lucide-react";
import { ChevronDown, ChevronUp } from "lucide-react";

import { useMatchData } from "@/components/dashboard/matches/match-data-provider";
import { useMatchReport } from "@/components/dashboard/matches/match-detail/match-report-context";
import { useMatchSides } from "@/components/dashboard/matches/match-detail/use-match-sides";
import { formatClock } from "@/components/dashboard/matches/match-detail/format-clock";
import { setOutcome } from "@/components/dashboard/matches/match-detail/report-scoreboard";
import { isFormControl } from "@/components/dashboard/matches/new-match-wizard/useWizardKeys";
import { TIEBREAK_STYLE } from "@/components/dashboard/score-line";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { formatScoreboardStatus } from "@/lib/data/match-utils";
import { playedSets, tiebreakOf } from "@/lib/ui/score-format";
import { overlayIsOpen } from "@/lib/ui/overlay-is-open";
import { cn } from "@/lib/utils";

import { AppliedStrip } from "./applied-strip";
import { ChartMenu } from "./chart-menu";
import { APRON_FILL, HEAT_APRON_FILL } from "./court-art";
import { CutMenu, loadedViewLabel } from "./cut-menu";
import { FiltersPopover } from "./filters-popover";
import { KEY_PAN_PX, zoomPercentLabel } from "./pan-zoom";
import { SaveViewDialog } from "./save-view-dialog";
import { usePanZoom } from "./use-pan-zoom";
import { useVizState } from "./use-viz-state";
import { useVizView } from "./use-viz-view";
import { VizFullscreenCourt } from "./viz-fullscreen-court";
import { CUT_LABEL, legendItemsFor, type LegendItem } from "./viz-labels";
import { EMPTY_VIZ_FILTERS, availableSets } from "./viz-model";
import { activeFilterEntries } from "./viz-url";

/**
 * The fullscreen court viewer (Phase 2A, Task 4; spec A5, f4b-report
 * P2b–P2h). A portal on `document.body`, not `requestFullscreen()` — the
 * precedent is `match-detail/film/film-fullscreen.tsx`, and the two now share
 * `overlayIsOpen()` (`@/lib/ui/overlay-is-open`) rather than each carrying a
 * copy.
 *
 * `shots-tab.tsx` mounts it (`next/dynamic`, `ssr: false`) whenever
 * `state.fullscreen && state.cut`. The focused view stays mounted underneath,
 * so leaving is a pure state change — `setState` DROPPING the `fullscreen`
 * key (never setting it `false`; see `VizState.fullscreen`'s doc comment) —
 * and the court behind is already where it was.
 *
 * Everything the viewer shows comes from `useVizView()`, the same hook
 * `viz-focused.tsx` uses: one `computeViz` call, one resolved subject
 * (guardrails §4), so the viewer's mark count, count/noun and empty-state
 * copy are the focused court's by construction.
 *
 * Chrome is translucent black slabs over the art, each marked `data-chrome`
 * so `use-pan-zoom.ts` ignores gestures that start on them.
 */

/** P2b: the zoom readout is a fixed 38px so the slab never reflows. */
const ZOOM_READOUT_W = 38;

export function VizFullscreen() {
  const { state, setState } = useVizState();
  const { meta } = useMatchReport();
  const { cut, result, subjectName, you, opp, points, hasFilters } =
    useVizView();

  const rootRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const cutMenuTriggerRef = useRef<HTMLButtonElement>(null);
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);

  // `usePanZoom` needs a real cut; `shots-tab.tsx` only mounts this alongside
  // one, and the guard below covers the render race. Hooks can't sit behind
  // that guard, so the fallback keeps the hook order stable.
  const pz = usePanZoom(cut ?? "serve", stageRef);

  /* ── Exit ─────────────────────────────────────────────────────────────── */

  // Drops the key rather than setting `false` — `applyVizUpdate` and the URL
  // round-trip both treat "absent" as the only off state.
  function exit() {
    setState((prev) => {
      const { fullscreen: _fullscreen, ...rest } = prev;
      return rest;
    });
  }

  // Focus returns to whatever opened the viewer (Task 5's door), when it is
  // on the page. Runs on unmount, after the focused view is back.
  useEffect(() => {
    return () => {
      const door = document.querySelector("[data-viz-fullscreen-door]");
      if (door instanceof HTMLElement) door.focus({ preventScroll: true });
    };
  }, []);

  /* ── Mount: lock the page, take focus ─────────────────────────────────── */

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    rootRef.current?.focus({ preventScroll: true });
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  /* ── Keyboard ─────────────────────────────────────────────────────────── */

  const { zoomIn, zoomOut, fit, nudge } = pz;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isFormControl(e.target)) return;
      // A menu or dialog is up: its own keys win, ours stand down.
      if (overlayIsOpen()) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      switch (e.key) {
        case "Escape":
          e.preventDefault();
          exit();
          break;
        case "+":
        case "=":
          e.preventDefault();
          zoomIn();
          break;
        case "-":
          e.preventDefault();
          zoomOut();
          break;
        case "0":
          e.preventDefault();
          fit();
          break;
        case "ArrowLeft":
          e.preventDefault();
          nudge(KEY_PAN_PX, 0);
          break;
        case "ArrowRight":
          e.preventDefault();
          nudge(-KEY_PAN_PX, 0);
          break;
        case "ArrowUp":
          e.preventDefault();
          nudge(0, KEY_PAN_PX);
          break;
        case "ArrowDown":
          e.preventDefault();
          nudge(0, -KEY_PAN_PX);
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // `exit` is a stable closure over `setState`, which the store keeps
    // identity-stable; re-running this on every render would re-bind the
    // window listener on every pan frame.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoomIn, zoomOut, fit, nudge]);

  if (cut === null || result === null) {
    // Guarded by `shots-tab.tsx`; only reachable on a render race.
    return null;
  }

  const heat = state.chart === "heat";
  const stageBackground = heat ? HEAT_APRON_FILL : APRON_FILL;
  const applied = activeFilterEntries(state);
  const pillLabel =
    applied.length > 0 ? applied[0].label : `All ${result.noun}`;
  // P2e/P2f: a saved view that hasn't been edited since it loaded shows its
  // tokens read-only — there is nothing to clear on a view you're only
  // looking at.
  const viewIsPristine = loadedViewLabel(state, meta.savedViews).bookmark;

  function clearFilters() {
    setState((prev) => ({ ...prev, filters: EMPTY_VIZ_FILTERS, viewId: null }));
  }

  return createPortal(
    <TooltipProvider>
      <div
        ref={rootRef}
        role="region"
        aria-label={`${CUT_LABEL[cut]} fullscreen`}
        tabIndex={-1}
        className="fixed inset-0 z-50 overflow-clip outline-none"
        style={{ background: stageBackground }}
      >
        <div
          ref={stageRef}
          data-court-stage=""
          className="absolute inset-0 cursor-grab overflow-clip select-none active:cursor-grabbing"
          style={{ touchAction: "none" }}
          onPointerDown={pz.onPointerDown}
          onPointerMove={pz.onPointerMove}
          onPointerUp={pz.onPointerUp}
          onPointerCancel={pz.onPointerUp}
        >
          <VizFullscreenCourt
            cut={cut}
            chart={state.chart}
            dots={result.dots}
            zoneStats={result.zoneStats}
            filters={state.filters}
            subjectName={subjectName}
            transform={pz.t}
            panning={pz.panning}
          />

          {/* Widget states: an honest empty message on the stage, with the
              chrome still live so the filters that emptied it can be
              cleared. No spinner — nothing is loading here; the points were
              already in `MatchDataProvider` before the viewer opened. */}
          {result.count === 0 && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center px-6">
              <div
                data-chrome=""
                className="pointer-events-auto flex flex-col items-center gap-2 rounded-[12px] px-5 py-4 text-center backdrop-blur-[8px]"
                style={{ background: "rgba(13,13,13,0.74)" }}
              >
                <p className="text-[12px] text-white/80">
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

          {/* ── Top chrome ─────────────────────────────────────────────── */}
          <div
            data-chrome=""
            className="absolute top-[14px] right-[18px] left-[18px] flex items-start gap-3"
          >
            <ViewerScoreboard
              cutLabel={CUT_LABEL[cut]}
              count={result.count}
              noun={result.noun}
            />
            <div className="flex-1" />
            <FiltersPopover
              count={result.count}
              total={result.total}
              noun={result.noun}
              sets={availableSets(points)}
              youName={you.name}
              opponentName={opp.name}
              tone="dark"
              side="bottom"
              trigger={(open) => (
                <button
                  type="button"
                  aria-haspopup="dialog"
                  aria-expanded={open}
                  className="inline-flex h-[26px] shrink-0 cursor-pointer items-center gap-1.5 rounded-full px-2.5 text-[11px] font-medium text-white backdrop-blur-[6px] transition-colors duration-200"
                  style={{
                    background: open
                      ? "rgba(13,13,13,0.92)"
                      : "rgba(13,13,13,0.72)",
                  }}
                >
                  <SlidersHorizontal
                    className="size-3 shrink-0 text-white/70"
                    strokeWidth={1.6}
                    aria-hidden="true"
                  />
                  <span className="truncate">{pillLabel}</span>
                  <span className="mono tabular">·</span>
                  <span className="mono tabular">{result.count}</span>
                  {open ? (
                    <ChevronUp
                      className="size-3 shrink-0 text-white/70"
                      strokeWidth={1.6}
                      aria-hidden="true"
                    />
                  ) : (
                    <ChevronDown
                      className="size-3 shrink-0 text-white/70"
                      strokeWidth={1.6}
                      aria-hidden="true"
                    />
                  )}
                </button>
              )}
            />
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  aria-label="Exit fullscreen"
                  onClick={exit}
                  className="flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-[var(--radius-element)] text-white/85 backdrop-blur-[6px] transition-colors duration-200 hover:text-white"
                  style={{ background: "rgba(13,13,13,0.72)" }}
                >
                  <X
                    className="size-3.5"
                    strokeWidth={1.6}
                    aria-hidden="true"
                  />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" align="end">
                Exit fullscreen · Esc
              </TooltipContent>
            </Tooltip>
          </div>

          {/* ── Bottom slab ────────────────────────────────────────────── */}
          <div
            data-chrome=""
            className="absolute right-5 bottom-4 left-5 flex h-12 items-center gap-2 rounded-[12px] px-3 backdrop-blur-[8px]"
            style={{ background: "rgba(13,13,13,0.72)" }}
          >
            <CutMenu
              savedViews={meta.savedViews}
              onSaveRequest={() => setSaveDialogOpen(true)}
              triggerRef={cutMenuTriggerRef}
              width={312}
              tone="dark"
              side="top"
              showLoadedView
            />
            <ChartMenu tone="dark" side="top" />
            {applied.length > 0 && (
              <>
                <SlabDivider />
                <AppliedStrip tone="dark" readOnly={viewIsPristine} />
              </>
            )}
            {/* Scope guard: the depth/contact bands control (2B) lands here,
                between the tokens and the spacer. Nothing renders yet. */}
            <div className="flex-1" />
            <DarkLegend items={legendItemsFor(cut, state.chart)} />
            <SlabDivider />
            <ZoomButton
              label="Zoom out"
              icon={<Minus className="size-[15px]" strokeWidth={1.7} />}
              onClick={pz.zoomOut}
            />
            <span
              className="mono tabular text-center text-[11px] text-white/85"
              style={{ width: ZOOM_READOUT_W }}
            >
              {zoomPercentLabel(pz.t.z)}
            </span>
            <ZoomButton
              label="Zoom in"
              icon={<Plus className="size-[15px]" strokeWidth={1.7} />}
              onClick={pz.zoomIn}
            />
            <ZoomButton
              label="Fit the court"
              icon={<Maximize className="size-3.5" strokeWidth={1.6} />}
              onClick={pz.fit}
            />
          </div>
        </div>

        <SaveViewDialog
          open={saveDialogOpen}
          onOpenChange={setSaveDialogOpen}
          anchorRef={cutMenuTriggerRef}
          cut={cut}
          chart={state.chart}
          filters={state.filters}
          savedViews={meta.savedViews}
          workspaceKind={meta.workspaceKind}
          workspaceName={meta.workspaceName}
          tone="dark"
          side="top"
          onSaved={(view) => setState((prev) => ({ ...prev, viewId: view.id }))}
        />
      </div>
    </TooltipProvider>,
    document.body,
  );
}

/* ── Pieces ─────────────────────────────────────────────────────────────── */

function SlabDivider() {
  return (
    <div aria-hidden="true" className="h-4 w-px shrink-0 bg-white/[0.18]" />
  );
}

function ZoomButton({
  label,
  icon,
  onClick,
}: {
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={label}
          onClick={onClick}
          className="flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-[var(--radius-element)] text-white/85 transition-colors duration-200 hover:bg-white/10 hover:text-white"
        >
          {icon}
        </button>
      </TooltipTrigger>
      <TooltipContent side="top">{label}</TooltipContent>
    </Tooltip>
  );
}

/**
 * The bottom slab's legend — the SAME `legendItemsFor(cut, chart)` the
 * focused court's legend reads, drawn on the dark surface (8px dots ringed in
 * black so a white-ish swatch still separates from the slab, 11px labels at
 * 70% white). Heat returns its one ramp item, and the ramp replaces the
 * outcome keys entirely.
 */
function DarkLegend({ items }: { items: LegendItem[] }) {
  if (items.length === 1 && items[0].glyph === "ramp") {
    return (
      <span className="inline-flex shrink-0 items-center gap-1.5">
        <span className="text-[11px] text-white/70">Fewer</span>
        <span
          className="inline-flex shrink-0 overflow-hidden rounded-full"
          aria-hidden="true"
        >
          {[0, 1, 2, 3].map((i) => (
            <span
              key={i}
              style={{
                width: 22,
                height: 8,
                backgroundColor: `var(--viz-heatmap-${i})`,
              }}
            />
          ))}
        </span>
        <span className="text-[11px] text-white/70">More</span>
      </span>
    );
  }
  return (
    <div className="flex shrink-0 items-center gap-3 pr-1">
      {items.map((item) => (
        <span key={item.key} className="inline-flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className="size-2 shrink-0 rounded-full"
            style={{
              backgroundColor: item.outline ? "transparent" : item.color,
              boxShadow: item.outline
                ? `inset 0 0 0 1px ${item.color}`
                : // The handoff writes `#000000`; `--ink-900` is the design system's own
                  // black and is indistinguishable at a 0.75px ring.
                  "0 0 0 0.75px var(--ink-900)",
            }}
          />
          <span className="text-[11px] text-white/70">{item.label}</span>
        </span>
      ))}
    </div>
  );
}

/**
 * The top-left scoreboard slab. It lists the MATCH's two players — you first,
 * with the blue dot on you — exactly as the match report's own rail
 * scoreboard does, NOT the current view's subject: a court filtered to the
 * opponent is still this match, and a scoreboard that reordered itself with a
 * filter would be unreadable.
 *
 * The digits come from `useMatchSides().sets` (already you-first) through the
 * same `playedSets`/`setOutcome`/`tiebreakOf` helpers `report-scoreboard.tsx`
 * uses — never re-derived from `points` (guardrails §4). No duration ⇒ no
 * clock; no played sets ⇒ a dash, never a 0.
 */
function ViewerScoreboard({
  cutLabel,
  count,
  noun,
}: {
  cutLabel: string;
  count: number;
  noun: string;
}) {
  const { match } = useMatchData();
  const sides = useMatchSides();
  const sets = playedSets(sides.sets);
  const status = formatScoreboardStatus(match.matchContext);
  const clock =
    typeof match.durationSec === "number" && match.durationSec > 0
      ? formatClock(match.durationSec, { alwaysShowHours: true })
      : null;

  return (
    <div
      className="flex min-w-[236px] flex-col gap-[14px] rounded-[12px] backdrop-blur-[8px]"
      style={{ background: "rgba(13,13,13,0.74)", padding: "14px 15px 12px" }}
    >
      <div className="flex items-baseline gap-2">
        <span className="text-[11px] text-white/55">
          {status.charAt(0) + status.slice(1).toLowerCase()}
        </span>
        <div className="flex-1" />
        {clock !== null && (
          <span className="mono tabular text-[10px] text-white/45">
            {clock}
          </span>
        )}
      </div>

      <div className="flex flex-col gap-[11px]">
        <ViewerScoreRow side="you" name={sides.you.name} sets={sets} />
        <ViewerScoreRow side="opp" name={sides.opp.name} sets={sets} />
      </div>

      <div className="flex items-center gap-2 border-t border-white/[0.14] pt-[9px]">
        <span
          aria-hidden="true"
          className="flex size-[22px] shrink-0 items-center justify-center rounded-full text-[10px] font-medium text-white"
          style={{ background: "rgba(255,255,255,0.14)" }}
        >
          {sides.you.initials}
        </span>
        <span className="truncate text-[11px] text-white/55">{cutLabel}</span>
        <div className="flex-1" />
        <span className="mono tabular shrink-0 text-[10px] text-white/45">
          {count} {noun}
        </span>
      </div>
    </div>
  );
}

function ViewerScoreRow({
  side,
  name,
  sets,
}: {
  side: "you" | "opp";
  name: string;
  sets: ReturnType<typeof playedSets>;
}) {
  const isYou = side === "you";
  return (
    <div className="flex min-w-0 items-center gap-[7px]">
      <span
        className={cn(
          "min-w-0 overflow-hidden text-[13px] text-ellipsis whitespace-nowrap",
          isYou ? "font-medium text-white" : "text-white/70",
        )}
      >
        {name}
      </span>
      {isYou && (
        <span
          aria-hidden="true"
          className="size-1.5 shrink-0 rounded-full bg-[var(--blue)]"
        />
      )}
      <div className="flex-1" />
      <span className="mono tabular inline-flex shrink-0 items-center gap-2 text-[13px] whitespace-nowrap">
        {sets.length === 0 && (
          <span
            className="w-[11px] text-right"
            style={{ color: "rgba(255,255,255,0.42)" }}
          >
            <span aria-hidden="true">—</span>
            <span className="sr-only">No score</span>
          </span>
        )}
        {sets.map((set, index) => {
          const outcome = setOutcome(set);
          const lostSet = outcome !== "level" && outcome !== side;
          const tiebreak = lostSet ? tiebreakOf(set) : null;
          return (
            <span
              key={index}
              className="w-[11px] text-right"
              style={{ color: lostSet ? "rgba(255,255,255,0.42)" : "#FFFFFF" }}
            >
              {isYou ? set.player1 : set.player2}
              {tiebreak !== null && (
                <span className="inline-block w-0">
                  <span aria-hidden="true" style={TIEBREAK_STYLE}>
                    {tiebreak}
                  </span>
                  <span className="sr-only"> tiebreak {tiebreak}</span>
                </span>
              )}
            </span>
          );
        })}
      </span>
    </div>
  );
}
