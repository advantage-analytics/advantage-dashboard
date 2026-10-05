/**
 * The labelling console's "Split point here", admin-gated: a point the
 * vendor ran two real points into becomes two rows, the chosen shot and
 * every shot after it moving to a new point right below (`point-split.ts`).
 *
 * Same shape as point-insert-session.ts: the entry point re-checks
 * `requireAdmin`, runs on the service-role client, refuses a session that is
 * not `labelling` (`checkSessionOpen`), and decides what to write with the
 * pure plan the console ran for its optimistic rows. A session labelled
 * without marks takes a split too — a manual edit, not an answer to a mark.
 *
 * Its writes, in order, on `label_points` and `label_shots` and nothing
 * else: one UPDATE of `point_index` per later point, HIGHEST first (the
 * column has no unique constraint, but the rail numbers rows by it); ONE
 * INSERT of the new row; ONE UPDATE moving the shots (`label_point_id`, by
 * id list) — their statuses untouched; ONE UPDATE of the anchor's status and
 * rally ids. No row is ever removed. `tests/label-operations.spec.ts` scans
 * this file for a delete.
 */

import type { AdminClient } from "@/lib/supabase/admin";
import {
  checkSessionOpen,
  defaultLabelWriteDependencies,
  type LabelWriteDependencies,
} from "./edit-session";
import { gated, normaliseId, type LabelOpResult } from "./operations-session";
import {
  planPointSplit,
  type PointSplitSaved,
  type SplittablePoint,
  type SplittableShot,
} from "./point-split";
import type {
  LabelEnding,
  LabelGameType,
  LabelPoint,
  LabelPointStatus,
  LabelServeSide,
  LabelShotStatus,
  LabelSide,
} from "./session";

export type LabelSplitPointResult = LabelOpResult<PointSplitSaved>;

/** What the plan reads of each point of the session. */
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
}

const POINT_INDEX_COLUMNS =
  "id, session_id, point_index, status, set_number, game_number, server, game_type, vendor_rally_ids";

/** The inserted row, read back whole. */
interface InsertedRow extends PointRow {
  serve_side: LabelServeSide | null;
  winner: LabelSide | null;
  ending: LabelEnding | null;
  ended_by: LabelSide | null;
  status_before_delete: Exclude<LabelPointStatus, "deleted"> | null;
  checked_at: string | null;
  note: string | null;
  dismissed: string[] | null;
}

const INSERTED_COLUMNS = `${POINT_INDEX_COLUMNS}, serve_side, winner, ending, ended_by, status_before_delete, checked_at, note, dismissed`;

/**
 * What the plan reads of the anchor's shots. `rally` is the frozen vendor
 * stroke's `pred_rally_id` — the id the derivation keys rallies by
 * (`parse.ts`) and the one `label_points.vendor_rally_ids` holds — as
 * PostgREST hands a JSON text path back: a string, or null on an added
 * stroke, which carries no `vendor`.
 */
interface ShotRow {
  id: string;
  video_time: number | null;
  event_id: number | null;
  status: LabelShotStatus;
  rally: string | null;
}

const SHOT_COLUMNS =
  "id, video_time, event_id, status, rally:vendor->>pred_rally_id";

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
    vendorRallyId: rallyId(shot.rally),
  };
}

function rallyId(text: string | null): number | null {
  if (text === null || text === undefined) return null;
  const value = Number(text);
  return Number.isInteger(value) ? value : null;
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
 * Check the session, read its points and the anchor's shots, shift the later
 * points, insert the new one, move the shots, mark the anchor. Never throws.
 */
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
  const closed = await checkSessionOpen(supabase, anchor.session_id);
  if (closed) return { error: closed };

  const { data: rows, error: rowsError } = await supabase
    .from("label_points")
    .select(POINT_INDEX_COLUMNS)
    .eq("session_id", anchor.session_id)
    .order("point_index")
    .returns<PointRow[]>();
  if (rowsError) {
    return {
      error: `Could not read the session's points: ${rowsError.message}`,
    };
  }
  const { data: shotRows, error: shotsError } = await supabase
    .from("label_shots")
    .select(SHOT_COLUMNS)
    .eq("label_point_id", pointId)
    .returns<ShotRow[]>();
  if (shotsError) {
    return { error: `Could not read the point's shots: ${shotsError.message}` };
  }
  const plan = planPointSplit(
    toSplittable(rows ?? [], pointId, shotRows ?? []),
    pointId,
    shotId,
  );
  if ("error" in plan) return plan;
  const { write } = plan;

  // Highest first (the plan's order), one row at a time: an index is never
  // taken by two rows between one update and the next.
  for (const shift of write.shifts) {
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
      session_id: anchor.session_id,
      ...write.insert,
      serve_side: null,
      winner: null,
      ending: null,
      ended_by: null,
      seed: null,
      checked_at: null,
    })
    .select(INSERTED_COLUMNS)
    .single<InsertedRow>();
  if (insertError || !inserted) {
    return {
      error: `Could not add the point: ${insertError?.message ?? "no row came back"}`,
    };
  }

  const { error: moveError } = await supabase
    .from("label_shots")
    .update({ label_point_id: inserted.id })
    .in("id", write.movedShotIds);
  if (moveError) {
    return { error: `Could not move the shots: ${moveError.message}` };
  }

  const { error: anchorWriteError } = await supabase
    .from("label_points")
    .update({ ...write.anchor })
    .eq("id", pointId);
  if (anchorWriteError) {
    return {
      error: `Could not mark the point edited: ${anchorWriteError.message}`,
    };
  }

  return {
    ok: true,
    point: toLabelPoint(inserted),
    anchor: { id: pointId, ...write.anchor },
  };
}

/** The admin-gated entry point behind `splitLabelPointAction`. */
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
