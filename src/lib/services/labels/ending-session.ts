/**
 * "How it ended" follows the shot rows, on the server: the point patch a shot
 * write calls for (`endingPatchForShotChange`) is written in the same call as
 * the shot, so a save can never leave its point saying something its strokes
 * no longer do. The console used to send it as a second request, which could
 * be lost.
 *
 * Two forms. `syncEndingAfterShotChange` is the shot write paths': the caller
 * hands over the point's shots as read before its write and as they stand
 * with the change applied, and the patch is the one that change calls for —
 * so an ending set by hand survives edits that leave the rows saying the same
 * thing. `reconcileEnding` has no before: it writes what the rows derive
 * whenever that is not what the point holds. Split and combine use it on the
 * points they rebuilt, and a winner pick on the point it changed.
 *
 * The point write is compare-and-set on the `updated_at` it read, retried
 * like `writeLabelPointEdit`, with the status the patch implies against the
 * row's frozen seed. Writes `label_points` only.
 */

import type { AdminClient } from "@/lib/supabase/admin";
import {
  LABEL_POINT_SEED_FIELDS,
  labelPointStatusAfterPatch,
  parseLabelPointSeed,
  type LabelPointFields,
  type LabelPointPatch,
} from "./edit";
import {
  deriveEnding,
  endingPatchForShotChange,
  endingPatchTo,
} from "./ending-derived";
import { LABEL_SHOT_COLUMNS, toLabelShot, type LabelShotRow } from "./rows";
import {
  isNonPointEnding,
  type LabelEnding,
  type LabelPointStatus,
  type LabelShot,
  type LabelSide,
} from "./session";

/**
 * What a write hands back about the point once its ending followed the rows
 * — camelCase like the other results. Absent from a result when nothing was
 * due.
 */
export interface LabelPointEndingSynced {
  ending: LabelEnding | null;
  endedBy: LabelSide | null;
  winner: LabelSide | null;
  status: LabelPointStatus;
}

/**
 * A synced point as the `label_points` columns a split or combine answer
 * carries; nothing when the ending was not moved.
 */
export function endingColumns(
  point: LabelPointEndingSynced | null,
): Partial<Pick<LabelPointFields, "winner" | "ending" | "ended_by">> {
  return point
    ? { winner: point.winner, ending: point.ending, ended_by: point.endedBy }
    : {};
}

export type LabelEndingSyncResult =
  { point: LabelPointEndingSynced | null } | { error: string };

type EndingPatch = Pick<LabelPointPatch, "ending" | "ended_by" | "winner">;

type EndingRow = LabelPointFields & {
  id: string;
  updated_at: string;
  status: LabelPointStatus;
  /** Raw jsonb — parsed before the status rule trusts it. */
  seed: unknown;
};

const ENDING_COLUMNS = `id, updated_at, status, seed, ${LABEL_POINT_SEED_FIELDS.join(", ")}`;

/** How many fresh reads a write gets when the row changed under it. */
const MAX_SYNC_ATTEMPTS = 3;
const BUSY = "The point changed while its ending was saving. Try again.";

/**
 * Every shot row of `pointIds`' points, as the console's rows. `whose` words
 * the failure: "points'" for several, "point's" for one.
 */
export async function readShotsOfPoints(
  supabase: AdminClient,
  pointIds: readonly string[],
  whose = "points'",
): Promise<{ shots: LabelShot[] } | { error: string }> {
  if (pointIds.length === 0) return { shots: [] };
  const shots = supabase.from("label_shots").select(LABEL_SHOT_COLUMNS);
  const { data, error } = await (
    pointIds.length === 1
      ? shots.eq("label_point_id", pointIds[0])
      : shots.in("label_point_id", pointIds)
  ).returns<LabelShotRow[]>();
  if (error) {
    return { error: `Could not read the ${whose} shots: ${error.message}` };
  }
  return { shots: (data ?? []).map(toLabelShot) };
}

/** Every shot row of one point, as the console's rows. */
export const readPointShots = (supabase: AdminClient, pointId: string) =>
  readShotsOfPoints(supabase, [pointId], "point's");

/**
 * Read the point, let `decide` say what patch its stored values call for, and
 * write that patch with the status it implies — guarded on the `updated_at`
 * read, from a fresh read on a miss. `decide` runs per attempt, on the row as
 * it stands then. Null from it means nothing is due.
 */
async function writeEndingPatch(
  supabase: AdminClient,
  pointId: string,
  decide: (row: EndingRow) => EndingPatch | null,
  { keepStatus = false }: { keepStatus?: boolean } = {},
): Promise<LabelEndingSyncResult> {
  for (let attempt = 0; attempt < MAX_SYNC_ATTEMPTS; attempt += 1) {
    const { data: row, error } = await supabase
      .from("label_points")
      .select(ENDING_COLUMNS)
      .eq("id", pointId)
      .maybeSingle<EndingRow>();
    if (error) return { error: `Could not read the point: ${error.message}` };
    if (!row) return { error: "Point not found." };

    const patch = decide(row);
    if (!patch) return { point: null };
    const status = keepStatus
      ? row.status
      : labelPointStatusAfterPatch(
          { ...row, seed: parseLabelPointSeed(row.seed) },
          patch,
        );
    const { data: written, error: writeError } = await supabase
      .from("label_points")
      .update({ ...patch, status })
      .eq("id", pointId)
      .eq("updated_at", row.updated_at)
      .select("id");
    if (writeError) {
      return { error: `Could not save the point: ${writeError.message}` };
    }
    if (written && written.length > 0) {
      return {
        point: {
          ending: "ending" in patch ? (patch.ending ?? null) : row.ending,
          endedBy:
            "ended_by" in patch ? (patch.ended_by ?? null) : row.ended_by,
          winner: "winner" in patch ? (patch.winner ?? null) : row.winner,
          status,
        },
      };
    }
  }
  return { error: BUSY };
}

/**
 * The shot write paths' form: the point patch the change from `before` to
 * `after` (its shots, as read and with the change applied) calls for, written
 * once the shot write has succeeded. `ghosts` is the session's
 * `marks_enabled`.
 */
export function syncEndingAfterShotChange(params: {
  supabase: AdminClient;
  pointId: string;
  ghosts: boolean;
  before: readonly LabelShot[];
  after: readonly LabelShot[];
}): Promise<LabelEndingSyncResult> {
  const { supabase, pointId, ghosts, before, after } = params;
  return writeEndingPatch(supabase, pointId, (row) =>
    endingPatchForShotChange(
      { winner: row.winner, shots: [...before] },
      {
        winner: row.winner,
        ending: row.ending,
        endedBy: row.ended_by,
        shots: [...after],
      },
      ghosts,
    ),
  );
}

/**
 * The no-before form: what the rows derive, written when it is not what the
 * point holds. Nothing when the rows say nothing or the point is a let or a
 * non-point. The winner goes along only when the rows settle one the point
 * does not hold — and never with `settleWinner` off, the winner pick's case,
 * where the labeller just chose it. `keepStatus` leaves the status as the
 * caller wrote it: a split or combine marked the point `edited` on purpose.
 * Reads the point's shots unless handed them.
 */
export async function reconcileEnding(params: {
  supabase: AdminClient;
  pointId: string;
  ghosts: boolean;
  shots?: readonly LabelShot[];
  settleWinner?: boolean;
  keepStatus?: boolean;
}): Promise<LabelEndingSyncResult> {
  const { supabase, pointId, ghosts, settleWinner = true, keepStatus } = params;
  let shots = params.shots;
  if (!shots) {
    const read = await readPointShots(supabase, pointId);
    if ("error" in read) return read;
    shots = read.shots;
  }
  const rows = [...shots];
  return writeEndingPatch(
    supabase,
    pointId,
    (row) => {
      if (isNonPointEnding(row.ending)) return null;
      const now = deriveEnding({ winner: row.winner, shots: rows }, ghosts);
      if (!now) return null;
      return endingPatchTo(
        { ending: row.ending, endedBy: row.ended_by, winner: row.winner },
        now,
        settleWinner,
      );
    },
    { keepStatus },
  );
}

/**
 * The sentence a write answers with when its own write landed (`landed`) but
 * the point's did not: the rows and the point disagree until a reload.
 */
export function endingSyncFailed(
  error: string,
  landed = "The shot was saved",
): string {
  return `${error} ${landed}; reload to see the point as it stands.`;
}

/** The answer's `point`, when the write moved the ending; nothing otherwise. */
export function withSyncedPoint(synced: {
  point: LabelPointEndingSynced | null;
}): { point?: LabelPointEndingSynced } {
  return synced.point ? { point: synced.point } : {};
}
