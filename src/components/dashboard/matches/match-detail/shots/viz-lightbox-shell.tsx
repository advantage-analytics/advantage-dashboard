"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type ReactNode,
} from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Maximize, Minus, Plus, RotateCcw, X } from "lucide-react";

import { TooltipProvider } from "@/components/ui/tooltip";
import { ChromeTooltip } from "@/components/dashboard/shared/chrome-tooltip";
import {
  contactBandRows,
  depthBandRows,
  type BandSettings,
} from "@/lib/data/viz-bands";
import type { DistanceUnit } from "@/lib/format/distance";
import type { MatchPoint } from "@/lib/data/match-points-server";
import type { ZoneKey } from "@/lib/data/serve-zones";
import { isTextEntry } from "@/lib/ui/is-text-entry";
import { cn } from "@/lib/utils";
import {
  LightboxBodyPending,
  LightboxSubtitlePending,
  LightboxTitlePending,
} from "@/components/dashboard/loading/lightbox-pending";

import {
  bandEditorDirty,
  bandEditorPayload,
  bandEditorPreview,
  initBandEditor,
  refitBandEditor,
  resetBandEditor,
  type BandEditorState,
} from "./band-editor-state";
import { APRON_FILL, HEAT_APRON_FILL } from "./court-art";
import {
  projectViewerDot,
  viewerArtPoint,
  viewerFullCourtTransform,
  viewerInitialTransform,
} from "./court-geometry";
import { bandKindFor } from "./cut-kinds";
import { HeatRampLegend, LegendMark } from "./legend-mark";
import { LifecycleChip } from "./lifecycle-chip";
import type { PlayerChipLabels } from "./player-chip-labels";
import { PlayerChips } from "./player-chips";
import { filterRailReducer } from "../match-filters/rail-state";
import { LightboxAdvancedDrawer } from "./lightbox-advanced-drawer";
import { LightboxMatchesSheet } from "./lightbox-matches-sheet";
import { LightboxCourt, type CourtOutline } from "./lightbox-court";
import {
  COUNT_NOUN,
  LegendFilter,
  LightboxFilterPanel,
  type LightboxAdvancedFilters,
  type LightboxSeasonFilters,
} from "./lightbox-filters";
import { LightboxFilterStrip } from "./lightbox-filter-strip";
import {
  dotMatchesPick,
  legendCounts,
  markIsPoint,
  pointsBehind,
  type LegendPick,
} from "./lightbox-points";
import {
  LIGHTBOX_BOX_CLASS,
  LIGHTBOX_CLOSE_CLASS,
  LIGHTBOX_OVERLAY_CLASS,
} from "./lightbox-frame";
import { LightboxStats } from "./lightbox-stats";
import { GLIDE_MIN_RELATIVE_ZOOM, KEY_PAN_PX } from "./pan-zoom";
import type { StatPick } from "./stat-cut";
import { usePanZoom } from "./use-pan-zoom";
import type { BandReceipt, BandSaveOutcome } from "./viz-bands-context";
import {
  VizBandsEditorBanner,
  VizBandsEditorHandles,
  VizBandsEditorSlab,
  editorContext,
} from "./viz-bands-editor";
import type { VizBandsOverlayProps } from "./viz-bands-overlay";
import { legendItemsFor } from "./viz-labels";
import { isMarkRovingKey } from "./viz-mark-roving";
import type {
  Chart,
  Cut,
  PlayerFilter,
  VizDot,
  VizFilters,
  VizResult,
  VizStats,
} from "./viz-model";

/** What the Points column draws, handed to the host's `render`. */
export interface LightboxPointListArgs {
  /** The points behind the marks on court, in match order. */
  points: MatchPoint[];
  selectedPointId: string | null;
  /** Stable identity. */
  onSelectPoint: (point: MatchPoint) => void;
  /** The empty line under "No points to play". */
  emptyLine: string;
  /** Whether a second click on this row can watch its point — the selected
   *  row's line ends "Click again to watch" only then. Stable identity. */
  canWatch: (point: MatchPoint) => boolean;
}

/** What the footer's actions are built from. */
export interface LightboxFooterArgs {
  /** The points behind the marks on court (empty without a Points column). */
  matched: MatchPoint[];
  /** The strip's sentence, legend and Statistics picks included. */
  phrases: string[];
}

export interface VizLightboxShellProps {
  /* ── What is drawn ───────────────────────────────────────────────────── */
  cut: Cut;
  chart: Chart;
  /** The court's live filters (the court reads its zones off them). */
  filters: VizFilters;
  /** The court's marks, counts and zone figures — already computed. */
  result: VizResult;
  /** The Statistics column's rows — already computed. */
  stats: VizStats;
  /** Whose court it is, for the readout and the empty line. */
  subjectName: string;
  unit: DistanceUnit;
  /** The saved bands drawn on court, or none. */
  bandZones: VizBandsOverlayProps | null;
  /** Any filter is on: the empty court offers Clear. */
  hasFilters: boolean;
  /** The marks a Statistics row stands for. Stable identity; may cache. */
  statRowDots: (pick: StatPick) => Set<string> | null;
  /** A mark's readout's last line ("Set 1 · Game 4 · You serving"). */
  whereFor?: (pointId: string) => string | null;
  /** "vs Lee · Nov 3": which match a mark is from, on a court drawn over
   *  several (the season's). Omitted on one match's court. */
  matchFor?: (dot: VizDot) => string | null;
  /**
   * The second click. A click (or Enter) on the SELECTED mark, or on its
   * Points row, watches that one point when `canWatch` says it can; the
   * first click only selects. `onWatch` is handed the strip's sentence (the
   * host's filters, then the legend's and a Statistics row's pick) to name
   * the point by. Omitted, a second click does nothing and every hint reads
   * "Click to focus".
   */
  watch?: {
    canWatch: (dot: VizDot) => boolean;
    onWatch: (dot: VizDot, phrases: string[]) => void;
  };

  /* ── Words ───────────────────────────────────────────────────────────── */
  title: string;
  /** The header's own action, immediately left of the close — an open saved
   *  view's ⋯. Handed the lightbox's Esc step for its tooltip, as the close
   *  and zoom tooltips get it: an open tooltip is the topmost layer and
   *  would otherwise take the Esc meant for the lightbox. */
  headerAction?: (ctx: { onTooltipEscape: () => void }) => ReactNode;
  /** One line under the subtitle: a change to the view the server refused. */
  notice?: string;
  subtitle: string;
  /** The strip's sentence for the filters (the shell adds the legend's and a
   *  Statistics row's pick). Empty: no strip unless a pick is on. */
  filterPhrases: string[];
  /** A filter beyond the baseline is on: the Filters trigger reads applied. */
  panelActive: boolean;

  /* ── Actions ─────────────────────────────────────────────────────────── */
  onClose: () => void;
  /** "Clear filter": the shell lets go of its own picks, then calls this. */
  onClearFilters: () => void;
  /** The player switch and its two words (`player-chips.tsx`: "You" only
   *  for the player the charts are about). Omitted, it is not drawn. */
  player?: {
    value: PlayerFilter;
    onChange: (player: PlayerFilter) => void;
    labels: PlayerChipLabels;
  };
  /** The Filters panel. Omitted, it is not drawn. */
  filterPanel?: {
    onChange: (next: VizFilters) => void;
    sets: readonly number[];
    errorSplitJudged: boolean;
    countWith: (patch: Partial<VizFilters>) => number;
    /** The "Advanced filters" row (`filters.match`). Omitted, not drawn. */
    advanced?: LightboxAdvancedFilters;
    /** A season's match filters: the panel's "Matches" row and the sheet
     *  it opens. Omitted (the match report), not drawn. */
    season?: LightboxSeasonFilters;
  };
  /** The control row's menus (view, chart). `enterBandEdit` opens the band
   *  editor, when `bandEditor` allows it. */
  controls?: (ctx: { enterBandEdit: () => void }) => ReactNode;
  /** The band editor: who may edit, the live bands, how to save, and the
   *  receipt. Omitted, there is no editing. */
  bandEditor?: {
    canEdit: boolean;
    bands: BandSettings;
    applyBands: (next: BandSettings) => Promise<BandSaveOutcome>;
    receipt: BandReceipt | null;
  };
  /** The Points column. Omitted (a host with no points in the browser),
   *  the right column is Statistics alone and the strip has no count. */
  pointList?: {
    /** Every point the court is drawn from. */
    all: MatchPoint[];
    /** The list's denominator: "12 / 52". */
    total: number;
    render: (args: LightboxPointListArgs) => ReactNode;
  };
  /** The footer's actions, left and right. `null`: no footer bar. */
  footer?: (args: LightboxFooterArgs) => {
    start?: ReactNode;
    end?: ReactNode;
  } | null;
  /** "Create view": the blank court with its prompt. */
  draft?: { readOnly: boolean; onChooseView: () => void };
  /**
   * The frame alone, while the host's data is on its way: the header's
   * words and the two columns are drawn as a loading status named for
   * `title` (`loading/lightbox-pending.tsx`) — the season page's opened card
   * before the server answers (`season-viz-lightbox.tsx`). The same dialog
   * stays mounted when the court lands, so the scrim, focus and the
   * opener's return belong to the one opening. The data props are still
   * read (the hooks run over them) but nothing of them is drawn; a host
   * passes empties.
   */
  pending?: boolean;
}

/** The close's fade, on the scrim and the box alike. */
const LIGHTBOX_CLOSE_MS = 150;

/** The legend's picks, worded for the strip. */
const LEGEND_WORD: Record<LegendPick, string> = {
  won: "Won",
  lost: "Lost",
  out: "Out",
  ace: "Aces",
};

/**
 * The lightbox, drawn (canvas "Final flow" / "Flow states" S03–S17): a
 * Dialog v3 over the page, the court with its legend, Filters and applied
 * strip on the left, Points and Statistics on the right, and the footer's
 * actions. Everything it shows comes in as props — it reads no match, report,
 * view or URL context — so a page can hand it data computed anywhere (the
 * match report's `VizLightbox` computes it in the browser; a season page can
 * on the server). What it keeps itself is the reading: the pan and zoom, a
 * hovered or selected mark, the legend's and a Statistics row's picks, the
 * right column's pane, the band editor's draft, and Esc stepping back
 * through them.
 *
 * Geometry (Dialog v3, `reference/chrome.md`): scrim `rgba(13,13,13,.4)`,
 * 14px radius, the dropdown shadow, 24/24/20 padding, a 28px close. On a
 * 1512×982 screen it is 1212px wide, 96px from the top, with an 800px court
 * column beside a 340px right column.
 */
export function VizLightboxShell({
  cut,
  chart,
  filters,
  result,
  stats,
  subjectName,
  unit,
  bandZones: savedBandZones,
  hasFilters,
  statRowDots,
  whereFor,
  matchFor,
  watch,
  title,
  headerAction,
  notice,
  subtitle,
  filterPhrases,
  panelActive,
  onClose,
  onClearFilters,
  player,
  filterPanel,
  controls,
  bandEditor,
  pointList,
  footer,
  draft,
  pending = false,
}: VizLightboxShellProps) {
  const isDraft = draft !== undefined;
  const canEdit = bandEditor?.canEdit === true;
  const bands = bandEditor?.bands ?? null;
  const receipt = bandEditor?.receipt ?? null;
  const applyBands = bandEditor?.applyBands;
  const points = pointList?.all;

  // The stage lives inside Radix's portal, which mounts a commit after this
  // component, so a plain ref is still empty when `usePanZoom` first
  // measures. The element goes through state instead, and the ref object it
  // hands the hook changes identity once the stage exists — the hook keys its
  // measuring effects on that identity.
  const [stageEl, setStageEl] = useState<HTMLDivElement | null>(null);
  const stageRef = useMemo(() => ({ current: stageEl }), [stageEl]);
  const titleRef = useRef<HTMLHeadingElement>(null);

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

  /** The right column: the points behind the marks, or their statistics.
   *  Statistics alone when the host passes no points. */
  // Statistics is the pane a card opens on; Points is one click away.
  const [paneState, setPane] = useState<"points" | "stats">("stats");
  const pane = pointList ? paneState : "stats";
  /**
   * The legend's one choice (Won · Lost · Out · Ace), local to this card.
   * Stamped with the cut it was picked on: a chart-menu cut switch
   * (Placement → Contact) lets go of it, so it can never empty a court whose
   * marks it does not describe. A You | Opponent switch keeps it (canvas S08).
   */
  const legendStamp = `${cut}:${chart}`;
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
  const courtStamp = `${cut}:${player?.value ?? ""}`;
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

  // A Statistics row's marks, by the host's `statRowDots` (the match report
  // reads them by the stats' own rules, `stat-cut.ts`).
  const pickIds = useMemo(
    () => (activeStatPick === null ? null : statRowDots(activeStatPick)),
    [statRowDots, activeStatPick],
  );
  const hoverIds = useMemo(
    () => (statHover === null ? null : statRowDots(statHover)),
    [statRowDots, statHover],
  );

  // The marks on court: the result's, narrowed by the legend's pick and a
  // chosen Statistics row.
  const dots = useMemo(
    () =>
      result.dots.filter(
        (d) =>
          (legendPick === null || dotMatchesPick(d, legendPick)) &&
          (pickIds === null || pickIds.has(d.id)),
      ),
    [result, legendPick, pickIds],
  );

  const visibleSelectedMarkId =
    selectedMarkId !== null && dots.some((dot) => dot.id === selectedMarkId)
      ? selectedMarkId
      : null;
  // A selection whose mark has left the court (a filter, a legend or
  // Statistics pick, a player switch) is DROPPED, not just hidden: clearing
  // the filter must not bring the ring back, nor make the next Esc spend
  // itself deselecting a point nobody can see. Render-phase, as the stale
  // picks above.
  if (selectedMarkId !== null && visibleSelectedMarkId === null)
    setSelectedMarkId(null);

  const selectedPointId =
    visibleSelectedMarkId !== null
      ? (dots.find((d) => d.id === visibleSelectedMarkId)?.meta?.pointId ??
        null)
      : null;

  /* ── Band editor (moved from the fullscreen viewer) ───────────────────── */

  const [editor, setEditor] = useState<BandEditorState | null>(null);
  const activeEditor =
    editor !== null && canEdit && bandKindFor(cut) === editor.kind
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

  const pz = usePanZoom(cut, stageRef, dropActiveMark, editing);

  /* ── Selecting a mark glides the court to it ──────────────────────────── */

  // Selecting (a mark's click or Enter, or a Points row) centres the mark on
  // the stage, easing in to 150% of the cut's 100% on the way when the court
  // is further out than that; deselecting leaves the court where it is.
  const { glideTo, stage: pzStage } = pz;
  const glideToMark = useCallback(
    (dot: VizDot) => {
      if (pzStage.w === 0 || pzStage.h === 0) return;
      const p = projectViewerDot(cut, dot);
      const home = viewerInitialTransform(cut, pzStage);
      glideTo(viewerArtPoint(p.x, p.y), home.z * GLIDE_MIN_RELATIVE_ZOOM);
    },
    [cut, pzStage, glideTo],
  );
  // The host's watch and the strip's sentence, read at click time through
  // refs so `select` keeps its identity across the host's renders (the mark
  // layer is memoised on it).
  const watchRef = useRef(watch);
  const phrasesRef = useRef<string[]>([]);
  useEffect(() => {
    watchRef.current = watch;
  });
  // First click selects and glides; a click on the mark already selected
  // (or its row, or Enter on it) is the second click and watches its point,
  // when the host can play it — otherwise nothing. Deselecting is Esc or a
  // click on the empty court, never a second click.
  const select = useCallback(
    (dot: VizDot) => {
      setActiveMarkId(null);
      if (visibleSelectedMarkId === dot.id) {
        const host = watchRef.current;
        if (host?.canWatch(dot)) host.onWatch(dot, phrasesRef.current);
        return;
      }
      setSelectedMarkId(dot.id);
      glideToMark(dot);
    },
    [visibleSelectedMarkId, glideToMark],
  );
  const selectMark = useCallback(
    (id: string) => {
      const dot = dots.find((d) => d.id === id);
      if (dot) select(dot);
    },
    [dots, select],
  );
  // A row selects its point's mark on the court (the first mark that stands
  // for that point), so the row and the mark light together.
  const markOfPoint = useCallback(
    (point: MatchPoint) =>
      dots.find((d) => d.meta?.pointId === point.id && markIsPoint(cut, d)),
    [dots, cut],
  );
  const selectPoint = useCallback(
    (point: MatchPoint) => {
      const dot = markOfPoint(point);
      if (dot) select(dot);
    },
    [markOfPoint, select],
  );
  const canWatchMark = watch?.canWatch;
  const canWatchPoint = useCallback(
    (point: MatchPoint) => {
      const dot = markOfPoint(point);
      return dot !== undefined && (canWatchMark?.(dot) ?? false);
    },
    [markOfPoint, canWatchMark],
  );
  // The press that may end in a click on the empty court: a press that
  // moved past the pan's dead zone was a drag, and does not deselect.
  const pressRef = useRef<{ x: number; y: number } | null>(null);

  // A resize re-fits the court while the editor is open: re-fit the draft to
  // the new zoom during render, the way a stale editor is dropped above.
  const [editorZ, setEditorZ] = useState<number | null>(null);
  if (activeEditor !== null && editorZ !== pz.t.z) {
    setEditorZ(pz.t.z);
    setEditor(refitBandEditor(activeEditor, editorContext(unit, pz.t.z)));
  }

  const enterBandEdit = useCallback(() => {
    if (!canEdit || bands === null) return;
    const kind = bandKindFor(cut);
    if (kind === null) return;
    dropActiveMark();
    editSessionRef.current += 1;
    setSaving(false);
    setEditorZ(pz.t.z);
    setEditor(initBandEditor(kind, bands, editorContext(unit, pz.t.z)));
  }, [canEdit, cut, bands, unit, pz.t.z, dropActiveMark]);

  function saveEdit() {
    if (activeEditor === null || saving || bands === null || !applyBands)
      return;
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

  /* ── Advanced filters drawer ─────────────────────────────────────────── */

  // The Filters popover's "Advanced filters" row closes the popover and
  // opens the advanced-filters sheet on the window's right edge, over the
  // box (`lightbox-advanced-drawer.tsx`), with the window dimmed and the
  // rest of the box inert. The phases are the report
  // rail's (`rail-state.ts`): the out animation keeps it drawn while
  // `"closing"`. Focus goes back to the Filters trigger on every close —
  // the trigger is the one way back in, and everything else was inert.
  const [drawerPhase, dispatchDrawer] = useReducer(filterRailReducer, "closed");
  // Which sheet the slot holds: Advanced filters, or a season's Matches
  // (`lightbox-matches-sheet.tsx`). Both open from a Filters popover row and
  // share the phases, the dimming and the way back.
  const [drawerKind, setDrawerKind] = useState<"advanced" | "matches">(
    "advanced",
  );
  const filtersTriggerRef = useRef<HTMLButtonElement>(null);
  const drawerFocusBackRef = useRef(false);
  const openAdvanced = useCallback(() => {
    setDrawerKind("advanced");
    dispatchDrawer("toggle");
  }, []);
  const openMatches = useCallback(() => {
    setDrawerKind("matches");
    dispatchDrawer("toggle");
  }, []);
  const closeDrawer = useCallback(() => {
    drawerFocusBackRef.current = true;
    dispatchDrawer("close");
  }, []);
  const finishDrawer = useCallback(() => dispatchDrawer("closed"), []);
  // After the commit that lifts `inert` from the box — an inert trigger
  // cannot take focus.
  useEffect(() => {
    if (drawerPhase === "open" || !drawerFocusBackRef.current) return;
    drawerFocusBackRef.current = false;
    filtersTriggerRef.current?.focus({ preventScroll: true });
  }, [drawerPhase]);
  const advancedFilters = filterPanel?.advanced;
  const seasonFilters = filterPanel?.season;
  const drawerShown =
    drawerPhase !== "closed" &&
    (drawerKind === "advanced"
      ? advancedFilters !== undefined
      : seasonFilters !== undefined) &&
    !pending &&
    !isDraft;
  /** The drawer is up: the rest of the box is dimmed and inert. */
  const drawerOpen = drawerShown && drawerPhase === "open";

  /* ── Closing ──────────────────────────────────────────────────────────── */

  // A close the reader asks for (Esc, Close, the scrim) fades the scrim and
  // the box out before the host drops the lightbox, then `onClose`. The ref
  // guards a second Esc or click in that window; the state draws the fade.
  // A close the host makes itself (the URL losing its cut) unmounts at once.
  const closingRef = useRef(false);
  const closeTimerRef = useRef<number | null>(null);
  const [closingMs, setClosingMs] = useState<number | null>(null);
  const closing = closingMs !== null;
  useEffect(
    () => () => {
      if (closeTimerRef.current !== null)
        window.clearTimeout(closeTimerRef.current);
    },
    [],
  );
  function requestClose() {
    if (closingRef.current) return;
    closingRef.current = true;
    const ms =
      typeof document === "undefined" || document.visibilityState !== "visible"
        ? 0
        : LIGHTBOX_CLOSE_MS;
    if (ms <= 0) {
      onClose();
      return;
    }
    setClosingMs(ms);
    closeTimerRef.current = window.setTimeout(() => {
      closeTimerRef.current = null;
      onClose();
    }, ms);
  }
  const exitStyle = closing
    ? {
        animationDuration: `${closingMs}ms`,
        animationTimingFunction: "cubic-bezier(0.4, 0, 0.2, 1)",
      }
    : undefined;
  const exitClass = "animate-out fade-out-0 fill-mode-forwards";
  // Opening draws no animation (user decision, 2026-11-10): a card's
  // lightbox is simply there on the click, and a season court that lands
  // after its loading frame cuts straight to the body.

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

  /* ── Esc ──────────────────────────────────────────────────────────────── */

  // Esc steps back one layer at a time: the advanced filters drawer, the
  // band editor, then a selected point, then the lightbox itself. Returns
  // whether it stepped back short of closing.
  function escapeStep(): boolean {
    if (drawerOpen) {
      closeDrawer();
      return true;
    }
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
    if (!escapeStep()) requestClose();
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
    escapeRef.current = escapeFromTooltip;
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

  /* ── Derived ──────────────────────────────────────────────────────────── */

  // Zoom is shown against the cut's own framing (`viewerInitialTransform`):
  // a landing cut's half court is 100%, so "150%" is 1.5× that and the whole
  // court ("Full court") reads below 100%.
  const measured = pz.stage.w > 0 && pz.stage.h > 0;
  const homeT = measured ? viewerInitialTransform(cut, pz.stage) : null;
  const fullT = measured ? viewerFullCourtTransform(pz.stage) : null;
  const zoomRelative = homeT ? pz.t.z / homeT.z : 1;
  const sameT = (a: { z: number; px: number; py: number } | null) =>
    a === null ||
    (Math.abs(pz.t.z / a.z - 1) < 0.005 &&
      Math.abs(pz.t.px - a.px) < 0.5 &&
      Math.abs(pz.t.py - a.py) < 0.5);
  const atHome = sameT(homeT);
  const atFullCourt = sameT(fullT);

  const matched = isDraft || !points ? [] : pointsBehind(cut, dots, points);
  const legend = legendItemsFor(cut, chart);
  const heat = chart === "heat";

  function clearFilters() {
    setLegendPick(null);
    setStatPick(null);
    onClearFilters();
  }

  // The strip's sentence: the host's filters, then the legend's pick and a
  // Statistics row — so nothing narrows or widens the court unseen.
  const phrases = [...filterPhrases];
  if (legendPick !== null) phrases.push(LEGEND_WORD[legendPick]);
  if (activeStatPick !== null) phrases.push(activeStatPick.label);
  useEffect(() => {
    phrasesRef.current = phrases;
  });
  const anyCut = panelActive || legendPick !== null || activeStatPick !== null;
  const statOnly =
    activeStatPick !== null && !panelActive && legendPick === null;

  const footerActions =
    !isDraft && !pending && footer ? footer({ matched, phrases }) : null;

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
        if (!open) requestClose();
      }}
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          data-lightbox-scrim=""
          className={cn(LIGHTBOX_OVERLAY_CLASS, closing && exitClass)}
          style={exitStyle}
        />
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
          data-lightbox-box=""
          className={cn(LIGHTBOX_BOX_CLASS, closing && exitClass)}
          style={exitStyle}
        >
          <TooltipProvider>
            {/* The bands receipt's live region, mounted for the lightbox's
                whole life and only ever written to. */}
            <div role="status" className="sr-only">
              {receipt?.message ?? ""}
            </div>

            {/* ── Header ─────────────────────────────────────────────── */}
            <div
              inert={drawerOpen}
              className="flex items-start gap-2.5 px-6 pt-6 pb-5"
            >
              <div className="flex min-w-0 flex-col gap-1">
                <div className="flex min-w-0 items-center gap-2">
                  <DialogPrimitive.Title
                    ref={titleRef}
                    data-lightbox-title=""
                    tabIndex={-1}
                    className="m-0 truncate text-[16px] leading-[1.4] font-medium text-[var(--ink-900)] outline-none"
                  >
                    {pending ? <LightboxTitlePending label={title} /> : title}
                  </DialogPrimitive.Title>
                </div>
                <p
                  id="viz-lightbox-subtitle"
                  className="m-0 text-[12px] text-[var(--ink-600)]"
                >
                  {pending ? <LightboxSubtitlePending /> : subtitle}
                </p>
                {notice && !pending && (
                  <p
                    role="alert"
                    className="m-0 text-[11px] text-[var(--error)]"
                  >
                    {notice}
                  </p>
                )}
              </div>
              <span className="flex-1" />
              {/* The header's chrome, one cluster: the view's ⋯, then close. */}
              <div className="flex shrink-0 items-center gap-1">
                {!pending && headerAction && (
                  <HeaderActionSlot
                    render={headerAction}
                    onTooltipEscape={escapeFromTooltip}
                  />
                )}
                <ChromeTooltip
                  label="Close"
                  shortcut="Esc"
                  align="end"
                  onEscapeKeyDown={escapeFromTooltip}
                >
                  <DialogPrimitive.Close
                    aria-label="Close"
                    className={LIGHTBOX_CLOSE_CLASS}
                  >
                    <X className="size-3.5" strokeWidth={1.5} aria-hidden />
                  </DialogPrimitive.Close>
                </ChromeTooltip>
              </div>
            </div>

            {/* ── Body ───────────────────────────────────────────────── */}
            {pending ? (
              <LightboxBodyPending label={title} />
            ) : (
              <div
                inert={drawerOpen}
                className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-6 md:flex-row md:overflow-visible"
              >
                {/* Court column */}
                <div className="flex min-w-0 shrink-0 flex-col gap-3 md:min-h-0 md:max-w-[800px] md:flex-1 md:shrink">
                  <div className="flex min-h-7 flex-wrap items-center gap-2 border-b border-[var(--border-hairline)] pb-3">
                    {player && (
                      <PlayerChips
                        value={player.value}
                        onChange={player.onChange}
                        labels={player.labels}
                        className="flex gap-1.5"
                      />
                    )}
                    {controls && (
                      <ControlsSlot
                        render={controls}
                        enterBandEdit={enterBandEdit}
                      />
                    )}
                    {!isDraft && filterPanel && (
                      <LightboxFilterPanel
                        cut={cut}
                        filters={filters}
                        setFilters={filterPanel.onChange}
                        onClear={clearFilters}
                        hasActive={panelActive}
                        engaged={anyCut}
                        result={result}
                        sets={filterPanel.sets}
                        errorSplitJudged={filterPanel.errorSplitJudged}
                        countWith={filterPanel.countWith}
                        advanced={filterPanel.advanced}
                        onOpenAdvanced={openAdvanced}
                        onOpenMatches={openMatches}
                        triggerRef={filtersTriggerRef}
                        season={filterPanel.season}
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
                      shown={pointList ? matched.length : undefined}
                      total={pointList?.total}
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
                    onPointerDown={(event) => {
                      pressRef.current = {
                        x: event.clientX,
                        y: event.clientY,
                      };
                      pz.onPointerDown(event);
                    }}
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
                        // A click on the empty court lets go of the
                        // selection — but not the end of a drag.
                        const press = pressRef.current;
                        const dragged =
                          press !== null &&
                          Math.abs(event.clientX - press.x) +
                            Math.abs(event.clientY - press.y) >
                            4;
                        if (!dragged && !editing) setSelectedMarkId(null);
                      }
                    }}
                  >
                    <LightboxCourt
                      cut={cut}
                      chart={chart}
                      dots={isDraft ? [] : dots}
                      zoneStats={isDraft ? null : result.zoneStats}
                      filters={filters}
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
                      matchFor={matchFor}
                      canWatchMark={canWatchMark}
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

                    {draft ? (
                      <StageCard>
                        <p className="text-[13px] font-medium text-[var(--ink-900)]">
                          Pick what to plot
                        </p>
                        <p className="text-micro max-w-[240px] text-[var(--ink-600)]">
                          {draft.readOnly
                            ? "Choose a view, a chart and filters."
                            : "Choose a view, a chart and filters — then save it."}
                        </p>
                        <button
                          type="button"
                          onClick={draft.onChooseView}
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

                    {activeEditor !== null && bands !== null ? (
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
                          atHome={atHome}
                          atFullCourt={atFullCourt}
                          onZoomIn={pz.zoomIn}
                          onZoomOut={pz.zoomOut}
                          onFullCourt={pz.fullCourt}
                          onReset={pz.fit}
                          onEscape={escapeFromTooltip}
                        />
                      )
                    )}
                  </div>

                  {!isDraft && (
                    <div>
                      {chart === "scatter" ? (
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
                        // `min-h-6`: the Scatter legend's row height (its
                        // keys are 24px buttons), so a chart switch never
                        // changes the stage's height — a resized stage re-fits
                        // the court (`usePanZoom`) and would throw away the
                        // reader's pan and zoom.
                        <div
                          role="group"
                          aria-label="Legend"
                          className="flex min-h-6 flex-wrap items-center gap-x-2 gap-y-0.5"
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
                      )}
                    </div>
                  )}
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
                        pressed={pane === "stats"}
                        onClick={() => setPane("stats")}
                      >
                        Statistics
                      </LifecycleChip>
                      {pointList && (
                        <LifecycleChip
                          pressed={pane === "points"}
                          onClick={() => setPane("points")}
                        >
                          Points
                        </LifecycleChip>
                      )}
                    </div>
                    <span className="flex-1" />
                    {pane === "points" && pointList && !isDraft && (
                      <span
                        className="mono tabular text-[10px] text-[var(--ink-400)]"
                        aria-label={`${matched.length} of ${pointList.total} points`}
                      >
                        {matched.length}{" "}
                        <span className="text-[var(--ink-300)]">/</span>{" "}
                        {pointList.total}
                      </span>
                    )}
                  </div>
                  {!isDraft &&
                    (pane === "points" && pointList ? (
                      // `selectPoint` reads the watch and sentence refs only
                      // when a row is clicked, never while this renders.
                      // eslint-disable-next-line react-hooks/refs -- see above
                      pointList.render({
                        points: matched,
                        selectedPointId,
                        onSelectPoint: selectPoint,
                        canWatch: canWatchPoint,
                        emptyLine:
                          cut === "serve" && dots.length > 0
                            ? `${dots.length} ${dots.length === 1 ? "serve" : "serves"} went out. A fault isn't a point, so there is no clip; the court shows where they landed.`
                            : `No ${result.noun} match these filters.`,
                      })
                    ) : (
                      // `-mx-2 px-2`: a row's hover wash hangs 8px past the
                      // column on both sides (`StatRowButton`'s `-mx-2`), and
                      // a scroller clips both axes — without the room its
                      // wash was cut square at the column's edge, flush to
                      // the text.
                      <div className="-mx-2 px-2 md:min-h-0 md:flex-1 md:overflow-y-auto">
                        <LightboxStats
                          stats={stats}
                          cut={cut}
                          pick={activeStatPick}
                          onPick={(pick) => {
                            setSelectedMarkId(null);
                            setStatPick(
                              pick === null
                                ? null
                                : { stamp: courtStamp, pick },
                            );
                          }}
                          onHover={setStatHover}
                        />
                      </div>
                    ))}
                </div>
              </div>
            )}

            {/* ── Footer ─────────────────────────────────────────────── */}
            {/* Only when it has an action: a read-only host (no Watch, no
                Save as view) gets the body's own bottom padding instead of an
                empty bar. */}
            {footerActions ? (
              <div
                inert={drawerOpen}
                className="mt-5 flex items-center gap-2.5 border-t border-[var(--border-hairline)] px-6 pt-4 pb-5"
              >
                {footerActions.start}
                <span className="flex-1" />
                {footerActions.end}
              </div>
            ) : (
              <div aria-hidden="true" className="h-6 shrink-0" />
            )}

            {/* ── Advanced filters drawer ────────────────────────────── */}
            {drawerShown && drawerKind === "matches" && seasonFilters && (
              <LightboxMatchesSheet
                phase={drawerPhase}
                onClose={closeDrawer}
                onFinish={finishDrawer}
                season={seasonFilters}
                noun={COUNT_NOUN[result.noun]}
              />
            )}
            {drawerShown &&
              drawerKind === "advanced" &&
              filterPanel &&
              advancedFilters && (
                <LightboxAdvancedDrawer
                  phase={drawerPhase}
                  onClose={closeDrawer}
                  onFinish={finishDrawer}
                  cut={cut}
                  filters={filters}
                  setFilters={filterPanel.onChange}
                  result={result}
                  advanced={advancedFilters}
                />
              )}
          </TooltipProvider>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

/** The host's header action, handed the lightbox's Esc step. */
function HeaderActionSlot({
  render,
  onTooltipEscape,
}: {
  render: (ctx: { onTooltipEscape: () => void }) => ReactNode;
  onTooltipEscape: () => void;
}) {
  return render({ onTooltipEscape });
}

/** The host's control-row menus, handed the band editor's opener. */
function ControlsSlot({
  render,
  enterBandEdit,
}: {
  render: (ctx: { enterBandEdit: () => void }) => ReactNode;
  enterBandEdit: () => void;
}) {
  return render({ enterBandEdit });
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
 * + / − / Reset view / Full court, bottom-right of the court (canvas S11),
 * and — only while the court is off its 100% framing — the level,
 * bottom-left: "150% · Drag to move around". Full court zooms out to the
 * whole court (below 100% on a landing cut, whose 100% is the half the shots
 * land in) and is spent there. Reset view (`0`) puts the court back as it
 * opened — its zoom AND where it was dragged — and is spent while it is
 * already there.
 */
function ZoomControls({
  relative,
  atHome,
  atFullCourt,
  onZoomIn,
  onZoomOut,
  onFullCourt,
  onReset,
  onEscape,
}: {
  relative: number;
  atHome: boolean;
  atFullCourt: boolean;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFullCourt: () => void;
  onReset: () => void;
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
          label="Reset view"
          shortcut="0"
          side="top"
          onEscapeKeyDown={onEscape}
        >
          <button
            type="button"
            aria-label="Reset view"
            onClick={onReset}
            disabled={atHome}
            className={button}
          >
            <RotateCcw className="size-3.5" strokeWidth={1.5} aria-hidden />
          </button>
        </ChromeTooltip>
        <ChromeTooltip label="Full court" side="top" onEscapeKeyDown={onEscape}>
          <button
            type="button"
            aria-label="Full court"
            onClick={onFullCourt}
            disabled={atFullCourt}
            className={button}
          >
            <Maximize className="size-3.5" strokeWidth={1.5} aria-hidden />
          </button>
        </ChromeTooltip>
      </div>
      {!atHome && (
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
