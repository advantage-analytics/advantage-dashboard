"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import {
  labelProgress,
  orderLabelShots,
  type LabelPoint,
  type LabelSession,
  type LabelShot,
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
import type { CourtPoint } from "./court-geometry";
import {
  NO_PLACEMENT,
  nextPlacement,
  placementPrompt,
  startPlacement,
  type PlacementState,
} from "./court-placement";
import type { LabelConfirm } from "./label-confirm";
import { LabelConfirmDialog } from "./label-confirm-dialog";
import { LabelCourt } from "./label-court";
import { sideNames } from "./label-format";
import {
  LabelPointsTable,
  type LabelRowOperations,
} from "./label-points-table";
import { LabelSaveStatus } from "./label-save-status";
import type { LabelVideoHandle } from "./label-video";
import { LabelVideoDock, type DockNowPlaying } from "./label-video-dock";
import { INITIAL_SAVE_STATUS, saveStatusReducer } from "./save-status";
import {
  createVideoClock,
  parsePlayingRowKey,
  playingRowKey,
} from "./video-clock";

/** Ids of rows drawn optimistically while their insert is in flight. */
const PENDING_SHOT_PREFIX = "pending-shot-";

/**
 * `/admin/labels/[sessionId]` — board 08: the header, the court card, the
 * points table, and the video floating over them in a corner.
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
 * Row operations (T7) follow the same optimistic contract through
 * `operations`: delete and Undo, add a stroke, move a point, mark it checked,
 * and reset an edited stroke or point to the values it was seeded with.
 * Three of them ask first — a delete and a reset always, a move only into a
 * game someone else serves — and those open `LabelConfirmDialog` WITHOUT
 * writing: the write happens on the dialog's action, and Cancel changes
 * nothing. Enter marks the open point checked when focus is not in a control.
 *
 * The video is the match film tab's player in a floating dock
 * (`label-video-dock.tsx`): always on screen while the table scrolls, dragged
 * to any corner or minimised to a pill. The band above the table holds only
 * the 320 × 216 court card, so the table keeps the screen. As the video plays
 * (or is scrubbed) the table marks the point and the stroke on screen
 * (`playingRowAt`, via the video clock in video-clock.ts). The mark is only a
 * mark: it never opens a point, selects a stroke or scrolls the table — the
 * labeller stays in charge of all three.
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
  const [expandedPointId, setExpandedPointId] = useState<string | null>(() =>
    initialExpandedPointId !== undefined
      ? initialExpandedPointId
      : (defaultPoint(session.points)?.id ?? null),
  );
  const [placement, setPlacement] = useState<PlacementState>(() =>
    startPlacement(initialSelectedShotId),
  );
  const [saveStatus, dispatchSave] = useReducer(
    saveStatusReducer,
    INITIAL_SAVE_STATUS,
  );
  const [confirm, setConfirm] = useState<LabelConfirm | null>(initialConfirm);
  const [openTombstones, setOpenTombstones] = useState<ReadonlySet<string>>(
    () => new Set(initialOpenTombstoneIds ?? []),
  );
  const player = useRef<LabelVideoHandle>(null);
  const pendingIds = useRef(0);
  const [clock] = useState(() => createVideoClock(initialVideoTime));

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
  const nowPlaying = useMemo(
    () => dockNowPlaying(points, parsePlayingRowKey(playingKey)),
    [points, playingKey],
  );

  // A deleted point is a marker, not an open point: nothing of it on the court.
  const expanded =
    points.find(
      (point) => point.id === expandedPointId && point.status !== "deleted",
    ) ?? null;
  const { checked, total } = labelProgress(points);

  function togglePoint(pointId: string) {
    const opening = pointId !== expandedPointId;
    setExpandedPointId(opening ? pointId : null);
    setPlacement(NO_PLACEMENT);
    if (!opening) return;
    const point = points.find((p) => p.id === pointId);
    const first = point?.shots.find(
      (shot) => shot.status !== "deleted" && shot.videoTime !== null,
    );
    if (first?.videoTime != null) player.current?.seekTo(first.videoTime);
  }

  function selectShot(shotId: string) {
    // A draft row cannot be placed or edited until its insert lands; it is
    // selected for placement then (see `addShot`).
    if (shotId.startsWith(PENDING_SHOT_PREFIX)) return;
    setPlacement(startPlacement(shotId));
    const shot = findShot(points, shotId);
    if (shot?.videoTime != null) player.current?.seekTo(shot.videoTime);
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
          ? startPlacement(result.shot.id)
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

  // The selected stroke's number as the table shows it: live strokes, 1…n.
  const selectedNumber = useMemo(() => {
    if (!expanded || placement.shotId === null) return null;
    const live = expanded.shots.filter((shot) => shot.status !== "deleted");
    const index = live.findIndex((shot) => shot.id === placement.shotId);
    return index === -1 ? null : index + 1;
  }, [expanded, placement.shotId]);

  function place(point: CourtPoint) {
    if (placement.shotId === null) return;
    const shot = findShot(points, placement.shotId);
    if (!shot) return;
    const step = nextPlacement(placement, point, labelShotValues(shot));
    if (!step) return;
    setPlacement(step.state);
    void patchShot(shot.id, step.patch);
  }

  return (
    <>
      <div className="flex items-end justify-between gap-8">
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
          {headerAction}
        </div>
      </div>

      {/* The video is not in the band: it floats (`LabelVideoDock`, fixed to
          the viewport), because `position: sticky` never engages anywhere in
          the admin — `body` is its own overflow container (globals.css) — so
          a video in the flow scrolls away with the header. */}
      <div data-label-band="" className="flex">
        <LabelCourt
          title={
            expanded ? `Court · point ${expanded.pointIndex + 1}` : "Court"
          }
          shots={expanded?.shots ?? []}
          names={names}
          selectedShotId={placement.shotId}
          prompt={editable ? placementPrompt(placement, selectedNumber) : null}
          onPlace={editable ? place : undefined}
        />
      </div>

      <LabelPointsTable
        points={points}
        adScoring={session.adScoring}
        names={names}
        expandedPointId={expandedPointId}
        onTogglePoint={togglePoint}
        editable={editable}
        selectedShotId={placement.shotId}
        onSelectShot={selectShot}
        onPatchPoint={patchPoint}
        onPatchShot={patchShot}
        operations={rowOperations}
        openTombstoneIds={openTombstones}
        onToggleTombstone={toggleTombstone}
        playingPointId={playing?.pointId ?? null}
        playingShotId={playing?.shotId ?? null}
      />

      <LabelVideoDock
        ref={player}
        video={video}
        points={points}
        nowPlaying={nowPlaying}
        onTime={clock.set}
        initialMinimised={initialVideoMinimised}
      />

      {operable ? (
        <LabelConfirmDialog
          confirm={confirm}
          names={names}
          onCancel={() => setConfirm(null)}
          onConfirm={confirmed}
        />
      ) : null}
    </>
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
