/**
 * The console's "Add point" (`point-insert.ts`): the suggestion's slot, or any
 * point's "Add point above" / "Add point below". Admin-gated like
 * edit-session.ts; not the marks gate (`checkSessionOpen`'s `blind`): adding a
 * point is a manual label edit, so a session labelled without marks takes one
 * too.
 *
 * Writes `label_points` only, in one transaction (`applyLabelEdit`): one
 * UPDATE of `point_index` per point at or after the slot, then one INSERT of
 * the new row (`winner`, `ending`, `ended_by`, `serve_side` and `seed` null, no
 * shots). One read, one write: the session's gate and points side by side,
 * then everything else in a single round trip. No row is ever removed.
 */

import { randomUUID } from "node:crypto";

import type { AdminClient } from "@/lib/supabase/admin";
import { applyLabelEdit, type LabelEditOp } from "./apply-edit-session";
import {
  defaultLabelWriteDependencies,
  readSessionGate,
  type LabelWriteDependencies,
} from "./edit-session";
import { gated, normaliseId, type LabelOpResult } from "./operations-session";
import {
  planInsertedPoint,
  type InsertablePoint,
  type InsertPosition,
} from "./point-insert";
import { toLabelPoint, type LabelPointRow } from "./rows";
import type {
  LabelGameType,
  LabelPoint,
  LabelPointStatus,
  LabelSide,
} from "./session";

export type LabelInsertPointResult = LabelOpResult<{ point: LabelPoint }>;

/** `position` as the action receives it: anything else is "before". */
function normalisePosition(position: unknown): InsertPosition {
  return position === "after" ? "after" : "before";
}

interface IndexRow {
  id: string;
  point_index: number;
  status: LabelPointStatus;
  set_number: number | null;
  game_number: number | null;
  server: LabelSide | null;
  game_type: LabelGameType;
}

const INDEX_COLUMNS =
  "id, point_index, status, set_number, game_number, server, game_type";

function toInsertable(row: IndexRow): InsertablePoint {
  return {
    id: row.id,
    pointIndex: row.point_index,
    status: row.status,
    setNumber: row.set_number,
    gameNumber: row.game_number,
    server: row.server,
    gameType: row.game_type,
  };
}

/** Shift the later points, insert the new one. Never throws. */
export async function writeLabelPointInsert(params: {
  supabase: AdminClient;
  sessionId: unknown;
  /** The anchor: the new point goes before it (the default) or after it. */
  anchorPointId: unknown;
  position?: unknown;
}): Promise<LabelInsertPointResult> {
  const { supabase } = params;
  const sessionId = normaliseId(params.sessionId);
  if (!sessionId) return { error: "Invalid session id." };
  const anchorPointId = normaliseId(params.anchorPointId);
  if (!anchorPointId) return { error: "Invalid point id." };
  const position = normalisePosition(params.position);

  const [gate, { data: rows, error }] = await Promise.all([
    readSessionGate(supabase, sessionId),
    supabase
      .from("label_points")
      .select(INDEX_COLUMNS)
      .eq("session_id", sessionId)
      .order("point_index")
      .returns<IndexRow[]>(),
  ]);
  if ("error" in gate) return gate;
  if (error) {
    return { error: `Could not read the session's points: ${error.message}` };
  }

  const plan = planInsertedPoint(
    (rows ?? []).map(toInsertable),
    anchorPointId,
    position,
  );
  if ("error" in plan) return plan;

  const ops: LabelEditOp[] = plan.write.shifts.map((shift) => ({
    op: "update",
    table: "label_points",
    ids: [shift.id],
    set: { point_index: shift.point_index },
  }));
  ops.push({
    op: "insert",
    table: "label_points",
    values: {
      id: randomUUID(),
      ...plan.write.insert,
      serve_side: null,
      winner: null,
      ending: null,
      ended_by: null,
      seed: null,
      checked_at: null,
    },
  });
  const applied = await applyLabelEdit(
    supabase,
    sessionId,
    ops,
    "add the point",
  );
  if ("error" in applied) return applied;
  const inserted = applied.inserted[0] as LabelPointRow | undefined;
  if (!inserted) return { error: "Could not add the point: no row came back" };
  // The row read back whole, as the console draws it: an added point with no
  // seed and no shots.
  return { ok: true, point: toLabelPoint(inserted) };
}

export function insertLabelPoint(
  sessionId: unknown,
  anchorPointId: unknown,
  position: unknown = "before",
  deps: LabelWriteDependencies = defaultLabelWriteDependencies,
): Promise<LabelInsertPointResult> {
  return gated(
    deps,
    (supabase) =>
      writeLabelPointInsert({ supabase, sessionId, anchorPointId, position }),
    "add the point",
  );
}
