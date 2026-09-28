/**
 * The labelling console's Reset, admin-gated: write an edited shot's or
 * point's seed back over its values.
 *
 * Same shape as operations-session.ts: every entry point re-checks
 * `requireAdmin`, runs on the service-role client, refuses a `complete`
 * session, and decides what to write with the pure rules in reset.ts — the
 * ones the console ran for its optimistic update.
 *
 * Every write is an UPDATE on `label_shots` / `label_points`, compare-and-set
 * on the status the row was read with, so a reset racing a delete in another
 * tab cannot bring a tombstone's values back. A point reset writes the
 * point's own columns only — never its strokes, note or `checked_at`.
 * `tests/label-operations.spec.ts` scans this file for a delete call.
 */

import type { AdminClient } from "@/lib/supabase/admin";
import {
  checkSessionOpen,
  defaultLabelWriteDependencies,
} from "./edit-session";
import type { LabelWriteDependencies } from "./edit-session";
import { parseLabelPointSeed, parseLabelShotSeed } from "./edit";
import {
  gated,
  normaliseId,
  updateIfUnchanged,
  type LabelPointStatusResult,
  type LabelShotStatusResult,
} from "./operations-session";
import { planPointReset, planShotReset } from "./reset";
import type { LabelPointStatus, LabelShotStatus } from "./session";

interface ResetRow<S> {
  id: string;
  session_id: string;
  status: S;
  /** Raw jsonb — parsed before anything is written from it. */
  seed: unknown;
}

async function readResetRow<S>(
  supabase: AdminClient,
  table: "label_shots" | "label_points",
  id: string,
  what: "shot" | "point",
): Promise<{ row: ResetRow<S> } | { error: string }> {
  const { data, error } = await supabase
    .from(table)
    .select("id, session_id, status, seed")
    .eq("id", id)
    .maybeSingle<ResetRow<S>>();
  if (error) return { error: `Could not read the ${what}: ${error.message}` };
  if (!data)
    return { error: what === "shot" ? "Shot not found." : "Point not found." };
  const closed = await checkSessionOpen(supabase, data.session_id);
  if (closed) return { error: closed };
  return { row: data };
}

/** Write a shot's seed back over its values, and `kept`. Never throws. */
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
  const failed = await updateIfUnchanged(
    params.supabase,
    "label_shots",
    shotId,
    read.row.status,
    { ...plan.write },
    "reset the shot",
  );
  return failed ? { error: failed } : { ok: true, status: plan.write.status };
}

/** Write a point's seed back over its own fields, and `unchanged`. */
export async function writeLabelPointReset(params: {
  supabase: AdminClient;
  pointId: unknown;
}): Promise<LabelPointStatusResult> {
  const pointId = normaliseId(params.pointId);
  if (!pointId) return { error: "Invalid point id." };
  const read = await readResetRow<LabelPointStatus>(
    params.supabase,
    "label_points",
    pointId,
    "point",
  );
  if ("error" in read) return read;
  const plan = planPointReset({
    status: read.row.status,
    seed: parseLabelPointSeed(read.row.seed ?? null),
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
  return failed ? { error: failed } : { ok: true, status: plan.write.status };
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
): Promise<LabelPointStatusResult> {
  return gated(
    deps,
    (supabase) => writeLabelPointReset({ supabase, pointId }),
    "reset the point",
  );
}
