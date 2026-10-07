/**
 * The console's "Split point here" (`point-split.ts`). Admin-gated like
 * edit-session.ts; not the marks gate.
 *
 * Its writes, in order, on `label_points` and `label_shots` only: one UPDATE of
 * `point_index` per later point, HIGHEST first (the rail numbers rows by it);
 * one INSERT of the new row; one UPDATE moving the shots (`label_point_id`, by
 * id list), their statuses untouched; one UPDATE of the anchor's status and
 * rally ids; then each half's ending as its rows now derive it
 * (`reconcileEnding`, ending-session.ts) — the new point's, which starts
 * blank, and the anchor's, where its last stroke changed. No row is ever
 * removed.
 */

import type { AdminClient } from "@/lib/supabase/admin";
import {
  defaultLabelWriteDependencies,
  readSessionGate,
  type LabelWriteDependencies,
} from "./edit-session";
import { reconcileEnding } from "./ending-session";
import { gated, normaliseId, type LabelOpResult } from "./operations-session";
import {
  planPointSplit,
  type PointSplitSaved,
  type SplittablePoint,
  type SplittableShot,
} from "./point-split";
import { LABEL_POINT_COLUMNS, toLabelPoint, type LabelPointRow } from "./rows";
import type {
  LabelGameType,
  LabelPointStatus,
  LabelShotStatus,
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
}

const POINT_INDEX_COLUMNS =
  "id, session_id, point_index, status, set_number, game_number, server, game_type, vendor_rally_ids";

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
  const gate = await readSessionGate(supabase, anchor.session_id);
  if ("error" in gate) return gate;

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
    .select(LABEL_POINT_COLUMNS)
    .single<LabelPointRow>();
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

  // Both halves' endings, off the rows each now holds. The statuses stay as
  // just written: a split's anchor is `edited` whatever its fields say.
  const split = await reconcileEnding({
    supabase,
    pointId: inserted.id,
    ghosts: gate.ghosts,
    keepStatus: true,
  });
  if ("error" in split) return split;
  const kept = await reconcileEnding({
    supabase,
    pointId,
    ghosts: gate.ghosts,
    keepStatus: true,
  });
  if ("error" in kept) return kept;

  const point = toLabelPoint(inserted);
  return {
    ok: true,
    // The row read back whole: an added point with no seed and no shots, and
    // the ending its moved strokes derive.
    point: split.point
      ? {
          ...point,
          ending: split.point.ending,
          endedBy: split.point.endedBy,
          winner: split.point.winner,
        }
      : point,
    anchor: {
      id: pointId,
      ...write.anchor,
      ...(kept.point
        ? {
            ending: kept.point.ending,
            ended_by: kept.point.endedBy,
            winner: kept.point.winner,
          }
        : {}),
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
