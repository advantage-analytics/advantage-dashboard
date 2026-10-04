"use client";

import {
  useCallback,
  useEffect,
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
import {
  DEFAULT_DOCK_SIZE,
  DEFAULT_LAYOUT_MODE,
  LAYOUT_MODE_STORAGE_KEY,
  parseLayoutMode,
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
 * tall or wide until the divider (T25) moves it; the table takes the rest and
 * still scrolls inside itself. Nothing floats, so the follow scroll keeps
 * clear of the sticky column header only. The choice is remembered under
 * `LAYOUT_MODE_STORAGE_KEY`, read after mount like the docks read their own
 * keys — the page is server-rendered, and a first client render that read
 * storage would not hydrate.
 *
 * Switching mode moves the `<video>` to another parent, which remounts it. The
 * playhead carries over: once the new element is in, the console seeks it to
 * where the clock says the film was (`seekTo` before metadata sets the
 * element's default start position, which it honours when the metadata
 * lands). Playback resumes paused, and a shot loop lets go.
 *
 * Outside a control, Space plays and pauses and ← / → step to the previous or
 * next point — the keys the player's own tooltips name.
 */
export function LabelConsole({
  session,
  video,
  initialExpandedPointId,
  initialSelectedShotId = null,
  onSaveShot,
  onSavePoint,
  operations,
  initialConfirm = null,
  initialOpenTombstoneIds,
  initialVideoTime = null,
  initialVideoMinimised,
  initialPointFocus,
  initialLayoutMode,
  headerAction,
}: {
  session: LabelSession;
  video: LabelVideo | null;
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
  const player = useRef<LabelVideoHandle>(null);
  // The table card: the one thing on the page that scrolls (T19).
  const scrollerRef = useRef<HTMLDivElement | null>(null);
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
  const chooseLayout = useCallback((mode: LabelLayoutMode) => {
    setLayoutMode(mode);
    try {
      localStorage.setItem(LAYOUT_MODE_STORAGE_KEY, mode);
    } catch {
      /* private window — the choice just isn't kept */
    }
  }, []);
  const docked = layoutMode !== "overlay";

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
  // The docked player's transport title row — the dock derives the same for
  // the floating one. Nothing in the overlay reads it, so it stays `null`.
  const dockedReadout = useMemo(() => {
    if (!docked) return null;
    const scores = labelScores(points, session.adScoring);
    return dockReadout(points, nowPlaying, names, scores);
  }, [docked, points, session.adScoring, nowPlaying, names]);
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
  // as it always did. The open row folds instead: a hold with nothing open
  // (T25), so the video moving on does not pop another point open under the
  // labeller's hands; clicking the playing row again then re-follows.
  function togglePoint(pointId: string) {
    player.current?.loopShot(null);
    setPlacement(NO_PLACEMENT);
    if (pointId === openPointId) {
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
    if (!target.closest("input, select, textarea, [contenteditable='true']"))
      return;
    if (!target.closest("[data-point-id]")) return;
    holdPoint(openPointId);
  }

  const patchShot = useCallback(
    async (shotId: string, patch: LabelShotPatch) => {
      const before = findShot(points, shotId);
      if (!before || !onSaveShot) return;
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
    },
    [points, onSaveShot],
  );

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
    void runOperation(
      (rows) => replaceShot(rows, shotId, (s) => applyShotDelete(s, reason)),
      () => operations.deleteShot(shotId, reason),
      (rows) => rows,
      (rows) => replaceShot(rows, shotId, () => before),
    );
  }

  function restoreShot(shotId: string) {
    const before = findShot(points, shotId);
    if (!before || !operations) return;
    void runOperation(
      (rows) => replaceShot(rows, shotId, applyShotRestore),
      () => operations.restoreShot(shotId),
      (rows, result) =>
        replaceShot(rows, shotId, (s) => ({ ...s, status: result.status })),
      (rows) => replaceShot(rows, shotId, () => before),
    );
    closeTombstone(shotId);
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
      contactX: null,
      contactY: null,
      landingX: null,
      landingY: null,
      videoTime: plan.write.video_time,
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
    void runOperation(
      (rows) => updateShot(rows, shotId, true, applyShotReset),
      () => operations.resetShot(shotId),
      (rows, result) =>
        replaceShot(rows, shotId, (s) => ({ ...s, status: result.status })),
      (rows) => updateShot(rows, shotId, true, () => before),
    );
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
  // floats over the table: only the column header is kept clear.
  const insets = useMemo(() => {
    if (docked) return { top: POINT_HEADER_HEIGHT, bottom: 0 };
    const docks = followInsets(videoLayout);
    return { top: docks.top + POINT_HEADER_HEIGHT, bottom: docks.bottom };
  }, [docked, videoLayout]);
  useFollowScroll({
    scroller: scrollerRef,
    held,
    activePointId: playingPointId,
    activeShotId: playing?.shotId ?? null,
    // The playing stroke has a row only while its point is the open one.
    wellOpen: openPointId !== null && openPointId === playingPointId,
    displayedPointId: openPointId,
    onHoldPoint: holdPoint,
    insets,
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
            "absolute top-3 left-1/2 z-50 inline-flex h-7 -translate-x-1/2 cursor-pointer items-center rounded-[var(--radius-button)] bg-[rgba(13,13,13,0.72)] px-2.5 text-[11px] font-medium whitespace-nowrap text-white shadow-[var(--shadow-floating)] transition-[background-color,transform] duration-200 ease-[var(--ease-primary)] hover:bg-[rgba(13,13,13,0.9)] focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none active:scale-[0.97]",
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
      <div className="flex shrink-0 items-end justify-between gap-8">
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

      {layoutMode === "docked-top" ? (
        // A band above the table, `DEFAULT_DOCK_SIZE` tall: the video at
        // 16:9 from that height (565 wide at 318), the court card beside it
        // at the floating card's own width, the rest of the band open. The
        // table takes what is left below.
        <div className="flex min-h-0 flex-1 flex-col gap-4">
          <div
            data-label-dock="top"
            className="flex shrink-0 gap-4"
            style={{ height: DEFAULT_DOCK_SIZE["docked-top"] }}
          >
            <div
              data-label-dock-video=""
              className={cn(
                DOCK_CARD,
                "aspect-video h-full shrink-0 overflow-hidden",
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
          {table}
        </div>
      ) : layoutMode === "docked-side" ? (
        // A column to the table's right, `DEFAULT_DOCK_SIZE` wide and never
        // more than 45% of the row: the video at 16:9 from that width (270
        // tall at 480), the court card under it taking the rest of the
        // height. The table narrows beside it and scrolls sideways.
        <div className="flex min-h-0 flex-1 gap-4">
          {table}
          <div
            data-label-dock="side"
            className="flex max-w-[45%] shrink-0 flex-col gap-4"
            style={{ width: DEFAULT_DOCK_SIZE["docked-side"] }}
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
