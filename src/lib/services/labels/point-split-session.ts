/**
 * The console's "Split point here" (`point-split.ts`). Admin-gated like
 * edit-session.ts; not the marks gate.
 *
 * Its writes, on `label_points` and `label_shots` only, all in one
 * transaction (`applyLabelEdit` — a miss anywhere leaves nothing written): one
 * UPDATE of `point_index` per later point (the rail numbers rows by it); one
 * INSERT of the new row, with the ending its moved strokes derive; one UPDATE
 * moving the shots (`label_point_id`, by id list), their statuses untouched;
 * one UPDATE per opening serve of the new point that takes a new number
 * (`serveRestrokes`), with the status the stroke implies against its seed; and
 * one UPDATE of the anchor's status, rally ids and ending, guarded on the
 * status it was read with. The endings are each half's rows as they now
 * derive (`plannedReconcile`, ending-session.ts) — worked out here from the
 * rows read, so no read follows the write. No row is ever removed.
 */

import { randomUUID } from "node:crypto";

import type { AdminClient } from "@/lib/supabase/admin";
import { applyLabelEdit, type LabelEditOp } from "./apply-edit-session";
import { labelShotStatusAfterPatch, parseLabelShotSeed } from "./edit";
import {
  defaultLabelWriteDependencies,
  readSessionGate,
  type LabelWriteDependencies,
} from "./edit-session";
import { endingColumns, plannedReconcile } from "./ending-session";
import { gated, normaliseId, type LabelOpResult } from "./operations-session";
import {
  planPointSplit,
  type PointSplitSaved,
  type SplittablePoint,
  type SplittableShot,
} from "./point-split";
import {
  LABEL_SHOT_COLUMNS,
  toLabelPoint,
  toLabelShot,
  type LabelPointRow,
  type LabelShotRow,
} from "./rows";
import type {
  LabelEnding,
  LabelGameType,
  LabelPointStatus,
  LabelShot,
  LabelSide,
} from "./session";

export type LabelSplitPointResult = LabelOpResult<PointSplitSaved>;

interface PointRow {
  id: string;
  session_id: string;
  point_index: number;
  status: LabelPointStatus;
  set_number: number | null;
  game_number: number | null;
  server: LabelSide | null;
  game_type: LabelGameType;
  vendor_rally_ids: number[] | null;
  winner: LabelSide | null;
  ending: LabelEnding | null;
  ended_by: LabelSide | null;
}

const POINT_INDEX_COLUMNS =
  "id, session_id, point_index, status, set_number, game_number, server, game_type, vendor_rally_ids, winner, ending, ended_by";

/**
 * The anchor's shots, whole (each half's ending is derived from them), plus
 * `rally`: the frozen vendor stroke's `pred_rally_id` — the id the derivation
 * keys rallies by (`parse.ts`) and the one `label_points.vendor_rally_ids`
 * holds — as PostgREST hands a JSON text path back: a string, or null on an
 * added stroke, which carries no `vendor`.
 */
type ShotRow = LabelShotRow & { rally: string | null };

const SHOT_COLUMNS = `${LABEL_SHOT_COLUMNS}, rally:vendor->>pred_rally_id`;

/**
 * The session's points as the plan reads them. Only the anchor's shots are
 * read (`anchorShots`); every other point's list is empty, which the plan
 * never looks at.
 */
function toSplittable(
  rows: readonly PointRow[],
  anchorId: string,
  anchorShots: readonly ShotRow[],
): SplittablePoint[] {
  return rows.map((row) => ({
    id: row.id,
    pointIndex: row.point_index,
    status: row.status,
    setNumber: row.set_number,
    gameNumber: row.game_number,
    server: row.server,
    gameType: row.game_type,
    vendorRallyIds: row.vendor_rally_ids ?? [],
    shots: row.id === anchorId ? anchorShots.map(toSplittableShot) : [],
  }));
}

function toSplittableShot(shot: ShotRow): SplittableShot {
  return {
    id: shot.id,
    videoTime: shot.video_time,
    eventId: shot.event_id,
    status: shot.status,
    stroke: shot.stroke,
    result: shot.result,
    vendorRallyId: rallyId(shot.rally),
  };
}

function rallyId(text: string | null): number | null {
  if (text === null || text === undefined) return null;
  const value = Number(text);
  return Number.isInteger(value) ? value : null;
}

/** Shift, insert, move the shots, mark the anchor. Never throws. */
export async function writeLabelPointSplit(params: {
  supabase: AdminClient;
  pointId: unknown;
  shotId: unknown;
}): Promise<LabelSplitPointResult> {
  const { supabase } = params;
  const pointId = normaliseId(params.pointId);
  if (!pointId) return { error: "Invalid point id." };
  const shotId = normaliseId(params.shotId);
  if (!shotId) return { error: "Invalid shot id." };

  const { data: anchor, error: anchorError } = await supabase
    .from("label_points")
    .select("id, session_id")
    .eq("id", pointId)
    .maybeSingle<{ id: string; session_id: string }>();
  if (anchorError) {
    return { error: `Could not read the point: ${anchorError.message}` };
  }
  if (!anchor) return { error: "Point not found." };
  // Three independent reads; their refusals are taken in this order.
  const [gate, { data: rows, error: rowsError }, shotsRead] = await Promise.all(
    [
      readSessionGate(supabase, anchor.session_id),
      supabase
        .from("label_points")
        .select(POINT_INDEX_COLUMNS)
        .eq("session_id", anchor.session_id)
        .order("point_index")
        .returns<PointRow[]>(),
      supabase
        .from("label_shots")
        .select(SHOT_COLUMNS)
        .eq("label_point_id", pointId)
        .returns<ShotRow[]>(),
    ],
  );
  if ("error" in gate) return gate;
  if (rowsError) {
    return {
      error: `Could not read the session's points: ${rowsError.message}`,
    };
  }
  const { data: shotRows, error: shotsError } = shotsRead;
  if (shotsError) {
    return { error: `Could not read the point's shots: ${shotsError.message}` };
  }
  const points = toSplittable(rows ?? [], pointId, shotRows ?? []);
  const plan = planPointSplit(points, pointId, shotId);
  if ("error" in plan) return plan;
  const { write } = plan;
  const anchorRow = (rows ?? []).find((row) => row.id === pointId);
  if (!anchorRow) return { error: "Point not found." };
  const newId = randomUUID();

  // The new point opens on a first serve: its serves renumbered, each with
  // the status its new stroke implies — before either ending is derived, as a
  // second serve made a first no longer ends the point by missing.
  const serves: NonNullable<PointSplitSaved["serves"]> = [];
  const restroked = new Map<string, Pick<LabelShot, "stroke" | "status">>();
  for (const serve of write.serves) {
    const row = (shotRows ?? []).find((shot) => shot.id === serve.id);
    if (!row) continue;
    const status = labelShotStatusAfterPatch(
      { ...row, seed: parseLabelShotSeed(row.seed) },
      { stroke: serve.stroke },
    );
    serves.push({ ...serve, status });
    restroked.set(serve.id, { stroke: serve.stroke, status });
  }

  // Each half's shots as they stand once the writes land.
  const moved = new Set(write.movedShotIds);
  const halves: { split: LabelShot[]; kept: LabelShot[] } = {
    split: [],
    kept: [],
  };
  for (const row of shotRows ?? []) {
    const shot = { ...toLabelShot(row), ...restroked.get(row.id) };
    if (moved.has(row.id)) halves.split.push({ ...shot, labelPointId: newId });
    else halves.kept.push(shot);
  }
  // The statuses stay as the split writes them: `added` for the new point,
  // the anchor `edited` whatever its fields say.
  const split = plannedReconcile(
    { winner: null, ending: null, ended_by: null, status: write.insert.status },
    halves.split,
    gate.ghosts,
  );
  const kept = plannedReconcile(
    {
      winner: anchorRow.winner,
      ending: anchorRow.ending,
      ended_by: anchorRow.ended_by,
      status: write.anchor.status,
    },
    halves.kept,
    gate.ghosts,
  );

  const ops: LabelEditOp[] = [
    ...write.shifts.map((shift): LabelEditOp => ({
      op: "update",
      table: "label_points",
      ids: [shift.id],
      set: { point_index: shift.point_index },
    })),
    {
      op: "insert",
      table: "label_points",
      values: {
        id: newId,
        ...write.insert,
        serve_side: null,
        winner: null,
        ending: null,
        ended_by: null,
        seed: null,
        checked_at: null,
        ...split?.patch,
      },
    },
  ];
  if (write.movedShotIds.length > 0) {
    ops.push({
      op: "update",
      table: "label_shots",
      ids: write.movedShotIds,
      set: { label_point_id: newId },
    });
  }
  for (const serve of serves) {
    ops.push({
      op: "update",
      table: "label_shots",
      ids: [serve.id],
      set: { stroke: serve.stroke, status: serve.status },
    });
  }
  // Guarded on the anchor's status as read: if another tab moved it, nothing
  // of the split is written.
  ops.push({
    op: "update",
    table: "label_points",
    ids: [pointId],
    set: { ...write.anchor, ...kept?.patch },
    expect_status: anchorRow.status,
  });

  const applied = await applyLabelEdit(
    supabase,
    anchor.session_id,
    ops,
    "split the point",
  );
  if ("error" in applied) return applied;
  const inserted = applied.inserted[0] as LabelPointRow | undefined;
  if (!inserted) return { error: "Could not add the point: no row came back" };

  return {
    ok: true,
    // The row read back whole: an added point with no seed and no shots, and
    // the ending its moved strokes derive.
    point: toLabelPoint(inserted),
    ...(serves.length > 0 ? { serves } : {}),
    anchor: {
      id: pointId,
      ...write.anchor,
      ...endingColumns(kept?.point ?? null),
    },
  };
}

export function splitLabelPoint(
  pointId: unknown,
  shotId: unknown,
  deps: LabelWriteDependencies = defaultLabelWriteDependencies,
): Promise<LabelSplitPointResult> {
  return gated(
    deps,
    (supabase) => writeLabelPointSplit({ supabase, pointId, shotId }),
    "split the point",
  );
}
