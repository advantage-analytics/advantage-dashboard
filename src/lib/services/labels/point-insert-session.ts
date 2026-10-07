/**
 * The console's "Add point" (`point-insert.ts`): the suggestion's slot, or any
 * point's "Add point above" / "Add point below". Admin-gated like
 * edit-session.ts; not the marks gate (`checkSessionOpen`'s `blind`): adding a
 * point is a manual label edit, so a session labelled without marks takes one
 * too.
 *
 * Writes `label_points` only: one UPDATE of `point_index` per point at or after
 * the slot, HIGHEST index first so no two rows share an index while the shift
 * is under way, then one INSERT of the new row (`winner`, `ending`, `ended_by`,
 * `serve_side` and `seed` null, no shots). No row is ever removed.
 */

import type { AdminClient } from "@/lib/supabase/admin";
import {
  checkSessionOpen,
  defaultLabelWriteDependencies,
  type LabelWriteDependencies,
} from "./edit-session";
import { gated, normaliseId, type LabelOpResult } from "./operations-session";
import {
  planInsertedPoint,
  type InsertablePoint,
  type InsertPosition,
} from "./point-insert";
import { LABEL_POINT_COLUMNS, toLabelPoint, type LabelPointRow } from "./rows";
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

  const closed = await checkSessionOpen(supabase, sessionId);
  if (closed) return { error: closed };

  const { data: rows, error } = await supabase
    .from("label_points")
    .select(INDEX_COLUMNS)
    .eq("session_id", sessionId)
    .order("point_index")
    .returns<IndexRow[]>();
  if (error) {
    return { error: `Could not read the session's points: ${error.message}` };
  }

  const plan = planInsertedPoint(
    (rows ?? []).map(toInsertable),
    anchorPointId,
    position,
  );
  if ("error" in plan) return plan;

  // Highest first (the plan's order), one row at a time: an index is never
  // taken by two rows between one update and the next.
  for (const shift of plan.write.shifts) {
    const { error: shiftError } = await supabase
      .from("label_points")
      .update({ point_index: shift.point_index })
      .eq("id", shift.id);
    if (shiftError) {
      return {
        error: `Could not make room for the point: ${shiftError.message}`,
      };
    }
  }

  const { data: inserted, error: insertError } = await supabase
    .from("label_points")
    .insert({
      session_id: sessionId,
      ...plan.write.insert,
      serve_side: null,
      winner: null,
      ending: null,
      ended_by: null,
      seed: null,
      checked_at: null,
    })
    .select(LABEL_POINT_COLUMNS)
    .single<LabelPointRow>();
  if (insertError || !inserted) {
    return {
      error: `Could not add the point: ${insertError?.message ?? "no row came back"}`,
    };
  }
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
