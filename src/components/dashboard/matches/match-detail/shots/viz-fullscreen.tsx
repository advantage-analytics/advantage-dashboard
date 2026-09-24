"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Maximize,
  Minus,
  MoveVertical,
  Plus,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { ChevronDown, ChevronUp } from "lucide-react";

import { useMatchData } from "@/components/dashboard/matches/match-data-provider";
import { useMatchReport } from "@/components/dashboard/matches/match-detail/match-report-context";
import { useMatchSides } from "@/components/dashboard/matches/match-detail/use-match-sides";
import { formatClock } from "@/components/dashboard/matches/match-detail/format-clock";
import { scoreboardCells } from "@/components/dashboard/matches/match-detail/report-scoreboard";
import { TIEBREAK_STYLE } from "@/components/dashboard/score-line";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { contactBandRows, depthBandRows } from "@/lib/data/viz-bands";
import { formatScoreboardStatus } from "@/lib/data/match-utils";
import { playedSets } from "@/lib/ui/score-format";
import { overlayIsOpen } from "@/lib/ui/overlay-is-open";
import { isTextEntry } from "@/lib/ui/is-text-entry";
import { cn } from "@/lib/utils";

import { AppliedStrip } from "./applied-strip";
import {
  bandEditorDirty,
  bandEditorPayload,
  bandEditorPreview,
  initBandEditor,
  refitBandEditor,
  resetBandEditor,
  type BandEditorState,
} from "./band-editor-state";
import { ChartMenu } from "./chart-menu";
import { APRON_FILL, HEAT_APRON_FILL } from "./court-art";
import { starPoints } from "./court-geometry";
import { CutMenu } from "./cut-menu";
import { FiltersPopover } from "./filters-popover";
import { KEY_PAN_PX, zoomPercentLabel } from "./pan-zoom";
import { SaveViewDialog } from "./save-view-dialog";
import { usePanZoom } from "./use-pan-zoom";
import { isMarkRovingKey } from "./viz-mark-roving";
import { useVizState } from "./use-viz-state";
import { useVizView } from "./use-viz-view";
import { useVizBands } from "./viz-bands-context";
import {
  VizBandsEditorBanner,
  VizBandsEditorHandles,
  VizBandsEditorSlab,
  editorContext,
} from "./viz-bands-editor";
import { bandKindFor, VizBandsMenu } from "./viz-bands-menu";
import type { VizBandsOverlayProps } from "./viz-bands-overlay";
import { VizFullscreenCourt } from "./viz-fullscreen-court";
import { HeatRampSwatches } from "./viz-focused";
import {
  CUT_LABEL,
  legendItemsFor,
  loadedViewLabel,
  type LegendItem,
} from "./viz-labels";
import { availableSets } from "./viz-model";
import { activeFilterEntries, clearedFilters } from "./viz-url";
import { VIZ_FOCUSED_HEADING_ID } from "./viz-court-transition";

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

// `isTextEntry` (fix round 1) moved to `@/lib/ui/is-text-entry` — see its own
// doc comment for why this viewer deliberately does NOT use the wizard's
// `isFormControl`.

export function VizFullscreen() {
  const { state, setState } = useVizState();
  const { meta, actions } = useMatchReport();
  const {
    cut,
    result,
    stats,
    subjectName,
    subjectIsPlayer1,
    you,
    opp,
    points,
    hasFilters,
    bands,
    bandZones: savedBandZones,
    unit,
  } = useVizView();
  const { receipt, canEdit, applyBands } = useVizBands();
  // `availableSets` is an O(points) scan; this viewer re-renders on every
  // pan/zoom frame (see the `VizBandsOverlay`/`MarkLayer` memoization below),
  // so it's memoized on `points` alone rather than re-scanning on every one
  // of those.
  const sets = useMemo(() => availableSets(points), [points]);

  const rootRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const cutMenuTriggerRef = useRef<HTMLButtonElement>(null);
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  // Mirrored out of `FiltersPopover` (which still owns it) so the bands
  // receipt knows whether it may take the pill's slot — see the receipt's
  // own comment in the top chrome.
  const [filtersOpen, setFiltersOpen] = useState(false);
  // The hovered/focused mark lives here, not in the court: a press that turns
  // into a drag has to drop it (fix round 1 #4), and the pan/zoom hook that
  // detects that is mounted here. Both setters are stable, which is what lets
  // the court's `MarkLayer` memo survive a pan frame.
  const [activeMarkId, setActiveMarkId] = useState<string | null>(null);
  const [focusedMarkId, setFocusedMarkId] = useState<string | null>(null);
  const [selectedMarkId, setSelectedMarkId] = useState<string | null>(null);
  // Final review #3: the marks' single tab stop. `null` = "the first mark" —
  // nobody has moved within the group yet.
  const [rovingMarkId, setRovingMarkId] = useState<string | null>(null);

  const activateMark = useCallback((id: string, keyboard: boolean) => {
    setActiveMarkId(id);
    if (keyboard) setFocusedMarkId(id);
  }, []);
  const deactivateMark = useCallback((id: string) => {
    setActiveMarkId((prev) => (prev === id ? null : prev));
    setFocusedMarkId((prev) => (prev === id ? null : prev));
  }, []);
  const roveMark = useCallback((id: string) => {
    setRovingMarkId(id);
  }, []);
  const dropActiveMark = useCallback(() => {
    setActiveMarkId(null);
    setFocusedMarkId(null);
    setSelectedMarkId(null);
  }, []);
  const selectMark = useCallback((id: string) => {
    setActiveMarkId(null);
    setSelectedMarkId((prev) => (prev === id ? null : id));
  }, []);

  const visibleSelectedMarkId =
    selectedMarkId !== null &&
    result?.dots.some((dot) => dot.id === selectedMarkId)
      ? selectedMarkId
      : null;

  /* ── Band editor (Phase 2B, Task 4) ───────────────────────────────────── */

  /**
   * The editor's draft, or `null` outside edit mode. The ONE `editing` flag
   * below is what every other part of the viewer reads — the pan/zoom lock,
   * the window key handler, the slab crossfade, the pill, the overlay — so
   * edit mode cannot be half-on.
   *
   * `activeEditor` re-checks the two things that can make an open editor
   * wrong without anyone closing it: the viewer losing edit rights
   * (`canEdit`), and the cut no longer having this kind of band. Derived
   * during render, not reset in an effect.
   */
  const [editor, setEditor] = useState<BandEditorState | null>(null);
  const activeEditor =
    editor !== null &&
    canEdit &&
    cut !== null &&
    bandKindFor(cut) === editor.kind
      ? editor
      : null;
  const editing = activeEditor !== null;
  // Fix round 1: an editor that is no longer active is dropped outright, so
  // it cannot spring back if `canEdit`/the cut flip back. A render-phase
  // update of this component's own state — no effect, no extra commit.
  if (editor !== null && activeEditor === null) setEditor(null);

  /** A save is in flight: Save is dead and busy until it resolves. */
  const [saving, setSaving] = useState(false);
  /**
   * Bumped on every entry, so a save that resolves after its editor was
   * cancelled (and perhaps a new one opened) cannot close the new one.
   */
  const editSessionRef = useRef(0);

  /** The bands trigger in the slab — where focus goes back to on exit. */
  const bandsTriggerRef = useRef<HTMLSpanElement>(null);

  const updateEditor = useCallback(
    (fn: (prev: BandEditorState) => BandEditorState) => {
      setEditor((prev) => (prev === null ? prev : fn(prev)));
    },
    [],
  );

  const exitEdit = useCallback(() => {
    setEditor(null);
  }, []);

  // Leaving edit mode — Cancel, Esc, a successful Save, or the editor going
  // stale — returns focus to the bands trigger. Keyed on the `editing` EDGE,
  // after the commit, because the slab's controls are `inert` right up to it
  // and `focus()` on an inert element is silently a no-op.
  const wasEditingRef = useRef(false);
  useEffect(() => {
    if (wasEditingRef.current && !editing) {
      // The trigger is gone when the cut changed mid-edit (Back to Serve,
      // which has no bands): fall back to the viewer's own root rather than
      // letting focus drop to <body>.
      const trigger =
        bandsTriggerRef.current?.querySelector<HTMLElement>("button") ??
        rootRef.current;
      trigger?.focus({ preventScroll: true });
    }
    wasEditingRef.current = editing;
  }, [editing]);

  // `usePanZoom` needs a real cut; `shots-tab.tsx` only mounts this alongside
  // one, and the guard below covers the render race. Hooks can't sit behind
  // that guard, so the fallback keeps the hook order stable. `editing` locks
  // it at the current transform.
  const pz = usePanZoom(cut ?? "serve", stageRef, dropActiveMark, editing);

  // Fix round 1: the lock holds the zoom still, but a window resize still
  // re-fits the court — and 26 screen px is then a different number of feet.
  // Re-fit the draft (and its start, together) to the new zoom's gap during
  // render, the same way a stale editor is dropped above.
  const [editorZ, setEditorZ] = useState<number | null>(null);
  if (activeEditor !== null && editorZ !== pz.t.z) {
    setEditorZ(pz.t.z);
    setEditor(refitBandEditor(activeEditor, editorContext(unit, pz.t.z)));
  }

  /**
   * "Edit bands…". Guarded here as well as by the menu's disabled row: a
   * player can never reach edit mode, whatever calls this.
   */
  const enterEdit = useCallback(() => {
    if (!canEdit || cut === null) return;
    const kind = bandKindFor(cut);
    if (kind === null) return;
    dropActiveMark();
    editSessionRef.current += 1;
    setSaving(false);
    setEditorZ(pz.t.z);
    setEditor(initBandEditor(kind, bands, editorContext(unit, pz.t.z)));
  }, [canEdit, cut, bands, unit, pz.t.z, dropActiveMark]);

  /**
   * Save. The payload is built on the CURRENT effective bands (only this
   * kind's fields come from the draft), and goes through the same
   * optimistic, generation-sequenced `applyBands` a preset pick takes.
   *
   * Fix round 1 ruling: only a SUCCESSFUL save leaves edit mode. A refusal
   * keeps the editor open with the draft intact, the reason shows beside the
   * "Editing bands" pill, and Save is live again (the override reverted, so
   * the draft is dirty against the current bands once more) for a retry.
   */
  function saveEdit() {
    if (activeEditor === null || saving) return;
    if (!bandEditorDirty(activeEditor, bands)) return;
    const session = editSessionRef.current;
    setSaving(true);
    void applyBands(bandEditorPayload(activeEditor, bands)).then((outcome) => {
      // Only the session that started the save may settle it: a Cancel while
      // the save is in flight, then a reopen, starts a new session whose
      // `saving` is already false (enterEdit resets it).
      if (session !== editSessionRef.current) return;
      setSaving(false);
      if (outcome === "saved") exitEdit();
    });
  }

  /* ── Bands (Phase 2B) ─────────────────────────────────────────────────── */

  /**
   * The band overlay's data, assembled ONCE per real change rather than per
   * pan frame — `VizBandsOverlay` is `memo`'d, and a fresh props object on
   * every frame would undo that.
   *
   * `statRows` is the Depth group out of the SAME `computeVizStats` the
   * focused court's stats card renders (`useVizView`), bucketed by these
   * exact bands: the overlay prints that group's rate and count, it never
   * counts anything itself. Serve has no bands; a depth scheme of `"none"`
   * and the contact cuts' session-only "No bands" toggle each drop the
   * overlay entirely (and with it, `MarkLayer` draws over bare court).
   */
  const bandOverlay = useMemo<VizBandsOverlayProps | null>(() => {
    // While editing: the DRAFT, whatever the saved scheme (a "none" record
    // or hidden contact shading still shows the bands being edited), with no
    // `% · n` — those were counted against the saved bands.
    if (activeEditor !== null) {
      const preview = bandEditorPreview(activeEditor);
      const kind = activeEditor.kind;
      return {
        kind,
        dividersFt:
          kind === "depth"
            ? [activeEditor.draft[0], activeEditor.draft[1]]
            : [...preview.contactDividersFt],
        rows:
          kind === "depth"
            ? depthBandRows(preview, unit)
            : contactBandRows(preview, unit),
        statRows: null,
        editing: true,
      };
    }
    return savedBandZones;
  }, [unit, savedBandZones, activeEditor]);

  /* ── Exit ─────────────────────────────────────────────────────────────── */

  // Drops the key rather than setting `false` — `applyVizUpdate` and the URL
  // round-trip both treat "absent" as the only off state.
  function exit() {
    setState((prev) => {
      const { fullscreen: _fullscreen, ...rest } = prev;
      return rest;
    });
  }

  // Fix round 1 #15: the key listener reads the LATEST `exit` through a ref
  // rather than depending on it. `setState` is `useCallback`'d over
  // `searchParams`, so its identity changes with the URL, and depending on it
  // would re-bind the window listener on every navigation for no reason.
  const exitRef = useRef(exit);
  useEffect(() => {
    exitRef.current = exit;
  });

  // Focus returns to whatever opened the viewer (Task 5's door), when it is
  // on the page. Runs on unmount, after the focused view is back.
  useEffect(() => {
    return () => {
      // The door Task 5 added, when it is on the page; otherwise the focused
      // court's own eyebrow, which is already a `tabIndex={-1}` focus target
      // (it is where `runCourtMorph` lands focus). Never nothing: focus
      // falling back to `<body>` strands a keyboard user at the top of the
      // document.
      // Deferred by a microtask: this cleanup runs DURING the commit that
      // removes the portal, and the same commit is what drops `inert` from
      // the wrapper around the focused view (`shots-tab.tsx`, final review
      // #2). `focus()` on a still-inert element is silently a no-op, and the
      // two mutations have no guaranteed order — so wait for the commit to
      // finish, by which point the attribute is certainly gone.
      queueMicrotask(() => {
        const target =
          document.querySelector("[data-viz-fullscreen-door]") ??
          document.getElementById(VIZ_FOCUSED_HEADING_ID);
        if (target instanceof HTMLElement)
          target.focus({ preventScroll: true });
      });
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
      if (isTextEntry(e.target)) return;
      // A menu or dialog is up: its own keys win, ours stand down.
      if (overlayIsOpen()) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      // Phase 2B, Task 4: while the band editor is open the viewer's keys
      // stand down. Esc cancels EDIT MODE (it never exits the viewer from
      // here), the arrows belong to the focused divider (which stops them
      // itself) and never pan, and +/-/0 do nothing — the court is locked.
      if (editing) {
        if (e.key === "Escape") {
          e.preventDefault();
          exitEdit();
        }
        return;
      }
      // Final review #3: a mark owns the arrows (and Home/End) while it has
      // focus — they move focus within the mark group, they do not pan the
      // court out from under it. `MarkLayer` also stops propagation, so this
      // is the belt to that brace: the guard holds even if the synthetic
      // event never reaches this listener's own path.
      if (
        isMarkRovingKey(e.key) &&
        e.target instanceof Element &&
        e.target.closest("[data-viz-mark]") !== null
      ) {
        return;
      }
      switch (e.key) {
        case "Escape":
          e.preventDefault();
          exitRef.current();
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
  }, [zoomIn, zoomOut, fit, nudge, editing, exitEdit]);

  if (cut === null || result === null) {
    // Guarded by `shots-tab.tsx`; only reachable on a render race.
    return null;
  }

  // While editing the pill slot says "Editing bands"; a receipt that arrives
  // then (a refused save, above all) sits BESIDE it rather than being
  // swallowed — the same arrangement as an open filters popover.
  const showReceipt = receipt !== null;
  const receiptTakesPillSlot = showReceipt && !filtersOpen && !editing;
  const pillHidden = editing || receiptTakesPillSlot;

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
    setState((prev) => clearedFilters(prev));
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
        {/* The receipt's live region, mounted for the viewer's whole life
            and only ever WRITTEN to. A `role="status"` that mounts together
            with its text is announced unreliably (VoiceOver above all), and
            a refused save is exactly what has to be heard. The visible pill
            is `aria-hidden`; this is what a screen reader reads. */}
        <div role="status" className="sr-only">
          {receipt?.message ?? ""}
        </div>
        <div
          ref={stageRef}
          data-court-stage=""
          className={cn(
            "absolute inset-0 overflow-clip select-none",
            editing ? "cursor-default" : "cursor-grab active:cursor-grabbing",
          )}
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
            unit={unit}
            bands={bandOverlay}
            transform={pz.t}
            stage={pz.stage}
            panning={pz.panning}
            activeId={activeMarkId ?? visibleSelectedMarkId}
            focusedId={focusedMarkId}
            selectedId={visibleSelectedMarkId}
            rovingId={rovingMarkId}
            onActivate={activateMark}
            onDeactivate={deactivateMark}
            onRove={roveMark}
            onSelect={selectMark}
            watchPointId={
              meta.hasPlayableVideo && visibleSelectedMarkId
                ? (result.dots.find((dot) => dot.id === visibleSelectedMarkId)
                    ?.meta?.pointId ?? null)
                : null
            }
            canWatchPoint={(pointId) =>
              points.some(
                (point) =>
                  point.id === pointId &&
                  point.videoTime !== null &&
                  Number.isFinite(point.videoTime),
              )
            }
            onWatchPoint={actions.watchPoint}
            editing={editing}
            editorLayer={
              activeEditor !== null ? (
                <VizBandsEditorHandles
                  state={activeEditor}
                  z={pz.t.z}
                  unit={unit}
                  update={updateEditor}
                />
              ) : null
            }
          />

          {/* Widget states: an honest empty message on the stage, with the
              chrome still live so the filters that emptied it can be
              cleared. No spinner — nothing is loading here; the points were
              already in `MatchDataProvider` before the viewer opened. */}
          {result.count === 0 && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center px-6">
              {/* While the band editor is open the card is a caption, not a
                  control: it must never catch a divider drag passing under
                  it, and "Clear" would change the filters mid-edit. */}
              <div
                data-chrome=""
                className={cn(
                  "flex flex-col items-center gap-2 rounded-[12px] px-5 py-4 text-center backdrop-blur-[8px]",
                  editing ? "pointer-events-none" : "pointer-events-auto",
                )}
                style={{ background: "rgba(13,13,13,0.74)" }}
              >
                <p className="text-[12px] text-white/80">
                  {hasFilters
                    ? `No ${result.noun} match these filters`
                    : `No ${result.noun} recorded for ${subjectName} yet`}
                </p>
                {hasFilters && !editing && (
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
            className="absolute top-[14px] right-[18px] left-[18px] flex flex-wrap items-start justify-end gap-3"
          >
            <ViewerScoreboard
              cutLabel={CUT_LABEL[cut]}
              count={result.count}
              noun={result.noun}
              subjectIsPlayer1={subjectIsPlayer1}
            />
            <div className="hidden flex-1 sm:block" />
            {/* P2n: the bands receipt takes the filter pill's slot for four
                seconds — no toast, no green tick. The pill is the one piece
                of chrome a coach is already looking at when they pick a
                preset, and the sentence has to name the workspace, not this
                match. It returns on its own; nothing here dismisses it.

                Fix round 1 (#3): the pill is HIDDEN, never unmounted. It is
                the anchor of an open Radix popover, and swapping it out
                while that panel is up destroys the panel mid-interaction and
                drops focus to `<body>`. So while the popover is open the
                receipt sits BESIDE it instead of over it — the receipt is
                never withheld, and the filters a coach is in the middle of
                editing are never yanked away. */}
            {showReceipt && <BandsReceipt message={receipt.message} />}
            {/* P2m: while editing, the pill reads "Editing bands" — static,
                not a door into the filters (changing the cut's filters under
                an open editor would change nothing it edits, and would only
                muddle what Save means). */}
            {editing && <EditingBandsPill />}
            <span
              className={cn("inline-flex shrink-0", pillHidden && "hidden")}
              aria-hidden={pillHidden || undefined}
            >
              <FiltersPopover
                onOpenChange={setFiltersOpen}
                count={result.count}
                total={result.total}
                noun={result.noun}
                sets={sets}
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
            </span>
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

          {activeEditor !== null && (
            <VizBandsEditorBanner kind={activeEditor.kind} />
          )}

          {/* ── Bottom slab ────────────────────────────────────────────── */}
          {/* P2m: the slab crossfades to the editor's controls. The viewer's
              own controls stay MOUNTED underneath (inert, faded out) so the
              bands trigger is still there to take focus back on exit, and
              fade back in over 200ms when the editor closes. */}
          <div
            data-chrome=""
            className="absolute right-5 bottom-4 left-5 h-12 min-w-0 overflow-hidden rounded-[12px] backdrop-blur-[8px]"
            style={{ background: "rgba(13,13,13,0.72)" }}
          >
            <div
              inert={editing}
              aria-hidden={editing || undefined}
              className={cn(
                "flex h-full min-w-0 items-center gap-2 overflow-x-auto px-3 transition-opacity duration-200 ease-[var(--ease-primary)] motion-reduce:transition-none",
                editing && "opacity-0",
              )}
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
                  {/* The tokens are the one item allowed to give up width when
                    the slab runs out; everything else is fixed-size chrome. */}
                  <div
                    aria-label="Applied filters, scroll horizontally"
                    tabIndex={0}
                    className="min-w-[72px] shrink overflow-x-auto overscroll-x-contain whitespace-nowrap"
                    onKeyDown={(event) => {
                      if (event.target !== event.currentTarget) return;
                      if (
                        event.key !== "ArrowLeft" &&
                        event.key !== "ArrowRight"
                      )
                        return;
                      event.preventDefault();
                      event.stopPropagation();
                      event.currentTarget.scrollBy({
                        left: event.key === "ArrowRight" ? 80 : -80,
                      });
                    }}
                  >
                    <AppliedStrip
                      tone="dark"
                      readOnly={viewIsPristine}
                      fullscreen
                    />
                  </div>
                </>
              )}
              {/* P2k: the bands control, between the tokens and the spacer.
                Only the three return cuts have bands — `VizBandsMenu`
                returns nothing on Serve, so the slab simply doesn't grow a
                control there. `onEdit` opens Task 4's drag editor; the
                menu's own "Edit bands…" row renders disabled for a viewer
                who cannot change this workspace's bands, and `enterEdit`
                refuses them as well. */}
              {bandKindFor(cut) !== null && (
                <>
                  <SlabDivider />
                  <span ref={bandsTriggerRef} className="contents">
                    <VizBandsMenu cut={cut} onEdit={enterEdit} />
                  </span>
                </>
              )}
              <div className="flex-1" />
              {/* The legend is the first thing to go on a narrow viewport: the
                court's own colours still read, and every other control is
                something you cannot operate without. */}
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
            {activeEditor !== null && (
              <VizBandsEditorSlab
                state={activeEditor}
                current={bands}
                saving={saving}
                unit={unit}
                onReset={() => updateEditor(resetBandEditor)}
                onCancel={exitEdit}
                onSave={saveEdit}
              />
            )}
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

/**
 * P2n: the bands receipt, in the filter pill's own slot and shaped like it —
 * a `move-vertical` glyph and one sentence. Visual only (`aria-hidden`): the
 * viewer's always-mounted sr-only status region carries the same sentence to
 * a screen reader without focus moving. No tick and no colour: a save that
 * worked is not an event, it is a fact, and the sentence ("every return
 * chart in {workspace}") is the part that matters — bands are workspace-wide,
 * not this match's.
 *
 * A failure takes the same slot with the reason in it, rather than a toast
 * somewhere else on the screen: the thing that did not change is right here.
 */
function BandsReceipt({ message }: { message: string }) {
  return (
    <div
      aria-hidden="true"
      className="inline-flex h-[26px] shrink-0 items-center gap-1.5 rounded-full px-2.5 text-[11px] font-medium text-white backdrop-blur-[6px]"
      style={{ background: "rgba(13,13,13,0.72)" }}
    >
      <MoveVertical
        className="size-3 shrink-0 text-white/70"
        strokeWidth={1.6}
        aria-hidden="true"
      />
      <span className="truncate">{message}</span>
    </div>
  );
}

/** P2m: the pill slot while the band editor is open. Not a control. */
function EditingBandsPill() {
  return (
    <span
      className="inline-flex h-[26px] shrink-0 items-center gap-1.5 rounded-full px-2.5 text-[11px] font-medium text-white backdrop-blur-[6px]"
      style={{ background: "rgba(13,13,13,0.72)" }}
    >
      <MoveVertical
        className="size-3 shrink-0 text-white/70"
        strokeWidth={1.6}
        aria-hidden="true"
      />
      Editing bands
    </span>
  );
}

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
 * focused court's legend reads, drawn on the dark surface (8px dots and a
 * modest ace star, ringed in black, with 11px labels at
 * 70% white). Heat returns its one ramp item, and the ramp replaces the
 * outcome keys entirely.
 */
function DarkLegend({ items }: { items: LegendItem[] }) {
  // Fix round 1 #8: hidden below `xl`, where the slab's fixed chrome already
  // fills the row. The court's own colours still carry the encoding, and the
  // focused view's legend (always visible) is one Esc away.
  if (items.length === 1 && items[0].glyph === "ramp") {
    return (
      <span className="hidden shrink-0 items-center gap-1.5 xl:inline-flex">
        <span className="text-[11px] text-white/70">Fewer</span>
        <span
          className="inline-flex shrink-0 overflow-hidden rounded-full"
          aria-hidden="true"
        >
          <HeatRampSwatches />
        </span>
        <span className="text-[11px] text-white/70">More</span>
      </span>
    );
  }
  return (
    <div className="hidden shrink-0 items-center gap-3 pr-1 xl:flex">
      {items.map((item) => (
        <span key={item.key} className="inline-flex items-center gap-1.5">
          {item.glyph === "star" ? (
            <svg
              aria-hidden="true"
              className="size-2.5 shrink-0"
              viewBox="0 0 10 10"
            >
              <polygon
                points={starPoints(5, 5, 4.2)}
                fill={item.color}
                stroke="var(--ink-900)"
                strokeWidth={0.5}
              />
            </svg>
          ) : (
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
          )}
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
  subjectIsPlayer1,
}: {
  cutLabel: string;
  count: number;
  noun: string;
  subjectIsPlayer1: boolean;
}) {
  const { match } = useMatchData();
  const sides = useMatchSides();
  const sets = playedSets(sides.sets);
  const subject =
    subjectIsPlayer1 === sides.you.isPlayer1 ? sides.you : sides.opp;
  const status = formatScoreboardStatus(match.matchContext);
  const clock =
    typeof match.durationSec === "number" && match.durationSec > 0
      ? formatClock(match.durationSec, { alwaysShowHours: true })
      : null;

  return (
    <div
      data-testid="fullscreen-scoreboard"
      className="mr-auto flex w-full min-w-[236px] flex-col gap-[14px] rounded-[12px] backdrop-blur-[8px] sm:w-auto"
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
          data-testid="fullscreen-subject-avatar"
          className="flex size-[22px] shrink-0 items-center justify-center rounded-full text-[10px] font-medium text-white"
          style={{ background: "rgba(255,255,255,0.14)" }}
        >
          {subject.initials}
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
        {/* Final review #10: the digit, the dimming and the tiebreak slot all
            come from `scoreboardCells` — the SAME function the match
            report's rail scoreboard uses. This is the one widget where a
            flipped `player1`/`player2` would look entirely correct on screen
            while naming the wrong player (guardrails §4), so it is not
            re-derived here. */}
        {scoreboardCells(sets, side).map(
          ({ digit, lostSet, tiebreak }, index) => (
            <span
              key={index}
              className="w-[11px] text-right"
              style={{ color: lostSet ? "rgba(255,255,255,0.42)" : "#FFFFFF" }}
            >
              {digit}
              {tiebreak !== null && (
                <span className="inline-block w-0">
                  <span aria-hidden="true" style={TIEBREAK_STYLE}>
                    {tiebreak}
                  </span>
                  <span className="sr-only"> tiebreak {tiebreak}</span>
                </span>
              )}
            </span>
          ),
        )}
      </span>
    </div>
  );
}
