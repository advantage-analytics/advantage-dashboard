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
  liveShotsInOrder,
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
import {
  drawsGhosts,
  type ReviewItemId,
} from "@/lib/services/labels/marks-state";
import {
  advanceAfterAnswer,
  replayWindow,
  stepKeyOf,
} from "@/lib/services/labels/review-flow";
import { withLiveScoreMarks } from "@/lib/services/labels/score-marks";
import {
  nextReviewStop,
  openReviewItems,
  reviewStep,
  type ReviewAnswer,
  type ReviewStep,
} from "@/lib/services/labels/review-step";
import {
  applyPointDelete,
  applyPointMove,
  applyPointRestore,
  applyShotDelete,
  deadBallsAfterMiss,
  applyShotRestore,
  applyShotsRemoved,
  deadBallReason,
  applyShotsRestored,
  destinationServerIn,
  gameInSetOf,
  liveShotsAfter,
  moveNeedsServerSwitch,
  planAddedShot,
  planPointMove,
  type PlannedPointMove,
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
import {
  endingPatchForShotChange,
  SHOT_FIELDS_MOVING_ENDING,
} from "@/lib/services/labels/ending-derived";
import { planGameBoundary } from "@/lib/services/labels/game-boundary";
import {
  servedRightHitWrong,
  serversOffOrder,
  tiebreakServeOrders,
} from "@/lib/services/labels/tiebreak-serve";
import {
  planServeHitterFollow,
  type ServeHitterFollow,
} from "@/lib/services/labels/serve-hitter";
import { completeWarnings } from "@/lib/services/labels/session-status";
import type { LabelSessionStatusResult } from "@/lib/services/labels/session-status-session";
import { advButton } from "@/lib/ui/adv-button";
import { applySiteRemovalRestore } from "@/lib/services/labels/site-removal";
import type { LabelSiteRemovalRestoreResult } from "@/lib/services/labels/site-removal-session";
import {
  applyDismiss,
  suggestionState,
} from "@/lib/services/labels/suggestions";
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
  tiebreakHitterHalf,
  NO_PLACEMENT,
  estimatePatch,
  flipPlacement,
  hitterHalf,
  nextPlacement,
  setPlacementTarget,
  startPlacement,
  type PlacementState,
  type PlacementTarget,
} from "./court-placement";
import { LabelBlackRail } from "./label-black-rail";
import { strokeChangePatch } from "./label-black-shot-row";
import { LabelBlackView } from "./label-black-view";
import type { LabelConfirm } from "./label-confirm";
import { LabelConfirmDialog } from "./label-confirm-dialog";
import { LabelCourtPanel, isPlacing } from "./label-court-panel";
import type { PointInfo } from "./label-point-info";
import {
  NO_OPENED_COUNT,
  ReviewInlineBlock,
  inlineReviewAnchor,
  openedCount,
  stepCount,
  type OpenedCount,
} from "./label-review-inline";
import { runReviewAnswer, type ReviewWriteHandlers } from "./review-answer";
import { runReplay, type ReplayHandle } from "./review-replay";
import { labelFilmStops } from "./label-film-stops";
import {
  DEFAULT_LAYOUT_MODE,
  KEY_OWNER_SELECTOR,
  layoutAfterFullscreenRequest,
  type LabelLayoutMode,
} from "./label-layout";
import { sideNames } from "./label-format";
import { nowPlayingOf, nowPlayingReadout } from "./label-now-playing";
import {
  openFlags,
  scoreStop,
  slotStops,
  stepFlag,
  type FlagStop,
} from "@/lib/services/labels/flag-nav";
import {
  matchTiebreakSet,
  sessionScoreMismatch,
} from "@/lib/services/labels/set-scores";
import {
  planTiebreakFold,
  tiebreakFolds,
} from "@/lib/services/labels/tiebreak-fold";
import type { LabelRowOperations } from "./label-row-parts";
import { LabelSaveStatus } from "./label-save-status";
import { LabelDashboard } from "./label-dashboard";
import { PersonAvatar } from "@/components/ui/person-avatar";
import { ProgramCrest } from "@/components/dashboard/settings/teams/program-crest";
import { getInitials } from "@/lib/data/match-utils";
import type { LabelUploadInfo } from "@/lib/data/label-overview-server";
import type { LabelUndoResult } from "@/lib/services/labels/undo-session";
import type {
  LabelAddMissingShotsResult,
  MissingShotAdd,
} from "@/lib/services/labels/add-missing-shots";
import type {
  LabelOpenCounts,
  LabelOpenCountsResult,
} from "@/lib/services/labels/open-counts-session";
import { LabelVideoPlayer, type LabelVideoHandle } from "./label-video";
import { INITIAL_SAVE_STATUS, saveStatusReducer } from "./save-status";
import {
  createVideoClock,
  parsePlayingRowKey,
  playingRowKey,
} from "./video-clock";
import { useBrowserFullscreen } from "./use-browser-fullscreen";
import { isStrokeKey, strokeKeyChange } from "./stroke-keys";

/** Ids of rows drawn optimistically while their insert is in flight. */
const PENDING_SHOT_PREFIX = "pending-shot-";
/** How long the overview's jump waits for full screen to settle. */
const OPEN_JUMP_DELAY_MS = 450;
/**
 * What a step's landing lets go of when it holds focus (`landOnStep`: a flag
 * jump, the auto-advance after an answer): a text field, a select, an
 * editable region or a select editor, any of which would keep the stroke and
 * spin keys for itself after the jump.
 */
const JUMP_BLURS_SELECTOR =
  "input, textarea, select, [contenteditable='true'], [data-select-editor]";
/** A point row whose insert is still in flight (`insertPoint`), likewise. */
const PENDING_POINT_PREFIX = "pending-point-";

/**
 * The add-shot slot a flag jump landed on (`ReviewStep.target.slot`): the
 * point and the stroke the missing one follows. Nothing is written for it
 * until the labeller takes the step's "Add the shot" — the rail draws the
 * slot's row armed, and the court panel asks for it.
 */
interface ArmedSlot {
  pointId: string;
  afterShotId: string;
}

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
 *   → step points, ] / [ step the amber marks and ' / ; the grey ones. ↑ / ↓ walk the open point's
 *   strokes and ⌘ Enter checks the point, both from inside a stroke's row
 *   too. Escape lets go of the selected stroke, then folds the open point.
 *   ⌘Z is the header's Undo: the newest action rewound on the server. Space
 *   plays or pauses from anywhere but a text field, an open menu or a dialog.
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
  initialReviewMode = false,
  headerAction,
  upload = null,
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
  /** What the uploader entered, for the overview (label-overview-server.ts). */
  upload?: LabelUploadInfo | null;
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
  /** Start in review mode (`reviewMode`), as a flag jump would leave it. Specs only. */
  initialReviewMode?: boolean;
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
  // Every "Missing shot?" slot still open whose "Add shot" would write: what
  // "Add all missing shots" fills, in rail order.
  const missingShotAdds = useMemo<MissingShotAdd[]>(() => {
    if (!marks) return [];
    const byId = new Map(points.map((point) => [point.id, point]));
    return marks.suggestions.flatMap((s) => {
      if (s.kind !== "missing_shot") return [];
      const point = byId.get(s.pointId);
      if (!point || point.status === "deleted") return [];
      if (suggestionState(s, point) !== "open") return [];
      if ("error" in planAddedShot(point, s.afterShotId)) return [];
      return [{ pointId: s.pointId, afterShotId: s.afterShotId }];
    });
  }, [marks, points]);
  // The open counts the overview shows — flagged points, amber and grey —
  // saved on the session whenever they change, so the Labels list reads the
  // work left without building marks.
  const openCounts = useMemo(() => {
    if (!liveMarks) return null;
    const open = openFlags(points, liveMarks);
    const grey = open.filter((flag) => flag.data).length;
    return { amber: open.length - grey, grey };
  }, [points, liveMarks]);
  const recordOpenCounts = operations?.recordOpenCounts;
  const recordedCounts = useRef<string | null>(null);
  useEffect(() => {
    if (!openCounts || !recordOpenCounts) return;
    const key = `${openCounts.amber}/${openCounts.grey}`;
    if (recordedCounts.current === key) return;
    recordedCounts.current = key;
    // A cache: a failed save leaves the list a step behind, nothing more.
    void recordOpenCounts(session.id, openCounts).catch(() => {});
  }, [openCounts, recordOpenCounts, session.id]);
  // The two session fields the score chip writes, held beside the rows so an
  // answer re-evaluates the chip at once.
  const [sessionFields, setSessionFields] = useState<LabelSessionFields>({
    finalScore: session.finalScore,
    videoEndsEarly: session.videoEndsEarly,
  });
  // The deciding set the match record spells as a 10-point match tiebreak
  // (set-scores.ts) — never the labeller's own `final_score`, which is games
  // only. "Make it a match tiebreak" offers to fold it, and the shift and
  // pull slots leave its vendor-cut games alone.
  const matchTiebreakSetNumber = useMemo(
    () => matchTiebreakSet(session.matchScore, session.bestOf),
    [session.matchScore, session.bestOf],
  );
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
  const [armedSlot, setArmedSlot] = useState<ArmedSlot | null>(null);
  // Review mode: a flag jump (] [ ' ; or a header flag row, `findGap` with
  // `arm`) enters it, and while it is on the open point's review step is
  // asked inline in the rail (`ReviewInlineBlock`), an answer lands on the
  // next open item — the next flagged point's too — and the inline court is
  // the one placement surface. The labeller's own selection ends it: a row
  // or cell click, a point row, ↑ / ↓ (`selectShot`, `togglePoint`), and
  // nothing then advances away from what they chose. The next jump re-enters.
  const [reviewMode, setReviewMode] = useState(initialReviewMode);
  // A step's end-of-point replay while it runs (review-replay.ts). A ref:
  // nothing renders from it, and it is let go from event handlers.
  const replay = useRef<ReplayHandle | null>(null);
  function cancelReplay() {
    replay.current?.cancel();
    replay.current = null;
  }
  // The labeller answered, placed or jumped while the replay was still
  // running: stop the film where it is too, rather than let it play on into
  // the next point. A seek, a pause or a key of their own only lets the
  // replay go (`cancelReplay`).
  function stopReplay() {
    // A replay that already let itself go (a jump it read as a seek) still
    // started this film: while it plays on, stop it too.
    if (replay.current && player.current?.isPlaying()) player.current.pause();
    cancelReplay();
  }
  // The step an answer, a placement, an add or a dismiss made here was
  // about: once the rows have changed and the point asks something else,
  // the console lands on that (`advanceAfterAnswer`). Null until the next
  // such write — a refresh the labeller did not cause moves nothing.
  // `force`: land whatever the rows say next, even on the same step — a
  // stroke placed with no step about it (the one an answer added) is done
  // with, and the console moves on from it.
  const pendingAdvance = useRef<{
    pointId: string;
    key: string;
    force?: boolean;
  } | null>(null);
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
  const blackScrollerRef = useRef<HTMLDivElement | null>(null);
  // The root: the video writes the film's clock onto it (`--film-t`), so the
  // playing row's progress rule and the transport read one clock.
  const rootRef = useRef<HTMLDivElement | null>(null);
  const pendingIds = useRef(0);
  const [clock] = useState(() => createVideoClock(initialVideoTime));

  // The overview or full screen (label-layout.ts). Never stored: the full
  // screen is the browser's own, which a reload cannot re-enter without a
  // gesture, so the page always opens on the overview.
  const [layoutMode, setLayoutMode] = useState<LabelLayoutMode>(
    initialLayoutMode ?? DEFAULT_LAYOUT_MODE,
  );
  // A mode change remounts the `<video>`, which stops it: remember whether
  // the film was running so the new element can carry on.
  const resumeAfterLayout = useRef(false);
  /** The one way the layout changes, whoever asked. */
  // A view fades in only once the labeller has switched layouts — never the
  // one the page loaded with (`arrive`, label-black-view).
  const [layoutSwitched, setLayoutSwitched] = useState(false);
  const switchLayout = useCallback((mode: LabelLayoutMode) => {
    resumeAfterLayout.current = player.current?.isPlaying() ?? false;
    setLayoutMode(mode);
    setLayoutSwitched(true);
  }, []);
  // Leaving the browser's full screen by any road goes back to the overview:
  // one state (use-browser-fullscreen.ts). Only while the layout is the full
  // screen. The hook calls the latest of these.
  const homeMode: LabelLayoutMode = "overview";
  const leftWholeScreen = () => {
    if (layoutMode === "black") switchLayout(homeMode);
  };
  const { enter: enterWholeScreen, leave: leaveWholeScreen } =
    useBrowserFullscreen(leftWholeScreen);
  const chooseLayout = useCallback(
    (mode: LabelLayoutMode) => {
      switchLayout(mode);
      if (mode === "black") {
        // Inside the click that chose it: the gesture the browser asks for. A
        // refused request goes back to the overview; a browser with no
        // Fullscreen API keeps the black layer.
        void enterWholeScreen().then((outcome) => {
          const settled = layoutAfterFullscreenRequest(outcome);
          if (settled !== "black") switchLayout(homeMode);
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
    [switchLayout, enterWholeScreen, leaveWholeScreen, homeMode],
  );
  const fullScreen = layoutMode === "black";
  // The overview has no film, court or rail: nothing is labelled on it, and
  // the console's keys are not bound there.
  const overview = layoutMode === "overview";
  const overviewRef = useRef(overview);
  useEffect(() => {
    overviewRef.current = overview;
  });
  // A point the overview opened full screen on. The rail it scrolls is not
  // mounted until the layout has switched, so the jump waits for that.
  const openOnPointId = useRef<string | null>(null);
  const jumpAfterOpen = useRef<(pointId: string) => void>(() => {});
  useEffect(() => {
    const pointId = openOnPointId.current;
    if (!fullScreen || pointId === null) return;
    openOnPointId.current = null;
    // After the browser's own full-screen transition: the rail is measured
    // for the jump's scroll, and mid-transition it is still the wrong height.
    const timer = window.setTimeout(
      () => jumpAfterOpen.current(pointId),
      OPEN_JUMP_DELAY_MS,
    );
    return () => window.clearTimeout(timer);
  }, [fullScreen]);
  const scrollerRef = blackScrollerRef;

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
    cancelReplay();
    setReviewMode(false);
    setArmedSlot(null);
    setPlacement(NO_PLACEMENT);
    setRestPointId(pointId);
    setFoldedPointId(null);
    if (pointId === playingPointId) followPlayback();
    else holdPoint(pointId);
    seekToPointStart(points.find((p) => p.id === pointId));
  }

  // Selecting a stroke starts an edit: it holds the rail and seeks the video to
  // the stroke; playback carries on as it was.
  // `seek: false` is a step's landing with a replay to run: the replay's own
  // seek is the one that wins, so there is never a second. `review` is that
  // landing's too: every other selection is the labeller's own and ends
  // review mode.
  function selectShot(
    shotId: string,
    target?: PlacementTarget,
    { seek = true, review = false }: { seek?: boolean; review?: boolean } = {},
  ) {
    if (!review) setReviewMode(false);
    if (seek) cancelReplay();
    setArmedSlot(null);
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
    if (seek && shot?.videoTime != null) {
      player.current?.seekTo(shot.videoTime);
    }
  }

  // An editor opening on a point row's own cells is focus landing in a form
  // control inside that row; the row's click handler ignores cell clicks, so
  // this is where that edit holds the rail.
  // Stable, so the rail's memoised rows keep their props between renders.
  const exitReview = useCallback(() => setReviewMode(false), []);

  function holdOnEditorFocus(event: FocusEvent<HTMLDivElement>) {
    const target = event.target as Element;
    // A dropdown's trigger is a button (`SelectEditor`), not a form control.
    if (
      !target.closest(
        "input, select, textarea, [data-select-editor] button, [contenteditable='true']",
      )
    )
      return;
    if (!target.closest("[data-point-id]")) return;
    // An edit of the labeller's own in a row ends review mode — but not the
    // review block's own controls (its estimate box).
    if (!target.closest("[data-review-inline]")) setReviewMode(false);
    if (held) return;
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
      const patched = (current: readonly LabelPoint[]) =>
        updateShot(current, shotId, retime, (shot) =>
          applyLabelShotPatch(shot, patch),
        );
      // A rally ball marked out takes the stroke or two after it in the same
      // write (`deadBallsAfterMiss`, as the server reads it): they go at once
      // here too, so "Did the point end here?" never shows for a question
      // the write is already answering.
      const reason = deadBallReason(plan.row.stroke);
      const ownerBefore = pointOfShot(patched(rows), shotId);
      const dead = ownerBefore
        ? deadBallsAfterMiss(
            ownerBefore.shots,
            shotId,
            before,
            patch,
            drawsGhosts(marks),
          )
        : [];
      const deadIds = new Set(dead.map((shot) => shot.id));
      const change = (current: readonly LabelPoint[]) =>
        dead.length === 0 || !ownerBefore
          ? patched(current)
          : replacePoint(patched(current), ownerBefore.id, (p) => ({
              ...p,
              shots: p.shots.map((s) =>
                deadIds.has(s.id) ? applyShotDelete(s, reason) : s,
              ),
            }));
      // The strokes this write took optimistically that the server did not:
      // back as they were read.
      const putBackDead = (
        current: LabelPoint[],
        kept: ReadonlySet<string> = new Set(),
      ) => {
        const back = new Map(
          dead.filter((s) => !kept.has(s.id)).map((s) => [s.id, s]),
        );
        // On the owning row as it stands now: a split may have replaced
        // the draft point the stroke sat in since the write went out.
        const owner = pointOfShot(current, shotId);
        return back.size === 0 || !owner
          ? current
          : replacePoint(current, owner.id, (p) => ({
              ...p,
              shots: p.shots.map((s) => back.get(s.id) ?? s),
            }));
      };
      const undoEnding = (current: LabelPoint[]) =>
        ending.undo(current, pointOfShot(current, shotId)?.id);
      // The ending the server will settle in this same call, now.
      const ownerRead = pointOfShot(rows, shotId);
      const ending = endingFollow(
        SHOT_FIELDS_MOVING_ENDING.some((field) => field in patch)
          ? ownerRead
          : null,
        ownerRead ? change([ownerRead])[0] : null,
        drawsGhosts(marks),
      );
      setPoints((current) => ending.apply(change(current)));

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
          undoEnding(
            putBackDead(
              updateShot(current, shotId, retime, (shot) => ({
                ...applyLabelShotPatch(shot, undo),
                status: before.status,
              })),
            ),
          ),
        );
        dispatchSave({ type: "failure", message: result.error });
        return null;
      }
      const removed = result.removedAfter;
      const removedIds = new Set(removed?.map((r) => r.id));
      setPoints((current) => {
        // With no `point` answered the server settled nothing: the ending
        // taken ahead of it goes back.
        const saved = updateShot(
          putBackDead(result.point ? current : undoEnding(current), removedIds),
          shotId,
          false,
          (shot) => ({
            ...shot,
            status: result.status,
          }),
        );
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
    [onSaveShot, marks],
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

  // Undo: the server rewinds the newest action on its journal and answers
  // every row, which replace the console's own — an undone split or combine
  // moves strokes between points and renumbers the ones after. Not while a
  // write is in flight: its answer would land on rows that are gone. False
  // once the server has said nothing is left, until the next write.
  const [undoing, setUndoing] = useState(false);
  const [undoEmpty, setUndoEmpty] = useState(false);
  if (undoEmpty && saveStatus.pending > 0) setUndoEmpty(false);
  const canUndo =
    editable &&
    Boolean(operations?.undo) &&
    !undoing &&
    !undoEmpty &&
    !statusSaving &&
    !confirm &&
    saveStatus.pending === 0;
  async function undoLast() {
    if (!canUndo || !operations?.undo) return;
    setUndoing(true);
    dispatchSave({ type: "start" });
    const result = await settle(operations.undo(session.id));
    setUndoing(false);
    if ("error" in result) {
      dispatchSave({ type: "failure", message: result.error });
      return;
    }
    setPlacement(NO_PLACEMENT);
    setPoints(result.points);
    dispatchSave({ type: "success", at: Date.now() });
    // After the success above, which counts as a write settling.
    setUndoEmpty(result.undone === null || result.remaining === 0);
  }

  async function addAllMissingShots() {
    if (!operations?.addMissingShots || missingShotAdds.length === 0) return;
    dispatchSave({ type: "start" });
    const result = await settle(
      operations.addMissingShots(session.id, missingShotAdds),
    );
    if ("error" in result) {
      dispatchSave({ type: "failure", message: result.error });
      return;
    }
    setPlacement(NO_PLACEMENT);
    setPoints(result.points);
    if (result.added > 0) setUndoEmpty(false);
    if (result.failed > 0) {
      dispatchSave({
        type: "failure",
        message: `Added ${result.added}; ${result.failed} could not be added.`,
      });
      return;
    }
    dispatchSave({ type: "success", at: Date.now() });
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
    const gone = (rows: LabelPoint[]) =>
      replaceShot(rows, shotId, (s) => applyShotDelete(s, reason));
    const owner = pointOfShot(points, shotId);
    const ending = endingFollow(
      owner,
      owner ? gone([owner])[0] : null,
      drawsGhosts(marks),
    );
    void runOperation(
      (rows) => ending.apply(gone(rows)),
      () => operations.deleteShot(shotId, reason),
      (rows, result) =>
        settlePoint(result.point ? rows : ending.undo(rows), result),
      (rows) => ending.undo(putBackShot(shotId, before)(rows)),
    );
  }

  function restoreShot(shotId: string) {
    const before = findShot(points, shotId);
    if (!before || !operations) return;
    const settlePoint = settlePointOf(shotId);
    const back = (rows: LabelPoint[]) =>
      replaceShot(rows, shotId, applyShotRestore);
    const owner = pointOfShot(points, shotId);
    const ending = endingFollow(
      owner,
      owner ? back([owner])[0] : null,
      drawsGhosts(marks),
    );
    void runOperation(
      (rows) => ending.apply(back(rows)),
      () => operations.restoreShot(shotId),
      (rows, result) =>
        settlePoint(
          replaceShot(result.point ? rows : ending.undo(rows), shotId, (s) => ({
            ...s,
            status: result.status,
          })),
          result,
        ),
      (rows) => ending.undo(putBackShot(shotId, before)(rows)),
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
    const removeFrom = (p: LabelPoint): LabelPoint => ({
      ...p,
      shots: p.shots.map((s) =>
        ids.has(s.id) ? applyShotDelete(s, reason) : s,
      ),
    });
    const ending = endingFollow(point, removeFrom(point), drawsGhosts(marks));
    void runOperation(
      (rows) => ending.apply(replacePoint(rows, pointId, removeFrom)),
      () => operations.removeShotsAfter(shotId),
      (rows, result) =>
        replacePoint(result.point ? rows : ending.undo(rows), pointId, (p) =>
          applyEndingSync(
            { ...p, shots: applyShotsRemoved(p.shots, result.removed, reason) },
            result.point,
          ),
        ),
      (rows) => ending.undo(putBackShots(pointId, after)(rows)),
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
    // A dismiss on the open point may close its step: the next one lands.
    if (pointId === currentPointId) noteAnswered();
    void runOperation(
      (rows) => replacePoint(rows, pointId, (p) => applyDismiss(p, key)),
      () => operations.dismissSuggestion(pointId, key),
      // Merged, never replaced: an answer dismisses several keys at once, and
      // a reply that predates the others' writes would wipe their keys from
      // the rows until the next refresh (the question flickering back).
      (rows, result) =>
        replacePoint(rows, pointId, (p) => ({
          ...p,
          dismissed: [...new Set([...p.dismissed, ...result.dismissed])],
        })),
      // Refused: this key alone comes off; the others' writes stand.
      (rows) =>
        replacePoint(rows, pointId, (p) => ({
          ...p,
          dismissed: before.dismissed.includes(key)
            ? p.dismissed
            : p.dismissed.filter((k) => k !== key),
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
    const plan = planGameShift(
      points,
      session.adScoring,
      fromPointId,
      matchTiebreakSetNumber,
    );
    if ("error" in plan) return refuse(plan.error);
    runGameShift(plan, () =>
      operations.shiftGameOverflow(session.id, fromPointId),
    );
  }

  /**
   * The tiebreak at 6–6 (`tiebreak-fold.ts`): the game after it becomes a
   * tiebreak, the vendor's split games fold into it, and its serve order is
   * set — planned here on the rows as they stand, written by the server.
   */
  function foldTiebreak(setNumber: number) {
    if (!operations?.foldTiebreak) return;
    const fold = tiebreakFolds(
      points,
      session.adScoring,
      matchTiebreakSetNumber,
    ).find((f) => f.setNumber === setNumber);
    if (!fold) {
      return refuse(
        "That set is not at 6–6 before an ordinary game, and the entered score does not make it a match tiebreak.",
      );
    }
    const plan = planTiebreakFold(points, fold);
    if ("error" in plan) return refuse(plan.error);
    const fold_ = operations.foldTiebreak;
    runGameShift(plan, () => fold_(session.id, setNumber));
  }

  /**
   * The mirror of `shiftGameOverflow`: a game left unfinished pulls the next
   * game's first rows in until it is decided (`planGamePull`). A plan that says
   * the game is more likely missing a point writes nothing and says so
   * (`GAME_PULL_ADD_POINT`); the slot offers "Add point" for that.
   */
  function pullGamePoints(gameKey: string) {
    if (!operations) return;
    const plan = planGamePull(
      points,
      gameKey,
      session.adScoring,
      matchTiebreakSetNumber,
    );
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
    return runOperation(
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
        names,
      }),
    });
  }

  /**
   * Where a step lands (`ReviewStep.target`, review-step.ts), as a flag jump
   * and the auto-advance after an answer both arrive: a focused text field,
   * select or editable region is let go first, so the stroke and spin keys
   * work at once; a coordinate item selects its stroke with the court open
   * on the end it wants placed; a missing stroke arms its add-shot slot —
   * the rail's "Missing shot?" row, or the lone first serve's second serve
   * — with nothing selected and nothing written until the labeller takes
   * the step's "Add the shot"; a step with no target opens the point at its
   * first stroke. An end-of-point question (`step.replay`) plays the last
   * strokes through the last ball and pauses just after it, the court armed
   * on that ball's landing throughout, so one click answers; the replay's
   * seek is the only one made (`selectShot`'s is skipped).
   */
  function landOnStep(point: LabelPoint, step: ReviewStep | null) {
    stopReplay();
    const active = document.activeElement as HTMLElement | null;
    if (active?.closest?.(JUMP_BLURS_SELECTOR)) active.blur();
    const target = step?.target ?? null;
    const film =
      step?.replay && liveMarks
        ? replayWindow(point, step.replay, points, drawsGhosts(liveMarks))
        : null;
    if (target?.slot) {
      setArmedSlot({ pointId: point.id, afterShotId: target.slot.afterShotId });
      setPlacement(NO_PLACEMENT);
      const after = findShot(points, target.slot.afterShotId);
      if (after?.videoTime != null) player.current?.seekTo(after.videoTime);
    } else if (target?.shotId && target.place) {
      selectShot(target.shotId, target.place, {
        seek: film === null,
        review: true,
      });
    } else if (target?.shotId) {
      // Nothing to place (a winner pick, the game order): the film goes to
      // the stroke and the court stays as it is — selecting it would arm
      // the court for a click the question does not want.
      setArmedSlot(null);
      setPlacement(NO_PLACEMENT);
      const shot = findShot(points, target.shotId);
      if (film === null && shot?.videoTime != null) {
        player.current?.seekTo(shot.videoTime);
      }
    } else {
      // A step about no stroke (a winner pick with nothing to play back, the
      // game order): the stroke the last answer placed must not stay selected,
      // or the block would keep asking where it was hit.
      setArmedSlot(null);
      setPlacement(NO_PLACEMENT);
      if (film === null) seekToPointStart(point);
    }
    if (film && player.current) {
      const handle = player.current;
      replay.current = runReplay(film, {
        seekTo: (at) => handle.seekTo(at),
        play: () => handle.play(),
        pause: () => handle.pause(),
        clock,
      });
    }
  }

  /**
   * "Find the gap": navigation only. The mismatching set's first point (or,
   * with none, the last labelled point) is made current, the rail held and the
   * video seeks to it; the row is then brought to the rail's top
   * (`jumpToPointId`).
   *
   * `arm` is a flag jump's (`stepToFlag`, the header's flag rows): the point
   * also opens unfolded, and on a console that may write it lands on the
   * point's review step (`reviewStep`, through `landOnStep`) — the labeller
   * clicks the court or an answer once and the console moves on. With no
   * step the point opens as it would otherwise. Nothing else sets `arm` — a
   * row opened by a click, "Find the gap" or the overview's open-on-point
   * leaves the court and focus as they were.
   */
  const jumpToPointId = useRef<string | null>(null);
  function findGap(
    pointId: string | null,
    { arm = false }: { arm?: boolean } = {},
  ) {
    const live = points.filter((point) => point.status !== "deleted");
    const target = pointId ?? live[live.length - 1]?.id ?? null;
    if (target === null) return;
    const point = live.find((p) => p.id === target);
    stopReplay();
    setArmedSlot(null);
    setPlacement(NO_PLACEMENT);
    setRestPointId(target);
    holdPoint(target);
    if (arm) setFoldedPointId(null);
    pendingAdvance.current = null;
    // A flag jump enters review mode; any other way here leaves it.
    setReviewMode(Boolean(arm && editable && point && liveMarks));
    if (arm && editable && point && liveMarks) {
      landOnStep(
        point,
        reviewStep(point, liveMarks, points, names, drawsGhosts(liveMarks)),
      );
    } else {
      seekToPointStart(point);
    }
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
    if (top !== null) {
      scroller.scrollTo({
        top,
        behavior: reducedMotionNow() ? "auto" : "smooth",
      });
    }
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

  /**
   * A stroke added after `afterShotId` (or at the end), selected for
   * placement once it has saved. `follow` is what a review answer knows of it
   * beyond the add's plan (a second serve, by the server): written once it
   * has saved, those fields the add did not already give it.
   */
  function addShot(
    pointId: string,
    afterShotId: string | null,
    follow?: LabelShotPatch,
  ) {
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
      const rows = insertShot(points, pointId, result.shot);
      setPlacement((current) =>
        current.shotId === selectedBefore
          ? placementOf(rows, result.shot.id)
          : current,
      );
      const values = labelShotValues(result.shot);
      const rest = Object.fromEntries(
        Object.entries(follow ?? {}).filter(
          ([key, value]) => values[key as keyof typeof values] !== value,
        ),
      ) as LabelShotPatch;
      if (Object.keys(rest).length > 0) {
        void writeShot(rows, result.shot.id, rest);
      }
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
        gameInSet: gameInSetOf(points, to),
        server,
        swaps: moveSwapsPlayers(point, server)
          ? point.winner === null
            ? "shots"
            : "shots-and-winner"
          : null,
      });
      return;
    }
    void movePoint(pointId, to, false);
  }

  /**
   * Move one point (`planPointMove`): game, server and, if needed, players.
   */
  async function movePoint(
    pointId: string,
    to: LabelGame,
    switchServer: boolean,
  ): Promise<void> {
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
    await runOperation(
      (rows) => pointMoved(rows, pointId, plan),
      () => operations.movePoint(pointId, to, switchServer),
      (rows, result) => pointMoveSettled(rows, pointId, result),
      (rows) => pointMovePutBack(rows, before),
    );
  }

  /**
   * A game's header dragged to a new start (`game-boundary.ts`): the points
   * it passed move into the neighbouring game, one move each. Asks first only
   * when a moved point's players switch with its server; a point that only
   * changes game and server goes at once.
   */
  function requestMoveBoundary(game: LabelGame, beforePointId: string) {
    if (!operations) return;
    const plan = planGameBoundary(points, game, beforePointId);
    if ("error" in plan) return refuse(plan.error);
    const { to, pointIds } = plan.write;
    if (pointIds.length === 0) return;
    const server = destinationServerIn(points, pointIds[0], to);
    const swaps = pointIds.filter((id) => {
      const point = points.find((p) => p.id === id);
      return point ? moveSwapsPlayers(point, server) : false;
    }).length;
    if (swaps === 0 || server === null) return void moveBoundary(to, pointIds);
    setConfirm({
      kind: "move-boundary",
      to,
      gameInSet: gameInSetOf(points, to),
      pointIds,
      server,
      swaps,
    });
  }

  /**
   * The run's moves. Every point takes its new game at once — one at a time
   * would leave a game a point short between two writes, and the slots that
   * read the score would ask about a state the run is only passing through.
   * The writes then go in order; a refused one puts it and the rest back.
   * A tiebreak on either side of the boundary then has its serve order put
   * right.
   */
  async function moveBoundary(to: LabelGame, pointIds: readonly string[]) {
    if (!operations) return;
    if (pointIds.some((id) => id.startsWith(PENDING_POINT_PREFIX))) {
      return refuse("Wait for the new point to save, then move it.");
    }
    let rows: LabelPoint[] = points;
    const steps: {
      before: LabelPoint;
      plan: Extract<PlannedPointMove, { ok: true }>;
    }[] = [];
    for (const id of pointIds) {
      const before = rows.find((p) => p.id === id);
      if (!before) return;
      const plan = planPointMove(
        before,
        to,
        destinationServerIn(rows, id, to),
        true,
      );
      if ("error" in plan) return refuse(plan.error);
      steps.push({ before, plan });
      rows = pointMoved(rows, id, plan);
    }
    type Step = (typeof steps)[number];
    const moved = (current: LabelPoint[], { before, plan }: Step) =>
      pointMoved(current, before.id, plan);
    const putBack = (current: LabelPoint[], { before }: Step) =>
      pointMovePutBack(current, before);
    setPoints((current) => steps.reduce(moved, current));
    dispatchSave({ type: "start" });
    for (const [i, { before }] of steps.entries()) {
      const result = await settle(operations.movePoint(before.id, to, true));
      if ("error" in result) {
        setPoints((current) => steps.slice(i).reduce(putBack, current));
        dispatchSave({ type: "failure", message: result.error });
        return;
      }
      setPoints((current) => pointMoveSettled(current, before.id, result));
    }
    dispatchSave({ type: "success", at: Date.now() });
    // A tiebreak that gained or lost points has every turn behind them
    // shifted, and a move gives each point the game's one server: its order
    // is put right in the same gesture (`fixTiebreakServe`, which does
    // nothing for an ordinary game or a tiebreak still in order).
    const source = steps[0]?.before;
    const games: LabelGame[] = [to];
    if (source && source.setNumber !== null && source.gameNumber !== null) {
      games.push({
        setNumber: source.setNumber,
        gameNumber: source.gameNumber,
      });
    }
    for (const game of games) await fixTiebreakServe(game, rows);
  }

  /**
   * A whole game's server or type; the action's rows are the last word. A
   * point whose players switch with the new server takes its flipped winner,
   * ended by and hitters too (`applyShotSwaps`), as a move does.
   */
  function runGameOperation(
    plan: PlannedGameWrites,
    call: () => Promise<LabelGameWriteResult>,
    rows: readonly LabelPoint[] = points,
  ) {
    if ("error" in plan) return refuse(plan.error);
    const written = new Set(plan.writes.map((write) => write.id));
    const before = new Map(
      rows.filter((p) => written.has(p.id)).map((p) => [p.id, p]),
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

  /** `rows`: the rows to plan from, when an edit has only just landed on them. */
  function setGameServer(
    game: LabelGame,
    server: LabelSide,
    rows: readonly LabelPoint[] = points,
  ) {
    if (!operations) return;
    runGameOperation(
      planGameServer(rows, game, server),
      () => operations.setGameServer(session.id, game, server),
      rows,
    );
  }

  /**
   * The labeller's shot edit. A serve given to the other player asks first
   * whether the rest follows it (`planServeHitterFollow`): the point's other
   * rows, and the game's server. Every other edit is written at once.
   */
  function requestPatchShot(shotId: string, patch: LabelShotPatch) {
    // A draft stroke's add is still in flight: the server would switch the
    // saved rows and not it, so its edit goes alone.
    if (
      operations &&
      !shotId.startsWith(PENDING_SHOT_PREFIX) &&
      "hitter" in patch &&
      Object.keys(patch).length === 1
    ) {
      const follow = planServeHitterFollow(
        points,
        shotId,
        patch.hitter ?? null,
      );
      const point = follow && points.find((p) => p.id === follow.pointId);
      if (follow && point && !point.id.startsWith(PENDING_POINT_PREFIX)) {
        setConfirm({
          kind: "serve-hitter",
          shotId,
          pointNumber: point.pointIndex + 1,
          gameInSet: scores.points.get(point.id)?.gameInSet ?? null,
          follow,
        });
        return;
      }
    }
    void patchShot(shotId, patch);
  }

  /**
   * "Fix serve order" on a tiebreak (`tiebreak-serve.ts`): a point the order
   * already serves right but whose strokes are the other player's switches
   * players, one write each; then the game's server from the order's first
   * server, planned over the rows with those switches on them.
   */
  async function fixTiebreakServe(
    game: LabelGame,
    from: readonly LabelPoint[] = points,
  ) {
    const order = tiebreakServeOrders(from).find(
      (o) =>
        o.game.setNumber === game.setNumber &&
        o.game.gameNumber === game.gameNumber,
    );
    if (!order || !operations) return;
    let rows: LabelPoint[] = [...from];
    for (const off of order.off.filter(servedRightHitWrong)) {
      const point = rows.find((p) => p.id === off.pointId);
      const plan = point ? planPlayerSwitch(point) : null;
      if (!plan || "error" in plan) continue;
      if (!(await switchPlayers(off.pointId))) return;
      rows = applyShotSwaps(
        replacePoint(rows, off.pointId, (p) =>
          applyPlayerSwitch(p, plan.write),
        ),
        plan.shots,
      );
    }
    if (serversOffOrder(order)) setGameServer(game, order.first, rows);
  }

  /** A yes to the serve's confirm, by the operation its plan names. */
  async function followServeHitter(shotId: string, follow: ServeHitterFollow) {
    if (follow.run === "switch-point") return switchPlayers(follow.pointId);
    if (!follow.game) return;
    const { game, first } = follow.game;
    if (follow.run === "game-server") return setGameServer(game, first);
    // Only the serve was wrong on this point: its own edit first, then the
    // game's server planned over the rows with that edit on them.
    const saved = await writeShot(points, shotId, { hitter: follow.hitter });
    if (!saved) return;
    setGameServer(
      game,
      first,
      points.map((p) => (p.id === saved.id ? saved : p)),
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
        void movePoint(question.pointId, question.to, true);
        return;
      case "move-boundary":
        void moveBoundary(question.to, question.pointIds);
        return;
      case "serve-hitter":
        void followServeHitter(question.shotId, question.follow);
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
    onAskDeleteShot: (shotId, shotNumber, pointNumber) => {
      // A stroke the labeller added goes at once: it records nothing the
      // scorer needs and leaves no row, so there is nothing to confirm.
      if (findShot(points, shotId)?.status === "added") {
        deleteShot(shotId, "other");
        return;
      }
      setConfirm({ kind: "delete-shot", shotId, shotNumber, pointNumber });
    },
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
    onFoldTiebreak: foldTiebreak,
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
    patchShot: requestPatchShot,
    // A review answer's own shot write: awaited, so the ending it leads to
    // is written after it.
    saveShot: patchShot,
    addShot,
    removeShotsAfter,
    restoreShots,
    setGameServer,
    moveGameBoundary: requestMoveBoundary,
    fixTiebreakServe,
    setGameType,
    findGap,
    goToFlag: (pointId: string) => findGap(pointId, { arm: true }),
    pullGamePoints,
    addPointAfter: (pointId: string) => insertPoint(pointId, "after"),
    clearEnteredScore: () => void updateSessionFields({ final_score: null }),
    videoEndsEarly: () => void updateSessionFields({ video_ends_early: true }),
  });

  // Enter marks the open point checked; Space and ← / → drive the video; ]
  // and [ go to the next and previous open flag. Never from inside a control,
  // where those keys already mean something.
  const checkOpenPoint = useRef<() => void>(() => {});
  // `]` and `[`: the next and previous amber flag, as the header's amber list
  // does; `'` and `;`, the two keys under them, the same for the grey list.
  const stepToFlag = useRef<
    (direction: 1 | -1, kind: "score" | "data") => void
  >(() => {});
  // ↑ and ↓: the previous and next stroke of the open point.
  const stepShot = useRef<(direction: 1 | -1) => void>(() => {});
  // F B V O S and 1–4: the selected stroke's Stroke or Spin (stroke-keys.ts).
  // True when the key was the selected stroke's to take.
  const strokeKey = useRef<(key: string) => boolean>(() => false);
  // Escape with no stroke selected: fold the open point's rows away.
  const foldOpenPoint = useRef<() => boolean>(() => false);
  // ⌘Z: the header's Undo.
  const undoLastRef = useRef<() => void>(() => {});
  // Space and ← / →: the labeller driving the film lets a replay go.
  const cancelReplayRef = useRef<() => void>(() => {});
  // The rail's amber slots as stops, read off the rows once for the keys
  // here and the rail's header — marks or none.
  const slotJumpStops = useMemo(
    () =>
      operable
        ? slotStops(points, session.adScoring, matchTiebreakSetNumber)
        : NO_SLOT_STOPS,
    [operable, points, session.adScoring, matchTiebreakSetNumber],
  );
  // The two lists the rail's header steps: what can move the score — the
  // amber flagged points, the set that doesn't add up and every amber slot
  // between the rows — and the grey flagged points, which are wrong data.
  const flagStops = useMemo(() => {
    const slots: readonly FlagStop[] = slotJumpStops;
    if (!liveMarks) return { score: slots, data: [] as FlagStop[] };
    const marked = openFlags(points, liveMarks);
    const stop = scoreStop(
      sessionScoreMismatch({
        points,
        games: scores.games,
        finalScore: sessionFields.finalScore,
        matchScore: session.matchScore,
        videoEndsEarly: sessionFields.videoEndsEarly,
      }),
      points,
    );
    return {
      score: [
        ...marked.filter((flag) => !flag.data),
        ...(stop ? [stop] : []),
        ...slots,
      ] as readonly FlagStop[],
      data: marked.filter((flag) => flag.data) as readonly FlagStop[],
    };
  }, [
    points,
    liveMarks,
    scores,
    sessionFields,
    session.matchScore,
    slotJumpStops,
  ]);
  useEffect(() => {
    checkOpenPoint.current = () => {
      if (!operable || confirm || !expanded || expanded.checkedAt) return;
      setChecked(expanded.id, true);
    };
    stepToFlag.current = (direction, kind) => {
      if (confirm) return;
      const flag = stepFlag(flagStops[kind], points, currentPointId, direction);
      if (flag) findGap(flag.pointId, { arm: true });
    };
    stepShot.current = (direction) => {
      if (confirm || !expanded || unfoldedPointId !== expanded.id) return;
      const shots = liveShotsInOrder(expanded, drawsGhosts(marks)).filter(
        (shot) => !shot.id.startsWith(PENDING_SHOT_PREFIX),
      );
      if (shots.length === 0) return;
      const at = shots.findIndex((shot) => shot.id === placement.shotId);
      // From no stroke, ↓ takes the first and ↑ the last; the ends do not wrap.
      const next =
        at === -1
          ? direction === 1
            ? 0
            : shots.length - 1
          : Math.min(shots.length - 1, Math.max(0, at + direction));
      if (next === at) return;
      // A cell left focused in the old row would keep the keys for itself.
      (document.activeElement as HTMLElement | null)?.blur?.();
      selectShot(shots[next].id);
    };
    strokeKey.current = (key) => {
      if (!operable || confirm || placement.shotId === null) return false;
      const shot = findShot(points, placement.shotId);
      if (!shot || shot.status === "deleted") return false;
      const change = strokeKeyChange(key, shot);
      if (change) {
        requestPatchShot(
          shot.id,
          "stroke" in change ? strokeChangePatch(shot, change.stroke) : change,
        );
      }
      return true;
    };
    undoLastRef.current = () => void undoLast();
    cancelReplayRef.current = cancelReplay;
    jumpAfterOpen.current = (pointId) => findGap(pointId);
    foldOpenPoint.current = () => {
      if (confirm || !expanded || unfoldedPointId !== expanded.id) return false;
      setFoldedPointId(expanded.id);
      return true;
    };
  });
  // Escape lets go of the selected stroke, from anywhere in its row: a text
  // field has already put its draft back by the time the key reaches the
  // window. An open menu or dialog keeps the key for itself.
  // With no stroke selected the same key folds the open point, unless it was
  // spent closing an editor (`defaultPrevented`) or typed into a field.
  const selectedShotId = placement.shotId;
  useEffect(() => {
    function onEscape(event: KeyboardEvent) {
      if (
        overviewRef.current ||
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
      if (selectedShotId === null) {
        const target = event.target as Element | null;
        if (
          event.defaultPrevented ||
          target?.closest?.("input, select, textarea, [contenteditable='true']")
        ) {
          return;
        }
        if (foldOpenPoint.current()) {
          (document.activeElement as HTMLElement | null)?.blur?.();
        }
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
      if (overviewRef.current) return;
      const key = event.key;
      // ⌘ Enter and ↑ / ↓ work from inside a stroke's row as well: a focused
      // cell is a button, which the keys below leave alone. A text field, an
      // open menu and a dialog still keep them.
      // ⌘Z is the header's Undo, except in a text field, which undoes its
      // own typing.
      if (
        (key === "z" || key === "Z") &&
        (event.metaKey || event.ctrlKey) &&
        !event.altKey &&
        !event.shiftKey &&
        !event.defaultPrevented
      ) {
        const target = event.target as Element | null;
        if (
          target?.closest?.(
            "input, select, textarea, [contenteditable='true'], [role='dialog'], [role='alertdialog']",
          )
        ) {
          return;
        }
        event.preventDefault();
        undoLastRef.current();
        return;
      }
      // A stroke key reaches the selected stroke from a focused cell too (a
      // cell is a button); a text field, a menu and a dialog keep it.
      if (
        isStrokeKey(key) &&
        !event.metaKey &&
        !event.ctrlKey &&
        !event.altKey &&
        !event.defaultPrevented &&
        !event.repeat
      ) {
        const target = event.target as Element | null;
        if (
          !target?.closest?.(
            "input, select, textarea, [contenteditable='true'], [role='menu'], [role='dialog'], [role='alertdialog']",
          ) &&
          !document.querySelector(
            "[role='menu'], [role='dialog'], [role='alertdialog']",
          ) &&
          strokeKey.current(key)
        ) {
          event.preventDefault();
          return;
        }
      }
      const chord = key === "Enter" && (event.metaKey || event.ctrlKey);
      const vertical =
        (key === "ArrowUp" || key === "ArrowDown") &&
        !event.metaKey &&
        !event.ctrlKey;
      if (chord || vertical) {
        if (event.defaultPrevented || event.altKey || event.shiftKey) return;
        const target = event.target as Element | null;
        if (
          target?.closest?.(
            "input, select, textarea, [contenteditable='true'], [role='menu'], [role='dialog'], [role='alertdialog']",
          ) ||
          document.querySelector(
            "[role='menu'], [role='dialog'], [role='alertdialog']",
          )
        ) {
          return;
        }
        event.preventDefault();
        if (chord) {
          (document.activeElement as HTMLElement | null)?.blur?.();
          checkOpenPoint.current();
        } else stepShot.current(key === "ArrowDown" ? 1 : -1);
        return;
      }
      if (
        (key !== "Enter" &&
          key !== " " &&
          key !== "ArrowLeft" &&
          key !== "ArrowRight" &&
          key !== "[" &&
          key !== "]" &&
          key !== ";" &&
          key !== "'") ||
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
        stepToFlag.current(key === "]" ? 1 : -1, "score");
      } else if (key === "'" || key === ";") {
        stepToFlag.current(key === "'" ? 1 : -1, "data");
      } else if (key === " ") {
        cancelReplayRef.current();
        player.current?.togglePlay();
      } else {
        cancelReplayRef.current();
        player.current?.step(key === "ArrowLeft" ? -1 : 1);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
  // Space always plays or pauses, with a cell, a row or a button focused too.
  // It is taken in the capture phase, before the control it was aimed at can
  // read it as a click or open its editor, and that control is let go so the
  // key's release does not press it either. Typing keeps its space, and an
  // open menu or dialog keeps the key: there it chooses.
  useEffect(() => {
    function onSpace(event: KeyboardEvent) {
      if (
        overviewRef.current ||
        event.key !== " " ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey ||
        event.shiftKey
      ) {
        return;
      }
      const target = event.target as HTMLElement | null;
      if (
        target?.closest?.(
          "input, select, textarea, [contenteditable='true'], [role='menu'], [role='dialog'], [role='alertdialog']",
        ) ||
        document.querySelector(
          "[role='menu'], [role='dialog'], [role='alertdialog']",
        )
      ) {
        return;
      }
      // Outside a control the handler above has it.
      if (!target?.closest?.(KEY_OWNER_SELECTOR)) return;
      event.preventDefault();
      event.stopPropagation();
      (document.activeElement as HTMLElement | null)?.blur?.();
      if (!event.repeat) {
        cancelReplayRef.current();
        player.current?.togglePlay();
      }
    }
    window.addEventListener("keydown", onSpace, true);
    return () => window.removeEventListener("keydown", onSpace, true);
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
    const next = nextPlacement(placement, point, labelShotValues(shot));
    if (!next) return;
    stopReplay();
    // A placement answers the step only once its stroke has both ends: a
    // missing contact is placed first and its landing still to come must not
    // be skipped. On the step's own stroke the item is answered — in review
    // mode the step is noted and the console moves on, outside it the queue
    // only stops asking (the labeller chose this stroke; nothing lands for
    // them). In review mode a stroke with no step about it (the one an
    // answer added) forces the move on regardless.
    if (placesBothEnds(shot, next.patch)) {
      if (step?.target.shotId === shot.id) {
        if (reviewMode) noteAnswered();
        else closeQueuedItem();
      } else if (reviewMode && inlineAnchor?.strokeId === shot.id) {
        notePlaced();
      }
    }
    setPlacement(next.state);
    void patchShot(shot.id, next.patch);
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
  const videoPlayer = (
    <LabelVideoPlayer
      ref={player}
      video={video}
      points={points}
      readout={readout}
      onTime={clock.set}
      onPause={cancelReplay}
      clockTargetRef={rootRef}
      square={fullScreen}
    />
  );
  // The open point's review step (`reviewStep`), asked in the court panel.
  // Memoised: the console re-renders on every film tick while it plays.
  // The open point's queue: the items it had open when it became the open
  // point, less the ones the labeller has answered here. Any edit settles
  // every counted mark on a point (marks-state.ts `markState`), so without
  // it the first answer would take the point's other questions with it; the
  // queue keeps asking them (`reviewStep`'s `keep`) until each is answered,
  // dismissed or no longer raised. Set again whenever another point opens.
  const [reviewQueue, setReviewQueue] = useState<{
    pointId: string;
    keep: readonly ReviewItemId[];
  } | null>(null);
  if (expanded && liveMarks && reviewQueue?.pointId !== expanded.id) {
    setReviewQueue({
      pointId: expanded.id,
      keep: openReviewItems(expanded, liveMarks, points).map((item) => item.id),
    });
  }
  const keep =
    expanded && reviewQueue?.pointId === expanded.id
      ? reviewQueue.keep
      : undefined;
  const step = useMemo(
    () =>
      expanded && liveMarks
        ? reviewStep(
            expanded,
            liveMarks,
            points,
            names,
            drawsGhosts(liveMarks),
            keep,
          )
        : null,
    [expanded, liveMarks, points, names, keep],
  );
  const stepKey = expanded ? stepKeyOf(expanded.id, step) : "";
  // "n of m": the count the point's review opened with, latched in render.
  const [opened, setOpened] = useState<OpenedCount>(NO_OPENED_COUNT);
  const keptOpened = openedCount(opened, expanded?.id ?? null, step);
  if (keptOpened !== opened) setOpened(keptOpened);
  // Where the inline block sits in review mode, and the stroke it is about;
  // null draws none, and the left court panel is then the labeller's.
  const inlineAnchor =
    reviewMode && expanded
      ? inlineReviewAnchor(expanded, step, placement, drawsGhosts(liveMarks))
      : null;
  const reviewActive = inlineAnchor !== null;
  /** The step's item is answered: the queue stops asking it. */
  function closeQueuedItem() {
    if (!expanded || !step) return;
    const id = step.item.id;
    setReviewQueue((queue) =>
      queue && queue.pointId === expanded.id
        ? { ...queue, keep: queue.keep.filter((kept) => kept !== id) }
        : queue,
    );
  }
  /** A write made here that may close the step: remember what it was about. */
  function noteAnswered() {
    if (!expanded || !step) return;
    pendingAdvance.current = { pointId: expanded.id, key: stepKey };
    closeQueuedItem();
  }
  /** A stroke with no step about it placed: move on, whatever is next. */
  function notePlaced() {
    if (!expanded) return;
    pendingAdvance.current = {
      pointId: expanded.id,
      key: stepKey,
      force: true,
    };
  }
  // Auto-advance, in review mode: once a write made here has changed the
  // rows (the optimistic apply, in the same commit as the click), the open
  // point's step is read again. Another question still open on the point
  // lands straight away (`landOnStep`: its stroke or slot, the court armed,
  // its replay); nothing open goes on to the next flagged point
  // (`nextReviewStop`, through the same jump `]` makes). Never from a
  // refresh the labeller did not cause (`pendingAdvance` is null then),
  // never once they have selected something of their own (review mode off),
  // and never under a confirm or an open menu.
  const landOnStepRef = useRef(landOnStep);
  landOnStepRef.current = landOnStep;
  const reviewJumpRef = useRef((fromPointId: string) => void fromPointId);
  reviewJumpRef.current = (fromPointId) => {
    if (!liveMarks) return;
    const stop = nextReviewStop(points, liveMarks, fromPointId, 1);
    if (stop && stop.pointId !== fromPointId)
      findGap(stop.pointId, { arm: true });
  };
  useEffect(() => {
    const pending = pendingAdvance.current;
    if (!pending || !expanded || pending.pointId !== expanded.id) return;
    const verdict = pending.force
      ? stepKey === ""
        ? "done"
        : "advance"
      : advanceAfterAnswer(pending.key, stepKey);
    if (verdict === "stay") return;
    pendingAdvance.current = null;
    if (!reviewMode || confirm) return;
    if (
      document.querySelector(
        "[role='menu'], [role='dialog'], [role='alertdialog']",
      )
    ) {
      return;
    }
    if (verdict === "advance") landOnStepRef.current(expanded, step);
    else reviewJumpRef.current(expanded.id);
    // `step` and `expanded` move with `stepKey`; the key is the comparison.
    // `points` is here for a forced advance, whose key does not move.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepKey, points, confirm, reviewMode]);
  // The armed slot belongs to the open point; it goes with the point.
  if (armedSlot && armedSlot.pointId !== currentPointId) setArmedSlot(null);
  // An answer's writes, each through the console's own handler for it.
  const reviewWrites: ReviewWriteHandlers = {
    patchShot: railHandlers.saveShot,
    patchPoint: railHandlers.patchPoint,
    splitPoint: rowOperations.onSplitPoint,
    removeShotsAfter: railHandlers.removeShotsAfter,
    dismissSuggestion: rowOperations.onDismissSuggestion,
    setChecked: rowOperations.onSetChecked,
    addShot: railHandlers.addShot,
  };
  function answerReview(answer: ReviewAnswer) {
    if (!expanded) return;
    stopReplay();
    if (answer.writes.some((write) => write.write === "check")) {
      // "Looks right" confirms the whole point: nothing left in its queue,
      // and once the tick has settled its marks the next flagged point lands.
      noteAnswered();
      const pointId = expanded.id;
      setReviewQueue((queue) =>
        queue && queue.pointId === pointId ? { ...queue, keep: [] } : queue,
      );
    } else if (answer.writes.some((write) => write.write === "addShot")) {
      // The item is answered, but the added stroke (`addShot` selects it
      // once saved) stays selected for placement: the queue moves on without
      // landing anywhere.
      closeQueuedItem();
    } else {
      noteAnswered();
    }
    void runReviewAnswer(answer, expanded.id, reviewWrites);
  }
  // "Off screen, so this is an estimate": the placed end's two names in the
  // stroke's `unclear`, through the rail's shot edit.
  function setEstimate(estimate: boolean) {
    const shot =
      placement.shotId === null ? null : findShot(points, placement.shotId);
    if (!shot) return;
    railHandlers.patchShot(
      shot.id,
      estimatePatch(shot.unclear, placement.target, estimate),
    );
  }
  // One line about the open point for the left panel while the film runs.
  const pointInfo = useMemo<PointInfo | null>(() => {
    if (!expanded) return null;
    const live = liveShotsInOrder(expanded, drawsGhosts(liveMarks));
    const at =
      playing?.pointId === expanded.id
        ? live.findIndex((shot) => shot.id === playing.shotId)
        : -1;
    return {
      score: scores.points.get(expanded.id)?.scoreBefore ?? null,
      server: expanded.server ? names[expanded.server] : null,
      rallyLength: live.length,
      rallySoFar: at === -1 ? null : at + 1,
      // The same queue the review asks from (`keep`): a question an edit
      // elsewhere on the point settled is still to review until answered.
      openItems: liveMarks
        ? openReviewItems(expanded, liveMarks, points, keep).length
        : 0,
    };
  }, [expanded, liveMarks, playing, scores, names, points, keep]);
  // While the inline block owns placement the left court follows the film
  // with nothing selected: one placement surface at a time.
  const panelPlacement = reviewActive ? NO_PLACEMENT : placement;
  const placing = isPlacing(expanded, panelPlacement, editable);
  const courtPanel = (
    <LabelCourtPanel
      point={expanded}
      names={names}
      placement={panelPlacement}
      editable={editable}
      playingShotId={playing?.shotId ?? null}
      ghosts={drawsGhosts(liveMarks)}
      info={pointInfo}
      onEstimate={editable ? setEstimate : undefined}
      clock={clock}
      onPlace={place}
      onTarget={setTarget}
      onFlip={() => setPlacement(flipPlacement)}
    />
  );
  // The review step, asked in the rail under the stroke it is about.
  const reviewInline =
    expanded && inlineAnchor
      ? {
          pointId: expanded.id,
          afterShotId: inlineAnchor.shotId,
          node: (
            <ReviewInlineBlock
              point={expanded}
              names={names}
              step={step}
              anchor={inlineAnchor}
              placement={placement}
              editable={editable}
              ghosts={drawsGhosts(liveMarks)}
              count={step ? stepCount(keptOpened, step) : null}
              onAnswer={operable ? answerReview : undefined}
              onEstimate={editable ? setEstimate : undefined}
              onPlace={place}
              onTarget={setTarget}
              onFlip={() => setPlacement(flipPlacement)}
            />
          ),
        }
      : null;
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
      onUndo={editable && operations?.undo ? () => void undoLast() : undefined}
      missingShots={missingShotAdds.length}
      onAddMissingShots={
        editable && operations?.addMissingShots
          ? () => void addAllMissingShots()
          : undefined
      }
      canUndo={canUndo}
      onExit={fullScreen ? () => chooseLayout(homeMode) : undefined}
      onFullScreen={fullScreen ? undefined : () => chooseLayout("black")}
      scrollerRef={scrollerRef}
      onFocusCapture={railHandlers.holdOnEditorFocus}
      affordance={affordance}
      onFollow={followPlayback}
      points={points}
      adScoring={session.adScoring}
      matchTiebreakSet={matchTiebreakSetNumber}
      playOnLets={session.playOnLets}
      fileOffset={fileOffset}
      names={names}
      marks={liveMarks}
      expandedPointId={unfoldedPointId}
      onTogglePoint={railHandlers.togglePoint}
      editable={editable}
      selectedShotId={placement.shotId}
      armedSlotAfterShotId={armedSlot?.afterShotId ?? null}
      reviewInline={reviewInline}
      onSelectShot={railHandlers.selectShot}
      onExitReview={exitReview}
      onPatchPoint={railHandlers.patchPoint}
      onPatchShot={railHandlers.patchShot}
      operations={operable ? rowOperations : undefined}
      onRemoveShotsAfter={operable ? railHandlers.removeShotsAfter : undefined}
      onRestoreShots={operable ? railHandlers.restoreShots : undefined}
      onSetGameServer={operable ? railHandlers.setGameServer : undefined}
      onFixTiebreakServe={operable ? railHandlers.fixTiebreakServe : undefined}
      slotStops={slotJumpStops}
      onMoveGameBoundary={operable ? railHandlers.moveGameBoundary : undefined}
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
      onVideoEndsEarly={operable ? railHandlers.videoEndsEarly : undefined}
      onFindGap={operable ? railHandlers.findGap : undefined}
      onGoToPoint={railHandlers.goToFlag}
    />
  );

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
          <div className="flex min-w-0 items-center gap-4">
            {/* Both players, player 1 in front: the pair is the match. */}
            <span className="flex shrink-0">
              <PersonAvatar
                initials={getInitials(session.player1Name)}
                className="relative size-10 text-[12px]"
              />
              <PersonAvatar
                initials={getInitials(session.player2Name)}
                className="-ml-2.5 size-10 text-[12px] shadow-[0_0_0_2px_var(--surface-card)]"
              />
            </span>
            <div className="flex min-w-0 flex-col gap-1.5">
              <h1 className="text-display truncate">
                {session.player1Name} vs {session.player2Name}
              </h1>
              <p className="flex flex-wrap items-center gap-1.5 text-[12px] text-[var(--ink-600)]">
                {upload?.program ? (
                  <>
                    <ProgramCrest
                      name={upload.program}
                      crestUrl={upload.programCrestUrl}
                      size={26}
                    />
                    <span>{upload.program}</span>
                    <span aria-hidden="true">·</span>
                  </>
                ) : null}
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
          </div>
          <div className="flex shrink-0 items-center gap-5">
            <LabelSaveStatus status={saveStatus} />
            {operable && operations?.undo && !overview ? (
              <button
                type="button"
                data-undo-last=""
                className={advButton("outline", "sm")}
                aria-label="Undo the last change"
                aria-keyshortcuts="Meta+Z"
                disabled={!canUndo}
                onClick={() => void undoLast()}
              >
                Undo
              </button>
            ) : null}
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
            <button
              type="button"
              data-open-labelling=""
              className={advButton("primary", "sm")}
              onClick={() => chooseLayout("black")}
            >
              {status === "complete" ? "Open full screen" : "Open labelling"}
            </button>
            {headerAction}
          </div>
        </div>
      )}

      {/* The full-screen layer is a child of this root so `--film-t`
          reaches the rail's rows. */}
      {overview ? (
        <LabelDashboard
          points={points}
          marks={liveMarks}
          games={scores.games}
          adScoring={session.adScoring}
          names={names}
          finalScore={sessionFields.finalScore}
          matchScore={session.matchScore}
          videoEndsEarly={sessionFields.videoEndsEarly}
          warnings={completeWarnings({
            points,
            adScoring: session.adScoring,
            marks: liveMarks,
            finalScore: sessionFields.finalScore,
            videoEndsEarly: sessionFields.videoEndsEarly,
            matchScore: session.matchScore,
            games: scores.games,
            names,
          })}
          complete={status === "complete"}
          upload={upload}
          onOpen={(pointId) => {
            // The gesture the browser's full screen asks for is this click.
            openOnPointId.current = pointId ?? null;
            chooseLayout("black");
          }}
        />
      ) : (
        <LabelBlackView
          initialRailWidth={initialRailWidth}
          video={videoPlayer}
          court={courtPanel}
          placing={placing}
          arrive={layoutSwitched}
        >
          {rail}
        </LabelBlackView>
      )}

      {operable ? (
        <LabelConfirmDialog
          confirm={confirm}
          names={names}
          onCancel={() => setConfirm(null)}
          onConfirm={confirmed}
          onAlternative={(question) => {
            setConfirm(null);
            if (question.kind === "serve-hitter") {
              void patchShot(question.shotId, {
                hitter: question.follow.hitter,
              });
            }
          }}
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
  /** Makes set `setNumber`'s game after 6–6 a tiebreak. Same answer. */
  foldTiebreak?: (
    sessionId: string,
    setNumber: number,
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
  /**
   * Rewind the session's newest action, whatever it was, and answer the rows
   * as they now stand (undo-session.ts). Absent: no "Undo".
   */
  undo?: (sessionId: string) => Promise<LabelUndoResult>;
  /**
   * Answer every open "Missing shot?" slot with "Add shot", as one Undo step
   * (add-missing-shots.ts). Absent: no "Add all".
   */
  addMissingShots?: (
    sessionId: string,
    adds: MissingShotAdd[],
  ) => Promise<LabelAddMissingShotsResult>;
  /**
   * Save the open amber and grey counts on the session, for the Labels list
   * (open-counts-session.ts). Absent: the list keeps what it had.
   */
  recordOpenCounts?: (
    sessionId: string,
    counts: LabelOpenCounts,
  ) => Promise<LabelOpenCountsResult>;
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
    hitterHalf(
      shot,
      owner.shots.slice(0, index),
      // In a tiebreak the earlier points say, ends changing every six.
      tiebreakHitterHalf(points, owner.id, shot.hitter) ?? "near",
    ),
  );
  const hasContact = shot.contactX !== null && shot.contactY !== null;
  const hasLanding = shot.landingX !== null && shot.landingY !== null;
  return hasContact && !hasLanding
    ? setPlacementTarget(start, "landing", shot.contactY)
    : start;
}

/**
 * Whether `patch`, a court click's, leaves `shot` with both a contact and a
 * landing: what a placement must do before it can answer a review step.
 */
function placesBothEnds(shot: LabelShot, patch: LabelShotPatch): boolean {
  const end = (x: "contact" | "landing") => {
    const px = patch[`${x}_x`];
    const py = patch[`${x}_y`];
    const sx =
      px !== undefined ? px : x === "contact" ? shot.contactX : shot.landingX;
    const sy =
      py !== undefined ? py : x === "contact" ? shot.contactY : shot.landingY;
    return sx !== null && sy !== null;
  };
  return end("contact") && end("landing");
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

const NO_SLOT_STOPS: ReturnType<typeof slotStops> = [];

/** A planned point move (`planPointMove`), as the rows take it at once. */
function pointMoved(
  rows: readonly LabelPoint[],
  pointId: string,
  plan: Extract<PlannedPointMove, { ok: true }>,
): LabelPoint[] {
  return applyShotSwaps(
    replacePoint(rows, pointId, (p) => applyPointMove(p, plan.write)),
    plan.shots,
  );
}

/** The move as the server wrote it: the last word over `pointMoved`. */
function pointMoveSettled(
  rows: readonly LabelPoint[],
  pointId: string,
  result: Extract<LabelMovePointResult, { ok: true }>,
): LabelPoint[] {
  return applyShotSwaps(
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
  );
}

/** A move undone: the point's columns and its strokes' hitters as `before` had them. */
function pointMovePutBack(
  rows: readonly LabelPoint[],
  before: LabelPoint,
): LabelPoint[] {
  return applyShotSwaps(
    replacePoint(rows, before.id, (p) => ({
      ...p,
      setNumber: before.setNumber,
      gameNumber: before.gameNumber,
      server: before.server,
      status: before.status,
      winner: before.winner,
      endedBy: before.endedBy,
    })),
    shotSwapsOf(before.shots),
  );
}

/**
 * The ending a shot change calls for (`endingPatchForShotChange`, the rule
 * the server settles it by), applied at once and taken back as it was read:
 * while a write is in flight the stored ending must not disagree with the
 * rows, or "Different ending?" asks about a change the write is already
 * making. The server's `point` stays the last word.
 */
function endingFollow(
  before: LabelPoint | null | undefined,
  after: LabelPoint | null | undefined,
  ghosts: boolean,
): {
  apply: (rows: LabelPoint[]) => LabelPoint[];
  /** `pointId`: the row to put it back on, when its id may have changed. */
  undo: (rows: LabelPoint[], pointId?: string) => LabelPoint[];
} {
  const patch =
    before && after ? endingPatchForShotChange(before, after, ghosts) : null;
  if (!patch || !before) return { apply: (rows) => rows, undo: (rows) => rows };
  return {
    apply: (rows) =>
      replacePoint(rows, before.id, (p) => applyLabelPointPatch(p, patch)),
    undo: (rows, pointId = before.id) =>
      replacePoint(rows, pointId, (p) => ({
        ...p,
        ending: before.ending,
        endedBy: before.endedBy,
        winner: before.winner,
        status: before.status,
      })),
  };
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
