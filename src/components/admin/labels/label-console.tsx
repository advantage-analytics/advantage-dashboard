"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  useSyncExternalStore,
  type FocusEvent,
  type ReactNode,
} from "react";
import {
  labelProgress,
  orderLabelShots,
  type LabelGameType,
  type LabelPoint,
  type LabelSession,
  type LabelShot,
  type LabelSide,
  type LabelVideo,
} from "@/lib/services/labels/session";
import {
  applyLabelPointPatch,
  applyLabelShotPatch,
  labelShotValues,
  type LabelPointPatch,
  type LabelShotPatch,
} from "@/lib/services/labels/edit";
import type {
  LabelPointEditResult,
  LabelShotEditResult,
} from "@/lib/services/labels/edit-session";
import {
  applyGameWrites,
  planGameServer,
  planGameType,
  type PlannedGameWrites,
} from "@/lib/services/labels/game-operations";
import type { LabelGameWriteResult } from "@/lib/services/labels/game-operations-session";
import type { LabelMarks } from "@/lib/services/labels/marks";
import { endingPatchForShotChange } from "@/lib/services/labels/ending-derived";
import { labelScores } from "@/lib/services/labels/score";
import {
  applyPointDelete,
  applyPointMove,
  applyPointRestore,
  applyShotDelete,
  applyShotRestore,
  destinationServerIn,
  moveNeedsServerSwitch,
  planAddedShot,
  planPointMove,
  type LabelDeleteReason,
  type LabelGame,
} from "@/lib/services/labels/operations";
import type {
  LabelAddShotResult,
  LabelCheckedResult,
  LabelMovePointResult,
  LabelPointStatusResult,
  LabelShotStatusResult,
} from "@/lib/services/labels/operations-session";
import { playingRowAt } from "@/lib/services/labels/playback";
import { applyPointReset, applyShotReset } from "@/lib/services/labels/reset";
import { applySiteRemovalRestore } from "@/lib/services/labels/site-removal";
import type { LabelSiteRemovalRestoreResult } from "@/lib/services/labels/site-removal-session";
import { applyDismiss } from "@/lib/services/labels/suggestions";
import type { LabelDismissSuggestionResult } from "@/lib/services/labels/suggestions-session";
import {
  displayedPointId,
  followAffordance,
  type PointFocus,
} from "@/components/dashboard/matches/match-detail/film/film-timeline";
import { useFollowScroll } from "@/components/dashboard/matches/match-detail/film/use-follow-scroll";
import { cn } from "@/lib/utils";
import type { CourtPoint } from "./court-geometry";
import {
  NO_PLACEMENT,
  flipPlacement,
  hitterHalf,
  nextPlacement,
  setPlacementTarget,
  startPlacement,
  type PlacementState,
  type PlacementTarget,
} from "./court-placement";
import { LabelBlackRail } from "./label-black-rail";
import { LabelBlackView } from "./label-black-view";
import type { LabelConfirm } from "./label-confirm";
import { LabelConfirmDialog } from "./label-confirm-dialog";
import { LabelCourtDock } from "./label-court-dock";
import { LabelCourtPanel, isPlacing } from "./label-court-panel";
import {
  COURT_DOCK_SIZE,
  followInsets,
  type VideoDockLayout,
} from "./label-court-position";
import { labelFilmStops } from "./label-film-stops";
import { LabelDivider } from "./label-divider";
import {
  DEFAULT_DOCK_SIZE,
  DEFAULT_LAYOUT_MODE,
  LAYOUT_MODE_STORAGE_KEY,
  LAYOUT_SIZE_STORAGE_KEY,
  MIN_DOCK_PX,
  clampDockSize,
  dockRoom,
  maxDockSize,
  parseDockSizes,
  parseLayoutMode,
  type DockSizes,
  type LabelLayoutMode,
} from "./label-layout";
import { LabelLayoutControl } from "./label-layout-control";
import { shotLoopWindow } from "./label-shot-loop";
import { sideNames } from "./label-format";
import {
  LabelPointsTable,
  POINT_HEADER_HEIGHT,
  type LabelRowOperations,
} from "./label-points-table";
import { LabelSaveStatus } from "./label-save-status";
import { LabelVideoPlayer, type LabelVideoHandle } from "./label-video";
import {
  LabelVideoDock,
  dockReadout,
  type DockNowPlaying,
} from "./label-video-dock";
import { INITIAL_SAVE_STATUS, saveStatusReducer } from "./save-status";
import {
  createVideoClock,
  parsePlayingRowKey,
  playingRowKey,
} from "./video-clock";

/** Ids of rows drawn optimistically while their insert is in flight. */
const PENDING_SHOT_PREFIX = "pending-shot-";

/** One frozen `follow`, so re-following while following changes no identity. */
const FOLLOW: PointFocus = { mode: "follow" };

/**
 * `/admin/labels/[sessionId]` — board 08: the header and the points table,
 * with the video and the court card floating over them, a corner each.
 *
 * Owns the session's rows for this visit and every edit to them. There is no
 * Save button: a change is applied to the rows at once (optimistic), handed to
 * `onSaveShot` / `onSavePoint` (the `updateLabelShot` / `updateLabelPoint`
 * server actions) straight away, put back if the write fails, and reported by
 * the header's save line. The status an edit implies is computed with the
 * same pure rule the server writes (`lib/services/labels/edit.ts`), so the
 * Edited pill appears with the edit and the server's answer only confirms it.
 *
 * Three pieces of UI state: which point is open (its strokes fold out under
 * it, show on the court, and the video jumps to its first stroke), which
 * stroke is selected (the one a court click places — see court-placement.ts)
 * and the save line.
 *
 * ── Follow the video, or hold the point being labelled ──────────────────────
 *
 * The open point is the film room's `PointFocus` (film-timeline.ts) read
 * against the playing point, exactly as the Film tab's points rail reads it:
 * in `follow` the PLAYING point is the open one — its strokes unfold, the
 * playing stroke is lit, and `useFollowScroll` keeps that row in view as the
 * table scrolls under the floating video; in `held` the open point stays put
 * while the lit row keeps following the video. A click on a point row, a
 * stroke row or an editor holds (editing is never fought by the video moving
 * on); re-clicking the playing point's row re-follows; a hand scroll of the
 * table — wheel, touch, the scrollbar, a scrolling key — holds too, on the
 * displayed point (T24), with `null` when nothing is open (T25). The way back
 * is the "Now playing · Point N" pill, at the top-centre of the table while
 * held and a point is playing (the video dock keeps the bottom-right corner,
 * the court card the bottom-left); pressing it follows again and the hook
 * jumps the playing row to the top (T26).
 *
 * ── The page does not scroll; the table does (T19) ──────────────────────────
 *
 * Everything renders inside one root (`data-label-console`), a flex column
 * filling the height the page bounds `main` to: the header row and its save
 * line on top, and under them the table card, which takes what is left and
 * scrolls both ways inside itself (`data-label-scroller`, in
 * label-points-table.tsx) with its column header stuck to its top — the Film
 * tab's points list, not a page that grows. The floating cards are `fixed`,
 * so where they sit in this tree changes nothing.
 *
 * With nothing playing — before the video moves, or in the dead time between
 * points — following shows the last point that was open (`restPointId`:
 * the first point still to check on arrival), so the court never empties
 * between points and Enter still has a point to check.
 *
 * Row operations (T7) follow the same optimistic contract through
 * `operations`: delete and Undo, add a stroke, move a point, mark it checked,
 * reset an edited stroke or point to the values it was seeded with, and —
 * from a game band (T14) — set a whole game's server or its type.
 * Three of them ask first — a delete and a reset always, a move only into a
 * game someone else serves — and those open `LabelConfirmDialog` WITHOUT
 * writing: the write happens on the dialog's action, and Cancel changes
 * nothing. Enter marks the open point checked when focus is not in a control.
 *
 * The video is the match film tab's player in a floating dock
 * (`label-video-dock.tsx`): always on screen while the table scrolls, dragged
 * to any corner or minimised to a pill. The court is a floating card of its
 * own (`label-court-dock.tsx`, board 08i) — nothing sits above the table, so
 * the table keeps the screen. As the video plays
 * (or is scrubbed) the table marks the point and the stroke on screen
 * (`playingRowAt`, via the video clock in video-clock.ts). The mark never
 * selects a stroke; whether it opens the point and scrolls to it is the
 * follow-or-hold state above — held, the labeller stays in charge of both.
 *
 * ── Three layouts (T24) ─────────────────────────────────────────────────────
 *
 * That floating arrangement is **Overlay**, one of three the header's Layout
 * menu offers (`label-layout.ts`). **Docked top** puts the video and the court
 * side by side in a band above the table; **Docked side** puts the video over
 * the court in a column to the table's right. In a docked mode the same
 * `LabelVideoPlayer` (the dock's inner player — same `player` ref, same
 * transport, same clock) and the same `LabelCourtPanel` (the court card's
 * body) render straight into the band or column, which is `DEFAULT_DOCK_SIZE`
 * tall or wide until the divider moves it; the table takes the rest and
 * still scrolls inside itself. Nothing floats, so the follow scroll keeps
 * clear of the sticky column header only. The choice is remembered under
 * `LAYOUT_MODE_STORAGE_KEY`, read after mount like the docks read their own
 * keys — the page is server-rendered, and a first client render that read
 * storage would not hydrate.
 *
 * ── The divider (T25) ───────────────────────────────────────────────────────
 *
 * Between the dock and the table, in the gap they already had, sits
 * `LabelDivider`: drag it (or arrow it) and the band's height or the column's
 * width follows, the video — 16:9 from that one number — and the court with
 * it, the table taking what is left. The console keeps the size the labeller
 * ASKED for, per mode, under `LAYOUT_SIZE_STORAGE_KEY`, and draws it through
 * `clampDockSize` against the docked layout's measured box (`dockRoom`, a
 * `ResizeObserver`): a size left in a bigger window is held to what this one
 * allows, and comes back when the window does. That clamp is the only cap —
 * nothing in the markup limits the dock a second time. Until the box is
 * measured (the server's render, the first client one) only the minimum
 * applies.
 *
 * Switching mode moves the `<video>` to another parent, which remounts it. The
 * playhead carries over: once the new element is in, the console seeks it to
 * where the clock says the film was (`seekTo` before metadata sets the
 * element's default start position, which it honours when the metadata
 * lands). Playback resumes paused, and a shot loop lets go.
 *
 * Outside a control, Space plays and pauses and ← / → step to the previous or
 * next point — the keys the player's own tooltips name.
 *
 * ── Full screen (T33) ───────────────────────────────────────────────────────
 *
 * The fourth mode, **black** (`label-black-view.tsx`, board 08l): a
 * `fixed inset-0 z-50` layer over the whole page — the film room's own
 * mechanism, which is what hides the admin header — holding the same player
 * and court panel on the left and the points rail (`label-black-rail.tsx`)
 * on the right. The layer stays a child of this root, not a portal, so the
 * `--film-t` clock still reaches its rows and every callback below is handed
 * down unchanged. The rail's exit button returns to the mode the console was
 * in before — the last non-black one, the overlay by default.
 */
export function LabelConsole({
  session,
  video,
  marks: initialMarks = null,
  initialExpandedPointId,
  initialSelectedShotId = null,
  onSaveShot,
  onSavePoint,
  operations,
  initialConfirm = null,
  initialOpenTombstoneIds,
  initialOpenGhostIds,
  initialVideoTime = null,
  initialVideoMinimised,
  initialPointFocus,
  initialLayoutMode,
  initialDockSize,
  initialRailWidth,
  headerAction,
}: {
  session: LabelSession;
  video: LabelVideo | null;
  /**
   * The derivation's marks on the session's rows (`getLabelSession`'s
   * `marks`), plain data across the RSC boundary. Null when the session has
   * them off, or when the page could not build them — the rows then carry
   * none. Held in state beside `points`, where the black rail reads them.
   */
  marks?: LabelMarks | null;
  /**
   * The point open on first render. Defaults to the first point still to
   * check — where a labeller returning to a session picks up — or the first
   * live point once every one is checked.
   */
  initialExpandedPointId?: string | null;
  /** The stroke selected on first render; none by default. */
  initialSelectedShotId?: string | null;
  /** Absent (or a complete session): the console is read-only. */
  onSaveShot?: (
    shotId: string,
    patch: LabelShotPatch,
  ) => Promise<LabelShotEditResult>;
  onSavePoint?: (
    pointId: string,
    patch: LabelPointPatch,
  ) => Promise<LabelPointEditResult>;
  /**
   * The row operations' server actions. Absent: no ✕, Undo, move menu or
   * point footer — the rows can still be edited when the saves are given.
   */
  operations?: LabelConsoleOperations;
  /** A confirm open on first render — for specs. */
  initialConfirm?: LabelConfirm | null;
  /** Tombstones expanded to their ghost row on first render. */
  initialOpenTombstoneIds?: readonly string[];
  /** Site-removed strokes shown as their struck-through row on first render. */
  initialOpenGhostIds?: readonly string[];
  /** The video's position on first render, on the analysis clock — for specs. */
  initialVideoTime?: number | null;
  /** The video dock minimised on first render — for specs. */
  initialVideoMinimised?: boolean;
  /** Follow or hold on first render — for specs. Follows by default. */
  initialPointFocus?: PointFocus;
  /**
   * Overlay, docked top or docked side on first render — for specs. Given,
   * storage is not consulted. Otherwise the overlay, then the stored mode
   * once the client can read it.
   */
  initialLayoutMode?: LabelLayoutMode;
  /**
   * The docked band's height or column's width on first render, in px — for
   * specs. Given, storage is not consulted.
   */
  initialDockSize?: number;
  /** The black view's rail width on first render, in px — for specs. */
  initialRailWidth?: number;
  /** The header's trailing link, rendered by the page. */
  headerAction?: ReactNode;
}) {
  const names = useMemo(
    () => sideNames(session.player1Name, session.player2Name),
    [session.player1Name, session.player2Name],
  );
  const editable =
    session.status === "labelling" &&
    onSaveShot !== undefined &&
    onSavePoint !== undefined;

  const [points, setPoints] = useState<LabelPoint[]>(session.points);
  // The marks beside those points. State, not a prop read: the page builds
  // them once per render and later tasks revise them as rows change.
  const [marks] = useState<LabelMarks | null>(initialMarks);
  // The point open while nothing is playing: see the file comment.
  const [restPointId, setRestPointId] = useState<string | null>(() =>
    initialExpandedPointId !== undefined
      ? initialExpandedPointId
      : (defaultPoint(session.points)?.id ?? null),
  );
  const [pointFocus, setPointFocus] = useState<PointFocus>(
    initialPointFocus ?? FOLLOW,
  );
  const holdPoint = useCallback(
    (pointId: string | null) => setPointFocus({ mode: "held", pointId }),
    [],
  );
  const followPlayback = useCallback(() => {
    player.current?.loopShot(null);
    setPointFocus(FOLLOW);
  }, []);
  const held = pointFocus.mode === "held";
  const [placement, setPlacement] = useState<PlacementState>(() =>
    placementOf(session.points, initialSelectedShotId),
  );
  // Where the floating video rests, as it reports it: the court card keeps
  // clear of it (label-court-position.ts).
  const [videoLayout, setVideoLayout] = useState<VideoDockLayout | null>(null);
  const [saveStatus, dispatchSave] = useReducer(
    saveStatusReducer,
    INITIAL_SAVE_STATUS,
  );
  const [confirm, setConfirm] = useState<LabelConfirm | null>(initialConfirm);
  const [openTombstones, setOpenTombstones] = useState<ReadonlySet<string>>(
    () => new Set(initialOpenTombstoneIds ?? []),
  );
  // The ghosts (site-removed strokes, board 08m §3) the black view shows as
  // their struck-through row. Only that view reads it.
  const [openGhosts, setOpenGhosts] = useState<ReadonlySet<string>>(
    () => new Set(initialOpenGhostIds ?? []),
  );
  const player = useRef<LabelVideoHandle>(null);
  // The table card: the one thing on the page that scrolls (T19).
  // One ref per layout: each mode mounts its own table, and the follow
  // scroll hangs its hold listeners on the element behind the ref it is
  // given — a single ref would keep them on the table that just unmounted.
  const overlayScrollerRef = useRef<HTMLDivElement | null>(null);
  const topScrollerRef = useRef<HTMLDivElement | null>(null);
  const sideScrollerRef = useRef<HTMLDivElement | null>(null);
  const blackScrollerRef = useRef<HTMLDivElement | null>(null);
  // The root: the video writes the film's clock onto it (`--film-t`), so the
  // playing row's progress rule and the transport read one clock (T21).
  const rootRef = useRef<HTMLDivElement | null>(null);
  const pendingIds = useRef(0);
  const [clock] = useState(() => createVideoClock(initialVideoTime));

  // Overlay, docked top or docked side (label-layout.ts). The stored choice is
  // read after mount, as the docks read theirs: the page is server-rendered
  // and the server has no storage, so a first client render that disagreed
  // with the server's would not hydrate. The overlay's cards are invisible
  // until measured, so a stored docked mode never shows the cards first.
  const [layoutMode, setLayoutMode] = useState<LabelLayoutMode>(
    initialLayoutMode ?? DEFAULT_LAYOUT_MODE,
  );
  useEffect(() => {
    if (initialLayoutMode !== undefined) return;
    try {
      const stored = localStorage.getItem(LAYOUT_MODE_STORAGE_KEY);
      // Storage is the external system here, readable only after mount.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (stored !== null) setLayoutMode(parseLayoutMode(stored));
    } catch {
      /* storage blocked — the console just starts in the overlay */
    }
  }, [initialLayoutMode]);
  // A mode change remounts the `<video>`, which stops it: remember whether
  // the film was running so the new element can carry on.
  const resumeAfterLayout = useRef(false);
  const chooseLayout = useCallback((mode: LabelLayoutMode) => {
    resumeAfterLayout.current = player.current?.isPlaying() ?? false;
    setLayoutMode(mode);
    // The menu hands focus back to its trigger once it has closed (some
    // 400ms later), and a focused button swallows Space and the arrows the
    // film is driven by. Let go of it as it arrives, so the keys work
    // straight after a switch; stop waiting if it never does.
    const release = (event: Event) => {
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        target.closest("[data-label-layout]")
      ) {
        target.blur();
        stop();
      }
    };
    const stop = () => {
      document.removeEventListener("focusin", release);
      window.clearTimeout(giveUp);
    };
    const giveUp = window.setTimeout(stop, 1500);
    document.addEventListener("focusin", release);
    try {
      localStorage.setItem(LAYOUT_MODE_STORAGE_KEY, mode);
    } catch {
      /* private window — the choice just isn't kept */
    }
  }, []);
  // The two modes with a dock. The black full-screen view (T33) has none.
  const dockMode =
    layoutMode === "docked-top" || layoutMode === "docked-side"
      ? layoutMode
      : null;
  const docked = dockMode !== null;
  const black = layoutMode === "black";
  const scrollerRef =
    layoutMode === "docked-top"
      ? topScrollerRef
      : layoutMode === "docked-side"
        ? sideScrollerRef
        : black
          ? blackScrollerRef
          : overlayScrollerRef;
  // Where "Exit full screen" goes: the last mode that was not the black view
  // — the overlay when the console arrived in black, or never left it.
  const modeBeforeBlack = useRef<LabelLayoutMode>(DEFAULT_LAYOUT_MODE);
  useEffect(() => {
    if (layoutMode !== "black") modeBeforeBlack.current = layoutMode;
  }, [layoutMode]);
  const exitBlack = useCallback(
    () => chooseLayout(modeBeforeBlack.current),
    [chooseLayout],
  );

  // The dock's size as the labeller left it, per docked mode (T25). Read from
  // storage in the initialiser: the server has none and gets the defaults,
  // and the client's first render is the overlay (the stored MODE arrives
  // after mount, above), which draws no size — so the two still agree. A
  // spec that pins the mode or the size never reads storage.
  const [dockSizes, setDockSizes] = useState<DockSizes>(() => {
    if (initialDockSize !== undefined) {
      return { "docked-top": initialDockSize, "docked-side": initialDockSize };
    }
    if (initialLayoutMode !== undefined || typeof window === "undefined") {
      return { ...DEFAULT_DOCK_SIZE };
    }
    try {
      return parseDockSizes(localStorage.getItem(LAYOUT_SIZE_STORAGE_KEY));
    } catch {
      /* storage blocked — the defaults */
      return { ...DEFAULT_DOCK_SIZE };
    }
  });
  // The docked layout's own box — the dock, the divider and the table — as
  // last measured: what the size is clamped against. Observed before the
  // first paint of a docked mode, so a stored size too big for this window
  // never shows unclamped.
  const dockLayoutRef = useRef<HTMLDivElement | null>(null);
  const [dockBox, setDockBox] = useState<{
    width: number;
    height: number;
  } | null>(null);
  useLayoutEffect(() => {
    const element = dockLayoutRef.current;
    if (!docked || !element || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      const { clientWidth: width, clientHeight: height } = element;
      setDockBox((box) =>
        box && box.width === width && box.height === height
          ? box
          : { width, height },
      );
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [docked, layoutMode]);
  const dockAvailable =
    dockMode && dockBox ? dockRoom(dockMode, dockBox) : null;
  const dockSize = dockMode
    ? clampDockSize(
        dockMode,
        dockSizes[dockMode],
        dockAvailable ?? Number.POSITIVE_INFINITY,
      )
    : null;
  const resizeDock = useCallback(
    (px: number) => {
      if (!dockMode) return;
      const next = {
        ...dockSizes,
        [dockMode]: clampDockSize(
          dockMode,
          px,
          dockAvailable ?? Number.POSITIVE_INFINITY,
        ),
      };
      if (next[dockMode] === dockSizes[dockMode]) return;
      setDockSizes(next);
      try {
        localStorage.setItem(LAYOUT_SIZE_STORAGE_KEY, JSON.stringify(next));
      } catch {
        /* private window — the size just isn't kept */
      }
    },
    [dockMode, dockSizes, dockAvailable],
  );
  const resetDock = useCallback(() => {
    if (dockMode) resizeDock(DEFAULT_DOCK_SIZE[dockMode]);
  }, [dockMode, resizeDock]);

  // A mode change moves the `<video>` to another parent, which remounts it at
  // zero. Put the new element where the clock says the film was: `seekTo`
  // before its metadata is in sets the element's default start position,
  // which it takes up when the metadata lands; after, it is a plain seek. Not
  // on mount — the first element starts where `initialVideoTime` put the
  // clock only in specs, and a real one starts at the film's first frame.
  const mountedLayout = useRef<LabelLayoutMode | null>(null);
  useEffect(() => {
    const previous = mountedLayout.current;
    mountedLayout.current = layoutMode;
    if (previous === null || previous === layoutMode) return;
    const at = clock.get();
    if (at !== null) player.current?.seekTo(at);
    if (resumeAfterLayout.current) player.current?.play();
    resumeAfterLayout.current = false;
  }, [layoutMode, clock]);

  // Re-renders only when the video crosses into another row; taken from the
  // current rows every render, so a retimed stroke moves the mark at once.
  const playingSnapshot = () =>
    playingRowKey(playingRowAt(points, clock.get()));
  const playingKey = useSyncExternalStore(
    clock.subscribe,
    playingSnapshot,
    playingSnapshot,
  );
  const playing = parsePlayingRowKey(playingKey);
  const playingPointId = playing?.pointId ?? null;
  const nowPlaying = useMemo(
    () => dockNowPlaying(points, parsePlayingRowKey(playingKey)),
    [points, playingKey],
  );
  // The docked (and black) player's transport title row — the dock derives
  // the same for the floating one. Nothing in the overlay reads it, so it
  // stays `null`.
  const dockedReadout = useMemo(() => {
    if (!docked && !black) return null;
    const scores = labelScores(points, session.adScoring);
    return dockReadout(points, nowPlaying, names, scores);
  }, [docked, black, points, session.adScoring, nowPlaying, names]);
  // The playing point's span on the FILE clock — `--film-t` is the element's
  // own seconds, so the window is the player's stop, not `playingRowAt`'s
  // analysis-clock one.
  const fileOffset = video?.startTimeSeconds ?? 0;
  const stops = useMemo(
    () => labelFilmStops(points, fileOffset),
    [points, fileOffset],
  );
  const playingWindow = useMemo(() => {
    if (playingPointId === null) return null;
    const stop = stops.find((s) => s.point.id === playingPointId);
    return stop ? { start: stop.start, end: stop.end } : null;
  }, [stops, playingPointId]);

  // The open point: the held one while held (`null` for none), else the
  // playing one, else the one that rested open when the video last had a
  // point — the same read as the film room's well, with the rest as the
  // fallback the room does without.
  const openPointId = displayedPointId(
    pointFocus,
    playingPointId ?? restPointId,
  );
  // Whatever opens, by following or by hand, is where following rests next:
  // when the video runs into dead time the open point stays, rather than
  // snapping back to wherever the console arrived. Adjusted during render,
  // not in an effect: the fallback must never be a render behind the point
  // it is standing in for.
  if (openPointId !== null && openPointId !== restPointId) {
    setRestPointId(openPointId);
  }

  // A deleted point is a marker, not an open point: nothing of it on the court.
  const expanded =
    points.find(
      (point) => point.id === openPointId && point.status !== "deleted",
    ) ?? null;
  const { checked, total } = labelProgress(points);

  // A row click holds its point — or re-follows, when it is the one already
  // playing (the way back without the pill) — and seeks to its first stroke,
  // as it always did. An open row that is NOT playing folds instead: a hold
  // with nothing held open. The playing point never folds — the table keeps
  // it unfolded whatever is held — so a click on it is always a re-follow.
  function togglePoint(pointId: string) {
    player.current?.loopShot(null);
    setPlacement(NO_PLACEMENT);
    if (pointId === openPointId && pointId !== playingPointId) {
      holdPoint(null);
      return;
    }
    if (pointId === playingPointId) followPlayback();
    else holdPoint(pointId);
    const point = points.find((p) => p.id === pointId);
    const first = point?.shots.find(
      (shot) => shot.status !== "deleted" && shot.videoTime !== null,
    );
    if (first?.videoTime != null) player.current?.seekTo(first.videoTime);
  }

  // Selecting a stroke is the start of an edit, so it always holds its point
  // — even the playing one, which following would otherwise swap out from
  // under the editors as the video crosses into the next point.
  function selectShot(shotId: string) {
    const owner = pointOfShot(points, shotId);
    if (owner) holdPoint(owner.id);
    // A draft row cannot be placed or edited until its insert lands; it is
    // selected for placement then (see `addShot`).
    if (shotId.startsWith(PENDING_SHOT_PREFIX)) return;
    setPlacement(placementOf(points, shotId));
    // A shot click replays that shot alone, on a loop (`label-shot-loop.ts`);
    // a stroke with no place on the video's clock just lets go of the last.
    player.current?.loopShot(
      owner ? shotLoopWindow(owner, shotId, fileOffset, stops) : null,
    );
  }

  // An editor opening on a point row's own cells (winner, ending, note…) is
  // focus landing in a form control inside that row; the row's click handler
  // deliberately ignores cell clicks, so this is where that edit holds —
  // an enter only, on the displayed point, like a hand scroll: the open
  // point stays what it was, and following simply stops moving it.
  function holdOnEditorFocus(event: FocusEvent<HTMLDivElement>) {
    if (held) return;
    const target = event.target as Element;
    // A dropdown's trigger is a button (`SelectEditor`), not a form control.
    if (
      !target.closest(
        "input, select, textarea, [data-select-editor] button, [contenteditable='true']",
      )
    )
      return;
    if (!target.closest("[data-point-id]")) return;
    holdPoint(openPointId);
  }

  const patchPoint = useCallback(
    async (pointId: string, patch: LabelPointPatch) => {
      const before = points.find((point) => point.id === pointId);
      if (!before || !onSavePoint) return;
      setPoints((current) =>
        current.map((point) =>
          point.id === pointId
            ? {
                ...applyLabelPointPatch(point, patch),
                // The note annotates the point: it is not one of the values
                // `applyLabelPointPatch` moves, and it never moves the status.
                note: "note" in patch ? (patch.note ?? null) : point.note,
              }
            : point,
        ),
      );

      dispatchSave({ type: "start" });
      const result = await settle(onSavePoint(pointId, patch));
      setPoints((current) =>
        current.map((point) => {
          if (point.id !== pointId) return point;
          if ("error" in result) {
            return {
              ...point,
              winner: "winner" in patch ? before.winner : point.winner,
              ending: "ending" in patch ? before.ending : point.ending,
              endedBy: "ended_by" in patch ? before.endedBy : point.endedBy,
              serveSide:
                "serve_side" in patch ? before.serveSide : point.serveSide,
              note: "note" in patch ? before.note : point.note,
              status: before.status,
            };
          }
          return { ...point, status: result.status };
        }),
      );
      dispatchSave(
        "error" in result
          ? { type: "failure", message: result.error }
          : { type: "success", at: Date.now() },
      );
    },
    [points, onSavePoint],
  );

  /**
   * "How it ended" follows the shot rows. Called by every shot path once its
   * write has SAVED, with the shot's point as it was and the change the write
   * made: when that change moved what the rows say (`deriveEnding`), the new
   * ending goes out as one point patch through the point autosave. A failed
   * shot write never reaches here, so a reverted row cannot leave an ending
   * behind. A point reset is not a shot change and does not call this.
   */
  const syncEnding = useCallback(
    (
      before: LabelPoint | null,
      change: (rows: LabelPoint[]) => LabelPoint[],
    ) => {
      if (!before) return;
      const after = change([before])[0];
      const patch = after && endingPatchForShotChange(before, after);
      if (patch) void patchPoint(before.id, patch);
    },
    [patchPoint],
  );

  const patchShot = useCallback(
    async (shotId: string, patch: LabelShotPatch) => {
      const before = findShot(points, shotId);
      if (!before || !onSaveShot) return;
      const owner = pointOfShot(points, shotId);
      // A draft row has no id the server knows yet; its add is still in
      // flight, and the saved row replaces it when that lands.
      if (shotId.startsWith(PENDING_SHOT_PREFIX)) return;
      const retime = "video_time" in patch;
      setPoints((current) =>
        updateShot(current, shotId, retime, (shot) =>
          applyLabelShotPatch(shot, patch),
        ),
      );

      dispatchSave({ type: "start" });
      const result = await settle(onSaveShot(shotId, patch));
      if ("error" in result) {
        // Put back exactly the fields this edit changed, and its status.
        const prior = labelShotValues(before);
        const undo = Object.fromEntries(
          Object.keys(patch).map((key) => [
            key,
            prior[key as keyof typeof prior],
          ]),
        ) as LabelShotPatch;
        setPoints((current) =>
          updateShot(current, shotId, retime, (shot) => ({
            ...applyLabelShotPatch(shot, undo),
            status: before.status,
          })),
        );
        dispatchSave({ type: "failure", message: result.error });
        return;
      }
      setPoints((current) =>
        updateShot(current, shotId, false, (shot) => ({
          ...shot,
          status: result.status,
        })),
      );
      dispatchSave({ type: "success", at: Date.now() });
      syncEnding(owner, (rows) =>
        updateShot(rows, shotId, retime, (shot) =>
          applyLabelShotPatch(shot, patch),
        ),
      );
    },
    [points, onSaveShot, syncEnding],
  );

  /**
   * One row operation: apply `optimistic` to the rows at once, call the
   * server, then `settleRows` with its answer — or put back what the
   * operation changed (`revert`) and report the error on the save line.
   */
  async function runOperation<R extends object>(
    optimistic: (rows: LabelPoint[]) => LabelPoint[],
    call: () => Promise<R | { error: string }>,
    settleRows: (rows: LabelPoint[], result: R) => LabelPoint[],
    revert: (rows: LabelPoint[]) => LabelPoint[],
  ): Promise<R | null> {
    setPoints(optimistic);
    dispatchSave({ type: "start" });
    const result = await settle(call());
    if ("error" in result) {
      setPoints(revert);
      dispatchSave({ type: "failure", message: result.error });
      return null;
    }
    setPoints((rows) => settleRows(rows, result));
    dispatchSave({ type: "success", at: Date.now() });
    return result;
  }

  function deleteShot(shotId: string, reason: LabelDeleteReason) {
    const before = findShot(points, shotId);
    if (!before || !operations) return;
    if (placement.shotId === shotId) setPlacement(NO_PLACEMENT);
    const owner = pointOfShot(points, shotId);
    const change = (rows: LabelPoint[]) =>
      replaceShot(rows, shotId, (s) => applyShotDelete(s, reason));
    void runOperation(
      change,
      () => operations.deleteShot(shotId, reason),
      (rows) => rows,
      (rows) => replaceShot(rows, shotId, () => before),
    ).then((saved) => {
      if (saved) syncEnding(owner, change);
    });
  }

  function restoreShot(shotId: string) {
    const before = findShot(points, shotId);
    if (!before || !operations) return;
    const owner = pointOfShot(points, shotId);
    const change = (rows: LabelPoint[]) =>
      replaceShot(rows, shotId, applyShotRestore);
    void runOperation(
      change,
      () => operations.restoreShot(shotId),
      (rows, result) =>
        replaceShot(rows, shotId, (s) => ({ ...s, status: result.status })),
      (rows) => replaceShot(rows, shotId, () => before),
    ).then((saved) => {
      if (saved) syncEnding(owner, change);
    });
    closeTombstone(shotId);
  }

  /**
   * Put a ghost back (board 08m §3's Restore): `siteRemovalRestoredAt` set,
   * nothing else on the row — it is `kept` with the vendor's values. The
   * ending is not re-derived: `deriveEnding` never skipped the ghost (a
   * ghost precedes the point's last serve, so it is never the last stroke),
   * and the rows say the same thing after as before.
   */
  function restoreSiteRemoval(shotId: string) {
    const before = findShot(points, shotId);
    if (!before || !operations) return;
    const at = new Date().toISOString();
    void runOperation(
      (rows) =>
        replaceShot(rows, shotId, (s) => applySiteRemovalRestore(s, at)),
      () => operations.restoreSiteRemoval(shotId),
      (rows, result) =>
        replaceShot(rows, shotId, (s) => ({
          ...s,
          siteRemovalRestoredAt: result.siteRemovalRestoredAt,
        })),
      (rows) => replaceShot(rows, shotId, () => before),
    );
    closeGhost(shotId);
  }

  /**
   * Dismiss a suggestion (board 08m §4): its key joins the point's
   * `dismissed`, the one stored piece of a mark's life — the dashed row goes
   * and the chip that opened it reads dismissed. Nothing else on the point
   * changes, so it is not `edited` and nothing is re-derived.
   */
  function dismissSuggestion(pointId: string, key: string) {
    const before = points.find((point) => point.id === pointId);
    if (!before || !operations) return;
    if (applyDismiss(before, key) === before) return;
    void runOperation(
      (rows) => replacePoint(rows, pointId, (p) => applyDismiss(p, key)),
      () => operations.dismissSuggestion(pointId, key),
      (rows, result) =>
        replacePoint(rows, pointId, (p) => ({
          ...p,
          dismissed: result.dismissed,
        })),
      (rows) =>
        replacePoint(rows, pointId, (p) => ({
          ...p,
          dismissed: before.dismissed,
        })),
    );
  }

  function deletePoint(pointId: string) {
    const before = points.find((point) => point.id === pointId);
    if (!before || !operations) return;
    if (before.shots.some((shot) => shot.id === placement.shotId)) {
      setPlacement(NO_PLACEMENT);
    }
    void runOperation(
      (rows) => replacePoint(rows, pointId, applyPointDelete),
      () => operations.deletePoint(pointId),
      (rows) => rows,
      (rows) =>
        replacePoint(rows, pointId, (p) => ({
          ...p,
          status: before.status,
          statusBeforeDelete: before.statusBeforeDelete,
        })),
    );
  }

  function restorePoint(pointId: string) {
    const before = points.find((point) => point.id === pointId);
    if (!before || !operations) return;
    void runOperation(
      (rows) => replacePoint(rows, pointId, applyPointRestore),
      () => operations.restorePoint(pointId),
      (rows, result) =>
        replacePoint(rows, pointId, (p) => ({ ...p, status: result.status })),
      (rows) =>
        replacePoint(rows, pointId, (p) => ({
          ...p,
          status: before.status,
          statusBeforeDelete: before.statusBeforeDelete,
        })),
    );
    closeTombstone(pointId);
  }

  function addShot(pointId: string, afterShotId: string | null) {
    const point = points.find((p) => p.id === pointId);
    if (!point || !operations) return;
    const plan = planAddedShot(point, afterShotId);
    if ("error" in plan) {
      dispatchSave({ type: "start" });
      dispatchSave({ type: "failure", message: plan.error });
      return;
    }
    pendingIds.current += 1;
    const tempId = `${PENDING_SHOT_PREFIX}${pendingIds.current}`;
    const draft: LabelShot = {
      id: tempId,
      labelPointId: pointId,
      eventId: null,
      afterEventId: plan.write.after_event_id,
      status: "added",
      statusBeforeDelete: null,
      deleteReason: null,
      hitter: plan.write.hitter,
      stroke: null,
      result: null,
      spin: null,
      contactX: null,
      contactY: null,
      landingX: null,
      landingY: null,
      videoTime: plan.write.video_time,
      siteRemoval: null,
      siteRemovalRestoredAt: null,
      seed: null,
    };
    // The new stroke is the one a court click places next — once it is saved.
    // Selecting the draft would send its temporary id to the server on the
    // first court click, which refuses it.
    const selectedBefore = placement.shotId;
    void runOperation<{ shot: LabelShot }>(
      (rows) => insertShot(rows, pointId, draft),
      () => operations.addShot(pointId, afterShotId),
      (rows, result) =>
        insertShot(removeShot(rows, tempId), pointId, result.shot),
      (rows) => removeShot(rows, tempId),
    ).then((result) => {
      // Select the saved row, unless the labeller picked something else
      // while the add was in flight.
      if (!result) return;
      syncEnding(point, (rows) => insertShot(rows, pointId, result.shot));
      setPlacement((current) =>
        current.shotId === selectedBefore
          ? placementOf(
              insertShot(points, pointId, result.shot),
              result.shot.id,
            )
          : current,
      );
    });
  }

  /** A move asks first only when someone else serves the destination. */
  function requestMove(pointId: string, to: LabelGame) {
    const point = points.find((p) => p.id === pointId);
    if (!point || !operations) return;
    const server = destinationServerIn(points, pointId, to);
    if (server !== null && moveNeedsServerSwitch(point, server)) {
      setConfirm({
        kind: "move-point",
        pointId,
        pointNumber: point.pointIndex + 1,
        to,
        server,
      });
      return;
    }
    movePoint(pointId, to, false);
  }

  function movePoint(pointId: string, to: LabelGame, switchServer: boolean) {
    const before = points.find((p) => p.id === pointId);
    if (!before || !operations) return;
    const plan = planPointMove(
      before,
      to,
      destinationServerIn(points, pointId, to),
      switchServer,
    );
    if ("error" in plan) {
      dispatchSave({ type: "start" });
      dispatchSave({ type: "failure", message: plan.error });
      return;
    }
    void runOperation(
      (rows) =>
        replacePoint(rows, pointId, (p) => applyPointMove(p, plan.write)),
      () => operations.movePoint(pointId, to, switchServer),
      (rows, result) =>
        replacePoint(rows, pointId, (p) => ({
          ...p,
          status: result.status,
          server: result.server,
          setNumber: result.setNumber,
          gameNumber: result.gameNumber,
        })),
      (rows) =>
        replacePoint(rows, pointId, (p) => ({
          ...p,
          setNumber: before.setNumber,
          gameNumber: before.gameNumber,
          server: before.server,
          status: before.status,
        })),
    );
  }

  /**
   * A whole game's server, or its type: the pure planner's writes are the
   * optimistic step (`applyGameWrites`), the action's rows the last word.
   */
  function runGameOperation(
    plan: PlannedGameWrites,
    call: () => Promise<LabelGameWriteResult>,
  ) {
    if ("error" in plan) {
      dispatchSave({ type: "start" });
      dispatchSave({ type: "failure", message: plan.error });
      return;
    }
    const written = new Set(plan.writes.map((write) => write.id));
    const before = new Map(
      points.filter((p) => written.has(p.id)).map((p) => [p.id, p]),
    );
    void runOperation(
      (rows) => applyGameWrites(rows, plan.writes),
      call,
      (rows, result) => {
        const saved = new Map(result.points.map((p) => [p.id, p]));
        return rows.map((p) => {
          const row = saved.get(p.id);
          return row
            ? {
                ...p,
                server: row.server,
                gameType: row.gameType,
                status: row.status,
              }
            : p;
        });
      },
      (rows) =>
        rows.map((p) => {
          const row = before.get(p.id);
          return row
            ? {
                ...p,
                server: row.server,
                gameType: row.gameType,
                status: row.status,
              }
            : p;
        }),
    );
  }

  function setGameServer(game: LabelGame, server: LabelSide) {
    if (!operations) return;
    runGameOperation(planGameServer(points, game, server), () =>
      operations.setGameServer(session.id, game, server),
    );
  }

  function setGameType(game: LabelGame, type: LabelGameType) {
    if (!operations) return;
    runGameOperation(planGameType(points, game, type), () =>
      operations.setGameType(session.id, game, type),
    );
  }

  function setChecked(pointId: string, value: boolean) {
    const before = points.find((p) => p.id === pointId);
    if (!before || !operations || before.status === "deleted") return;
    void runOperation(
      (rows) =>
        replacePoint(rows, pointId, (p) => ({
          ...p,
          checkedAt: value ? new Date().toISOString() : null,
        })),
      () => operations.setChecked(pointId, value),
      (rows, result) =>
        replacePoint(rows, pointId, (p) => ({
          ...p,
          checkedAt: result.checkedAt,
        })),
      (rows) =>
        replacePoint(rows, pointId, (p) => ({
          ...p,
          checkedAt: before.checkedAt,
        })),
    );
  }

  /** Back to the seed. The dialog asked first; the write happens here. */
  function resetShot(shotId: string) {
    const before = findShot(points, shotId);
    if (!before || !operations) return;
    // A reset can move the stroke's time, so it re-sorts like a time edit.
    const owner = pointOfShot(points, shotId);
    const change = (rows: LabelPoint[]) =>
      updateShot(rows, shotId, true, applyShotReset);
    void runOperation(
      change,
      () => operations.resetShot(shotId),
      (rows, result) =>
        replaceShot(rows, shotId, (s) => ({ ...s, status: result.status })),
      (rows) => updateShot(rows, shotId, true, () => before),
    ).then((saved) => {
      if (saved) syncEnding(owner, change);
    });
  }

  /** The point's own fields back to the seed; its strokes are not touched. */
  function resetPoint(pointId: string) {
    const before = points.find((p) => p.id === pointId);
    if (!before || !operations) return;
    void runOperation(
      (rows) => replacePoint(rows, pointId, applyPointReset),
      () => operations.resetPoint(pointId),
      (rows, result) =>
        replacePoint(rows, pointId, (p) => ({ ...p, status: result.status })),
      (rows) =>
        replacePoint(rows, pointId, (p) => ({
          ...p,
          setNumber: before.setNumber,
          gameNumber: before.gameNumber,
          server: before.server,
          serveSide: before.serveSide,
          winner: before.winner,
          ending: before.ending,
          endedBy: before.endedBy,
          status: before.status,
        })),
    );
  }

  function toggleTombstone(id: string) {
    setOpenTombstones((current) => {
      const next = new Set(current);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  }

  function closeTombstone(id: string) {
    setOpenTombstones((current) => {
      if (!current.has(id)) return current;
      const next = new Set(current);
      next.delete(id);
      return next;
    });
  }

  function toggleGhost(id: string) {
    setOpenGhosts((current) => {
      const next = new Set(current);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  }

  function closeGhost(id: string) {
    setOpenGhosts((current) => {
      if (!current.has(id)) return current;
      const next = new Set(current);
      next.delete(id);
      return next;
    });
  }

  function confirmed(question: LabelConfirm, reason: LabelDeleteReason | null) {
    setConfirm(null);
    switch (question.kind) {
      case "delete-shot":
        if (reason) deleteShot(question.shotId, reason);
        return;
      case "delete-point":
        deletePoint(question.pointId);
        return;
      case "move-point":
        movePoint(question.pointId, question.to, true);
        return;
      case "reset-shot":
        resetShot(question.shotId);
        return;
      case "reset-point":
        resetPoint(question.pointId);
        return;
    }
  }

  const operable = editable && operations !== undefined;
  const rowOperations: LabelRowOperations | undefined = operable
    ? {
        onAskDeleteShot: (shotId, shotNumber, pointNumber) =>
          setConfirm({ kind: "delete-shot", shotId, shotNumber, pointNumber }),
        onAskDeletePoint: (pointId) => {
          const point = points.find((p) => p.id === pointId);
          if (!point) return;
          setConfirm({
            kind: "delete-point",
            pointId,
            pointNumber: point.pointIndex + 1,
            shotCount: point.shots.filter((shot) => shot.status !== "deleted")
              .length,
          });
        },
        onRestoreShot: restoreShot,
        onRestorePoint: restorePoint,
        onRestoreSiteRemoval: restoreSiteRemoval,
        onDismissSuggestion: dismissSuggestion,
        onMovePoint: requestMove,
        onSetChecked: setChecked,
        onAddShot: addShot,
        onAskResetShot: (shotId, shotNumber, pointNumber) =>
          setConfirm({ kind: "reset-shot", shotId, shotNumber, pointNumber }),
        onAskResetPoint: (pointId) => {
          const point = points.find((p) => p.id === pointId);
          if (!point) return;
          setConfirm({
            kind: "reset-point",
            pointId,
            pointNumber: point.pointIndex + 1,
          });
        },
      }
    : undefined;

  // Enter marks the open point checked — but never from inside a control,
  // where Enter already means "open this cell" or "press this button". Space
  // and ← / → drive the video on the same terms: they are the keys the
  // player's tooltips name, and inside a control they already mean something.
  const checkOpenPoint = useRef<() => void>(() => {});
  useEffect(() => {
    checkOpenPoint.current = () => {
      if (!operable || confirm || !expanded || expanded.checkedAt) return;
      setChecked(expanded.id, true);
    };
  });
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const key = event.key;
      if (
        (key !== "Enter" &&
          key !== " " &&
          key !== "ArrowLeft" &&
          key !== "ArrowRight") ||
        event.defaultPrevented ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey ||
        event.shiftKey
      ) {
        return;
      }
      const target = event.target as Element | null;
      if (
        target?.closest?.(
          "input, select, textarea, button, a, [role='button'], [role='menu'], [role='dialog'], [role='alertdialog'], [contenteditable='true']",
        )
      ) {
        return;
      }
      event.preventDefault();
      if (key === "Enter") checkOpenPoint.current();
      else if (key === " ") player.current?.togglePlay();
      else player.current?.step(key === "ArrowLeft" ? -1 : 1);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // The follow scroll, on the TABLE CARD (T19): the page is bounded to the
  // viewport and the card is what scrolls, so the hook takes its element and
  // measures rows against the card's own box, less the strip the floating
  // cards cover (`followInsets`) — a row under the video or the court is not
  // in view — and less the column header stuck to the card's top, which a
  // row scrolled to the very top would otherwise sit under. Docked, nothing
  // floats over the table: only the column header is kept clear. The black
  // rail has neither — no column header, nothing over it — so no insets.
  const insets = useMemo(() => {
    if (black) return { top: 0, bottom: 0 };
    if (docked) return { top: POINT_HEADER_HEIGHT, bottom: 0 };
    const docks = followInsets(videoLayout);
    return { top: docks.top + POINT_HEADER_HEIGHT, bottom: docks.bottom };
  }, [black, docked, videoLayout]);
  useFollowScroll({
    scroller: scrollerRef,
    held,
    activePointId: playingPointId,
    activeShotId: playing?.shotId ?? null,
    // The playing point is always unfolded, so its playing stroke has a row.
    wellOpen: playingPointId !== null,
    displayedPointId: openPointId,
    onHoldPoint: holdPoint,
    insets,
    // The point row with its lit stroke: after a seek back to an earlier
    // point the stroke alone would park at the box's top, its row cut above.
    keepPointRow: true,
  });

  // The way back while held and a point is playing (T23); nothing in follow
  // mode, nothing in dead time. The number is the table's own (`pointIndex +
  // 1`, the dock bar's "Point N").
  const affordance = followAffordance(
    pointFocus,
    playingPointId !== null && nowPlaying
      ? { id: playingPointId, index: nowPlaying.point }
      : null,
  );

  function place(point: CourtPoint) {
    if (placement.shotId === null) return;
    const shot = findShot(points, placement.shotId);
    if (!shot) return;
    const step = nextPlacement(placement, point, labelShotValues(shot));
    if (!step) return;
    setPlacement(step.state);
    void patchShot(shot.id, step.patch);
  }

  // The card's Contact / Landing switch: the stored contact, when there is
  // one, says which half the hitter was on.
  function setTarget(target: PlacementTarget) {
    const shot =
      placement.shotId === null ? null : findShot(points, placement.shotId);
    setPlacement(setPlacementTarget(placement, target, shot?.contactY ?? null));
  }

  // The table card and the Now-playing pill: one tree, wherever the layout
  // puts it. What is left of the column (or the row, docked side), and the
  // pill's positioning context. `min-w-0` so that, beside the docked column,
  // the card narrows and scrolls sideways rather than pushing the column off.
  const table = (
    <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
      {/* `onFocusCapture` on the frame, not the rows: a point cell's editor
          is the only edit that reaches no console handler of its own. */}
      <div
        className="flex min-h-0 flex-1 flex-col"
        onFocusCapture={holdOnEditorFocus}
      >
        <LabelPointsTable
          scrollerRef={scrollerRef}
          points={points}
          adScoring={session.adScoring}
          names={names}
          expandedPointId={openPointId}
          onTogglePoint={togglePoint}
          editable={editable}
          selectedShotId={placement.shotId}
          onSelectShot={selectShot}
          onPatchPoint={patchPoint}
          onPatchShot={patchShot}
          operations={rowOperations}
          onSetGameServer={operable ? setGameServer : undefined}
          onSetGameType={operable ? setGameType : undefined}
          openTombstoneIds={openTombstones}
          onToggleTombstone={toggleTombstone}
          playingPointId={playingPointId}
          playingShotId={playing?.shotId ?? null}
          playingWindow={playingWindow}
        />
      </div>

      {/* The film room's return pill (point-list.tsx `FollowPill`), pinned
          to the table's top-centre: over the scroller rather than inside
          it, so it stays put while the rows move, and over the table
          rather than the page header. The corners belong to the floating
          cards. The same dark recipe over the light page, so
          `--shadow-floating` in place of the room's inset hairline; no
          chevron, since the lit row is wherever the table is. Above the
          dock layer (`z-40`). */}
      {affordance ? (
        <button
          type="button"
          data-label-follow-pill=""
          aria-label={affordance.ariaLabel}
          onClick={followPlayback}
          className={cn(
            "absolute top-12 left-1/2 z-50 inline-flex h-7 -translate-x-1/2 cursor-pointer items-center rounded-[var(--radius-button)] bg-[rgba(13,13,13,0.72)] px-2.5 text-[11px] font-medium whitespace-nowrap text-white shadow-[var(--shadow-floating)] transition-[background-color,transform] duration-200 ease-[var(--ease-primary)] hover:bg-[rgba(13,13,13,0.9)] focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none active:scale-[0.97]",
            // Pinned top, so it drops in (the keyframe reads the sign).
            "film-follow-pill-in [--film-pill-rise:-4px]",
          )}
        >
          {affordance.label}
        </button>
      ) : null}
    </div>
  );

  // Docked (T24): the dock's inner player and the court card's body, bare,
  // on the court card's own dark ground. The player is the SAME component the
  // floating dock wraps — same `player` ref, transport, clock target — so
  // Space, ← / →, the shot loop and the progress rule never notice the move.
  // The court card keeps its blue outline while placing, as the floating one
  // does; `fill` lets the court centre in whatever height the panel has.
  const placing = isPlacing(expanded, placement, editable);
  const DOCK_CARD =
    "rounded-[var(--radius-card)] bg-[#1A1A1C] shadow-[var(--shadow-card)]";
  const dockedVideo = (
    <LabelVideoPlayer
      ref={player}
      video={video}
      points={points}
      readout={dockedReadout ?? undefined}
      onTime={clock.set}
      clockTargetRef={rootRef}
    />
  );
  const dockedCourt = (
    <LabelCourtPanel
      point={expanded}
      names={names}
      placement={placement}
      editable={editable}
      playingShotId={playing?.shotId ?? null}
      clock={clock}
      onPlace={place}
      onTarget={setTarget}
      onFlip={() => setPlacement(flipPlacement)}
      fill
    />
  );
  // The divider's value and bounds, in px. Unmeasured, the most is not known
  // yet, so it is wherever the dock already is.
  const divider =
    dockMode && dockSize !== null ? (
      <LabelDivider
        mode={dockMode}
        value={dockSize}
        min={MIN_DOCK_PX[dockMode]}
        max={
          dockAvailable === null
            ? dockSize
            : maxDockSize(dockMode, dockAvailable)
        }
        onResize={resizeDock}
        onReset={resetDock}
      />
    ) : null;
  const courtCardClass = cn(
    DOCK_CARD,
    "flex flex-col px-3 pt-3 pb-2.5 transition-[box-shadow] duration-150",
    placing && "shadow-[0_0_0_1.5px_var(--blue),var(--shadow-card)]",
  );

  return (
    <div
      ref={rootRef}
      data-label-console=""
      data-label-layout-mode={layoutMode}
      className="flex min-h-0 flex-1 flex-col gap-6"
    >
      {/* Not in the black view: it covers the whole page, and a header drawn
          under it is a row of Tab stops nobody can see. Its title, progress
          and save line are the rail header's there; the way out is the
          rail's own "Exit full screen". */}
      {black ? null : (
        <div
          data-console-header=""
          className="flex shrink-0 items-end justify-between gap-8"
        >
          <div className="flex min-w-0 flex-col gap-1.5">
            <h1 className="text-display truncate">
              Label match · {session.player1Name} vs {session.player2Name}
            </h1>
            <p className="flex flex-wrap items-center gap-1.5 text-[12px] text-[var(--ink-600)]">
              <span className="tabular">
                {checked} of {total} points checked
              </span>
              {session.status === "complete" ? <span>· Complete</span> : null}
              <span aria-hidden="true">·</span>
              <span className="mono text-[11px] text-[var(--ink-500)]">
                derivation {session.derivationVersion}
              </span>
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-5">
            <LabelSaveStatus status={saveStatus} />
            <LabelLayoutControl mode={layoutMode} onChange={chooseLayout} />
            {headerAction}
          </div>
        </div>
      )}

      {black ? (
        // Full screen (T33): the film room's `fixed inset-0 z-50` layer, a
        // child of this root so `--film-t` reaches the rail's rows. The same
        // player and court panel the docked modes mount; the rail takes
        // every callback the light table takes, unchanged.
        <LabelBlackView
          initialRailWidth={initialRailWidth}
          video={dockedVideo}
          court={dockedCourt}
          placing={placing}
        >
          <LabelBlackRail
            player1Name={session.player1Name}
            player2Name={session.player2Name}
            checked={checked}
            total={total}
            saveStatus={saveStatus}
            onExit={exitBlack}
            scrollerRef={scrollerRef}
            onFocusCapture={holdOnEditorFocus}
            affordance={affordance}
            onFollow={followPlayback}
            points={points}
            adScoring={session.adScoring}
            names={names}
            marks={marks}
            expandedPointId={openPointId}
            onTogglePoint={togglePoint}
            editable={editable}
            selectedShotId={placement.shotId}
            onSelectShot={selectShot}
            onPatchPoint={patchPoint}
            onPatchShot={patchShot}
            operations={rowOperations}
            onSetGameServer={operable ? setGameServer : undefined}
            onSetGameType={operable ? setGameType : undefined}
            openTombstoneIds={openTombstones}
            onToggleTombstone={toggleTombstone}
            marksEnabled={session.marksEnabled}
            openGhostIds={openGhosts}
            onToggleGhost={toggleGhost}
            playingPointId={playingPointId}
            playingShotId={playing?.shotId ?? null}
            playingWindow={playingWindow}
          />
        </LabelBlackView>
      ) : layoutMode === "docked-top" ? (
        // A band above the table, `dockSize` tall (`DEFAULT_DOCK_SIZE` until
        // the divider moves it): the video at 16:9 from that height (565
        // wide at 318), the court card beside it at the floating card's own
        // width, the rest of the band open. A band taller than the row is
        // wide narrows the video's card instead of pushing the court off —
        // the frame keeps 16:9 inside it, centred on the card's dark ground.
        // The divider sits in the gap; the table takes what is left below.
        <div ref={dockLayoutRef} className="flex min-h-0 flex-1 flex-col">
          <div
            data-label-dock="top"
            className="flex shrink-0 gap-4"
            style={{ height: dockSize ?? undefined }}
          >
            <div
              data-label-dock-video=""
              className={cn(
                DOCK_CARD,
                "flex aspect-video h-full min-w-0 items-center overflow-hidden",
              )}
            >
              {dockedVideo}
            </div>
            <div
              data-label-dock-court=""
              data-court-placing={placing ? "true" : "false"}
              className={cn(courtCardClass, "shrink-0")}
              style={{ width: COURT_DOCK_SIZE.width }}
            >
              {dockedCourt}
            </div>
          </div>
          {divider}
          {table}
        </div>
      ) : layoutMode === "docked-side" ? (
        // A column to the table's right, `dockSize` wide (`DEFAULT_DOCK_SIZE`
        // until the divider moves it): the video at 16:9 from that width (270
        // tall at 480), the court card under it taking the rest of the
        // height. The clamp is the column's only cap. The divider sits in the
        // gap; the table narrows beside it and scrolls sideways.
        <div ref={dockLayoutRef} className="flex min-h-0 flex-1">
          {table}
          {divider}
          <div
            data-label-dock="side"
            className="flex shrink-0 flex-col gap-4"
            style={{ width: dockSize ?? undefined }}
          >
            <div
              data-label-dock-video=""
              className={cn(DOCK_CARD, "w-full shrink-0 overflow-hidden")}
            >
              {dockedVideo}
            </div>
            <div
              data-label-dock-court=""
              data-court-placing={placing ? "true" : "false"}
              className={cn(courtCardClass, "min-h-0 flex-1")}
            >
              {dockedCourt}
            </div>
          </div>
        </div>
      ) : (
        <>
          {table}

          <LabelVideoDock
            ref={player}
            video={video}
            points={points}
            nowPlaying={nowPlaying}
            names={names}
            adScoring={session.adScoring}
            onTime={clock.set}
            onLayout={setVideoLayout}
            clockTargetRef={rootRef}
            initialMinimised={initialVideoMinimised}
          />

          {/* The court floats too (board 08i): the whole court, read-only,
              until a stroke is selected in an editable session — then the
              half its next click belongs on. After the video in the DOM, so
              where the two ever meet the court, the card being worked on, is
              on top. */}
          <LabelCourtDock
            point={expanded}
            names={names}
            placement={placement}
            editable={editable}
            playingShotId={playing?.shotId ?? null}
            clock={clock}
            video={videoLayout}
            onPlace={place}
            onTarget={setTarget}
            onFlip={() => setPlacement(flipPlacement)}
          />
        </>
      )}

      {operable ? (
        <LabelConfirmDialog
          confirm={confirm}
          names={names}
          onCancel={() => setConfirm(null)}
          onConfirm={confirmed}
        />
      ) : null}
    </div>
  );
}

/** The row operations' server actions, as the page hands them in. */
export interface LabelConsoleOperations {
  deleteShot: (
    shotId: string,
    reason: LabelDeleteReason,
  ) => Promise<LabelShotStatusResult>;
  restoreShot: (shotId: string) => Promise<LabelShotStatusResult>;
  deletePoint: (pointId: string) => Promise<LabelPointStatusResult>;
  restorePoint: (pointId: string) => Promise<LabelPointStatusResult>;
  addShot: (
    pointId: string,
    afterShotId: string | null,
  ) => Promise<LabelAddShotResult>;
  movePoint: (
    pointId: string,
    to: LabelGame,
    switchServer: boolean,
  ) => Promise<LabelMovePointResult>;
  setChecked: (
    pointId: string,
    checked: boolean,
  ) => Promise<LabelCheckedResult>;
  /** Back to the seeded values: status `kept`. */
  resetShot: (shotId: string) => Promise<LabelShotStatusResult>;
  /** The point's own fields back to the seed: status `unchanged`. */
  resetPoint: (pointId: string) => Promise<LabelPointStatusResult>;
  /** Who serves a whole game (in a tiebreak, who serves first). */
  setGameServer: (
    sessionId: string,
    game: LabelGame,
    server: LabelSide,
  ) => Promise<LabelGameWriteResult>;
  /** Game, tiebreak or match tiebreak, for a whole game. */
  setGameType: (
    sessionId: string,
    game: LabelGame,
    type: LabelGameType,
  ) => Promise<LabelGameWriteResult>;
  /**
   * Put a stroke the site removed back into the rally (board 08m §3):
   * `site_removal_restored_at` = now, the one column it writes.
   */
  restoreSiteRemoval: (
    shotId: string,
  ) => Promise<LabelSiteRemovalRestoreResult>;
  /**
   * Dismiss a suggestion on a point (board 08m §4): its key appended to
   * `label_points.dismissed`, the one column it writes.
   */
  dismissSuggestion: (
    pointId: string,
    key: string,
  ) => Promise<LabelDismissSuggestionResult>;
}

/** The dock bar's "Point N · shot M", numbered as the table numbers them. */
function dockNowPlaying(
  points: readonly LabelPoint[],
  playing: { pointId: string; shotId: string } | null,
): DockNowPlaying | null {
  if (!playing) return null;
  const point = points.find((p) => p.id === playing.pointId);
  if (!point) return null;
  const live = point.shots.filter((shot) => shot.status !== "deleted");
  const index = live.findIndex((shot) => shot.id === playing.shotId);
  return {
    id: point.id,
    point: point.pointIndex + 1,
    shot: index === -1 ? null : index + 1,
  };
}

function defaultPoint(points: readonly LabelPoint[]): LabelPoint | null {
  const live = points.filter((point) => point.status !== "deleted");
  return live.find((point) => point.checkedAt === null) ?? live[0] ?? null;
}

function findShot(
  points: readonly LabelPoint[],
  shotId: string,
): LabelShot | null {
  for (const point of points) {
    const shot = point.shots.find((s) => s.id === shotId);
    if (shot) return shot;
  }
  return null;
}

/** The point a shot (a draft row included) belongs to. */
function pointOfShot(
  points: readonly LabelPoint[],
  shotId: string,
): LabelPoint | null {
  return (
    points.find((point) => point.shots.some((s) => s.id === shotId)) ?? null
  );
}

/**
 * Selecting a stroke for the court: the first click is its contact, on the
 * half its hitter stood in (court-placement.ts `hitterHalf`).
 */
function placementOf(
  points: readonly LabelPoint[],
  shotId: string | null,
): PlacementState {
  const owner = shotId === null ? null : pointOfShot(points, shotId);
  if (!owner) return startPlacement(shotId);
  const index = owner.shots.findIndex((shot) => shot.id === shotId);
  return startPlacement(
    shotId,
    hitterHalf(owner.shots[index], owner.shots.slice(0, index)),
  );
}

/** `points` with one shot replaced; re-sorted into video order on a retime. */
function updateShot(
  points: readonly LabelPoint[],
  shotId: string,
  resort: boolean,
  change: (shot: LabelShot) => LabelShot,
): LabelPoint[] {
  return points.map((point) => {
    if (!point.shots.some((shot) => shot.id === shotId)) return point;
    const shots = point.shots.map((shot) =>
      shot.id === shotId ? change(shot) : shot,
    );
    return { ...point, shots: resort ? orderLabelShots(shots) : shots };
  });
}

function replacePoint(
  points: readonly LabelPoint[],
  pointId: string,
  change: (point: LabelPoint) => LabelPoint,
): LabelPoint[] {
  return points.map((point) => (point.id === pointId ? change(point) : point));
}

/** `points` with one shot replaced, in place (a status change never moves it). */
function replaceShot(
  points: readonly LabelPoint[],
  shotId: string,
  change: (shot: LabelShot) => LabelShot,
): LabelPoint[] {
  return updateShot(points, shotId, false, change);
}

/** `points` with `shot` added to its point, in video order. */
function insertShot(
  points: readonly LabelPoint[],
  pointId: string,
  shot: LabelShot,
): LabelPoint[] {
  return points.map((point) =>
    point.id === pointId
      ? { ...point, shots: orderLabelShots([...point.shots, shot]) }
      : point,
  );
}

function removeShot(
  points: readonly LabelPoint[],
  shotId: string,
): LabelPoint[] {
  return points.map((point) =>
    point.shots.some((shot) => shot.id === shotId)
      ? { ...point, shots: point.shots.filter((shot) => shot.id !== shotId) }
      : point,
  );
}

/** An action's answer, with a thrown request turned into an error answer. */
async function settle<T extends object>(
  pending: Promise<T>,
): Promise<T | { error: string }> {
  try {
    return await pending;
  } catch {
    return { error: "the connection dropped. Try again." };
  }
}
