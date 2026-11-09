"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Maximize, Minus, Plus, X } from "lucide-react";

import { useMatchReport } from "@/components/dashboard/matches/match-detail/match-report-context";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ChromeTooltip } from "@/components/dashboard/shared/chrome-tooltip";
import { advButton } from "@/lib/ui/adv-button";
import { MAX_POINT_SET } from "@/lib/match-video/point-set";
import { contactBandRows, depthBandRows } from "@/lib/data/viz-bands";
import { isTextEntry } from "@/lib/ui/is-text-entry";
import { cn } from "@/lib/utils";

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
import { CutMenu } from "./cut-menu";
import { defaultCutsFor } from "./default-cuts";
import { HeatRampLegend, LegendMark } from "./legend-mark";
import { LifecycleChip } from "./lifecycle-chip";
import { LightboxCourt, type CourtOutline } from "./lightbox-court";
import { LightboxStats } from "./lightbox-stats";
import { serveRowDotIds, statPickDotIds, type StatPick } from "./stat-cut";
import {
  dotMatchesPick,
  isPlayable,
  legendCounts,
  markIsPoint,
  pointsBehind,
  type LegendPick,
} from "./lightbox-points";
import {
  LegendFilter,
  LightboxFilterPanel,
  LightboxFilterStrip,
} from "./lightbox-filters";
import { LightboxPointList } from "./lightbox-point-list";
import type { MatchPoint } from "@/lib/data/match-points-server";
import type { ZoneKey } from "@/lib/data/serve-zones";
import { KEY_PAN_PX } from "./pan-zoom";
import { viewerInitialTransform } from "./court-geometry";
import { SaveViewDialog } from "./save-view-dialog";
import { shotsWriteAccess } from "./shots-write-access";
import { usePanZoom } from "./use-pan-zoom";
import { useVizState } from "./use-viz-state";
import { useVizView } from "./use-viz-view";
import { useVizBands } from "./viz-bands-context";
import {
  VizBandsEditorBanner,
  VizBandsEditorHandles,
  VizBandsEditorSlab,
  editorContext,
} from "./viz-bands-editor";
import type { VizBandsOverlayProps } from "./viz-bands-overlay";
import { bandKindFor } from "./cut-kinds";
import { CUT_LABEL, legendItemsFor } from "./viz-labels";
import { isMarkRovingKey } from "./viz-mark-roving";
import {
  EMPTY_VIZ_FILTERS,
  collapseErrorFilter,
  computeViz,
  errorsJudgedIn,
  filterKeysFor,
  type PlayerFilter,
  type VizFilters,
} from "./viz-model";
import { activeFilterEntries, courtFor, sameFilterValue } from "./viz-url";
import { useErrorSplitJudged } from "../match-filters/provider";
import { lightboxCountLine } from "./wall-summary";
import { useMatchFilters } from "../match-filters/provider";

/** A saved view's filter group, named when the reader loosens it to "any". */
const LOOSENED_LABEL: Partial<Record<keyof VizFilters, string>> = {
  ball: "Serve",
  court: "Court",
  set: "Set",
  zone: "Zone",
  result: "Result",
  pressure: "Score",
  rally: "Rally",
  game: "Game",
  error: "Error type",
  match: "Advanced filters",
};

/** Opens the Video tab on the points the lightbox shows, by point number,
 *  named by `label` in its strip. */
export type WatchPoints = (pointNumbers: number[], label: string) => void;

/**
 * The opened card (canvas "Final flow" / "Flow states" S03–S17): a Dialog v3
 * lightbox over the wall, replacing both the focused page and the fullscreen
 * viewer. `shots-tab.tsx` mounts it whenever `state.cut` is set, so
 * `?cut=…` opens it over the wall and dropping `cut` closes it.
 *
 * Geometry (Dialog v3, `reference/chrome.md`): scrim `rgba(13,13,13,.4)`,
 * 14px radius, the dropdown shadow, 24/24/20 padding, a 28px close. On a
 * 1512×982 screen it is 1212px wide, 96px from the top, with an 800px court
 * column beside a 340px right column.
 *
 * Every figure comes from `useVizView()` — one `computeViz`, one
 * `computeVizStats`, one resolved subject (guardrails §4) — and the footer's
 * N is `pointsBehind()` over the same marks the court draws.
 */
export function VizLightbox({
  wallPlayer,
  onWatchPoints,
  allowSaveView = true,
}: {
  /** The wall's own You | Opponent, which closing restores — a player
   *  switched inside the lightbox does not leak onto the wall. */
  wallPlayer: PlayerFilter;
  /** "Watch these N points". Omitted, there is no Watch button — a
   *  read-only host (the team player profile's season view) leaves it out. */
  onWatchPoints?: WatchPoints;
  /** "Save as view". `false` leaves it out whatever the viewer may write;
   *  `true` (default) still needs `shotsWriteAccess(meta).canSaveViews`. */
  allowSaveView?: boolean;
}) {
  const { state, setState } = useVizState();
  const { meta } = useMatchReport();
  const { context: matchCtx } = useMatchFilters();
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
    isDraft,
    bands,
    bandZones: savedBandZones,
    unit,
  } = useVizView();
  const { receipt, canEdit, applyBands } = useVizBands();
  const canSaveViews = allowSaveView && shotsWriteAccess(meta).canSaveViews;

  // The stage lives inside Radix's portal, which mounts a commit after this
  // component, so a plain ref is still empty when `usePanZoom` first
  // measures. The element goes through state instead, and the ref object it
  // hands the hook changes identity once the stage exists — the hook keys its
  // measuring effects on that identity.
  const [stageEl, setStageEl] = useState<HTMLDivElement | null>(null);
  const stageRef = useMemo(() => ({ current: stageEl }), [stageEl]);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const saveAnchorRef = useRef<HTMLButtonElement>(null);
  const cutMenuTriggerRef = useRef<HTMLButtonElement>(null);
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);

  /* ── Marks: hover, keyboard focus, selection ──────────────────────────── */

  const [activeMarkId, setActiveMarkId] = useState<string | null>(null);
  const [focusedMarkId, setFocusedMarkId] = useState<string | null>(null);
  const [selectedMarkId, setSelectedMarkId] = useState<string | null>(null);
  const [rovingMarkId, setRovingMarkId] = useState<string | null>(null);
  const readoutLeaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (readoutLeaveTimer.current) clearTimeout(readoutLeaveTimer.current);
    },
    [],
  );

  const activateMark = useCallback((id: string, keyboard: boolean) => {
    if (readoutLeaveTimer.current) clearTimeout(readoutLeaveTimer.current);
    setActiveMarkId(id);
    if (keyboard) setFocusedMarkId(id);
  }, []);
  const deactivateMark = useCallback((id: string) => {
    if (readoutLeaveTimer.current) clearTimeout(readoutLeaveTimer.current);
    readoutLeaveTimer.current = setTimeout(() => {
      setActiveMarkId((prev) => (prev === id ? null : prev));
      setFocusedMarkId((prev) => (prev === id ? null : prev));
    }, 220);
  }, []);
  const roveMark = useCallback((id: string) => setRovingMarkId(id), []);
  const dropActiveMark = useCallback(() => {
    if (readoutLeaveTimer.current) clearTimeout(readoutLeaveTimer.current);
    setActiveMarkId(null);
    setFocusedMarkId(null);
  }, []);
  const holdReadout = useCallback(() => {
    if (readoutLeaveTimer.current) clearTimeout(readoutLeaveTimer.current);
  }, []);
  const releaseReadout = useCallback(() => {
    setActiveMarkId(null);
    setFocusedMarkId(null);
  }, []);
  const selectMark = useCallback((id: string) => {
    setActiveMarkId(null);
    setSelectedMarkId((prev) => (prev === id ? null : id));
  }, []);

  /** The right column: the points behind the marks, or their statistics. */
  const [pane, setPane] = useState<"points" | "stats">("points");
  /**
   * The legend's one choice (Won · Lost · Out · Ace), local to this card.
   * Stamped with the cut it was picked on: a chart-menu cut switch
   * (Placement → Contact) lets go of it, so it can never empty a court whose
   * marks it does not describe. A You | Opponent switch keeps it (canvas S08).
   */
  const legendStamp = `${state.cut}:${state.chart}`;
  const [legendState, setLegendState] = useState<{
    stamp: string;
    pick: LegendPick;
  } | null>(null);
  const setLegendPick = (pick: LegendPick | null) =>
    setLegendState(pick === null ? null : { stamp: legendStamp, pick });
  /** A Statistics row chosen (court and Points keep its marks) or hovered
   *  (court outlines it). Stamped with the court it was picked on. */
  const [statPick, setStatPick] = useState<{
    stamp: string;
    pick: StatPick;
  } | null>(null);
  const [statHover, setStatHover] = useState<StatPick | null>(null);
  const courtStamp = `${state.cut}:${state.filters.player}`;
  // A pick whose stamp no longer matches is DROPPED, not just hidden, so
  // switching back never brings it back: the legend's on a cut change or a
  // chart change (Heat and Zones draw no marks to filter; You | Opponent
  // keeps it, canvas S08), a Statistics row's on a cut or player change
  // (the rows are another court's). Render-phase updates, as the band
  // editor's stale draft is dropped below; no effect.
  if (legendState !== null && legendState.stamp !== legendStamp)
    setLegendState(null);
  if (statPick !== null && statPick.stamp !== courtStamp) setStatPick(null);
  const legendPick =
    legendState !== null && legendState.stamp === legendStamp
      ? legendState.pick
      : null;
  const activeStatPick =
    statPick !== null && statPick.stamp === courtStamp ? statPick.pick : null;
  const errorSplitJudged = useErrorSplitJudged();

  // A Statistics row's marks, by the stats' own rules (`stat-cut.ts`).
  // The serve rows' marks, all six at once, while Statistics is open on the
  // serve cut — so hovering across its rows reads a set rather than running
  // a zone's `computeViz` per hover. Rebuilt when the filters change.
  const serveRows = useMemo(
    () =>
      pane === "stats" && cut === "serve"
        ? serveRowDotIds(
            points,
            state.filters,
            subjectIsPlayer1,
            matchCtx,
            bands,
          )
        : null,
    [pane, cut, points, state.filters, subjectIsPlayer1, matchCtx, bands],
  );
  const rowIds = useCallback(
    (pick: StatPick | null): Set<string> | null => {
      if (pick === null || result === null || cut === null) return null;
      const cached = serveRows?.get(pick.row);
      if (cached) return cached;
      return statPickDotIds(
        points,
        cut,
        state.filters,
        subjectIsPlayer1,
        matchCtx,
        result.dots,
        pick,
        bands,
      );
    },
    [
      serveRows,
      points,
      cut,
      state.filters,
      subjectIsPlayer1,
      matchCtx,
      result,
      bands,
    ],
  );
  const pickIds = useMemo(
    () => rowIds(activeStatPick),
    [rowIds, activeStatPick],
  );
  const hoverIds = useMemo(() => rowIds(statHover), [rowIds, statHover]);

  // The marks on court: the result's, narrowed by the legend's pick and a
  // chosen Statistics row.
  const dots = useMemo(
    () =>
      result === null
        ? undefined
        : result.dots.filter(
            (d) =>
              (legendPick === null || dotMatchesPick(d, legendPick)) &&
              (pickIds === null || pickIds.has(d.id)),
          ),
    [result, legendPick, pickIds],
  );

  const visibleSelectedMarkId =
    selectedMarkId !== null &&
    (dots ?? []).some((dot) => dot.id === selectedMarkId)
      ? selectedMarkId
      : null;
  // A selection whose mark has left the court (a filter, a legend or
  // Statistics pick, a player switch) is DROPPED, not just hidden: clearing
  // the filter must not bring the ring back, nor make the next Esc spend
  // itself deselecting a point nobody can see. Render-phase, as the stale
  // picks above; only once the marks are known.
  if (
    selectedMarkId !== null &&
    dots !== undefined &&
    visibleSelectedMarkId === null
  )
    setSelectedMarkId(null);

  // A row selects its point's mark on the court (the first mark that stands
  // for that point), so the row and the mark light together.
  const selectPoint = useCallback(
    (point: MatchPoint) => {
      if (!dots || cut === null) return;
      const dot = dots.find(
        (d) => d.meta?.pointId === point.id && markIsPoint(cut, d),
      );
      if (!dot) return;
      setActiveMarkId(null);
      setSelectedMarkId((prev) => (prev === dot.id ? null : dot.id));
    },
    [dots, cut],
  );
  const selectedPointId =
    visibleSelectedMarkId !== null
      ? (dots?.find((d) => d.id === visibleSelectedMarkId)?.meta?.pointId ??
        null)
      : null;

  const savedView =
    state.viewId !== null
      ? (meta.savedViews.find((v) => v.id === state.viewId) ?? null)
      : null;
  // The saved view the court is, or was edited from (`?vfrom=`, which the
  // store moves on every save, pick and new cut — `applyVizUpdate`). In the
  // URL, so a remount (Watch → Video → Back) or a reload keeps it.
  const baseViewId = state.viewId ?? state.editedFrom ?? null;
  const baseView =
    baseViewId !== null
      ? (meta.savedViews.find((v) => v.id === baseViewId) ?? null)
      : null;
  const defaultCut = defaultCutsFor(errorsJudgedIn(matchCtx)).find(
    (c) => c.cut === state.cut,
  );
  // The court's baseline: a saved view's own filters, else the wall card's
  // ("First serves" is first serves), always for the player on court. While
  // the court still holds them the view's or card's name is the title and
  // they are not repeated in the strip or counted as applied; loosen one
  // (Serve: Any) and the title falls back to the cut's own name, so title,
  // strip and Watch label always describe the live filters.
  const baseline: {
    name: string;
    filters: VizFilters;
    keys: (keyof VizFilters)[];
    view: { id: string; player: VizFilters["player"] } | null;
  } | null =
    baseView !== null && baseView.cut === state.cut
      ? (() => {
          // Read as the URL reads it: on a match whose errors are not
          // judged, a stored Unforced (or Forced) is every error
          // (`parseVizState`'s `collapseErrorFilter`), so a hard-loaded
          // view is not mistaken for an edit of itself.
          const filters: VizFilters = {
            ...EMPTY_VIZ_FILTERS,
            ...baseView.filters,
            error: collapseErrorFilter(
              baseView.filters.error ?? EMPTY_VIZ_FILTERS.error,
              errorSplitJudged,
            ),
            player: state.filters.player,
          };
          return {
            name: baseView.name,
            filters,
            keys: (
              Object.keys(EMPTY_VIZ_FILTERS) as (keyof VizFilters)[]
            ).filter(
              (key) =>
                key !== "player" &&
                !sameFilterValue(key, filters, EMPTY_VIZ_FILTERS),
            ),
            view: {
              id: baseView.id,
              player: baseView.filters.player ?? EMPTY_VIZ_FILTERS.player,
            },
          };
        })()
      : defaultCut && baseView === null
        ? {
            name: defaultCut.name,
            filters: {
              ...EMPTY_VIZ_FILTERS,
              ...defaultCut.filters,
              player: state.filters.player,
            },
            keys: Object.keys(defaultCut.filters) as (keyof VizFilters)[],
            view: null,
          }
        : null;
  const cardFilters: VizFilters | null = baseline?.filters ?? null;
  const cardKeys = baseline?.keys ?? [];
  const onCard =
    cardFilters !== null &&
    cardKeys.every((key) => sameFilterValue(key, state.filters, cardFilters));
  // The list's denominator. On the baseline it is the view's or card's own
  // points (an unfiltered "First serves" reads 40 / 40, the strip naming
  // anything narrower); off it — a loosened card, a link — it is the widest
  // set, the cut for this player with no filters, and the strip names every
  // filter in force. Either way N never passes M.
  const denominatorFilters: VizFilters =
    onCard && cardFilters !== null
      ? cardFilters
      : { ...EMPTY_VIZ_FILTERS, player: state.filters.player };
  const allPointsBehind = useMemo(() => {
    if (cut === null) return [];
    const all = computeViz(
      points,
      cut,
      denominatorFilters,
      subjectIsPlayer1,
      "scatter",
      matchCtx,
    );
    return pointsBehind(cut, all.dots, points);
    // `denominatorFilters` is rebuilt every render; its content is keyed by
    // these.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    points,
    cut,
    onCard,
    baseView,
    state.filters.player,
    subjectIsPlayer1,
    matchCtx,
  ]);

  /* ── Band editor (moved from the fullscreen viewer) ───────────────────── */

  const [editor, setEditor] = useState<BandEditorState | null>(null);
  const activeEditor =
    editor !== null &&
    canEdit &&
    cut !== null &&
    bandKindFor(cut) === editor.kind
      ? editor
      : null;
  const editing = activeEditor !== null;
  // An editor that is no longer active is dropped outright, so it cannot
  // spring back if `canEdit` or the cut flip back.
  if (editor !== null && activeEditor === null) setEditor(null);

  const [saving, setSaving] = useState(false);
  const editSessionRef = useRef(0);

  const updateEditor = useCallback(
    (fn: (prev: BandEditorState) => BandEditorState) => {
      setEditor((prev) => (prev === null ? prev : fn(prev)));
    },
    [],
  );
  const exitEdit = useCallback(() => setEditor(null), []);

  // The stage needs a real cut; `shots-tab.tsx` only mounts this with one.
  const pz = usePanZoom(cut ?? "serve", stageRef, dropActiveMark, editing);

  // The readout's last line, read off the point the way the Video tab's
  // point list prints its game headers: set, game, and who served.
  const pointById = useMemo(
    () => new Map(points.map((p) => [p.id, p])),
    [points],
  );
  const youIsPlayer1 = you.isPlayer1;
  const whereFor = useCallback(
    (pointId: string): string | null => {
      const point = pointById.get(pointId);
      if (!point) return null;
      const parts: string[] = [];
      if (point.setNumber > 0) parts.push(`Set ${point.setNumber}`);
      if (point.gameNumber > 0) parts.push(`Game ${point.gameNumber}`);
      if (typeof point.serverIsPlayer1 === "boolean")
        parts.push(
          `${point.serverIsPlayer1 === youIsPlayer1 ? "You" : "Opponent"} serving`,
        );
      return parts.length > 0 ? parts.join(" · ") : null;
    },
    [pointById, youIsPlayer1],
  );

  // A resize re-fits the court while the editor is open: re-fit the draft to
  // the new zoom during render, the way a stale editor is dropped above.
  const [editorZ, setEditorZ] = useState<number | null>(null);
  if (activeEditor !== null && editorZ !== pz.t.z) {
    setEditorZ(pz.t.z);
    setEditor(refitBandEditor(activeEditor, editorContext(unit, pz.t.z)));
  }

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

  function saveEdit() {
    if (activeEditor === null || saving) return;
    if (!bandEditorDirty(activeEditor, bands)) return;
    const session = editSessionRef.current;
    setSaving(true);
    void applyBands(bandEditorPayload(activeEditor, bands)).then((outcome) => {
      if (session !== editSessionRef.current) return;
      setSaving(false);
      if (outcome === "saved") exitEdit();
    });
  }

  const bandOverlay = useMemo<VizBandsOverlayProps | null>(() => {
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

  /* ── Close ────────────────────────────────────────────────────────────── */

  // Back to the wall: no cut, no filters, the wall's own player. The wall
  // never unmounted, so its scroll is where it was.
  function close() {
    setState({
      cut: null,
      chart: "scatter",
      filters: { ...EMPTY_VIZ_FILTERS, player: wallPlayer },
      viewId: null,
    });
  }

  // Focus goes back to whatever opened the lightbox — the card, a saved
  // view's tile — when it is still on the page.
  const openerRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (document.activeElement instanceof HTMLElement)
      openerRef.current = document.activeElement;
  }, []);

  /* ── Keyboard: zoom and pan, inside the dialog only ───────────────────── */

  const { zoomIn, zoomOut, fit, nudge } = pz;
  function onKeyDown(e: React.KeyboardEvent) {
    if (isTextEntry(e.target)) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (editing) return;
    if (
      isMarkRovingKey(e.key) &&
      e.target instanceof Element &&
      e.target.closest("[data-viz-mark]") !== null
    )
      return;
    // Only while the court has the keyboard — a menu row's arrows are its own.
    if (
      !(e.target instanceof Element) ||
      e.target.closest("[data-court-stage]") === null
    )
      return;
    const keys: Record<string, () => void> = {
      "+": zoomIn,
      "=": zoomIn,
      "-": zoomOut,
      "0": fit,
      ArrowLeft: () => nudge(KEY_PAN_PX, 0),
      ArrowRight: () => nudge(-KEY_PAN_PX, 0),
      ArrowUp: () => nudge(0, KEY_PAN_PX),
      ArrowDown: () => nudge(0, -KEY_PAN_PX),
    };
    const run = keys[e.key];
    if (run) {
      e.preventDefault();
      run();
    }
  }

  // Esc normally reaches the lightbox through Radix: the topmost layer
  // gets it, and the Dialog's own `onEscapeKeyDown` (below) takes one step
  // back. A nested Dialog, AlertDialog, Select, menu or popover opened above
  // it is topmost and handles Esc first, as it should.
  //
  // One case Radix gets wrong: a menu or popover that has just closed (the
  // Filters panel, the chart menu) stays mounted, and still topmost,
  // through its ~150ms exit animation. An Esc in that window (Esc to close
  // the panel, then Esc again to close the lightbox) is swallowed by the
  // closing layer, and the lightbox stays open. This capture listener takes
  // the key ONLY then: when a layer is closing and no other layer is open,
  // it runs the step itself. Otherwise it does nothing, and Radix routes
  // the key. Tooltips forward their own Esc (`escapeFromTooltip`).
  const contentRef = useRef<HTMLDivElement>(null);
  const escapeRef = useRef<() => void>(() => {});
  useEffect(() => {
    escapeRef.current = () => {
      if (!escapeStep()) close();
    };
  });
  useEffect(() => {
    const LAYERS =
      '[data-radix-popper-content-wrapper] > *, [role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"]';
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      const own = contentRef.current;
      const layers = [...document.querySelectorAll<HTMLElement>(LAYERS)].filter(
        (el) => el !== own && el.dataset.state !== undefined,
      );
      // Only Radix layers carry `data-state`; anything else matching a
      // layer role (MobileGate's always-mounted `alertdialog`, FloatMenu's
      // inner `role="menu"` list) says nothing about what is open, and
      // reading it as open would leave this listener inert.
      const isOpen = (el: HTMLElement) =>
        ["open", "delayed-open", "instant-open"].includes(
          el.dataset.state ?? "",
        );
      // Any layer open above the lightbox keeps the key.
      if (layers.some(isOpen)) return;
      // Nothing closing: the Dialog's own handler takes it.
      if (!layers.some((el) => el.dataset.state === "closed")) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      escapeRef.current();
    };
    document.addEventListener("keydown", onKey, { capture: true });
    return () =>
      document.removeEventListener("keydown", onKey, { capture: true });
  }, []);

  if (cut === null || result === null || stats === null) return null;

  /* ── Esc ──────────────────────────────────────────────────────────────── */

  // Esc steps back one layer at a time: the band editor, then a selected
  // point, then the lightbox itself. Returns whether it stepped back short of
  // closing.
  function escapeStep(): boolean {
    if (editing) {
      exitEdit();
      return true;
    }
    if (visibleSelectedMarkId !== null) {
      setSelectedMarkId(null);
      return true;
    }
    return false;
  }

  // The same step from an open icon tooltip. The tooltip is the topmost
  // layer then, so Radix gives it the key and the dialog never hears it; a
  // reader whose pointer rests on Close or a zoom button (where it lands when
  // the applied strip goes and the column shifts up) would otherwise need
  // two presses to close.
  function escapeFromTooltip() {
    if (!escapeStep()) close();
  }

  /* ── Words ────────────────────────────────────────────────────────────── */

  const title = isDraft
    ? "New view"
    : baseline !== null && (onCard || baseline.view !== null)
      ? // A saved view keeps its name while edited: the strip names every
        // change from it, and Clear goes back to it.
        baseline.name
      : (savedView?.name ?? CUT_LABEL[cut]);
  const subjectWord = state.filters.player === "you" ? "You" : "Opponent";
  const subtitle = isDraft
    ? "Pick a chart and filters, then save it as a view."
    : `${CUT_LABEL[cut]} · ${subjectWord} · ${lightboxCountLine(
        cut,
        result,
        stats,
        depthBandRows(bands, unit),
      )}`;

  // Zoom is shown against the fitted court: "180%" is 1.8× the fit.
  const fitT =
    pz.stage.w > 0 && pz.stage.h > 0
      ? viewerInitialTransform(cut, pz.stage)
      : null;
  const zoomRelative = fitT ? pz.t.z / fitT.z : 1;
  const atFit =
    fitT === null ||
    (Math.abs(zoomRelative - 1) < 0.005 &&
      Math.abs(pz.t.px - fitT.px) < 0.5 &&
      Math.abs(pz.t.py - fitT.py) < 0.5);

  const shownDots = dots ?? result.dots;
  const matched = isDraft ? [] : pointsBehind(cut, shownDots, points);
  const showFooter =
    !isDraft &&
    (canSaveViews || (meta.hasPlayableVideo && onWatchPoints !== undefined));
  // The points to watch: the matched ones with a clip, as many as one Video
  // tab point set holds (`MAX_POINT_SET`), so the button never promises more
  // than the list will show.
  const playable = matched.filter(isPlayable).slice(0, MAX_POINT_SET);
  const legend = legendItemsFor(cut, state.chart);
  const heat = state.chart === "heat";

  function choosePlayer(player: PlayerFilter) {
    setState((prev) => ({
      ...prev,
      filters: courtFor(prev, player),
      viewId: null,
    }));
  }

  // What "Clear filter" leaves: a saved view's own filters, always — Clear
  // goes back to the view; the card's while the title still names the card;
  // otherwise nothing but the player. Exactly the filters the strip names
  // are removed.
  const clearTarget: VizFilters =
    baseline !== null && (onCard || baseline.view !== null)
      ? baseline.filters
      : { ...EMPTY_VIZ_FILTERS, player: state.filters.player };
  // Back on the view's filters for the view's own player, the court IS the
  // view again: keep its id, so its title, Saved highlight and link return.
  const clearViewId =
    baseline?.view != null && baseline.view.player === state.filters.player
      ? baseline.view.id
      : null;

  function clearFilters() {
    setLegendPick(null);
    setStatPick(null);
    setState((prev) => ({
      ...prev,
      // Back to a saved view is back to its chart too: the id comes back
      // with it, and the title, Saved highlight and menu all name the view.
      ...(baseline?.view != null && baseView !== null
        ? { chart: baseView.chart }
        : {}),
      filters: clearTarget,
      viewId: clearViewId,
    }));
  }

  function setFilters(next: VizFilters) {
    setState((prev) => ({ ...prev, filters: next, viewId: null }));
  }

  // Any filter the court is under beyond what "Clear filter" leaves —
  // including the advanced (`match`), Result, Rally and Game groups a saved
  // view or a `?f=` link can carry, which the panel does not edit.
  const panelActive = filterKeysFor(cut).some(
    (key) =>
      key !== "player" && !sameFilterValue(key, state.filters, clearTarget),
  );
  // The strip's sentence: exactly what "Clear filter" removes. On a card
  // the card's own filters are left out while it holds them, and every
  // filter is named once it is loosened. On a saved view, every change from
  // the view: a filter added, a view filter changed (its new value), or a
  // view filter loosened to nothing ("Serve: any"). Then the legend's pick
  // and a Statistics row — so nothing narrows or widens the court unseen.
  const names = { you: you.shortName, opponent: opp.shortName };
  const onView = baseline !== null && baseline.view !== null;
  const unchangedBaseKey = (key: keyof VizFilters) =>
    cardFilters !== null &&
    cardKeys.includes(key) &&
    (onView ? sameFilterValue(key, state.filters, cardFilters) : onCard);
  const phrases = activeFilterEntries(state, names, { errorSplitJudged })
    .filter((e) => e.key !== "player" && !unchangedBaseKey(e.key))
    .map((e) => e.label);
  if (onView)
    for (const key of cardKeys)
      if (
        !unchangedBaseKey(key) &&
        sameFilterValue(key, state.filters, EMPTY_VIZ_FILTERS)
      )
        phrases.push(`${LOOSENED_LABEL[key] ?? "Filter"}: any`);
  if (legendPick !== null)
    phrases.push(
      { won: "Won", lost: "Lost", out: "Out", ace: "Aces" }[legendPick],
    );
  if (activeStatPick !== null) phrases.push(activeStatPick.label);
  const anyCut = panelActive || legendPick !== null || activeStatPick !== null;
  const statOnly =
    activeStatPick !== null && !panelActive && legendPick === null;

  // The court's outline: the hovered row, else the chosen one — a serve
  // zone, or a depth or contact band; other rows (Direction, Stroke, Miss)
  // have no single place on court and only fade the rest.
  const outlinePick = statHover ?? activeStatPick;
  let outline: CourtOutline | null = null;
  if (outlinePick !== null) {
    if (cut === "serve") {
      outline = {
        kind: "zone",
        key: outlinePick.row as ZoneKey,
      };
    } else if (
      outlinePick.group === "depth" &&
      savedBandZones !== null &&
      savedBandZones.rows.some((r) => r.key === outlinePick.row)
    ) {
      outline = {
        kind: "band",
        band: savedBandZones.kind,
        dividersFt: savedBandZones.dividersFt,
        index: savedBandZones.rows.findIndex((r) => r.key === outlinePick.row),
      };
    }
  }

  return (
    <DialogPrimitive.Root
      open
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-[rgba(13,13,13,0.4)] data-[state=open]:animate-in data-[state=open]:fade-in-0 motion-reduce:animate-none" />
        <DialogPrimitive.Content
          ref={contentRef}
          aria-describedby="viz-lightbox-subtitle"
          onKeyDown={onKeyDown}
          onEscapeKeyDown={(e) => {
            if (escapeStep()) e.preventDefault();
          }}
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            titleRef.current?.focus();
          }}
          onCloseAutoFocus={(e) => {
            const opener = openerRef.current;
            if (opener?.isConnected) {
              e.preventDefault();
              opener.focus({ preventScroll: true });
            }
          }}
          className="fixed top-[clamp(16px,10dvh,96px)] left-1/2 z-50 flex h-[min(880px,calc(100dvh-clamp(16px,10dvh,96px)-32px))] w-[min(1212px,calc(100vw-32px))] -translate-x-1/2 flex-col rounded-[14px] bg-[var(--surface-card)] shadow-[var(--shadow-dropdown)] outline-none data-[state=open]:animate-in data-[state=open]:fade-in-0 motion-reduce:animate-none"
        >
          <TooltipProvider>
            {/* The bands receipt's live region, mounted for the lightbox's
                whole life and only ever written to. */}
            <div role="status" className="sr-only">
              {receipt?.message ?? ""}
            </div>

            {/* ── Header ─────────────────────────────────────────────── */}
            <div className="flex items-start gap-2.5 px-6 pt-6 pb-5">
              <div className="flex min-w-0 flex-col gap-1">
                <DialogPrimitive.Title
                  ref={titleRef}
                  tabIndex={-1}
                  className="m-0 truncate text-[16px] leading-[1.4] font-medium text-[var(--ink-900)] outline-none"
                >
                  {title}
                </DialogPrimitive.Title>
                <p
                  id="viz-lightbox-subtitle"
                  className="m-0 text-[12px] text-[var(--ink-600)]"
                >
                  {subtitle}
                </p>
              </div>
              <span className="flex-1" />
              <ChromeTooltip
                label="Close"
                shortcut="Esc"
                align="end"
                onEscapeKeyDown={escapeFromTooltip}
              >
                <DialogPrimitive.Close
                  aria-label="Close"
                  className="flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-[var(--radius-element)] text-[var(--ink-500)] transition-colors hover:bg-[var(--surface-subtle)] focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none touch:hit-area"
                >
                  <X className="size-3.5" strokeWidth={1.5} aria-hidden />
                </DialogPrimitive.Close>
              </ChromeTooltip>
            </div>

            {/* ── Body ───────────────────────────────────────────────── */}
            <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-6 md:flex-row md:overflow-visible">
              {/* Court column */}
              <div className="flex min-w-0 shrink-0 flex-col gap-3 md:min-h-0 md:max-w-[800px] md:flex-1 md:shrink">
                <div className="flex min-h-7 flex-wrap items-center gap-2 border-b border-[var(--border-hairline)] pb-3">
                  <div
                    className="flex gap-1.5"
                    role="group"
                    aria-label="Player"
                  >
                    {(["you", "opponent"] as const).map((value) => (
                      <LifecycleChip
                        key={value}
                        pressed={state.filters.player === value}
                        onClick={() => choosePlayer(value)}
                      >
                        {value === "you" ? "You" : "Opponent"}
                      </LifecycleChip>
                    ))}
                  </div>
                  {isDraft && (
                    <CutMenu
                      savedViews={meta.savedViews}
                      triggerRef={cutMenuTriggerRef}
                    />
                  )}
                  <ChartMenu
                    showBands={!isDraft}
                    onEditBands={meta.readOnly ? undefined : enterEdit}
                  />
                  {!isDraft && (
                    <LightboxFilterPanel
                      cut={cut}
                      filters={state.filters}
                      setFilters={setFilters}
                      onClear={clearFilters}
                      hasActive={panelActive}
                      engaged={anyCut}
                      result={result}
                      points={points}
                      subjectIsPlayer1={subjectIsPlayer1}
                      matchCtx={matchCtx}
                    />
                  )}
                  {receipt !== null && (
                    <span
                      aria-hidden="true"
                      className="ml-auto truncate text-[11px] text-[var(--ink-600)]"
                    >
                      {receipt.message}
                    </span>
                  )}
                </div>

                {!isDraft && (
                  <LightboxFilterStrip
                    phrases={phrases}
                    shown={matched.length}
                    total={allPointsBehind.length}
                    statOnly={statOnly}
                    onClear={clearFilters}
                  />
                )}

                <div
                  ref={setStageEl}
                  data-court-stage=""
                  className={cn(
                    "relative h-[420px] shrink-0 overflow-hidden rounded-[10px] select-none md:h-auto md:min-h-[360px] md:flex-1 md:shrink",
                    editing
                      ? "cursor-default"
                      : "cursor-grab active:cursor-grabbing",
                  )}
                  style={{
                    touchAction: "none",
                    background: heat ? HEAT_APRON_FILL : APRON_FILL,
                  }}
                  onPointerDown={pz.onPointerDown}
                  onPointerMove={pz.onPointerMove}
                  onPointerUp={pz.onPointerUp}
                  onPointerCancel={pz.onPointerUp}
                  onClick={(event) => {
                    const target = event.target;
                    if (
                      target instanceof Element &&
                      event.currentTarget.contains(target) &&
                      target.closest(
                        "[data-viz-mark],[data-viz-readout],[data-chrome]",
                      ) === null
                    ) {
                      dropActiveMark();
                    }
                  }}
                >
                  <LightboxCourt
                    cut={cut}
                    chart={state.chart}
                    dots={isDraft ? [] : shownDots}
                    zoneStats={isDraft ? null : result.zoneStats}
                    filters={state.filters}
                    subjectName={subjectName}
                    unit={unit}
                    bands={isDraft ? null : bandOverlay}
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
                    whereFor={whereFor}
                    focusIds={statHover !== null ? hoverIds : null}
                    outline={outline}
                    onReadoutEnter={holdReadout}
                    onReadoutLeave={releaseReadout}
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

                  {isDraft ? (
                    <StageCard>
                      <p className="text-[13px] font-medium text-[var(--ink-900)]">
                        Pick what to plot
                      </p>
                      <p className="text-micro max-w-[240px] text-[var(--ink-600)]">
                        {meta.readOnly
                          ? "Choose a view, a chart and filters."
                          : "Choose a view, a chart and filters — then save it."}
                      </p>
                      <button
                        type="button"
                        onClick={() => cutMenuTriggerRef.current?.click()}
                        className="cursor-pointer text-[11px] font-medium text-[var(--blue)] hover:text-[var(--blue-hover)]"
                      >
                        Choose a view
                      </button>
                    </StageCard>
                  ) : (
                    result.count === 0 && (
                      <StageCard>
                        <p className="text-[12px] text-[var(--ink-600)]">
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
                      </StageCard>
                    )
                  )}

                  {activeEditor !== null && (
                    <VizBandsEditorBanner kind={activeEditor.kind} />
                  )}

                  {activeEditor !== null ? (
                    <div
                      data-chrome=""
                      className="absolute right-3 bottom-3 left-3 h-12 overflow-hidden rounded-[12px] backdrop-blur-[8px]"
                      style={{ background: "rgba(13,13,13,0.72)" }}
                    >
                      <VizBandsEditorSlab
                        state={activeEditor}
                        current={bands}
                        saving={saving}
                        unit={unit}
                        onReset={() => updateEditor(resetBandEditor)}
                        onCancel={exitEdit}
                        onSave={saveEdit}
                      />
                    </div>
                  ) : (
                    !isDraft && (
                      <ZoomControls
                        relative={zoomRelative}
                        atFit={atFit}
                        onZoomIn={pz.zoomIn}
                        onZoomOut={pz.zoomOut}
                        onFit={pz.fit}
                        onEscape={escapeFromTooltip}
                      />
                    )
                  )}
                </div>

                {!isDraft &&
                  (state.chart === "scatter" ? (
                    <LegendFilter
                      items={legend}
                      counts={legendCounts(result.dots)}
                      pick={legendPick}
                      onPick={(next) => {
                        setLegendPick(next);
                        setSelectedMarkId(null);
                      }}
                    />
                  ) : (
                    <div
                      role="group"
                      aria-label="Legend"
                      className="flex flex-wrap items-center gap-x-2 gap-y-0.5"
                    >
                      {legend.map((item) =>
                        item.glyph === "ramp" ? (
                          <HeatRampLegend key={item.key} />
                        ) : (
                          <span key={item.key} className="px-1">
                            <LegendMark item={item} />
                          </span>
                        ),
                      )}
                    </div>
                  ))}
              </div>

              {/* Right column */}
              <div className="flex w-full shrink-0 flex-col md:ml-auto md:min-h-0 md:w-[340px]">
                <div className="flex min-h-7 items-center gap-1.5 border-b border-[var(--border-hairline)] pb-3">
                  <div
                    className="flex gap-1.5"
                    role="group"
                    aria-label="Right panel"
                  >
                    <LifecycleChip
                      pressed={pane === "points"}
                      onClick={() => setPane("points")}
                    >
                      Points
                    </LifecycleChip>
                    <LifecycleChip
                      pressed={pane === "stats"}
                      onClick={() => setPane("stats")}
                    >
                      Statistics
                    </LifecycleChip>
                  </div>
                  <span className="flex-1" />
                  {pane === "points" && !isDraft && (
                    <span
                      className="mono tabular text-[10px] text-[var(--ink-400)]"
                      aria-label={`${matched.length} of ${allPointsBehind.length} points`}
                    >
                      {matched.length}{" "}
                      <span className="text-[var(--ink-300)]">/</span>{" "}
                      {allPointsBehind.length}
                    </span>
                  )}
                </div>
                {!isDraft &&
                  (pane === "points" ? (
                    <LightboxPointList
                      points={matched}
                      allPoints={points}
                      selectedPointId={selectedPointId}
                      onSelectPoint={selectPoint}
                      emptyLine={
                        cut === "serve" && shownDots.length > 0
                          ? `${shownDots.length} ${shownDots.length === 1 ? "serve" : "serves"} went out. A fault isn't a point, so there is no clip; the court shows where they landed.`
                          : `No ${result.noun} match these filters.`
                      }
                    />
                  ) : (
                    <div className="md:min-h-0 md:flex-1 md:overflow-y-auto">
                      <LightboxStats
                        stats={stats}
                        cut={cut}
                        pick={activeStatPick}
                        onPick={(pick) => {
                          setSelectedMarkId(null);
                          setStatPick(
                            pick === null ? null : { stamp: courtStamp, pick },
                          );
                        }}
                        onHover={setStatHover}
                      />
                    </div>
                  ))}
              </div>
            </div>

            {/* ── Footer ─────────────────────────────────────────────── */}
            {/* Only when it has an action: a read-only host (no Watch, no
                Save as view) gets the body's own bottom padding instead of an
                empty bar. */}
            {showFooter ? (
              <div className="mt-5 flex items-center gap-2.5 border-t border-[var(--border-hairline)] px-6 pt-4 pb-5">
                {canSaveViews && !isDraft && (
                  <button
                    ref={saveAnchorRef}
                    type="button"
                    onClick={() => setSaveDialogOpen(true)}
                    className="cursor-pointer text-[12px] font-medium text-[var(--blue)] transition-colors duration-200 hover:text-[var(--blue-hover)]"
                  >
                    Save as view
                  </button>
                )}
                <span className="flex-1" />
                {meta.hasPlayableVideo && onWatchPoints && !isDraft && (
                  <button
                    type="button"
                    disabled={playable.length === 0}
                    onClick={() =>
                      onWatchPoints(
                        playable.map((p) => p.pointNumber),
                        // The Video tab's strip names the set in the lightbox's
                        // own words: the card, whose points they are when not
                        // the viewer's own, then the strip's sentence.
                        [
                          title,
                          ...(state.filters.player === "you"
                            ? []
                            : [opp.shortName]),
                          ...phrases,
                        ]
                          .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
                          .join(" · "),
                      )
                    }
                    className={advButton("primary", "sm")}
                  >
                    {playable.length === 0
                      ? "Watch points"
                      : `Watch these ${playable.length} ${playable.length === 1 ? "point" : "points"}`}
                  </button>
                )}
              </div>
            ) : (
              <div aria-hidden="true" className="h-6 shrink-0" />
            )}

            {canSaveViews && (
              <SaveViewDialog
                open={saveDialogOpen}
                onOpenChange={setSaveDialogOpen}
                anchorRef={saveAnchorRef}
                cut={cut}
                chart={state.chart}
                filters={state.filters}
                savedViews={meta.savedViews}
                workspaceKind={meta.workspaceKind}
                workspaceName={meta.workspaceName}
                side="top"
                onSaved={(view) =>
                  setState((prev) => ({ ...prev, viewId: view.id }))
                }
              />
            )}
          </TooltipProvider>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

/** A centred card over the court — the draft prompt and the honest zero. */
function StageCard({ children }: { children: ReactNode }) {
  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center px-6">
      <div
        data-chrome=""
        className="pointer-events-auto flex flex-col items-center gap-2 rounded-[var(--radius-card)] border border-[var(--border-hairline)] bg-[var(--surface-card)] px-5 py-4 text-center shadow-[var(--shadow-card-emphasis)]"
      >
        {children}
      </div>
    </div>
  );
}

/**
 * + / − / Fit, bottom-right of the court (canvas S11), and — only while the
 * court is zoomed or panned — the level, bottom-left: "180% · Drag to move
 * around". Fit is spent at the fitted court.
 */
function ZoomControls({
  relative,
  atFit,
  onZoomIn,
  onZoomOut,
  onFit,
  onEscape,
}: {
  relative: number;
  atFit: boolean;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFit: () => void;
  /** The lightbox's Esc step, for when a zoom button's tooltip holds Esc. */
  onEscape: () => void;
}) {
  const button =
    "flex size-7 cursor-pointer items-center justify-center rounded-[8px] text-[var(--ink-700)] transition-colors duration-200 hover:bg-[var(--surface-subtle)] focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none disabled:pointer-events-none disabled:opacity-40 touch:hit-area";
  return (
    <>
      <div
        data-chrome=""
        role="group"
        aria-label="Zoom"
        className="absolute right-3 bottom-3 flex items-center gap-0.5 rounded-[10px] bg-[var(--surface-card)] p-[3px] shadow-[var(--shadow-dropdown)]"
      >
        <ChromeTooltip
          label="Zoom in"
          shortcut="+"
          side="top"
          onEscapeKeyDown={onEscape}
        >
          <button
            type="button"
            aria-label="Zoom in"
            onClick={onZoomIn}
            className={button}
          >
            <Plus className="size-3.5" strokeWidth={1.5} aria-hidden />
          </button>
        </ChromeTooltip>
        <ChromeTooltip
          label="Zoom out"
          shortcut="−"
          side="top"
          onEscapeKeyDown={onEscape}
        >
          <button
            type="button"
            aria-label="Zoom out"
            onClick={onZoomOut}
            className={button}
          >
            <Minus className="size-3.5" strokeWidth={1.5} aria-hidden />
          </button>
        </ChromeTooltip>
        <span
          aria-hidden="true"
          className="mx-0.5 h-4 w-px bg-[var(--border-medium)]"
        />
        <ChromeTooltip
          label="Fit the court"
          shortcut="0"
          side="top"
          onEscapeKeyDown={onEscape}
        >
          <button
            type="button"
            aria-label="Fit the court"
            onClick={onFit}
            disabled={atFit}
            className={button}
          >
            <Maximize className="size-3.5" strokeWidth={1.5} aria-hidden />
          </button>
        </ChromeTooltip>
      </div>
      {!atFit && (
        <span
          data-chrome=""
          className="pointer-events-none absolute bottom-3 left-3 inline-flex h-[26px] items-center rounded-[8px] bg-[var(--surface-card)] px-2.5 text-[11px] text-[var(--ink-700)] tabular-nums shadow-[var(--shadow-dropdown)]"
        >
          {Math.round(relative * 100)}% · Drag to move around
        </span>
      )}
    </>
  );
}
