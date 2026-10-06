"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  useSyncExternalStore,
  type Dispatch,
  type FocusEvent,
  type ReactNode,
  type SetStateAction,
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
import {
  applyGameShift,
  planGameShift,
} from "@/lib/services/labels/game-shift";
import type { LabelGameShiftResult } from "@/lib/services/labels/game-shift-session";
import type { LabelMarks } from "@/lib/services/labels/marks";
import { endingPatchForShotChange } from "@/lib/services/labels/ending-derived";
import { volleyLinkWrites } from "@/lib/services/labels/volley-link";
import { labelScores } from "@/lib/services/labels/score";
import { withLiveScoreMarks } from "@/lib/services/labels/score-marks";
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
import { playbackSpans, playingRowIn } from "@/lib/services/labels/playback";
import {
  applyPlayerSwitch,
  applyShotSwaps,
  moveSwapsPlayers,
  planPlayerSwitch,
  shotSwapsOf,
} from "@/lib/services/labels/player-swap";
import type { LabelPlayerSwitchResult } from "@/lib/services/labels/player-swap-session";
import {
  applyInsertedPoint,
  draftInsertedPoint,
  planInsertedPoint,
  withdrawInsertedPoint,
  type InsertPosition,
} from "@/lib/services/labels/point-insert";
import type { LabelInsertPointResult } from "@/lib/services/labels/point-insert-session";
import {
  applyPointSplit,
  draftSplitPoint,
  planPointSplit,
  settlePointSplit,
  withdrawPointSplit,
  type PointSplitSaved,
} from "@/lib/services/labels/point-split";
import type { LabelSplitPointResult } from "@/lib/services/labels/point-split-session";
import {
  applyPointCombine,
  isCombinedTombstone,
  planPointCombine,
  settlePointCombine,
  withdrawPointCombine,
  type CombineDirection,
  type PointCombineSaved,
} from "@/lib/services/labels/point-combine";
import type { LabelCombinePointsResult } from "@/lib/services/labels/point-combine-session";
import { applyPointReset, applyShotReset } from "@/lib/services/labels/reset";
import {
  applyLabelSessionPatch,
  type LabelSessionFields,
  type LabelSessionFieldsPatch,
} from "@/lib/services/labels/session-fields";
import type { LabelSessionFieldsResult } from "@/lib/services/labels/session-fields-session";
import { applySiteRemovalRestore } from "@/lib/services/labels/site-removal";
import type { LabelSiteRemovalRestoreResult } from "@/lib/services/labels/site-removal-session";
import { applyDismiss } from "@/lib/services/labels/suggestions";
import type { LabelDismissSuggestionResult } from "@/lib/services/labels/suggestions-session";
import {
  followAffordance,
  type PointFocus,
} from "@/components/dashboard/matches/match-detail/film/film-timeline";
import { reducedMotionNow } from "@/components/dashboard/matches/match-detail/film/film-motion";
import {
  REFOLLOW_JUMP_INSET_PX,
  followScrollTarget,
  useFollowScroll,
} from "@/components/dashboard/matches/match-detail/film/use-follow-scroll";
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
import { LabelSideView } from "./label-side-view";
import type { LabelConfirm } from "./label-confirm";
import { LabelConfirmDialog } from "./label-confirm-dialog";
import { LabelCourtPanel, isPlacing } from "./label-court-panel";
import { labelFilmStops } from "./label-film-stops";
import {
  DEFAULT_LAYOUT_MODE,
  layoutAfterFullscreenLeft,
  layoutAfterFullscreenRequest,
  type LabelLayoutMode,
} from "./label-layout";
import { LabelLayoutControl } from "./label-layout-control";
import { sideNames } from "./label-format";
import { nowPlayingOf, nowPlayingReadout } from "./label-now-playing";
import type { LabelRowOperations } from "./label-row-parts";
import { LabelSaveStatus } from "./label-save-status";
import { LabelVideoPlayer, type LabelVideoHandle } from "./label-video";
import { INITIAL_SAVE_STATUS, saveStatusReducer } from "./save-status";
import {
  createVideoClock,
  parsePlayingRowKey,
  playingRowKey,
} from "./video-clock";
import { useBrowserFullscreen } from "./use-browser-fullscreen";

/** Ids of rows drawn optimistically while their insert is in flight. */
const PENDING_SHOT_PREFIX = "pending-shot-";
/** A point row whose insert is still in flight (`insertPoint`), likewise. */
const PENDING_POINT_PREFIX = "pending-point-";

/** One frozen `follow`, so re-following while following changes no identity. */
const FOLLOW: PointFocus = { mode: "follow" };

/**
 * What a game operation writes back, and a game shift on top of it — a
 * shift can switch a moved point's players too (player-swap.ts), so its
 * winner and ended by are among what a revert puts back.
 */
const GAME_WRITE_FIELDS = ["server", "gameType", "status"] as const;
const GAME_SHIFT_FIELDS = [
  "setNumber",
  "gameNumber",
  "winner",
  "endedBy",
  ...GAME_WRITE_FIELDS,
] as const;

/**
 * `rows` with each row `from` names taking `keys` from there — the settle
 * and the revert of an operation that rewrites a few fields of many rows.
 */
function takeFields<K extends keyof LabelPoint>(
  rows: LabelPoint[],
  from: ReadonlyMap<string, Pick<LabelPoint, K>>,
  keys: readonly K[],
): LabelPoint[] {
  return rows.map((row) => {
    const source = from.get(row.id);
    if (!source) return row;
    const next = { ...row };
    for (const key of keys) next[key] = source[key];
    return next;
  });
}

/** `(id) => toggle id in the set` / `(id) => drop id from the set`, on a Set state. */
function toggleIn(set: Dispatch<SetStateAction<ReadonlySet<string>>>) {
  return (id: string) =>
    set((current) => {
      const next = new Set(current);
      if (!next.delete(id)) next.add(id);
      return next;
    });
}
function removeFrom(set: Dispatch<SetStateAction<ReadonlySet<string>>>) {
  return (id: string) =>
    set((current) => {
      if (!current.has(id)) return current;
      const next = new Set(current);
      next.delete(id);
      return next;
    });
}

/**
 * `/admin/labels/[sessionId]` — the labelling console: the film top-left
 * with its transport, the court under it, and the points rail down the
 * right.
 *
 * Owns the session's rows for this visit and every edit to them. There is no
 * Save button: a change is applied to the rows at once (optimistic), handed to
 * `onSaveShot` / `onSavePoint` (the `updateLabelShot` / `updateLabelPoint`
 * server actions) straight away, put back if the write fails, and reported by
 * the save line. The status an edit implies is computed with the same pure
 * rule the server writes (`lib/services/labels/edit.ts`), so the pencil
 * appears with the edit and the server's answer only confirms it.
 *
 * Three pieces of UI state: which point is current (its strokes fold out
 * under it, show on the court, and the video jumps to its first stroke),
 * which stroke is selected (the one a court click places — see
 * court-placement.ts) and the save line.
 *
 * ── One point unfolded: the current one ─────────────────────────────────────
 *
 * Exactly one point is unfolded — the CURRENT point: the one the playhead is
 * in, and between points the last one it was in, or the one the labeller
 * clicked (`restPointId`), so an edit in progress is not folded away by dead
 * time. A click on a point row seeks to its first stroke, which makes it
 * current; a click on the current point's own row folds nothing. Nothing
 * else ever unfolds a second point.
 *
 * ── Follow the video, or hold the rail ──────────────────────────────────────
 *
 * Whether the rail SCROLLS with the video is the film room's `PointFocus`
 * (film-timeline.ts), exactly as the Film tab's points rail reads it: in
 * `follow` `useFollowScroll` keeps the playing row in view; in `held` the
 * rows stay where the labeller left them while the lit row keeps following
 * the video. A click on a point row, a stroke row or an editor holds
 * (editing is never fought by the rail moving on); re-clicking the playing
 * point's row re-follows; a hand scroll of the rail — wheel, touch, the
 * scrollbar, a scrolling key — holds too. The way back is the "Now playing ·
 * Point N" pill, at the top-centre of the rail while held and a point is
 * playing; pressing it follows again and the hook jumps the playing row to
 * the top. Holding never unfolds a point of its own: a held rail scrolled
 * away from the playing point still shows that one point unfolded, wherever
 * it is.
 *
 * ── The page does not scroll; the rail does ─────────────────────────────────
 *
 * Everything renders inside one root (`data-label-console`), a flex column
 * filling the height the page bounds `main` to, and the rail's scroller
 * (`data-label-rail-scroller`) is the one thing in it that scrolls.
 *
 * With nothing playing — before the video moves, or in the dead time between
 * points — the current point is the last one that was (`restPointId`: the
 * first point still to check on arrival), so the court never empties between
 * points and Enter still has a point to check.
 *
 * Row operations follow the same optimistic contract through `operations`:
 * delete and Undo, add a stroke, move a point, mark it checked, reset an
 * edited stroke or point to the values it was seeded with, and — from a game
 * band — set a whole game's server or its type. Three of them ask first — a
 * delete and a reset always, a move only into a game someone else serves —
 * and those open `LabelConfirmDialog` WITHOUT writing: the write happens on
 * the dialog's action, and Cancel changes nothing. Enter marks the open
 * point checked when focus is not in a control.
 *
 * As the video plays (or is scrubbed) the rail marks the point and the
 * stroke on screen (`playingRowIn`, via the video clock in video-clock.ts).
 * The mark never selects a stroke; it does make the point current, and
 * whether the rail scrolls to it is the follow-or-hold state above.
 *
 * Selecting a stroke seeks the video to it and nothing more: the film plays
 * on if it was playing and rests there if it was paused. Nothing replays a
 * shot on its own.
 *
 * Outside a control, Space plays and pauses and ← / → step to the previous or
 * next point — the keys the player's own tooltips name.
 *
 * ── Two layouts ─────────────────────────────────────────────────────────────
 *
 * One arrangement, in the page or over it (`label-layout.ts`), chosen from
 * the header's Layout menu or the rail's own buttons. It is not stored: the
 * console always starts docked, since a reload cannot re-enter the browser's
 * full screen without a gesture.
 *
 * - **Docked side** (`label-side-view.tsx`), the default: under this
 *   header, the film and the court as dark cards and the rail as a white
 *   card (the rail's light tone). The header carries the title, the progress
 *   and the save line, so the rail's own header leaves them out.
 * - **Full screen** (`label-black-view.tsx`, board 08l): a `fixed inset-0
 *   z-50` layer over the whole page — the film room's own mechanism, which
 *   is what hides the admin header — black to the edges, the rail in its
 *   dark tone with the title, progress and save line in its header. It and
 *   the browser's own full screen are ONE state (`use-browser-fullscreen.ts`):
 *   choosing it asks for the browser's inside the same click, a refused
 *   request goes back to docked side, and leaving by any road — the rail's
 *   "Exit full screen", the Layout menu, the browser's own Esc — leaves both.
 *   Only a browser with no Fullscreen API shows the layer by itself.
 *   The layer stays a child of this root, not a portal, so the `--film-t`
 *   clock still reaches its rows.
 *
 * Both mount the SAME `LabelVideoPlayer`, `LabelCourtPanel` and
 * `LabelBlackRail`, every callback handed down unchanged. Switching moves
 * the `<video>` to another parent, which remounts it; the playhead carries
 * over: once the new element is in, the console seeks it to where the clock
 * says the film was (`seekTo` before metadata sets the element's default
 * start position, which it honours when the metadata lands), and carries on
 * playing if it was.
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
  initialOpenGhostIds,
  initialVideoTime = null,
  initialPointFocus,
  initialLayoutMode,
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
  /** Site-removed strokes shown as their struck-through row on first render. */
  initialOpenGhostIds?: readonly string[];
  /** The video's position on first render, on the analysis clock — for specs. */
  initialVideoTime?: number | null;
  /** Follow or hold on first render — for specs. Follows by default. */
  initialPointFocus?: PointFocus;
  /**
   * Docked side or full screen on first render — for specs. Otherwise
   * docked side.
   */
  initialLayoutMode?: LabelLayoutMode;
  /** The rail's width on first render, in px — for specs. */
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
  // The marks beside those points, as the page built them from the vendor's
  // file. State, not a prop read: the page builds them once per render.
  const [marks] = useState<LabelMarks | null>(initialMarks);
  // The marks the rail draws: the page's, plus the two score marks read off
  // the LIVE rows (score-marks.ts) — "Wrong side for the score" and "Same
  // side twice" follow the labelled score, so a point added or a winner
  // changed re-reads them at once, and one that agrees is gone. Only with
  // marks built; the marks-off session has none to add to.
  const liveMarks = useMemo(
    () =>
      marks === null
        ? null
        : withLiveScoreMarks(marks, points, session.adScoring),
    [marks, points, session.adScoring],
  );
  // The two session fields the score chip writes (board 08m), held beside
  // the rows so an answer re-evaluates the chip at once.
  const [sessionFields, setSessionFields] = useState<LabelSessionFields>({
    finalScore: session.finalScore,
    videoEndsEarly: session.videoEndsEarly,
  });
  // The current point while nothing is playing: see the file comment.
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
  const followPlayback = useCallback(() => setPointFocus(FOLLOW), []);
  const held = pointFocus.mode === "held";
  const [placement, setPlacement] = useState<PlacementState>(() =>
    placementOf(session.points, initialSelectedShotId),
  );
  const [saveStatus, dispatchSave] = useReducer(
    saveStatusReducer,
    INITIAL_SAVE_STATUS,
  );
  const [confirm, setConfirm] = useState<LabelConfirm | null>(initialConfirm);
  // The ghosts (site-removed strokes, board 08m §3) the full-screen rail
  // shows as their struck-through row. Only that rail reads it.
  const [openGhosts, setOpenGhosts] = useState<ReadonlySet<string>>(
    () => new Set(initialOpenGhostIds ?? []),
  );
  const player = useRef<LabelVideoHandle>(null);
  // The rail's scroller: the one thing on the page that scrolls. One ref
  // per layout: each mode mounts its own rail, and the follow scroll hangs
  // its hold listeners on the element behind the ref it is given — a single
  // ref would keep them on the rail that just unmounted.
  const sideScrollerRef = useRef<HTMLDivElement | null>(null);
  const blackScrollerRef = useRef<HTMLDivElement | null>(null);
  // The root: the video writes the film's clock onto it (`--film-t`), so the
  // playing row's progress rule and the transport read one clock.
  const rootRef = useRef<HTMLDivElement | null>(null);
  const pendingIds = useRef(0);
  const [clock] = useState(() => createVideoClock(initialVideoTime));

  // Docked side or full screen (label-layout.ts). Never stored: the full
  // screen is the browser's own, which a reload cannot re-enter without a
  // gesture, so the console always starts docked.
  const [layoutMode, setLayoutMode] = useState<LabelLayoutMode>(
    initialLayoutMode ?? DEFAULT_LAYOUT_MODE,
  );
  // A mode change remounts the `<video>`, which stops it: remember whether
  // the film was running so the new element can carry on.
  const resumeAfterLayout = useRef(false);
  /** The one way the layout changes, whoever asked. */
  // A view fades in only once the labeller has switched layouts — never the
  // one the page loaded with (`arrive`, label-black-view / label-side-view).
  const [layoutSwitched, setLayoutSwitched] = useState(false);
  const switchLayout = useCallback((mode: LabelLayoutMode) => {
    resumeAfterLayout.current = player.current?.isPlaying() ?? false;
    setLayoutMode(mode);
    setLayoutSwitched(true);
  }, []);
  // The browser's own full screen (use-browser-fullscreen.ts) and the black
  // layout are ONE state. The page leaving the browser's full screen by any
  // road — its own Esc or control, or this console's `leaveWholeScreen` — is
  // a real change event, and puts the layout back to docked side.
  // Only while the layout IS the full screen: a full screen that was never
  // this layout's (another element's, left again) changes nothing here. The
  // hook calls the latest of these, so it reads the layout as it stands.
  const leftWholeScreen = () => {
    if (layoutMode === "black") {
      switchLayout(layoutAfterFullscreenLeft(layoutMode));
    }
  };
  const { enter: enterWholeScreen, leave: leaveWholeScreen } =
    useBrowserFullscreen(leftWholeScreen);
  const chooseLayout = useCallback(
    (mode: LabelLayoutMode) => {
      switchLayout(mode);
      if (mode === "black") {
        // Inside the click that chose it: the gesture the browser asks for.
        // Black is drawn at once, so the layer and the browser's full
        // screen arrive together; a REFUSED request puts it back — black is
        // never left showing under the browser's bars. A browser with no
        // Fullscreen API keeps the black layer: its only full screen.
        void enterWholeScreen().then((outcome) => {
          const settled = layoutAfterFullscreenRequest(outcome);
          if (settled !== "black") switchLayout(settled);
        });
      } else {
        // The exit button and the Layout menu leave the browser's too.
        leaveWholeScreen();
      }
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
    },
    [switchLayout, enterWholeScreen, leaveWholeScreen],
  );
  const fullScreen = layoutMode === "black";
  const scrollerRef = fullScreen ? blackScrollerRef : sideScrollerRef;
  const enterFullScreen = useCallback(
    () => chooseLayout("black"),
    [chooseLayout],
  );
  const exitFullScreen = useCallback(
    () => chooseLayout("docked-side"),
    [chooseLayout],
  );

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

  // Re-renders only when the video crosses into another row. The spans are
  // rebuilt with the rows, so a retimed stroke moves the mark at once, and
  // a tick of the clock only scans them.
  const spans = useMemo(() => playbackSpans(points), [points]);
  const playingSnapshot = () => playingRowKey(playingRowIn(spans, clock.get()));
  const playingKey = useSyncExternalStore(
    clock.subscribe,
    playingSnapshot,
    playingSnapshot,
  );
  const playing = parsePlayingRowKey(playingKey);
  const playingPointId = playing?.pointId ?? null;
  const nowPlaying = useMemo(
    () => nowPlayingOf(points, parsePlayingRowKey(playingKey)),
    [points, playingKey],
  );
  // The scoreboard over the rows as they stand, once: the rail's scores and
  // bands and the player's readout all read this.
  const scores = useMemo(
    () => labelScores(points, session.adScoring),
    [points, session.adScoring],
  );
  // The player's transport title row.
  const readout = useMemo(
    () => nowPlayingReadout(points, nowPlaying, names, scores),
    [points, scores, nowPlaying, names],
  );
  // The playing point's span on the FILE clock — `--film-t` is the element's
  // own seconds, so the window is the player's stop, not `playingRowIn`'s
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

  // The current point: the playing one, else the one that was current when
  // the video last had a point or the labeller last went to one. The ONE
  // point that is unfolded, on the court and under Enter.
  const currentPointId = playingPointId ?? restPointId;
  // Whatever the video plays into is where the current point rests next:
  // when the video runs into dead time it stays, rather than snapping back
  // to wherever the console arrived. Adjusted during render, not in an
  // effect: the fallback must never be a render behind the point it is
  // standing in for.
  if (playingPointId !== null && playingPointId !== restPointId) {
    setRestPointId(playingPointId);
  }

  // Ticking the current point folds its shot rows: it is done with. It stays
  // folded until the labeller clicks its row or unticks it, or another point
  // becomes current (adjusted during render, like `restPointId` above).
  const [foldedPointId, setFoldedPointId] = useState<string | null>(null);
  if (foldedPointId !== null && foldedPointId !== currentPointId) {
    setFoldedPointId(null);
  }
  const unfoldedPointId =
    currentPointId === foldedPointId ? null : currentPointId;

  // A deleted point is a marker, not a current point: nothing of it on the court.
  const expanded =
    points.find(
      (point) => point.id === currentPointId && point.status !== "deleted",
    ) ?? null;
  const { checked, total } = labelProgress(points);

  // A row click makes its point current and seeks to its first stroke; it
  // holds the rail — or re-follows, when the point is the one already
  // playing (the way back without the pill). Nothing folds: the current
  // point's own row clicked again just seeks back to its start.
  function togglePoint(pointId: string) {
    setPlacement(NO_PLACEMENT);
    setRestPointId(pointId);
    setFoldedPointId(null);
    if (pointId === playingPointId) followPlayback();
    else holdPoint(pointId);
    seekToPointStart(points.find((p) => p.id === pointId));
  }

  // Selecting a stroke is the start of an edit, so it holds the rail (the
  // rows are not scrolled out from under the editors) and seeks the video to
  // the stroke, which keeps its point current; playback carries on as it
  // was. The court zooms to the half its hitter stood in (`placementOf`).
  function selectShot(shotId: string) {
    const owner = pointOfShot(points, shotId);
    if (owner) holdPoint(owner.id);
    // A draft row cannot be placed or edited until its insert lands; it is
    // selected for placement then (see `addShot`).
    if (shotId.startsWith(PENDING_SHOT_PREFIX)) return;
    setPlacement(placementOf(points, shotId));
    const shot = findShot(points, shotId);
    if (shot?.videoTime != null) player.current?.seekTo(shot.videoTime);
  }

  // An editor opening on a point row's own cells (winner, ending, note…) is
  // focus landing in a form control inside that row; the row's click handler
  // deliberately ignores cell clicks, so this is where that edit holds —
  // an enter only, on the current point, like a hand scroll: following
  // simply stops moving the rows.
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
    holdPoint(currentPointId);
  }

  const patchPoint = useCallback(
    async (pointId: string, patch: LabelPointPatch) => {
      const before = points.find((point) => point.id === pointId);
      if (!before || !onSavePoint) return;
      // A draft point has no id the server knows yet; its insert is still in
      // flight, and the saved row replaces it when that lands.
      if (pointId.startsWith(PENDING_POINT_PREFIX)) return;
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
   * ending goes out as one point patch through the point autosave — with the
   * winner when the last stroke now missed, so the scores after it follow. A failed
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

  /**
   * One shot write, optimistic: the labeller's own (`patchShot`) or a
   * follower of one. `rows` is what the write reads the stroke and its point
   * from — the committed rows for the labeller's edit, the rows with that
   * edit applied for its follower. Answers the stroke's point with the patch
   * applied once the write has SAVED, and null when it did not (refused
   * before the call, or failed and put back).
   */
  const writeShot = useCallback(
    async (
      rows: readonly LabelPoint[],
      shotId: string,
      patch: LabelShotPatch,
    ): Promise<LabelPoint | null> => {
      const before = findShot(rows, shotId);
      if (!before || !onSaveShot) return null;
      const owner = pointOfShot(rows, shotId);
      // A draft row has no id the server knows yet; its add is still in
      // flight, and the saved row replaces it when that lands.
      if (shotId.startsWith(PENDING_SHOT_PREFIX)) return null;
      const retime = "video_time" in patch;
      const change = (current: readonly LabelPoint[]) =>
        updateShot(current, shotId, retime, (shot) =>
          applyLabelShotPatch(shot, patch),
        );
      setPoints(change);

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
        return null;
      }
      setPoints((current) =>
        updateShot(current, shotId, false, (shot) => ({
          ...shot,
          status: result.status,
        })),
      );
      dispatchSave({ type: "success", at: Date.now() });
      syncEnding(owner, change);
      return owner ? (change([owner])[0] ?? null) : null;
    },
    [onSaveShot, syncEnding],
  );

  /**
   * The labeller's edit of one stroke, and — once it has SAVED — the volley
   * link (volley-link.ts): a volley or an overhead and the stroke before it
   * share one place, this one's contact and that one's landing, so the other
   * end goes out as a shot write of its own through the same `writeShot`.
   * A follower's write is never asked for followers of its own — the link is
   * planned here, off the labeller's patch alone — and, like `syncEnding`, a
   * failed write never reaches it, so a reverted row leaves none behind.
   */
  const patchShot = useCallback(
    async (shotId: string, patch: LabelShotPatch) => {
      const strokeBefore = findShot(points, shotId)?.stroke ?? null;
      const saved = await writeShot(points, shotId, patch);
      if (!saved) return;
      for (const follower of volleyLinkWrites({
        point: saved,
        shotId,
        strokeBefore,
        patch,
        ghosts: marks !== null,
      })) {
        void writeShot([saved], follower.shotId, follower.patch);
      }
    },
    [points, writeShot, marks],
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

  /** A plan the console refused before any write: the status bar says why. */
  function refuse(message: string) {
    dispatchSave({ type: "start" });
    dispatchSave({ type: "failure", message });
  }

  /** The revert of a one-shot operation: the row as it was read. */
  const putBackShot =
    (shotId: string, before: LabelShot) => (rows: LabelPoint[]) =>
      replaceShot(rows, shotId, () => before);

  /** Seek the film to the point's first live timed stroke, when it has one. */
  function seekToPointStart(point: LabelPoint | undefined) {
    const first = point?.shots.find(
      (shot) => shot.status !== "deleted" && shot.videoTime !== null,
    );
    if (first?.videoTime != null) player.current?.seekTo(first.videoTime);
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
      putBackShot(shotId, before),
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
      putBackShot(shotId, before),
    ).then((saved) => {
      if (saved) syncEnding(owner, change);
    });
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
      putBackShot(shotId, before),
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

  /**
   * Add a point the vendor never saw beside `anchorPointId` — BEFORE it
   * (board 08m §5's "Add point" on the suggestion slot, and the ⋯ menu's
   * "Add point above") or AFTER it ("Add point below"): the rows get a draft
   * of the planned point at once, every point from there on renumbered in
   * memory (`applyInsertedPoint`), and the saved row takes the draft's place
   * when the insert lands — or the draft goes and the numbers come back
   * (`withdrawInsertedPoint`). The new point is then held open and brought
   * into view: setting its winner and adding its shots is what comes next.
   * Nothing is re-derived — the point has no strokes yet.
   */
  function insertPoint(
    anchorPointId: string,
    position: InsertPosition = "before",
  ) {
    if (!operations) return;
    const plan = planInsertedPoint(points, anchorPointId, position);
    if ("error" in plan) {
      refuse(plan.error);
      return;
    }
    pendingIds.current += 1;
    const tempId = `${PENDING_POINT_PREFIX}${pendingIds.current}`;
    const draft = draftInsertedPoint(plan.write.insert, tempId);
    void runOperation<{ point: LabelPoint }>(
      (rows) => applyInsertedPoint(rows, draft),
      () => operations.insertPoint(session.id, anchorPointId, position),
      (rows, result) =>
        applyInsertedPoint(withdrawInsertedPoint(rows, tempId), result.point),
      (rows) => withdrawInsertedPoint(rows, tempId),
    ).then((result) => {
      if (!result) return;
      holdPoint(result.point.id);
      jumpToPointId.current = result.point.id;
    });
  }

  /**
   * Move the rows left over past a game's end into the next game, and on
   * down the match while games run over (`game-shift.ts`): the rows take
   * their new games at once (`applyGameShift` over the same plan the server
   * runs), the server's own writes are the last word, and on a refusal every
   * moved row gets its old game, server and status back. A moved point
   * whose players switch with its server (player-swap.ts) takes its flipped
   * winner, ended by and hitters the same way (`applyShotSwaps`), and gets
   * them back on a refusal. No index moves, so nothing renumbers; the bands,
   * scores and the score banner re-read the rows as they stand. The ending
   * is not re-derived: a whole point's flip leaves what its rows say about
   * the point unchanged.
   */
  function shiftGameOverflow(fromPointId: string) {
    if (!operations) return;
    const plan = planGameShift(points, session.adScoring, fromPointId);
    if ("error" in plan) {
      refuse(plan.error);
      return;
    }
    const written = new Set(plan.writes.map((write) => write.id));
    const before = new Map(
      points.filter((p) => written.has(p.id)).map((p) => [p.id, p]),
    );
    const shotsBefore = shotSwapsOf(
      [...before.values()].flatMap((point) => point.shots),
    );
    const revert = (rows: LabelPoint[]) =>
      applyShotSwaps(takeFields(rows, before, GAME_SHIFT_FIELDS), shotsBefore);
    void runOperation(
      (rows) => applyShotSwaps(applyGameShift(rows, plan.writes), plan.shots),
      () => operations.shiftGameOverflow(session.id, fromPointId),
      (rows, result) =>
        applyShotSwaps(
          applyGameShift(revert(rows), result.writes),
          result.shots,
        ),
      revert,
    );
  }

  /**
   * Split a point at one of its shots (`point-split.ts`): that shot and
   * every shot after it leave the anchor for a draft point drawn right
   * below it at once, the later points renumbered in memory
   * (`applyPointSplit`); the saved row takes the draft's place when the
   * write lands (`settlePointSplit`), or the shots come back and the draft
   * goes (`withdrawPointSplit`). Then the anchor's ending is re-derived from
   * the shots it kept (`syncEnding`), and the
   * new point is made current, held and brought into view — setting its
   * winner is what comes next.
   */
  function splitPoint(pointId: string, shotId: string) {
    const anchor = points.find((point) => point.id === pointId);
    if (!anchor || !operations) return;
    // A draft point cannot be split until its own insert lands.
    if (pointId.startsWith(PENDING_POINT_PREFIX)) return;
    const plan = planPointSplit(points, pointId, shotId);
    if ("error" in plan) {
      refuse(plan.error);
      return;
    }
    pendingIds.current += 1;
    const tempId = `${PENDING_POINT_PREFIX}${pendingIds.current}`;
    const draft = draftSplitPoint(plan.write.insert, tempId);
    const change = (rows: LabelPoint[]) =>
      applyPointSplit(rows, pointId, draft, plan.write);
    void runOperation<PointSplitSaved>(
      change,
      () => operations.splitPoint(pointId, shotId),
      (rows, result) => settlePointSplit(rows, tempId, result),
      (rows) => withdrawPointSplit(rows, anchor, tempId),
    ).then((result) => {
      if (!result) return;
      syncEnding(anchor, change);
      setRestPointId(result.point.id);
      holdPoint(result.point.id);
      jumpToPointId.current = result.point.id;
    });
  }

  /**
   * Combine a point with its neighbour above or below in the same game
   * (`point-combine.ts`): the later point's shots join the earlier at once,
   * which takes the later one's winner and ending, and the later row is a
   * tombstone with nothing in it (`applyPointCombine`); on a refusal both
   * rows come back as they were. Then the kept point's ending is re-derived
   * from the merged shots (`syncEnding`). The kept point is current if the
   * removed one was.
   */
  function combinePoints(pointId: string, direction: CombineDirection) {
    if (!operations) return;
    if (pointId.startsWith(PENDING_POINT_PREFIX)) return;
    const plan = planPointCombine(points, pointId, direction);
    if ("error" in plan) {
      refuse(plan.error);
      return;
    }
    const kept = points.find((point) => point.id === plan.write.keptId);
    const removed = points.find((point) => point.id === plan.write.removedId);
    if (!kept || !removed) return;
    const merged = applyPointCombine([kept, removed], plan.write)[0];
    void runOperation<PointCombineSaved>(
      (rows) => applyPointCombine(rows, plan.write),
      () => operations.combinePoints(pointId, direction),
      (rows, result) => settlePointCombine(rows, result),
      (rows) => withdrawPointCombine(rows, kept, removed),
    ).then((saved) => {
      if (!saved) return;
      syncEnding(kept, (rows) =>
        rows.map((row) => (row.id === kept.id ? merged : row)),
      );
      if (currentPointId === removed.id) setRestPointId(kept.id);
    });
  }

  /**
   * Switch one point's players by hand (`planPlayerSwitch`): every stroke's
   * hitter, the winner and ended by flip at once (`applyPlayerSwitch` and
   * `applyShotSwaps`), the server's answer is the last word, and a refusal
   * puts the point's columns and every stroke's hitter and status back. The
   * server, set and game never move. The ending is not re-derived: a whole
   * point's flip leaves what its rows say about the point unchanged.
   */
  function switchPlayers(pointId: string) {
    const before = points.find((p) => p.id === pointId);
    if (!before || !operations) return;
    if (pointId.startsWith(PENDING_POINT_PREFIX)) return;
    const plan = planPlayerSwitch(before);
    if ("error" in plan) {
      refuse(plan.error);
      return;
    }
    const shotsBefore = shotSwapsOf(before.shots);
    void runOperation(
      (rows) =>
        applyShotSwaps(
          replacePoint(rows, pointId, (p) => applyPlayerSwitch(p, plan.write)),
          plan.shots,
        ),
      () => operations.switchPlayers(pointId),
      (rows, result) =>
        applyShotSwaps(
          replacePoint(rows, pointId, (p) => ({
            ...p,
            status: result.status,
            winner: result.winner,
            endedBy: result.endedBy,
          })),
          result.shots,
        ),
      (rows) =>
        applyShotSwaps(
          replacePoint(rows, pointId, (p) => ({
            ...p,
            status: before.status,
            winner: before.winner,
            endedBy: before.endedBy,
          })),
          shotsBefore,
        ),
    );
  }

  /**
   * One of the score banner's two writes (board 08m's "Fix the entered
   * score" / "Video ends early"): the session's fields change at once, the
   * server is asked, and they come back on a refusal — `runOperation`'s
   * shape, on the session's two fields rather than the rows. `label_sessions`
   * only; the match record is never written.
   */
  async function updateSessionFields(patch: LabelSessionFieldsPatch) {
    if (!operations) return;
    const before = sessionFields;
    setSessionFields((fields) => applyLabelSessionPatch(fields, patch));
    dispatchSave({ type: "start" });
    const result = await settle(
      operations.updateSessionFields(session.id, patch),
    );
    if ("error" in result) {
      setSessionFields(before);
      dispatchSave({ type: "failure", message: result.error });
      return;
    }
    setSessionFields((fields) => applyLabelSessionPatch(fields, result.fields));
    dispatchSave({ type: "success", at: Date.now() });
  }

  /**
   * "Find the gap": navigation only. The mismatching set's first point is
   * made current, the rail held, and the video seeks to its first stroke, as
   * a row click does; the row is then brought to the rail's top
   * (`jumpToPointId`, below). With no such point — the rows stop before that
   * set — the last labelled point is where the gap begins. Nothing is written.
   */
  const jumpToPointId = useRef<string | null>(null);
  function findGap(pointId: string | null) {
    const live = points.filter((point) => point.status !== "deleted");
    const target = pointId ?? live[live.length - 1]?.id ?? null;
    if (target === null) return;
    setPlacement(NO_PLACEMENT);
    setRestPointId(target);
    holdPoint(target);
    seekToPointStart(live.find((p) => p.id === target));
    jumpToPointId.current = target;
  }
  // The follow scroll moves nothing while held, so the jump — "Find the
  // gap"'s, or to a point just added (`insertPoint`) — is made here with its
  // own arithmetic once the hold has rendered the row: its top
  // `REFOLLOW_JUMP_INSET_PX` under the rail's, as a re-follow jump lands. A
  // ref, not state: the request is consumed by the commit after the hold
  // and must not render anything itself.
  useEffect(() => {
    const pointId = jumpToPointId.current;
    if (pointId === null) return;
    jumpToPointId.current = null;
    const scroller = scrollerRef.current;
    const row = scroller?.querySelector<HTMLElement>(
      `[data-point-id="${pointId}"]`,
    );
    if (!scroller || !row) return;
    const box = scroller.getBoundingClientRect();
    const top = followScrollTarget(
      "jump",
      row.getBoundingClientRect(),
      {
        top: box.top,
        bottom: box.bottom,
        scrollTop: scroller.scrollTop,
        maxScrollTop: scroller.scrollHeight - scroller.clientHeight,
      },
      REFOLLOW_JUMP_INSET_PX,
    );
    if (top === null) return;
    scroller.scrollTo({
      top,
      behavior: reducedMotionNow() ? "auto" : "smooth",
    });
  });

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
    // A combined point's tombstone offers no Undo; the plan refuses it too.
    if (isCombinedTombstone(before)) return;
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
  }

  function addShot(pointId: string, afterShotId: string | null) {
    const point = points.find((p) => p.id === pointId);
    if (!point || !operations) return;
    // A draft point cannot take a stroke until its own insert lands.
    if (pointId.startsWith(PENDING_POINT_PREFIX)) return;
    const plan = planAddedShot(point, afterShotId);
    if ("error" in plan) {
      refuse(plan.error);
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

  /**
   * A move asks first only when someone else serves the destination — and
   * the question says whether a yes switches the point's players too
   * (player-swap.ts), or only its server.
   */
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
        swaps: moveSwapsPlayers(point, server)
          ? point.winner === null
            ? "shots"
            : "shots-and-winner"
          : null,
      });
      return;
    }
    movePoint(pointId, to, false);
  }

  /**
   * Move one point (`planPointMove`): its game, server and — when its own
   * strokes contradict the new server — its players switch at once
   * (`applyPointMove` and `applyShotSwaps`), the server's answer is the last
   * word, and a refusal puts the point's columns and every stroke's hitter
   * and status back. The ending is not re-derived: a whole point's flip
   * leaves what its rows say about the point unchanged.
   */
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
      refuse(plan.error);
      return;
    }
    const shotsBefore = shotSwapsOf(before.shots);
    void runOperation(
      (rows) =>
        applyShotSwaps(
          replacePoint(rows, pointId, (p) => applyPointMove(p, plan.write)),
          plan.shots,
        ),
      () => operations.movePoint(pointId, to, switchServer),
      (rows, result) =>
        applyShotSwaps(
          replacePoint(rows, pointId, (p) => ({
            ...p,
            status: result.status,
            server: result.server,
            setNumber: result.setNumber,
            gameNumber: result.gameNumber,
            winner: result.winner,
            endedBy: result.endedBy,
          })),
          result.shots,
        ),
      (rows) =>
        applyShotSwaps(
          replacePoint(rows, pointId, (p) => ({
            ...p,
            setNumber: before.setNumber,
            gameNumber: before.gameNumber,
            server: before.server,
            status: before.status,
            winner: before.winner,
            endedBy: before.endedBy,
          })),
          shotsBefore,
        ),
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
      refuse(plan.error);
      return;
    }
    const written = new Set(plan.writes.map((write) => write.id));
    const before = new Map(
      points.filter((p) => written.has(p.id)).map((p) => [p.id, p]),
    );
    void runOperation(
      (rows) => applyGameWrites(rows, plan.writes),
      call,
      (rows, result) =>
        takeFields(
          rows,
          new Map(result.points.map((p) => [p.id, p])),
          GAME_WRITE_FIELDS,
        ),
      (rows) => takeFields(rows, before, GAME_WRITE_FIELDS),
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
    setFoldedPointId(value && pointId === currentPointId ? pointId : null);
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

  const toggleGhost = useMemo(() => toggleIn(setOpenGhosts), []);
  const closeGhost = removeFrom(setOpenGhosts);

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

  // ── What the rail is handed ───────────────────────────────────────────────
  //
  // The rail's rows are memoised, so every callback they receive keeps ONE
  // identity for the console's life (`useLatestHandlers`) and runs whatever
  // this render defined. Without that each render — one per stroke the film
  // crosses — would hand every row new functions and re-render them all.
  const rowOperations = useLatestHandlers<LabelRowOperations>({
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
    onInsertPoint: insertPoint,
    onShiftGameOverflow: shiftGameOverflow,
    onSplitPoint: splitPoint,
    onCombinePoints: combinePoints,
    onSwitchPlayers: switchPlayers,
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
  });
  const railHandlers = useLatestHandlers({
    togglePoint,
    selectShot,
    holdOnEditorFocus,
    patchPoint,
    patchShot,
    setGameServer,
    setGameType,
    findGap,
    fixEnteredScore: (sets: number[][]) =>
      void updateSessionFields({ final_score: sets }),
    videoEndsEarly: () => void updateSessionFields({ video_ends_early: true }),
  });

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
  // Escape lets go of the selected stroke, from anywhere in its row: a text
  // field has already put its draft back by the time the key reaches the
  // window. An open menu or dialog keeps the key for itself.
  const selectedShotId = placement.shotId;
  useEffect(() => {
    if (selectedShotId === null) return;
    function onEscape(event: KeyboardEvent) {
      if (
        event.key !== "Escape" ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey ||
        event.shiftKey ||
        document.querySelector(
          "[role='menu'], [role='dialog'], [role='alertdialog']",
        )
      ) {
        return;
      }
      (document.activeElement as HTMLElement | null)?.blur?.();
      setPlacement(NO_PLACEMENT);
    }
    window.addEventListener("keydown", onEscape);
    return () => window.removeEventListener("keydown", onEscape);
  }, [selectedShotId]);
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

  // The follow scroll, on the RAIL's scroller: the page is bounded to the
  // viewport and the rail is what scrolls, so the hook takes its element and
  // measures rows against the rail's own box.
  useFollowScroll({
    scroller: scrollerRef,
    held,
    activePointId: playingPointId,
    activeShotId: playing?.shotId ?? null,
    // The playing point is the current one, so its playing stroke has a row.
    wellOpen: playingPointId !== null,
    displayedPointId: currentPointId,
    onHoldPoint: holdPoint,
    // The point row with its lit stroke: after a seek back to an earlier
    // point the stroke alone would park at the box's top, its row cut above.
    keepPointRow: true,
  });

  // The way back while held and a point is playing; nothing in follow mode,
  // nothing in dead time. The number is the rail's own (`pointIndex + 1`,
  // the transport's "Point N").
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

  // The court panel's Contact / Landing switch: the stored contact, when there is
  // one, says which half the hitter was on.
  function setTarget(target: PlacementTarget) {
    const shot =
      placement.shotId === null ? null : findShot(points, placement.shotId);
    setPlacement(setPlacementTarget(placement, target, shot?.contactY ?? null));
  }

  // The player, the court panel and the rail: the SAME three in both
  // layouts — same `player` ref, transport and clock target, every callback
  // unchanged — so Space, ← / → and the progress rule never notice a switch.
  // Docked, the film and the court are cards on the page and the rail is in
  // its light tone, with the page's header saying what the rail's would;
  // full screen the frame is flush to the stage, so nothing rounds a corner.
  const placing = isPlacing(expanded, placement, editable);
  const videoPlayer = (
    <LabelVideoPlayer
      ref={player}
      video={video}
      points={points}
      readout={readout}
      onTime={clock.set}
      clockTargetRef={rootRef}
      square={fullScreen}
    />
  );
  const courtPanel = (
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
    />
  );
  const rail = (
    <LabelBlackRail
      tone={fullScreen ? "dark" : "light"}
      showSession={fullScreen}
      scores={scores}
      player1Name={session.player1Name}
      player2Name={session.player2Name}
      checked={checked}
      total={total}
      saveStatus={saveStatus}
      onExit={fullScreen ? exitFullScreen : undefined}
      onFullScreen={fullScreen ? undefined : enterFullScreen}
      scrollerRef={scrollerRef}
      onFocusCapture={railHandlers.holdOnEditorFocus}
      affordance={affordance}
      onFollow={followPlayback}
      points={points}
      adScoring={session.adScoring}
      names={names}
      marks={liveMarks}
      expandedPointId={unfoldedPointId}
      onTogglePoint={railHandlers.togglePoint}
      editable={editable}
      selectedShotId={placement.shotId}
      onSelectShot={railHandlers.selectShot}
      onPatchPoint={railHandlers.patchPoint}
      onPatchShot={railHandlers.patchShot}
      operations={operable ? rowOperations : undefined}
      onSetGameServer={operable ? railHandlers.setGameServer : undefined}
      onSetGameType={operable ? railHandlers.setGameType : undefined}
      openGhostIds={openGhosts}
      onToggleGhost={toggleGhost}
      playingPointId={playingPointId}
      playingShotId={playing?.shotId ?? null}
      playingWindow={playingWindow}
      finalScore={sessionFields.finalScore}
      videoEndsEarly={sessionFields.videoEndsEarly}
      matchScore={session.matchScore}
      onFixEnteredScore={operable ? railHandlers.fixEnteredScore : undefined}
      onVideoEndsEarly={operable ? railHandlers.videoEndsEarly : undefined}
      onFindGap={operable ? railHandlers.findGap : undefined}
    />
  );
  const View = fullScreen ? LabelBlackView : LabelSideView;

  return (
    <div
      ref={rootRef}
      data-label-console=""
      data-label-layout-mode={layoutMode}
      className="flex min-h-0 flex-1 flex-col gap-6"
    >
      {/* Not full screen: the layer covers the whole page, and a header drawn
          under it is a row of Tab stops nobody can see. Its title, progress
          and save line are the rail header's there; the way out is the
          rail's own "Exit full screen". */}
      {fullScreen ? null : (
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

      {/* One view or the other, never both: the full screen is the film
          room's `fixed inset-0 z-50` layer, a child of this root so
          `--film-t` reaches the rail's rows. */}
      <View
        initialRailWidth={initialRailWidth}
        video={videoPlayer}
        court={courtPanel}
        placing={placing}
        arrive={layoutSwitched}
      >
        {rail}
      </View>

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

/**
 * `handlers` as functions that keep ONE identity for the component's life
 * and each run the handler of that name from the latest committed render —
 * so a memoised child handed them never re-renders for a new closure, and
 * never calls a stale one. The real handlers live in a ref written after
 * each commit (an effect, as `checkOpenPoint` is: a handler runs on a later
 * event, never inside the render that defined it); the proxies are made
 * once, for the names the first render gave.
 */
export function useLatestHandlers<
  T extends { [K in keyof T]: (...args: never[]) => unknown },
>(handlers: T): T {
  const latest = useRef(handlers);
  useEffect(() => {
    latest.current = handlers;
  });
  const [stable] = useState(() => {
    const proxies = {} as T;
    for (const name of Object.keys(handlers) as (keyof T)[]) {
      proxies[name] = ((...args: never[]) =>
        latest.current[name](...args)) as T[keyof T];
    }
    return proxies;
  });
  return stable;
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
  /**
   * Add a point BEFORE `anchorPointId` (board 08m §5's slot, the menu's "Add
   * point above") or AFTER it ("Add point below"): later points' indexes
   * shifted up one, then the new row inserted — `label_points` only.
   */
  insertPoint: (
    sessionId: string,
    anchorPointId: string,
    position: InsertPosition,
  ) => Promise<LabelInsertPointResult>;
  /**
   * Move the rows left over past a game's end — from the game that holds
   * `fromPointId`, one of them — into the next game, and on while games run
   * over: `set_number`, `game_number`, `server`, `game_type` and `status` on
   * each moved point (plus `winner` and `ended_by` on one whose players
   * switch), and the flipped strokes' `hitter` and status — `label_points`
   * and `label_shots`. Returns the moved rows and the flipped strokes.
   */
  shiftGameOverflow: (
    sessionId: string,
    fromPointId: string,
  ) => Promise<LabelGameShiftResult>;
  /**
   * Split `pointId` at `shotId` (`point-split.ts`): the later points'
   * indexes shifted up one, the new row inserted, the shot rows from that
   * shot on moved to it in one update, the anchor marked edited —
   * `label_points` and `label_shots`. Returns the new row and the anchor as
   * written.
   */
  splitPoint: (
    pointId: string,
    shotId: string,
  ) => Promise<LabelSplitPointResult>;
  /**
   * Combine `pointId` with its neighbour `direction` in the same game
   * (`point-combine.ts`): the later point's shot rows moved to the earlier
   * in one update, the earlier written with the later's winner and ending
   * and both rows' rallies, the later tombstoned — `label_points` and
   * `label_shots`. Returns both rows as written.
   */
  combinePoints: (
    pointId: string,
    direction: CombineDirection,
  ) => Promise<LabelCombinePointsResult>;
  /**
   * Switch `pointId`'s players by hand (`player-swap.ts`): `winner`,
   * `ended_by` and `status` on the point, every stroke's `hitter` and
   * status — `label_points` and `label_shots`; never `server`. Returns the
   * point's columns and the flipped strokes as written.
   */
  switchPlayers: (pointId: string) => Promise<LabelPlayerSwitchResult>;
  /**
   * The score banner's answers (board 08m): `final_score` and
   * `video_ends_early` on `label_sessions`, the only table it writes.
   */
  updateSessionFields: (
    sessionId: string,
    patch: LabelSessionFieldsPatch,
  ) => Promise<LabelSessionFieldsResult>;
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
 * half its hitter stood in (court-placement.ts `hitterHalf`). A stroke that
 * already has its contact and is only missing where it landed opens on the
 * landing instead, on the half across the net, so the one click it still
 * needs is the next one.
 */
function placementOf(
  points: readonly LabelPoint[],
  shotId: string | null,
): PlacementState {
  const owner = shotId === null ? null : pointOfShot(points, shotId);
  if (!owner) return startPlacement(shotId);
  const index = owner.shots.findIndex((shot) => shot.id === shotId);
  const shot = owner.shots[index];
  const start = startPlacement(
    shotId,
    hitterHalf(shot, owner.shots.slice(0, index)),
  );
  const hasContact = shot.contactX !== null && shot.contactY !== null;
  const hasLanding = shot.landingX !== null && shot.landingY !== null;
  return hasContact && !hasLanding
    ? setPlacementTarget(start, "landing", shot.contactY)
    : start;
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
