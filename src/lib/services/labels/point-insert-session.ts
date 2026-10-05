/**
 * The labelling console's "Add point", admin-gated: make room for a point the
 * vendor never saw — the suggestion's slot between two points served from
 * one side (board 08m §5), or any point's "Add point above" / "Add point
 * below" (`point-insert.ts`).
 *
 * Same shape as operations-session.ts: the entry point re-checks
 * `requireAdmin`, runs on the service-role client, refuses a session that is
 * not `labelling` (`checkSessionOpen`, the gate every row operation shares),
 * and decides what to write with the pure plan the console ran for its
 * optimistic rows. NOT the marks gate (`checkSessionOpenWithMarks`): adding
 * a point is a manual label edit, not an answer to a mark, so a session
 * labelled without marks — the ground-truth match — takes one too. The
 * suggestion slot that also calls this only draws when marks are on.
 *
 * Its writes are all on `label_points` and nothing else: one UPDATE of
 * `point_index` per point at or after the slot, HIGHEST index first so no two
 * rows share an index while the shift is under way (the column has no unique
 * constraint, but the rail numbers rows by it), then ONE INSERT of the new
 * row — `winner`, `ending`, `ended_by`, `serve_side` and `seed` null, no
 * `checked_at`, no shots — returned as the console draws it. No row is ever
 * removed. `tests/label-operations.spec.ts` scans this file for a delete.
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
import type {
  LabelEnding,
  LabelGameType,
  LabelPoint,
  LabelPointStatus,
  LabelServeSide,
  LabelSide,
} from "./session";

export type LabelInsertPointResult = LabelOpResult<{ point: LabelPoint }>;

/** `position` as the action receives it: anything else is "before". */
function normalisePosition(position: unknown): InsertPosition {
  return position === "after" ? "after" : "before";
}

/** What the plan reads of each row of the session. */
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

/** The inserted row, read back whole. */
interface InsertedRow extends IndexRow {
  vendor_rally_ids: number[] | null;
  serve_side: LabelServeSide | null;
  winner: LabelSide | null;
  ending: LabelEnding | null;
  ended_by: LabelSide | null;
  status_before_delete: Exclude<LabelPointStatus, "deleted"> | null;
  checked_at: string | null;
  note: string | null;
  dismissed: string[] | null;
}

const POINT_COLUMNS = `${INDEX_COLUMNS}, vendor_rally_ids, serve_side, winner, ending, ended_by, status_before_delete, checked_at, note, dismissed`;

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

/** The inserted row as the console draws it: an added point with no seed. */
function toLabelPoint(row: InsertedRow): LabelPoint {
  return {
    id: row.id,
    pointIndex: row.point_index,
    vendorRallyIds: row.vendor_rally_ids ?? [],
    setNumber: row.set_number,
    gameNumber: row.game_number,
    server: row.server,
    serveSide: row.serve_side ?? null,
    winner: row.winner ?? null,
    ending: row.ending ?? null,
    endedBy: row.ended_by ?? null,
    gameType: row.game_type,
    status: row.status,
    statusBeforeDelete: row.status_before_delete ?? null,
    checkedAt: row.checked_at ?? null,
    note: row.note ?? null,
    dismissed: row.dismissed ?? [],
    seed: null,
    shots: [],
  };
}

/**
 * Check the session, read its points, shift the later ones, insert the new
 * one. Never throws.
 */
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
    .select(POINT_COLUMNS)
    .single<InsertedRow>();
  if (insertError || !inserted) {
    return {
      error: `Could not add the point: ${insertError?.message ?? "no row came back"}`,
    };
  }
  return { ok: true, point: toLabelPoint(inserted) };
}

/** The admin-gated entry point behind `insertLabelPointAction`. */
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
