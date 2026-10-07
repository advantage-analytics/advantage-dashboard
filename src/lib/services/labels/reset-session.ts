/**
 * The console's Reset: write an edited shot's or point's seed back over its
 * values. Admin-gated like edit-session.ts, planned by reset.ts.
 *
 * Every write is an UPDATE on `label_shots` / `label_points`, compare-and-set
 * on the status the row was read with, so a reset racing a delete in another
 * tab cannot bring a tombstone's values back. A point reset writes the point's
 * own columns, then each stroke whose hitter goes back to its seed
 * (`writeShotSwaps`, grouped by value tuple as a swap's are) — never a
 * stroke's other values, the note or `checked_at`.
 */

import type { AdminClient } from "@/lib/supabase/admin";
import { defaultLabelWriteDependencies, readSessionGate } from "./edit-session";
import type { LabelWriteDependencies } from "./edit-session";
import { parseLabelPointSeed, parseLabelShotSeed } from "./edit";
import {
  endingSyncFailed,
  readPointShots,
  syncEndingAfterShotChange,
} from "./ending-session";
import {
  gated,
  normaliseId,
  readShotsOfPoints,
  updateIfUnchanged,
  writeShotSwaps,
  type LabelOpResult,
  type LabelShotStatusResult,
} from "./operations-session";
import type { ShotSwapWrite } from "./player-swap";
import { applyShotReset, planPointReset, planShotReset } from "./reset";
import type { LabelPointStatus, LabelShotStatus } from "./session";

export type LabelPointResetResult = LabelOpResult<{
  status: LabelPointStatus;
  /** The strokes whose hitter went back to its seed; empty when none. */
  shots: ShotSwapWrite[];
}>;

interface ResetRow<S> {
  id: string;
  session_id: string;
  /** A shot's point; a point row carries none. */
  label_point_id?: string;
  status: S;
  /** Raw jsonb — parsed before anything is written from it. */
  seed: unknown;
}

/** The row and its session's gate (`ghosts`, edit-session.ts). */
async function readResetRow<S>(
  supabase: AdminClient,
  table: "label_shots" | "label_points",
  id: string,
  what: "shot" | "point",
): Promise<{ row: ResetRow<S>; ghosts: boolean } | { error: string }> {
  const { data, error } = await supabase
    .from(table)
    .select(
      what === "shot"
        ? "id, session_id, label_point_id, status, seed"
        : "id, session_id, status, seed",
    )
    .eq("id", id)
    .maybeSingle<ResetRow<S>>();
  if (error) return { error: `Could not read the ${what}: ${error.message}` };
  if (!data)
    return { error: what === "shot" ? "Shot not found." : "Point not found." };
  const gate = await readSessionGate(supabase, data.session_id);
  if ("error" in gate) return gate;
  return { row: data, ghosts: gate.ghosts };
}

/**
 * Write a shot's seed back over its values, and `kept`; then its point's
 * ending, which the seeded values may move (ending-session.ts). Never throws.
 */
export async function writeLabelShotReset(params: {
  supabase: AdminClient;
  shotId: unknown;
}): Promise<LabelShotStatusResult> {
  const shotId = normaliseId(params.shotId);
  if (!shotId) return { error: "Invalid shot id." };
  const read = await readResetRow<LabelShotStatus>(
    params.supabase,
    "label_shots",
    shotId,
    "shot",
  );
  if ("error" in read) return read;
  const plan = planShotReset({
    status: read.row.status,
    seed: parseLabelShotSeed(read.row.seed ?? null),
  });
  if ("error" in plan) return plan;
  const pointId = read.row.label_point_id ?? "";
  const owned = await readPointShots(params.supabase, pointId);
  if ("error" in owned) return owned;
  const failed = await updateIfUnchanged(
    params.supabase,
    "label_shots",
    shotId,
    read.row.status,
    { ...plan.write },
    "reset the shot",
  );
  if (failed) return { error: failed };
  const synced = await syncEndingAfterShotChange({
    supabase: params.supabase,
    pointId,
    ghosts: read.ghosts,
    before: owned.shots,
    after: owned.shots.map((shot) =>
      shot.id === shotId ? applyShotReset(shot) : shot,
    ),
  });
  if ("error" in synced) return { error: endingSyncFailed(synced.error) };
  return {
    ok: true,
    status: plan.write.status,
    ...(synced.point ? { point: synced.point } : {}),
  };
}

/**
 * Write a point's seed back over its own fields, and `unchanged`; then its
 * strokes' seeded hitters, where they differ. The point first, compare-and-set,
 * then the strokes in grouped writes.
 */
export async function writeLabelPointReset(params: {
  supabase: AdminClient;
  pointId: unknown;
}): Promise<LabelPointResetResult> {
  const pointId = normaliseId(params.pointId);
  if (!pointId) return { error: "Invalid point id." };
  const read = await readResetRow<LabelPointStatus>(
    params.supabase,
    "label_points",
    pointId,
    "point",
  );
  if ("error" in read) return read;
  const owned = await readShotsOfPoints(params.supabase, [pointId]);
  if ("error" in owned) return owned;
  const plan = planPointReset({
    status: read.row.status,
    seed: parseLabelPointSeed(read.row.seed ?? null),
    shots: owned.shots,
  });
  if ("error" in plan) return plan;
  const failed = await updateIfUnchanged(
    params.supabase,
    "label_points",
    pointId,
    read.row.status,
    { ...plan.write },
    "reset the point",
  );
  if (failed) return { error: failed };
  const swapFailed = await writeShotSwaps(
    params.supabase,
    plan.shots,
    "reset the point's players",
  );
  if (swapFailed) return { error: swapFailed };
  return { ok: true, status: plan.write.status, shots: plan.shots };
}

// ── The admin-gated entry points behind the server actions ─────────────────

const defaults = defaultLabelWriteDependencies;

export function resetLabelShot(
  shotId: unknown,
  deps: LabelWriteDependencies = defaults,
): Promise<LabelShotStatusResult> {
  return gated(
    deps,
    (supabase) => writeLabelShotReset({ supabase, shotId }),
    "reset the shot",
  );
}

export function resetLabelPoint(
  pointId: unknown,
  deps: LabelWriteDependencies = defaults,
): Promise<LabelPointResetResult> {
  return gated(
    deps,
    (supabase) => writeLabelPointReset({ supabase, pointId }),
    "reset the point",
  );
}
