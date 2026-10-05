/**
 * The labelling console's "Combine with point above / below", admin-gated:
 * two neighbouring points of a game become one, the later point's shots
 * joining the earlier and the later row left as a tombstone
 * (`point-combine.ts`).
 *
 * Same shape as point-insert-session.ts: the entry point re-checks
 * `requireAdmin`, runs on the service-role client, refuses a session that is
 * not `labelling` (`checkSessionOpen`), and decides what to write with the
 * pure plan the console ran for its optimistic rows. A session labelled
 * without marks takes a combine too — a manual edit, not an answer to a mark.
 *
 * Its writes, in order, on `label_shots` and `label_points` and nothing
 * else: ONE UPDATE moving the later point's shots (`label_point_id`, by id
 * list) — their statuses untouched; ONE UPDATE of the kept point's winner,
 * ending, ended by, rally ids and status; ONE compare-and-set UPDATE
 * tombstoning the later point (`updateIfUnchanged`, as a plain delete is
 * written). No row is ever removed. `tests/label-operations.spec.ts` scans
 * this file for a delete.
 */

import type { AdminClient } from "@/lib/supabase/admin";
import {
  checkSessionOpen,
  defaultLabelWriteDependencies,
  type LabelWriteDependencies,
} from "./edit-session";
import {
  gated,
  normaliseId,
  updateIfUnchanged,
  type LabelOpResult,
} from "./operations-session";
import {
  isCombineDirection,
  planPointCombine,
  type CombinablePoint,
  type PointCombineSaved,
} from "./point-combine";
import type { LabelEnding, LabelPointStatus, LabelSide } from "./session";

export type LabelCombinePointsResult = LabelOpResult<PointCombineSaved>;

/** What the plan reads of each point of the session. */
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

/**
 * Check the session, read its points and the later point's shot ids, move
 * the shots, write the kept point, tombstone the later one. Never throws.
 */
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
  const closed = await checkSessionOpen(supabase, point.session_id);
  if (closed) return { error: closed };

  const { data: rows, error: rowsError } = await supabase
    .from("label_points")
    .select(POINT_COLUMNS)
    .eq("session_id", point.session_id)
    .order("point_index")
    .returns<PointRow[]>();
  if (rowsError) {
    return {
      error: `Could not read the session's points: ${rowsError.message}`,
    };
  }

  // The plan with no shots yet: which point is the later one is decided
  // first, then only that point's shot ids are read.
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

  const { data: shotRows, error: shotsError } = await supabase
    .from("label_shots")
    .select("id")
    .eq("label_point_id", dry.write.removedId)
    .returns<{ id: string }[]>();
  if (shotsError) {
    return { error: `Could not read the point's shots: ${shotsError.message}` };
  }
  const plan = planPointCombine(
    points.map((p) =>
      p.id === dry.write.removedId ? { ...p, shots: shotRows ?? [] } : p,
    ),
    pointId,
    direction,
  );
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

  const { error: keptError } = await supabase
    .from("label_points")
    .update({ ...write.kept })
    .eq("id", write.keptId);
  if (keptError) {
    return {
      error: `Could not write the combined point: ${keptError.message}`,
    };
  }

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

  return {
    ok: true,
    kept: { id: write.keptId, ...write.kept },
    removed: { id: write.removedId, ...write.removed },
  };
}

/** The admin-gated entry point behind `combineLabelPointsAction`. */
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
