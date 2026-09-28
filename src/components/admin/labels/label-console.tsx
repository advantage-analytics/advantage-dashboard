"use client";

import {
  useCallback,
  useMemo,
  useReducer,
  useRef,
  useState,
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
  type LabelPointPatch,
  type LabelShotPatch,
} from "@/lib/services/labels/edit";
import type {
  LabelPointEditResult,
  LabelShotEditResult,
} from "@/lib/services/labels/edit-session";
import type { CourtPoint } from "./court-geometry";
import {
  NO_PLACEMENT,
  nextPlacement,
  placementPrompt,
  startPlacement,
  type PlacementState,
} from "./court-placement";
import { LabelCourt } from "./label-court";
import { sideNames } from "./label-format";
import { LabelPointsTable } from "./label-points-table";
import { LabelSaveStatus } from "./label-save-status";
import { LabelVideoPlayer, type LabelVideoHandle } from "./label-video";
import { INITIAL_SAVE_STATUS, saveStatusReducer } from "./save-status";

/**
 * `/admin/labels/[sessionId]` — board 08: the header, the band (video
 * top-left, the vertical court card beside it) and the points table.
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
 */
export function LabelConsole({
  session,
  video,
  initialExpandedPointId,
  initialSelectedShotId = null,
  onSaveShot,
  onSavePoint,
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
  const player = useRef<LabelVideoHandle>(null);

  const expanded = points.find((point) => point.id === expandedPointId) ?? null;
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
    setPlacement(startPlacement(shotId));
    const shot = findShot(points, shotId);
    if (shot?.videoTime != null) player.current?.seekTo(shot.videoTime);
  }

  const patchShot = useCallback(
    async (shotId: string, patch: LabelShotPatch) => {
      const before = findShot(points, shotId);
      if (!before || !onSaveShot) return;
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
        const undo = Object.fromEntries(
          Object.keys(patch).map((key) => [
            key,
            shotColumnValue(before, key as keyof LabelShotPatch),
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
          point.id === pointId ? applyLabelPointPatch(point, patch) : point,
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

  // The selected stroke's number as the table shows it: live strokes, 1…n.
  const selectedNumber = useMemo(() => {
    if (!expanded || placement.shotId === null) return null;
    const live = expanded.shots.filter((shot) => shot.status !== "deleted");
    const index = live.findIndex((shot) => shot.id === placement.shotId);
    return index === -1 ? null : index + 1;
  }, [expanded, placement.shotId]);

  function place(point: CourtPoint) {
    const step = nextPlacement(placement, point);
    if (!step || placement.shotId === null) return;
    setPlacement(step.state);
    void patchShot(placement.shotId, step.patch);
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

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_500px]">
        <LabelVideoPlayer ref={player} video={video} />
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
        names={names}
        expandedPointId={expandedPointId}
        onTogglePoint={togglePoint}
        editable={editable}
        selectedShotId={placement.shotId}
        onSelectShot={selectShot}
        onPatchPoint={patchPoint}
        onPatchShot={patchShot}
      />
    </>
  );
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

/** A shot's current value for one patch column. */
function shotColumnValue(
  shot: LabelShot,
  column: keyof LabelShotPatch,
): unknown {
  switch (column) {
    case "hitter":
      return shot.hitter;
    case "stroke":
      return shot.stroke;
    case "result":
      return shot.result;
    case "contact_x":
      return shot.contactX;
    case "contact_y":
      return shot.contactY;
    case "landing_x":
      return shot.landingX;
    case "landing_y":
      return shot.landingY;
    case "video_time":
      return shot.videoTime;
    case "unclear":
      return undefined;
  }
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
