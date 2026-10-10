/**
 * The console's "Combine with point above / below" (`point-combine.ts`).
 * Admin-gated like edit-session.ts; not the marks gate.
 *
 * Its writes, in order, on `label_shots` and `label_points` only: one UPDATE
 * moving the later point's shots (`label_point_id`, by id list), their statuses
 * untouched; one compare-and-set UPDATE of the kept point's winner, ending,
 * ended by, rally ids and status, and one tombstoning the later point (both
 * `updateIfUnchanged` — the writes before a miss stand); one compare-and-set
 * UPDATE per serve the plan relabels (its stroke or let, and the status an edit would
 * give it, `labelShotStatusAfterPatch`); then the kept
 * point's ending as its joined rows
 * derive it (`reconcileEnding`, ending-session.ts), where the later point's
 * stored ending did not already say so. No row is ever removed.
 */

import type { AdminClient } from "@/lib/supabase/admin";
import {
  defaultLabelWriteDependencies,
  readSessionGate,
  updateIfUnchanged,
  type LabelWriteDependencies,
} from "./edit-session";
import { labelShotState, labelShotStatusAfterPatch } from "./edit";
import {
  endingColumns,
  readShotsOfPoints,
  reconcileEnding,
} from "./ending-session";
import { gated, normaliseId, type LabelOpResult } from "./operations-session";
import {
  isCombineDirection,
  planPointCombine,
  type CombinablePoint,
  type PointCombineSaved,
} from "./point-combine";
import type { LabelEnding, LabelPointStatus, LabelSide } from "./session";

export type LabelCombinePointsResult = LabelOpResult<PointCombineSaved>;

interface PointRow {
  id: string;
  point_index: number;
  status: LabelPointStatus;
  set_number: number | null;
  game_number: number | null;
  winner: LabelSide | null;
  ending: LabelEnding | null;
  ended_by: LabelSide | null;
  vendor_rally_ids: number[] | null;
}

const POINT_COLUMNS =
  "id, point_index, status, set_number, game_number, winner, ending, ended_by, vendor_rally_ids";

/** Move the shots, write the kept point, tombstone the later. Never throws. */
export async function writeLabelPointCombine(params: {
  supabase: AdminClient;
  pointId: unknown;
  direction: unknown;
}): Promise<LabelCombinePointsResult> {
  const { supabase } = params;
  const pointId = normaliseId(params.pointId);
  if (!pointId) return { error: "Invalid point id." };
  if (!isCombineDirection(params.direction)) {
    return { error: "Say whether to combine with the point above or below." };
  }
  const direction = params.direction;

  const { data: point, error: pointError } = await supabase
    .from("label_points")
    .select("id, session_id")
    .eq("id", pointId)
    .maybeSingle<{ id: string; session_id: string }>();
  if (pointError) {
    return { error: `Could not read the point: ${pointError.message}` };
  }
  if (!point) return { error: "Point not found." };
  // Independent reads; the gate's refusal is taken first.
  const [gate, { data: rows, error: rowsError }] = await Promise.all([
    readSessionGate(supabase, point.session_id),
    supabase
      .from("label_points")
      .select(POINT_COLUMNS)
      .eq("session_id", point.session_id)
      .order("point_index")
      .returns<PointRow[]>(),
  ]);
  if ("error" in gate) return gate;
  if (rowsError) {
    return {
      error: `Could not read the session's points: ${rowsError.message}`,
    };
  }

  // The plan with no shots yet: which point is the later one is decided
  // first, then both points' shots are read — the later one's to move, and
  // both for the serves the combine retypes.
  const points: CombinablePoint[] = (rows ?? []).map((row) => ({
    id: row.id,
    pointIndex: row.point_index,
    status: row.status,
    setNumber: row.set_number,
    gameNumber: row.game_number,
    winner: row.winner,
    ending: row.ending,
    endedBy: row.ended_by,
    vendorRallyIds: row.vendor_rally_ids ?? [],
    shots: [],
  }));
  const dry = planPointCombine(points, pointId, direction);
  if ("error" in dry) return dry;

  const read = await readShotsOfPoints(supabase, [
    dry.write.keptId,
    dry.write.removedId,
  ]);
  if ("error" in read) return read;
  const shotsOf = (id: string) =>
    read.shots.filter((shot) => shot.labelPointId === id);
  const plan = planPointCombine(
    points.map((p) =>
      p.id === dry.write.keptId || p.id === dry.write.removedId
        ? { ...p, shots: shotsOf(p.id) }
        : p,
    ),
    pointId,
    direction,
  );
  // A refusal here — including a serve retype that would leave a let on a
  // stroke that is not a serve (`combineRetypeError`, judged on the rows just
  // read) — comes before any write, so nothing moves.
  if ("error" in plan) return plan;
  const { write } = plan;

  if (write.movedShotIds.length > 0) {
    const { error: moveError } = await supabase
      .from("label_shots")
      .update({ label_point_id: write.keptId })
      .in("id", write.movedShotIds);
    if (moveError) {
      return { error: `Could not move the shots: ${moveError.message}` };
    }
  }

  // Both points were read above; the plan refuses a tombstone, so each
  // status as read is a live one.
  const kept = points.find((p) => p.id === write.keptId);
  const keptFailed = await updateIfUnchanged(
    supabase,
    "label_points",
    write.keptId,
    kept?.status ?? "deleted",
    { ...write.kept },
    "write the combined point",
  );
  if (keptFailed) return { error: keptFailed };

  const later = points.find((p) => p.id === write.removedId);
  const failed = await updateIfUnchanged(
    supabase,
    "label_points",
    write.removedId,
    later?.status ?? write.removed.status_before_delete,
    { ...write.removed },
    "remove the combined point",
  );
  if (failed) return { error: failed };

  // The serves relabelled — a let, or first and second — each
  // compare-and-set on the status read; before the ending, which reads the
  // strokes.
  const retyped: PointCombineSaved["retyped"] = [];
  for (const { shotId, patch } of write.retyped) {
    const shot = read.shots.find((s) => s.id === shotId);
    if (!shot) continue;
    const status = labelShotStatusAfterPatch(labelShotState(shot), patch);
    const retypeFailed = await updateIfUnchanged(
      supabase,
      "label_shots",
      shotId,
      shot.status,
      { ...patch, status },
      "relabel the serve",
    );
    if (retypeFailed) return { error: retypeFailed };
    retyped.push({
      id: shotId,
      stroke: patch.stroke ?? shot.stroke,
      result: patch.result ?? shot.result,
      status,
    });
  }

  // The kept point's ending off the joined rows; its status stays `edited`
  // (or `added`) as the plan wrote it.
  const synced = await reconcileEnding({
    supabase,
    pointId: write.keptId,
    ghosts: gate.ghosts,
    keepStatus: true,
  });
  if ("error" in synced) return synced;

  return {
    ok: true,
    kept: {
      id: write.keptId,
      ...write.kept,
      ...endingColumns(synced.point),
    },
    removed: { id: write.removedId, ...write.removed },
    retyped,
  };
}

export function combineLabelPoints(
  pointId: unknown,
  direction: unknown,
  deps: LabelWriteDependencies = defaultLabelWriteDependencies,
): Promise<LabelCombinePointsResult> {
  return gated(
    deps,
    (supabase) => writeLabelPointCombine({ supabase, pointId, direction }),
    "combine the points",
  );
}
