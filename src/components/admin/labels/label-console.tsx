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
import { planShotWrite } from "./shot-write-plan";
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
  GAME_PULL_ADD_POINT,
  planGamePull,
  planGameShift,
  type GameShiftWrite,
} from "@/lib/services/labels/game-shift";
import type { LabelGameShiftResult } from "@/lib/services/labels/game-shift-session";
import type { LabelMarks } from "@/lib/services/labels/marks";
import type { LabelPointEndingSynced } from "@/lib/services/labels/ending-session";
import { volleyLinkWrites } from "@/lib/services/labels/volley-link";
import { labelScores } from "@/lib/services/labels/score";
import { drawsGhosts } from "@/lib/services/labels/marks-state";
import { withLiveScoreMarks } from "@/lib/services/labels/score-marks";
import {
  applyPointDelete,
  applyPointMove,
  applyPointRestore,
  applyShotDelete,
  applyShotRestore,
  applyShotsRemoved,
  deadBallReason,
  applyShotsRestored,
  destinationServerIn,
  liveShotsAfter,
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
  LabelShotsRemoveResult,
  LabelShotsRestoreResult,
} from "@/lib/services/labels/operations-session";
import { playbackSpans, playingRowIn } from "@/lib/services/labels/playback";
import {
  applyPlayerSwitch,
  applyShotSwaps,
  moveSwapsPlayers,
  planPlayerSwitch,
  shotSwapsOf,
  type ShotSwapWrite,
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
import {
  applyPointReset,
  applyShotReset,
  pointResetScope,
} from "@/lib/services/labels/reset";
import { sharesVendorRally } from "@/lib/services/labels/point-split";
import type { LabelPointResetResult } from "@/lib/services/labels/reset-session";
import {
  applyLabelSessionPatch,
  type LabelSessionFields,
  type LabelSessionFieldsPatch,
} from "@/lib/services/labels/session-fields";
import type { LabelSessionFieldsResult } from "@/lib/services/labels/session-fields-session";
import { completeWarnings } from "@/lib/services/labels/session-status";
import type { LabelSessionStatusResult } from "@/lib/services/labels/session-status-session";
import { advButton } from "@/lib/ui/adv-button";
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
  KEY_OWNER_SELECTOR,
  layoutAfterFullscreenRequest,
  type LabelLayoutMode,
} from "./label-layout";
import { LabelLayoutControl } from "./label-layout-control";
import { sideNames } from "./label-format";
import { nowPlayingOf, nowPlayingReadout } from "./label-now-playing";
import { openFlags, stepFlag } from "@/lib/services/labels/flag-nav";
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
 * What a game operation writes back: a point whose players switch with the
 * server carries its flipped winner and ended by. A game shift adds the game.
 */
const GAME_WRITE_FIELDS = [
  "server",
  "gameType",
  "status",
  "winner",
  "endedBy",
] as const;
const GAME_SHIFT_FIELDS = [
  "setNumber",
  "gameNumber",
  ...GAME_WRITE_FIELDS,
] as const;

/** `rows` with each row `from` names taking `keys` from there. */
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
 * `/admin/labels/[sessionId]` — the labelling console: film, court and points
 * rail.
 *
 * Owns the session's rows and every edit to them. An edit is applied at once,
 * handed to `onSaveShot` / `onSavePoint`, put back if the write fails and
 * reported on the save line; the status it implies comes from the same pure
 * rule the server writes (`edit.ts`).
 *
 * - Current point: the one the playhead is in; between points, the last one it
 *   was in or the one clicked (`restPointId`). Exactly one point is unfolded. A
 *   row click seeks to its first stroke.
 * - Follow or hold: `PointFocus` (film-timeline.ts) decides whether the rail
 *   scrolls with the video. A click, an editor or a hand scroll holds; the "Now
 *   playing" pill or re-clicking the playing row follows again. Holding never
 *   unfolds a second point.
 * - The page does not scroll; the rail's scroller (`data-label-rail-scroller`)
 *   does.
 * - Row operations share one optimistic contract (`runOperation`). Delete and
 *   reset always ask first, a move only into another player's game; the write
 *   happens on the dialog's action.
 * - Nothing is written to the database without the labeller's click — never on
 *   load, never from a hint by itself. Three sanctioned exceptions, each done
 *   by the shot write's own server call: the ghost marking the site makes at
 *   seeding, and its inverse, a serve relabelled in putting back the ghost the
 *   site removed after it (`ghostFreedByServeIn`, answered as
 *   `restoredGhostId`); and a rally ball the labeller marks out or into the
 *   net taking the one or two live strokes after it as tombstones
 *   (`deadBallsAfterMiss`, answered as `removedAfter`) — the players playing
 *   a dead ball out, which used to cost a dialog each. Three or more are
 *   never removed by themselves: the hint line offers Remove or Split, and
 *   Restore for a removal, each a click (`removeShotsAfter` /
 *   `restoreShots`). A shot write also settles its point's ending in that
 *   same call (ending-session.ts); the server's `point` is the last word over
 *   the optimistic rows here.
 * - Outside a control: Enter checks the open point, Space plays or pauses, ← /
 *   → step points.
 * - Two layouts (`label-layout.ts`) mount the same player, court panel and rail
 *   with the same callbacks. A switch remounts the `<video>`, so the console
 *   re-seeks it to the clock's time.
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
  /** The session's marks, plain data. Null when off or not built. */
  marks?: LabelMarks | null;
  /** The point open on first render; by default the first still to check. */
  initialExpandedPointId?: string | null;
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
  /** The row operations' server actions. Absent: the rows offer none. */
  operations?: LabelConsoleOperations;
  /** A confirm open on first render — for specs. */
  initialConfirm?: LabelConfirm | null;
  /** Site-removed strokes shown as their struck-through row on first render. */
  initialOpenGhostIds?: readonly string[];
  /** The video's position on first render, on the analysis clock — for specs. */
  initialVideoTime?: number | null;
  /** Follow or hold on first render — for specs. Follows by default. */
  initialPointFocus?: PointFocus;
  /** Docked side or full screen on first render — for specs. */
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
  // Client state, so "Mark complete" and "Reopen" flip the console read-only
  // or editable without a reload.
  const [status, setStatus] = useState(session.status);
  // A status write in flight: both buttons wait for it.
  const [statusSaving, setStatusSaving] = useState(false);
  const editable =
    status === "labelling" &&
    onSaveShot !== undefined &&
    onSavePoint !== undefined;

  const [points, setPoints] = useState<LabelPoint[]>(session.points);
  // The marks beside those points, as the page built them from the vendor's
  // file. State, not a prop read: the page builds them once per render.
  const [marks] = useState<LabelMarks | null>(initialMarks);
  // The scoreboard over the rows as they stand, once: the rail's scores and
  // bands and the player's readout and the score marks all read this.
  const scores = useMemo(
    () => labelScores(points, session.adScoring),
    [points, session.adScoring],
  );
  // The page's marks plus the two score marks read off the live rows
  // (score-marks.ts), which follow the labelled score. Only with marks built.
  const liveMarks = useMemo(
    () =>
      marks === null
        ? null
        : withLiveScoreMarks(marks, points, session.adScoring, scores),
    [marks, points, session.adScoring, scores],
  );
  // The two session fields the score chip writes, held beside the rows so an
  // answer re-evaluates the chip at once.
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
  // The site-removed strokes the rail shows as their struck-through row.
  const [openGhosts, setOpenGhosts] = useState<ReadonlySet<string>>(
    () => new Set(initialOpenGhostIds ?? []),
  );
  const player = useRef<LabelVideoHandle>(null);
  // One scroller ref per layout: each mode mounts its own rail, and the follow
  // scroll hangs its hold listeners on the element behind the ref it is given.
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
  // Leaving the browser's full screen by any road puts the layout back to
  // docked side: one state (use-browser-fullscreen.ts). Only while the layout
  // is the full screen. The hook calls the latest of these.
  const leftWholeScreen = () => {
    if (layoutMode === "black") switchLayout("docked-side");
  };
  const { enter: enterWholeScreen, leave: leaveWholeScreen } =
    useBrowserFullscreen(leftWholeScreen);
  const chooseLayout = useCallback(
    (mode: LabelLayoutMode) => {
      switchLayout(mode);
      if (mode === "black") {
        // Inside the click that chose it: the gesture the browser asks for. A
        // refused request goes back to docked side; a browser with no
        // Fullscreen API keeps the black layer.
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

  // A mode change remounts the `<video>` at zero. Put the new element where the
  // clock says the film was: `seekTo` before its metadata is in sets the
  // element's default start position, which it takes up when the metadata
  // lands. Not on mount.
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

  // Re-renders only when the video crosses into another row; a tick of the
  // clock only scans the spans.
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

  // The current point: the playing one, else `restPointId`. The one point that
  // is unfolded, on the court and under Enter.
  const currentPointId = playingPointId ?? restPointId;
  // Whatever the video plays into is where the current point rests next.
  // Adjusted during render, not in an effect: the fallback must never be a
  // render behind the point it stands in for.
  if (playingPointId !== null && playingPointId !== restPointId) {
    setRestPointId(playingPointId);
  }

  // Ticking the current point folds its shot rows until the labeller clicks its
  // row or unticks it, or another point becomes current.
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

  // A row click makes its point current, seeks to its first stroke and holds
  // the rail, or re-follows when the point is the one already playing.
  function togglePoint(pointId: string) {
    setPlacement(NO_PLACEMENT);
    setRestPointId(pointId);
    setFoldedPointId(null);
    if (pointId === playingPointId) followPlayback();
    else holdPoint(pointId);
    seekToPointStart(points.find((p) => p.id === pointId));
  }

  // Selecting a stroke starts an edit: it holds the rail and seeks the video to
  // the stroke; playback carries on as it was.
  function selectShot(shotId: string, target?: PlacementTarget) {
    // Already selected: a position cell switches the court's end and nothing
    // else — the film stays where the labeller scrubbed it.
    if (target && shotId === placement.shotId) {
      const shot = findShot(points, shotId);
      setPlacement(
        setPlacementTarget(placement, target, shot?.contactY ?? null),
      );
      return;
    }
    const owner = pointOfShot(points, shotId);
    if (owner) holdPoint(owner.id);
    // A draft row cannot be placed or edited until its insert lands; it is
    // selected for placement then (see `addShot`).
    if (shotId.startsWith(PENDING_SHOT_PREFIX)) return;
    const shot = findShot(points, shotId);
    // A position cell names its end: the court opens on that end's half.
    const start = placementOf(points, shotId);
    setPlacement(
      target
        ? setPlacementTarget(start, target, shot?.contactY ?? null)
        : start,
    );
    if (shot?.videoTime != null) player.current?.seekTo(shot.videoTime);
  }

  // An editor opening on a point row's own cells is focus landing in a form
  // control inside that row; the row's click handler ignores cell clicks, so
  // this is where that edit holds the rail.
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
          // A winner pick lets the ending follow the rows on the server.
          return applyEndingSync(
            { ...point, status: result.status },
            result.point,
          );
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
   * One shot write, optimistic: the labeller's own (`patchShot`) or a follower
   * of one. `rows` is what the write reads the stroke and its point from.
   * Answers the stroke's point with the patch applied once the write has saved,
   * and null when it did not. "How it ended" follows the shot rows on the
   * server, in the same call: its `point` lands on the owning row here, as
   * do the ghost a serve relabelled in put back (`restoredGhostId`) and the
   * strokes a rally ball marked out took with it (`removedAfter`).
   */
  const writeShot = useCallback(
    async (
      rows: readonly LabelPoint[],
      shotId: string,
      patch: LabelShotPatch,
    ): Promise<LabelPoint | null> => {
      const before = findShot(rows, shotId);
      if (!before || !onSaveShot) return null;
      // A draft row has no id the server knows yet; its add is still in
      // flight, and the saved row replaces it when that lands.
      if (shotId.startsWith(PENDING_SHOT_PREFIX)) return null;
      // A let on a stroke that is not a serve: refused before any optimistic
      // change or request, on the same save line a server `{ error }` uses.
      const plan = planShotWrite(before, patch);
      if ("error" in plan) {
        dispatchSave({ type: "start" });
        dispatchSave({ type: "failure", message: plan.error });
        return null;
      }
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
      const removed = result.removedAfter;
      const reason = deadBallReason(plan.row.stroke);
      setPoints((current) => {
        const saved = updateShot(current, shotId, false, (shot) => ({
          ...shot,
          status: result.status,
        }));
        // The owning row as it stands now, not as it was when the write
        // went out: a split's draft point may have been replaced by the
        // saved one in the meantime, and the answer lands on that.
        const owner = pointOfShot(current, shotId);
        const synced = owner
          ? replacePoint(saved, owner.id, (p) =>
              applyEndingSync(
                removed
                  ? { ...p, shots: applyShotsRemoved(p.shots, removed, reason) }
                  : p,
                result.point,
              ),
            )
          : saved;
        const freed = result.restoredGhostId;
        return freed
          ? replaceShot(synced, freed, (s) =>
              applySiteRemovalRestore(s, new Date().toISOString()),
            )
          : synced;
      });
      // A stroke that went with the ball is no longer one to place.
      if (removed) {
        setPlacement((current) =>
          removed.some((r) => r.id === current.shotId) ? NO_PLACEMENT : current,
        );
      }
      dispatchSave({ type: "success", at: Date.now() });
      // The point the followers are planned from: the rows the write read,
      // with the patch and the answer applied.
      const owner = pointOfShot(rows, shotId);
      if (!owner) return null;
      const saved = change([owner])[0] ?? null;
      return saved && removed
        ? { ...saved, shots: applyShotsRemoved(saved.shots, removed, reason) }
        : saved;
    },
    [onSaveShot],
  );

  /**
   * The labeller's edit of one stroke and, once it has saved, the volley link
   * (volley-link.ts): the other end goes out as a shot write of its own through
   * `writeShot`. A follower's write never plans followers of its own.
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
        ghosts: drawsGhosts(marks),
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

  /** The revert of a point delete or restore: its two status columns. */
  const putBackPointStatus = (before: LabelPoint) => (rows: LabelPoint[]) =>
    replacePoint(rows, before.id, (p) => ({
      ...p,
      status: before.status,
      statusBeforeDelete: before.statusBeforeDelete,
    }));

  /** A draft row's id until its insert lands. */
  function nextTempId(prefix: string) {
    pendingIds.current += 1;
    return `${prefix}${pendingIds.current}`;
  }

  /** Seek the film to the point's first live timed stroke, when it has one. */
  function seekToPointStart(point: LabelPoint | undefined) {
    const first = point?.shots.find(
      (shot) => shot.status !== "deleted" && shot.videoTime !== null,
    );
    if (first?.videoTime != null) player.current?.seekTo(first.videoTime);
  }

  /**
   * The server's answer about a stroke's point once a stroke changed: its
   * ending as the rows now say (`result.point`), onto the owning row.
   */
  const settlePointOf =
    (shotId: string) =>
    (rows: LabelPoint[], result: { point?: LabelPointEndingSynced }) => {
      const owner = pointOfShot(rows, shotId);
      return owner
        ? replacePoint(rows, owner.id, (p) => applyEndingSync(p, result.point))
        : rows;
    };

  function deleteShot(shotId: string, reason: LabelDeleteReason) {
    const before = findShot(points, shotId);
    if (!before || !operations) return;
    if (placement.shotId === shotId) setPlacement(NO_PLACEMENT);
    const settlePoint = settlePointOf(shotId);
    void runOperation(
      (rows) => replaceShot(rows, shotId, (s) => applyShotDelete(s, reason)),
      () => operations.deleteShot(shotId, reason),
      settlePoint,
      putBackShot(shotId, before),
    );
  }

  function restoreShot(shotId: string) {
    const before = findShot(points, shotId);
    if (!before || !operations) return;
    const settlePoint = settlePointOf(shotId);
    void runOperation(
      (rows) => replaceShot(rows, shotId, applyShotRestore),
      () => operations.restoreShot(shotId),
      (rows, result) =>
        settlePoint(
          replaceShot(rows, shotId, (s) => ({ ...s, status: result.status })),
          result,
        ),
      putBackShot(shotId, before),
    );
  }

  /** The revert of a many-stroke operation: each row as it was read. */
  const putBackShots =
    (pointId: string, before: readonly LabelShot[]) => (rows: LabelPoint[]) => {
      const byId = new Map(before.map((shot) => [shot.id, shot]));
      return replacePoint(rows, pointId, (p) => ({
        ...p,
        shots: p.shots.map((shot) => byId.get(shot.id) ?? shot),
      }));
    };

  /**
   * The hint line's answers under a rally ball (or second serve) marked out:
   * every live stroke after it removed as hit after the point ended
   * (`deadBallReason` — after a double fault, or after the point),
   * and a removal's tombstones put back — one call each, the point's ending
   * settled in it. The server's rows are the last word over the optimistic
   * ones (`applyShotsRemoved` / `applyShotsRestored`).
   */
  function removeShotsAfter(pointId: string, shotId: string) {
    const point = points.find((p) => p.id === pointId);
    if (!point || !operations) return;
    // A draft point's insert is still in flight: its rows settle by the id
    // the server gives it, which this call could not name.
    if (pointId.startsWith(PENDING_POINT_PREFIX)) return;
    const after = liveShotsAfter(point.shots, shotId, drawsGhosts(marks));
    if (after.length === 0) return;
    const ids = new Set(after.map((shot) => shot.id));
    const reason = deadBallReason(
      point.shots.find((shot) => shot.id === shotId)?.stroke,
    );
    if (placement.shotId !== null && ids.has(placement.shotId)) {
      setPlacement(NO_PLACEMENT);
    }
    void runOperation(
      (rows) =>
        replacePoint(rows, pointId, (p) => ({
          ...p,
          shots: p.shots.map((s) =>
            ids.has(s.id) ? applyShotDelete(s, reason) : s,
          ),
        })),
      () => operations.removeShotsAfter(shotId),
      (rows, result) =>
        replacePoint(rows, pointId, (p) =>
          applyEndingSync(
            { ...p, shots: applyShotsRemoved(p.shots, result.removed, reason) },
            result.point,
          ),
        ),
      putBackShots(pointId, after),
    );
  }

  function restoreShots(pointId: string, shotIds: string[]) {
    const point = points.find((p) => p.id === pointId);
    if (!point || !operations) return;
    if (pointId.startsWith(PENDING_POINT_PREFIX)) return;
    const before = point.shots.filter(
      (shot) => shot.status === "deleted" && shotIds.includes(shot.id),
    );
    if (before.length === 0) return;
    const ids = new Set(before.map((shot) => shot.id));
    void runOperation(
      (rows) =>
        replacePoint(rows, pointId, (p) => ({
          ...p,
          shots: p.shots.map((s) => (ids.has(s.id) ? applyShotRestore(s) : s)),
        })),
      () => operations.restoreShots([...ids]),
      (rows, result) =>
        replacePoint(rows, pointId, (p) =>
          applyEndingSync(
            { ...p, shots: applyShotsRestored(p.shots, result.restored) },
            result.point,
          ),
        ),
      putBackShots(pointId, before),
    );
  }

  /**
   * Put a site-removed stroke back: sets `siteRemovalRestoredAt`, and takes
   * the point's ending as the server re-read it off the rally.
   */
  function restoreSiteRemoval(shotId: string) {
    const before = findShot(points, shotId);
    if (!before || !operations) return;
    const at = new Date().toISOString();
    const settlePoint = settlePointOf(shotId);
    void runOperation(
      (rows) =>
        replaceShot(rows, shotId, (s) => applySiteRemovalRestore(s, at)),
      () => operations.restoreSiteRemoval(shotId),
      (rows, result) =>
        settlePoint(
          replaceShot(rows, shotId, (s) => ({
            ...s,
            siteRemovalRestoredAt: result.siteRemovalRestoredAt,
          })),
          result,
        ),
      putBackShot(shotId, before),
    );
    closeGhost(shotId);
  }

  /** Dismiss a suggestion: its key joins the point's `dismissed`. */
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
   * Add a point before or after `anchorPointId`: a draft is drawn at once with
   * every later point renumbered (`applyInsertedPoint`), then replaced by the
   * saved row or withdrawn. The new point is held open and brought into view.
   */
  function insertPoint(
    anchorPointId: string,
    position: InsertPosition = "before",
  ) {
    if (!operations) return;
    const plan = planInsertedPoint(points, anchorPointId, position);
    if ("error" in plan) return refuse(plan.error);
    const tempId = nextTempId(PENDING_POINT_PREFIX);
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
   * A planned game shift or pull, optimistic: the moved rows take their new
   * game and server, and a moved point whose players switch takes its flipped
   * winner, ended by and hitters too (`applyShotSwaps`). The action's rows
   * are the last word.
   */
  function runGameShift(
    plan: { writes: GameShiftWrite[]; shots: ShotSwapWrite[] },
    call: () => Promise<LabelGameShiftResult>,
  ) {
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
      call,
      (rows, result) =>
        applyShotSwaps(
          applyGameShift(revert(rows), result.writes),
          result.shots,
        ),
      revert,
    );
  }

  /**
   * Move the rows left over past a game's end into the next game, and on down
   * the match (`game-shift.ts`).
   */
  function shiftGameOverflow(fromPointId: string) {
    if (!operations) return;
    const plan = planGameShift(points, session.adScoring, fromPointId);
    if ("error" in plan) return refuse(plan.error);
    runGameShift(plan, () =>
      operations.shiftGameOverflow(session.id, fromPointId),
    );
  }

  /**
   * The mirror of `shiftGameOverflow`: a game left unfinished pulls the next
   * game's first rows in until it is decided (`planGamePull`). A plan that says
   * the game is more likely missing a point writes nothing and says so
   * (`GAME_PULL_ADD_POINT`); the slot offers "Add point" for that.
   */
  function pullGamePoints(gameKey: string) {
    if (!operations) return;
    const plan = planGamePull(points, gameKey, session.adScoring);
    if ("error" in plan) return refuse(plan.error);
    if ("kind" in plan) return refuse(GAME_PULL_ADD_POINT);
    runGameShift(plan, () => operations.pullGamePoints(session.id, gameKey));
  }

  /**
   * Split a point at one of its shots (`point-split.ts`): that shot and every
   * later one move to a draft point right below (`applyPointSplit`). The
   * server answers with both halves' endings as their rows derive them
   * (`settlePointSplit`); then the new point is made current and held.
   */
  function splitPoint(pointId: string, shotId: string) {
    const anchor = points.find((point) => point.id === pointId);
    if (!anchor || !operations) return;
    // A draft point cannot be split until its own insert lands.
    if (pointId.startsWith(PENDING_POINT_PREFIX)) return;
    const plan = planPointSplit(points, pointId, shotId);
    if ("error" in plan) return refuse(plan.error);
    const tempId = nextTempId(PENDING_POINT_PREFIX);
    const draft = draftSplitPoint(plan.write.insert, tempId);
    void runOperation<PointSplitSaved>(
      (rows) => applyPointSplit(rows, pointId, draft, plan.write),
      () => operations.splitPoint(pointId, shotId),
      (rows, result) => settlePointSplit(rows, tempId, result),
      (rows) => withdrawPointSplit(rows, anchor, tempId),
    ).then((result) => {
      if (!result) return;
      setRestPointId(result.point.id);
      holdPoint(result.point.id);
      jumpToPointId.current = result.point.id;
    });
  }

  /**
   * Combine a point with its neighbour above or below in the same game
   * (`point-combine.ts`): the later point's shots join the earlier and the
   * later row becomes an empty tombstone. The server answers with the kept
   * point's ending as its joined rows derive it (`settlePointCombine`).
   */
  function combinePoints(pointId: string, direction: CombineDirection) {
    if (!operations) return;
    if (pointId.startsWith(PENDING_POINT_PREFIX)) return;
    const plan = planPointCombine(points, pointId, direction);
    if ("error" in plan) return refuse(plan.error);
    const kept = points.find((point) => point.id === plan.write.keptId);
    const removed = points.find((point) => point.id === plan.write.removedId);
    if (!kept || !removed) return;
    void runOperation<PointCombineSaved>(
      (rows) => applyPointCombine(rows, plan.write),
      () => operations.combinePoints(pointId, direction),
      (rows, result) => settlePointCombine(rows, result),
      (rows) => withdrawPointCombine(rows, kept, removed),
    ).then((saved) => {
      if (!saved) return;
      if (currentPointId === removed.id) setRestPointId(kept.id);
    });
  }

  /** Switch one point's players by hand (`planPlayerSwitch`). */
  function switchPlayers(pointId: string) {
    const before = points.find((p) => p.id === pointId);
    if (!before || !operations) return;
    if (pointId.startsWith(PENDING_POINT_PREFIX)) return;
    const plan = planPlayerSwitch(before);
    if ("error" in plan) return refuse(plan.error);
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

  /** One of the score banner's two writes, on `label_sessions` only. */
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
   * "Mark complete" (after its confirm) and "Reopen": `label_sessions.status`
   * alone. Not optimistic — the console flips read-only or editable once the
   * server has said so.
   */
  async function setSessionStatus(next: LabelSession["status"]) {
    const write =
      next === "complete"
        ? operations?.completeSession
        : operations?.reopenSession;
    if (!write || statusSaving) return;
    setStatusSaving(true);
    dispatchSave({ type: "start" });
    const result = await settle(write(session.id));
    setStatusSaving(false);
    if ("error" in result) {
      dispatchSave({ type: "failure", message: result.error });
      return;
    }
    if (result.status === "complete") setPlacement(NO_PLACEMENT);
    setStatus(result.status);
    dispatchSave({ type: "success", at: Date.now() });
  }

  /** "Mark complete": the confirm, listing what is still open. */
  function askComplete() {
    setConfirm({
      kind: "complete-session",
      warnings: completeWarnings({
        points,
        adScoring: session.adScoring,
        marks: liveMarks,
        finalScore: sessionFields.finalScore,
        videoEndsEarly: sessionFields.videoEndsEarly,
        matchScore: session.matchScore,
        games: scores.games,
      }),
    });
  }

  /**
   * "Find the gap": navigation only. The mismatching set's first point (or,
   * with none, the last labelled point) is made current, the rail held and the
   * video seeks to it; the row is then brought to the rail's top
   * (`jumpToPointId`).
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
  // The follow scroll moves nothing while held, so this jump is made here once
  // the hold has rendered the row: its top `REFOLLOW_JUMP_INSET_PX` under the
  // rail's. A ref, not state: the request is consumed by the commit after the
  // hold and must not render anything itself.
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
      putBackPointStatus(before),
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
      putBackPointStatus(before),
    );
  }

  function addShot(pointId: string, afterShotId: string | null) {
    const point = points.find((p) => p.id === pointId);
    if (!point || !operations) return;
    // A draft point cannot take a stroke until its own insert lands.
    if (pointId.startsWith(PENDING_POINT_PREFIX)) return;
    const plan = planAddedShot(point, afterShotId);
    if ("error" in plan) return refuse(plan.error);
    const tempId = nextTempId(PENDING_SHOT_PREFIX);
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
      unclear: [],
      siteRemoval: null,
      siteRemovalRestoredAt: null,
      seed: null,
    };
    // The new stroke is the one a court click places next — once it is saved.
    // Selecting the draft would send its temporary id to the server on the
    // first court click, which refuses it.
    const selectedBefore = placement.shotId;
    void runOperation<{ shot: LabelShot; point?: LabelPointEndingSynced }>(
      (rows) => insertShot(rows, pointId, draft),
      () => operations.addShot(pointId, afterShotId),
      (rows, result) =>
        replacePoint(
          insertShot(removeShot(rows, tempId), pointId, result.shot),
          pointId,
          (p) => applyEndingSync(p, result.point),
        ),
      (rows) => removeShot(rows, tempId),
    ).then((result) => {
      // Select the saved row, unless the labeller picked something else
      // while the add was in flight.
      if (!result) return;
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
   * Move one point (`planPointMove`): game, server and, if needed, players.
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
    if ("error" in plan) return refuse(plan.error);
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
   * A whole game's server or type; the action's rows are the last word. A
   * point whose players switch with the new server takes its flipped winner,
   * ended by and hitters too (`applyShotSwaps`), as a move does.
   */
  function runGameOperation(
    plan: PlannedGameWrites,
    call: () => Promise<LabelGameWriteResult>,
  ) {
    if ("error" in plan) return refuse(plan.error);
    const written = new Set(plan.writes.map((write) => write.id));
    const before = new Map(
      points.filter((p) => written.has(p.id)).map((p) => [p.id, p]),
    );
    const shotsBefore = shotSwapsOf(
      [...before.values()].flatMap((point) => point.shots),
    );
    void runOperation(
      (rows) => applyShotSwaps(applyGameWrites(rows, plan.writes), plan.shots),
      call,
      (rows, result) =>
        applyShotSwaps(
          takeFields(
            rows,
            new Map(result.points.map((p) => [p.id, p])),
            GAME_WRITE_FIELDS,
          ),
          result.shots,
        ),
      (rows) =>
        applyShotSwaps(
          takeFields(rows, before, GAME_WRITE_FIELDS),
          shotsBefore,
        ),
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
  function resetShot(shotId: string): Promise<unknown> {
    const before = findShot(points, shotId);
    if (!before || !operations) return Promise.resolve(null);
    // A reset can move the stroke's time, so it re-sorts like a time edit.
    const settlePoint = settlePointOf(shotId);
    return runOperation(
      (rows) => updateShot(rows, shotId, true, applyShotReset),
      () => operations.resetShot(shotId),
      (rows, result) =>
        settlePoint(
          replaceShot(rows, shotId, (s) => ({ ...s, status: result.status })),
          result,
        ),
      (rows) => updateShot(rows, shotId, true, () => before),
    );
  }

  /**
   * The point's own fields back to the seed, and each stroke's hitter back to
   * its seeded one (`reset.ts`): a point switched after a swap must not keep
   * contradicting its rows.
   */
  async function resetPoint(pointId: string) {
    const before = points.find((p) => p.id === pointId);
    if (!before || !operations) return;
    const scope = pointResetScope(before, sharesVendorRally(before, points));
    if (!scope) return;
    // The edited strokes one after another — each re-reads its point's ending
    // — then the point's own fields, whose seed has the last word.
    for (const shotId of scope.shotIds) {
      if ((await resetShot(shotId)) === null) return;
    }
    if (!scope.fields) return;
    // The rollback's hitters: the strokes just reset already sit on their
    // seed, so only the others go back if the point's own write fails.
    const shotsBefore = shotSwapsOf(
      before.shots.filter((shot) => !scope.shotIds.includes(shot.id)),
    );
    void runOperation(
      (rows) => replacePoint(rows, pointId, applyPointReset),
      () => operations.resetPoint(pointId),
      (rows, result) =>
        applyShotSwaps(
          replacePoint(rows, pointId, (p) => ({ ...p, status: result.status })),
          result.shots,
        ),
      (rows) =>
        applyShotSwaps(
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
          shotsBefore,
        ),
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
        void resetPoint(question.pointId);
        return;
      case "complete-session":
        // An edit made while the confirm was open would be refused.
        if (saveStatus.pending > 0) {
          return refuse(
            "Wait for your changes to save, then mark it complete.",
          );
        }
        void setSessionStatus("complete");
        return;
    }
  }

  const operable = editable && operations !== undefined;

  // The rail's rows are memoised, so every callback they receive keeps one
  // identity for the console's life (`useLatestHandlers`) and runs whatever
  // this render defined.
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
      const scope = point
        ? pointResetScope(point, sharesVendorRally(point, points))
        : null;
      if (!point || !scope) return;
      setConfirm({
        kind: "reset-point",
        pointId,
        pointNumber: point.pointIndex + 1,
        fields: scope.fields,
        shots: scope.shotIds.length,
      });
    },
  });
  const railHandlers = useLatestHandlers({
    togglePoint,
    selectShot,
    holdOnEditorFocus,
    patchPoint,
    patchShot,
    removeShotsAfter,
    restoreShots,
    setGameServer,
    setGameType,
    findGap,
    pullGamePoints,
    addPointAfter: (pointId: string) => insertPoint(pointId, "after"),
    fixEnteredScore: (sets: number[][]) =>
      void updateSessionFields({ final_score: sets }),
    clearEnteredScore: () => void updateSessionFields({ final_score: null }),
    videoEndsEarly: () => void updateSessionFields({ video_ends_early: true }),
  });

  // Enter marks the open point checked; Space and ← / → drive the video; ]
  // and [ go to the next and previous open flag. Never from inside a control,
  // where those keys already mean something.
  const checkOpenPoint = useRef<() => void>(() => {});
  // `]` and `[`: the next and previous open flag, as the header's flag does.
  const stepToFlag = useRef<(direction: 1 | -1) => void>(() => {});
  const openMarks = useMemo(
    () => (liveMarks ? openFlags(points, liveMarks) : []),
    [points, liveMarks],
  );
  useEffect(() => {
    checkOpenPoint.current = () => {
      if (!operable || confirm || !expanded || expanded.checkedAt) return;
      setChecked(expanded.id, true);
    };
    stepToFlag.current = (direction) => {
      if (confirm) return;
      const flag = stepFlag(openMarks, points, currentPointId, direction);
      if (flag) findGap(flag.pointId);
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
          key !== "ArrowRight" &&
          key !== "[" &&
          key !== "]") ||
        event.defaultPrevented ||
        event.metaKey ||
        event.ctrlKey ||
        // [ and ] take Option or Shift on some layouts (German, Nordic).
        ((event.altKey || event.shiftKey) && key !== "[" && key !== "]")
      ) {
        return;
      }
      const target = event.target as Element | null;
      if (target?.closest?.(KEY_OWNER_SELECTOR)) return;
      event.preventDefault();
      if (key === "Enter") checkOpenPoint.current();
      else if (key === "]" || key === "[") {
        stepToFlag.current(key === "]" ? 1 : -1);
      } else if (key === " ") player.current?.togglePlay();
      else player.current?.step(key === "ArrowLeft" ? -1 : 1);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // The follow scroll, on the rail's scroller: the page itself does not scroll.
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

  // The way back while held and a point is playing; nothing in follow mode or
  // in dead time.
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

  // The same player, court panel and rail in both layouts, every callback
  // unchanged.
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
      onExit={fullScreen ? () => chooseLayout("docked-side") : undefined}
      onFullScreen={fullScreen ? undefined : () => chooseLayout("black")}
      scrollerRef={scrollerRef}
      onFocusCapture={railHandlers.holdOnEditorFocus}
      affordance={affordance}
      onFollow={followPlayback}
      points={points}
      adScoring={session.adScoring}
      playOnLets={session.playOnLets}
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
      onRemoveShotsAfter={operable ? railHandlers.removeShotsAfter : undefined}
      onRestoreShots={operable ? railHandlers.restoreShots : undefined}
      onSetGameServer={operable ? railHandlers.setGameServer : undefined}
      onSetGameType={operable ? railHandlers.setGameType : undefined}
      onPullGame={operable ? railHandlers.pullGamePoints : undefined}
      onAddPoint={operable ? railHandlers.addPointAfter : undefined}
      onClearEnteredScore={
        operable ? railHandlers.clearEnteredScore : undefined
      }
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
      onGoToPoint={railHandlers.findGap}
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
      {/* Not full screen: the layer covers the whole page, and a header
          drawn under it is a row of Tab stops nobody can see. */}
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
              {status === "complete" ? (
                <span data-session-complete="">· Complete</span>
              ) : null}
              <span aria-hidden="true">·</span>
              <span className="mono text-[11px] text-[var(--ink-500)]">
                derivation {session.derivationVersion}
              </span>
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-5">
            <LabelSaveStatus status={saveStatus} />
            {operable && operations?.completeSession ? (
              <button
                type="button"
                data-mark-complete=""
                className={advButton("outline", "sm")}
                // Every edit must have landed first: one still in flight
                // would be refused once the session is complete, and its
                // value put back.
                disabled={saveStatus.pending > 0 || statusSaving}
                onClick={askComplete}
              >
                Mark complete
              </button>
            ) : null}
            {status === "complete" && operations?.reopenSession ? (
              <button
                type="button"
                data-reopen-session=""
                className={advButton("outline", "sm")}
                disabled={statusSaving}
                onClick={() => void setSessionStatus("labelling")}
              >
                Reopen
              </button>
            ) : null}
            <LabelLayoutControl mode={layoutMode} onChange={chooseLayout} />
            {headerAction}
          </div>
        </div>
      )}

      {/* The full-screen layer is a child of this root so `--film-t`
          reaches the rail's rows. */}
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
 * `handlers` as functions that keep one identity for the component's life and
 * each run the handler of that name from the latest committed render, so a
 * memoised child never re-renders for a new closure and never calls a stale
 * one.
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

export interface LabelConsoleOperations {
  deleteShot: (
    shotId: string,
    reason: LabelDeleteReason,
  ) => Promise<LabelShotStatusResult>;
  restoreShot: (shotId: string) => Promise<LabelShotStatusResult>;
  /**
   * Every live stroke after `shotId` in its point, tombstoned as hit after
   * the point ended; and a removal's tombstones put back. `label_shots` and
   * the point's ending only.
   */
  removeShotsAfter: (shotId: string) => Promise<LabelShotsRemoveResult>;
  restoreShots: (shotIds: string[]) => Promise<LabelShotsRestoreResult>;
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
  /**
   * The point's own fields back to the seed, status `unchanged`, and its
   * strokes' hitters back to theirs.
   */
  resetPoint: (pointId: string) => Promise<LabelPointResetResult>;
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
  /** Writes only `site_removal_restored_at`. */
  restoreSiteRemoval: (
    shotId: string,
  ) => Promise<LabelSiteRemovalRestoreResult>;
  /** Appends the key to `label_points.dismissed`, the one column it writes. */
  dismissSuggestion: (
    pointId: string,
    key: string,
  ) => Promise<LabelDismissSuggestionResult>;
  /** Adds a point before or after `anchorPointId`; `label_points` only. */
  insertPoint: (
    sessionId: string,
    anchorPointId: string,
    position: InsertPosition,
  ) => Promise<LabelInsertPointResult>;
  /** Moves a game's leftover rows on. Returns the rows and flipped strokes. */
  shiftGameOverflow: (
    sessionId: string,
    fromPointId: string,
  ) => Promise<LabelGameShiftResult>;
  /** Pulls the next game's first rows into an unfinished game. Same answer. */
  pullGamePoints: (
    sessionId: string,
    gameKey: string,
  ) => Promise<LabelGameShiftResult>;
  /** Splits `pointId` at `shotId`. Returns the new row and the anchor. */
  splitPoint: (
    pointId: string,
    shotId: string,
  ) => Promise<LabelSplitPointResult>;
  /** Combines `pointId` with its neighbour `direction`. Returns both rows. */
  combinePoints: (
    pointId: string,
    direction: CombineDirection,
  ) => Promise<LabelCombinePointsResult>;
  /**
   * Switches `pointId`'s players; never `server`. Returns what was written.
   */
  switchPlayers: (pointId: string) => Promise<LabelPlayerSwitchResult>;
  /** Writes `final_score` and `video_ends_early` on `label_sessions` only. */
  updateSessionFields: (
    sessionId: string,
    patch: LabelSessionFieldsPatch,
  ) => Promise<LabelSessionFieldsResult>;
  /** `label_sessions.status` to `complete`. Absent: no "Mark complete". */
  completeSession?: (sessionId: string) => Promise<LabelSessionStatusResult>;
  /** A complete session back to `labelling`. Absent: no "Reopen". */
  reopenSession?: (sessionId: string) => Promise<LabelSessionStatusResult>;
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
 * Selecting a stroke for the court: the first click is its contact, on the half
 * its hitter stood in (`hitterHalf`). A stroke that has its contact and only
 * lacks its landing opens on the landing, on the half across the net.
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

/**
 * The point as the server left it once its ending followed the rows
 * (ending-session.ts): the ending, who ended it, the winner and the status
 * it implies. Unchanged when the write moved none of them.
 */
function applyEndingSync(
  point: LabelPoint,
  synced: LabelPointEndingSynced | undefined,
): LabelPoint {
  if (!synced) return point;
  return {
    ...point,
    ending: synced.ending,
    endedBy: synced.endedBy,
    winner: synced.winner,
    status: synced.status,
  };
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
