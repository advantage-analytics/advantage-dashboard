/**
 * The labelling console's row operations, admin-gated: delete and Undo for a
 * stroke or a point, add a stroke, move a point to another game, and mark a
 * point checked (or clear it).
 *
 * Same shape as edit-session.ts: every entry point re-checks `requireAdmin`,
 * runs on the service-role client, refuses a `complete` session, and decides
 * what to write with the pure rules in operations.ts — the ones the console
 * ran for its optimistic update.
 *
 * Every write is an UPDATE or an INSERT on `label_points` / `label_shots`. No
 * row is ever removed: a delete is a tombstone (`status: 'deleted'` plus the
 * status it had, for Undo), which is what lets the offline scorer learn which
 * vendor strokes a labeller rejected. `tests/label-operations.spec.ts` scans
 * this file for a delete call.
 *
 * Status changes are compare-and-set: the UPDATE matches the status the row
 * was read with, so two tabs racing to delete (or Undo) the same row cannot
 * leave a tombstone remembering `deleted` as its previous status.
 */

import type { AdminClient } from "@/lib/supabase/admin";
import { UUID_RE } from "@/lib/admin/validation";
import {
  ADMIN_REQUIRED,
  checkSessionOpen,
  defaultLabelWriteDependencies,
  type LabelWriteDependencies,
} from "./edit-session";
import {
  gameServer,
  isLabelGame,
  planAddedShot,
  planPointChecked,
  planPointDelete,
  planPointMove,
  planPointRestore,
  planShotDelete,
  planShotRestore,
  type LabelGame,
} from "./operations";
import { parseLabelPointSeed, parseLabelShotSeed } from "./edit";
import {
  orderLabelShots,
  type LabelEnding,
  type LabelPointStatus,
  type LabelServeSide,
  type LabelShot,
  type LabelShotResult,
  type LabelShotStatus,
  type LabelSide,
  type LabelSpin,
  type LabelStroke,
} from "./session";

const LOG = "[labels:operations]";

export type LabelOpResult<T extends object = object> =
  ({ ok: true } & T) | { error: string };

export type LabelShotStatusResult = LabelOpResult<{ status: LabelShotStatus }>;
export type LabelPointStatusResult = LabelOpResult<{
  status: LabelPointStatus;
}>;
export type LabelAddShotResult = LabelOpResult<{ shot: LabelShot }>;
export type LabelMovePointResult = LabelOpResult<{
  status: LabelPointStatus;
  server: LabelSide | null;
  setNumber: number;
  gameNumber: number;
}>;
export type LabelCheckedResult = LabelOpResult<{ checkedAt: string | null }>;

const RACED = "This row changed in another tab. Reload to see it.";

export function normaliseId(id: unknown): string | null {
  if (typeof id !== "string") return null;
  const lower = id.toLowerCase();
  return UUID_RE.test(lower) ? lower : null;
}

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** The gate every entry point shares: admin first, then the work. */
export async function gated<T extends object>(
  deps: LabelWriteDependencies,
  work: (supabase: AdminClient) => Promise<LabelOpResult<T>>,
  what: string,
): Promise<LabelOpResult<T>> {
  const actor = await deps.requireAdmin();
  if (!actor) return { error: ADMIN_REQUIRED };
  try {
    return await work(deps.createAdminClient());
  } catch (err) {
    console.error(`${LOG} ${what} threw`, { message: message(err) });
    return { error: `Could not ${what}: ${message(err)}` };
  }
}

/**
 * UPDATE one row, but only while it still has the status it was read with.
 * Returns an error sentence, or null when exactly that row was written.
 */
export async function updateIfUnchanged(
  supabase: AdminClient,
  table: "label_points" | "label_shots",
  id: string,
  readStatus: string,
  values: Record<string, unknown>,
  what: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from(table)
    .update(values)
    .eq("id", id)
    .eq("status", readStatus)
    .select("id");
  if (error) return `Could not ${what}: ${error.message}`;
  if (!data || data.length === 0) return RACED;
  return null;
}

// ── Shots ───────────────────────────────────────────────────────────────────

interface ShotStateRow {
  id: string;
  session_id: string;
  status: LabelShotStatus;
  status_before_delete: Exclude<LabelShotStatus, "deleted"> | null;
  event_id: number | null;
}

async function readShotState(
  supabase: AdminClient,
  shotId: string,
): Promise<{ row: ShotStateRow } | { error: string }> {
  const { data, error } = await supabase
    .from("label_shots")
    .select("id, session_id, status, status_before_delete, event_id")
    .eq("id", shotId)
    .maybeSingle<ShotStateRow>();
  if (error) return { error: `Could not read the shot: ${error.message}` };
  if (!data) return { error: "Shot not found." };
  const closed = await checkSessionOpen(supabase, data.session_id);
  if (closed) return { error: closed };
  return { row: data };
}

/** Tombstone one stroke with a reason. Never throws. */
export async function writeLabelShotDelete(params: {
  supabase: AdminClient;
  shotId: unknown;
  reason: unknown;
}): Promise<LabelShotStatusResult> {
  const shotId = normaliseId(params.shotId);
  if (!shotId) return { error: "Invalid shot id." };
  // The reason is checked before anything is read.
  const early = planShotDelete({ status: "kept" }, params.reason);
  if ("error" in early) return early;

  const read = await readShotState(params.supabase, shotId);
  if ("error" in read) return read;
  const plan = planShotDelete(read.row, params.reason);
  if ("error" in plan) return plan;
  const failed = await updateIfUnchanged(
    params.supabase,
    "label_shots",
    shotId,
    read.row.status,
    { ...plan.write },
    "delete the shot",
  );
  return failed ? { error: failed } : { ok: true, status: plan.write.status };
}

/** Undo a stroke's delete. Never throws. */
export async function writeLabelShotRestore(params: {
  supabase: AdminClient;
  shotId: unknown;
}): Promise<LabelShotStatusResult> {
  const shotId = normaliseId(params.shotId);
  if (!shotId) return { error: "Invalid shot id." };
  const read = await readShotState(params.supabase, shotId);
  if ("error" in read) return read;
  const plan = planShotRestore(read.row);
  if ("error" in plan) return plan;
  const failed = await updateIfUnchanged(
    params.supabase,
    "label_shots",
    shotId,
    read.row.status,
    { ...plan.write },
    "restore the shot",
  );
  return failed ? { error: failed } : { ok: true, status: plan.write.status };
}

interface ShotRow {
  id: string;
  label_point_id: string;
  event_id: number | null;
  after_event_id: number | null;
  status: LabelShotStatus;
  status_before_delete: Exclude<LabelShotStatus, "deleted"> | null;
  delete_reason: string | null;
  hitter: LabelSide | null;
  stroke: LabelStroke | null;
  result: LabelShotResult | null;
  spin: LabelSpin | null;
  contact_x: number | null;
  contact_y: number | null;
  landing_x: number | null;
  landing_y: number | null;
  video_time: number | null;
  seed: unknown;
}

const SHOT_COLUMNS =
  "id, label_point_id, event_id, after_event_id, status, status_before_delete, delete_reason, hitter, stroke, result, spin, contact_x, contact_y, landing_x, landing_y, video_time, seed";

function toLabelShot(row: ShotRow): LabelShot {
  return {
    id: row.id,
    labelPointId: row.label_point_id,
    eventId: row.event_id,
    afterEventId: row.after_event_id,
    status: row.status,
    statusBeforeDelete: row.status_before_delete ?? null,
    deleteReason: row.delete_reason,
    hitter: row.hitter,
    stroke: row.stroke,
    result: row.result,
    spin: row.spin,
    contactX: row.contact_x,
    contactY: row.contact_y,
    landingX: row.landing_x,
    landingY: row.landing_y,
    videoTime: row.video_time,
    // An inserted stroke comes back without one (`seed` is null on it).
    seed: parseLabelShotSeed(row.seed ?? null),
  };
}

/**
 * INSERT one labeller-added stroke into a point, after `afterShotId` (or at
 * the end of the rally when null) — see `planAddedShot` for what it is seeded
 * with. Returns the new row as the console draws it. Never throws.
 */
export async function writeLabelShotAdd(params: {
  supabase: AdminClient;
  pointId: unknown;
  afterShotId: unknown;
}): Promise<LabelAddShotResult> {
  const { supabase } = params;
  const pointId = normaliseId(params.pointId);
  if (!pointId) return { error: "Invalid point id." };
  let afterShotId: string | null = null;
  if (params.afterShotId !== null && params.afterShotId !== undefined) {
    afterShotId = normaliseId(params.afterShotId);
    if (!afterShotId) return { error: "Invalid shot id." };
  }

  const read = await readPointState(supabase, pointId);
  if ("error" in read) return read;

  const { data: shotRows, error: shotsError } = await supabase
    .from("label_shots")
    .select(SHOT_COLUMNS)
    .eq("label_point_id", pointId)
    .returns<ShotRow[]>();
  if (shotsError) {
    return { error: `Could not read the point's shots: ${shotsError.message}` };
  }
  const shots = orderLabelShots((shotRows ?? []).map(toLabelShot));
  const plan = planAddedShot(
    { status: read.row.status, server: read.row.server, shots },
    afterShotId,
  );
  if ("error" in plan) return plan;

  const { data: inserted, error: insertError } = await supabase
    .from("label_shots")
    .insert({
      session_id: read.row.session_id,
      label_point_id: pointId,
      ...plan.write,
    })
    .select(SHOT_COLUMNS)
    .single<ShotRow>();
  if (insertError || !inserted) {
    return {
      error: `Could not add the shot: ${insertError?.message ?? "no row came back"}`,
    };
  }
  return { ok: true, shot: toLabelShot(inserted) };
}

// ── Points ──────────────────────────────────────────────────────────────────

interface PointStateRow {
  id: string;
  session_id: string;
  status: LabelPointStatus;
  status_before_delete: Exclude<LabelPointStatus, "deleted"> | null;
  server: LabelSide | null;
  set_number: number | null;
  game_number: number | null;
  serve_side: LabelServeSide | null;
  winner: LabelSide | null;
  ending: LabelEnding | null;
  ended_by: LabelSide | null;
  seed: unknown;
}

async function readPointState(
  supabase: AdminClient,
  pointId: string,
): Promise<{ row: PointStateRow } | { error: string }> {
  const { data, error } = await supabase
    .from("label_points")
    .select(
      "id, session_id, status, status_before_delete, server, set_number, game_number, serve_side, winner, ending, ended_by, seed",
    )
    .eq("id", pointId)
    .maybeSingle<PointStateRow>();
  if (error) return { error: `Could not read the point: ${error.message}` };
  if (!data) return { error: "Point not found." };
  const closed = await checkSessionOpen(supabase, data.session_id);
  if (closed) return { error: closed };
  return { row: data };
}

/** Tombstone one point. Its strokes are left exactly as they are. */
export async function writeLabelPointDelete(params: {
  supabase: AdminClient;
  pointId: unknown;
}): Promise<LabelPointStatusResult> {
  const pointId = normaliseId(params.pointId);
  if (!pointId) return { error: "Invalid point id." };
  const read = await readPointState(params.supabase, pointId);
  if ("error" in read) return read;
  const plan = planPointDelete(read.row);
  if ("error" in plan) return plan;
  const failed = await updateIfUnchanged(
    params.supabase,
    "label_points",
    pointId,
    read.row.status,
    { ...plan.write },
    "delete the point",
  );
  return failed ? { error: failed } : { ok: true, status: plan.write.status };
}

/** Undo a point's delete. */
export async function writeLabelPointRestore(params: {
  supabase: AdminClient;
  pointId: unknown;
}): Promise<LabelPointStatusResult> {
  const pointId = normaliseId(params.pointId);
  if (!pointId) return { error: "Invalid point id." };
  const read = await readPointState(params.supabase, pointId);
  if ("error" in read) return read;
  const plan = planPointRestore(read.row);
  if ("error" in plan) return plan;
  const failed = await updateIfUnchanged(
    params.supabase,
    "label_points",
    pointId,
    read.row.status,
    { ...plan.write },
    "restore the point",
  );
  return failed ? { error: failed } : { ok: true, status: plan.write.status };
}

/**
 * Move a point into game `to`. The destination's server is read from the
 * game's other live points; when it differs from the point's own the move is
 * refused unless `switchServer` — the console's "switch players?" yes — and
 * then `server` changes with it.
 */
export async function writeLabelPointMove(params: {
  supabase: AdminClient;
  pointId: unknown;
  to: unknown;
  switchServer: unknown;
}): Promise<LabelMovePointResult> {
  const { supabase } = params;
  const pointId = normaliseId(params.pointId);
  if (!pointId) return { error: "Invalid point id." };
  if (!isLabelGame(params.to)) {
    return { error: "A game is a set and a game number, both 1 or more." };
  }
  if (typeof params.switchServer !== "boolean") {
    return { error: "Say whether the server switches." };
  }
  const to: LabelGame = {
    setNumber: params.to.setNumber,
    gameNumber: params.to.gameNumber,
  };

  const read = await readPointState(supabase, pointId);
  if ("error" in read) return read;

  const { data: others, error: othersError } = await supabase
    .from("label_points")
    .select("server, point_index")
    .eq("session_id", read.row.session_id)
    .eq("set_number", to.setNumber)
    .eq("game_number", to.gameNumber)
    .neq("status", "deleted")
    .neq("id", pointId)
    .returns<{ server: LabelSide | null; point_index: number }[]>();
  if (othersError) {
    return { error: `Could not read that game: ${othersError.message}` };
  }
  const destination = gameServer(
    (others ?? []).map((p) => ({
      server: p.server,
      pointIndex: p.point_index,
    })),
  );

  const plan = planPointMove(
    {
      status: read.row.status,
      server: read.row.server,
      setNumber: read.row.set_number,
      gameNumber: read.row.game_number,
      serveSide: read.row.serve_side,
      winner: read.row.winner,
      ending: read.row.ending,
      endedBy: read.row.ended_by,
      seed: parseLabelPointSeed(read.row.seed ?? null),
    },
    to,
    destination,
    params.switchServer,
  );
  if ("error" in plan) return plan;
  const failed = await updateIfUnchanged(
    supabase,
    "label_points",
    pointId,
    read.row.status,
    { ...plan.write },
    "move the point",
  );
  if (failed) return { error: failed };
  return {
    ok: true,
    status: plan.write.status,
    server: plan.write.server ?? read.row.server,
    setNumber: plan.write.set_number,
    gameNumber: plan.write.game_number,
  };
}

/** Set a point's `checked_at` to now, or clear it. */
export async function writeLabelPointChecked(params: {
  supabase: AdminClient;
  pointId: unknown;
  checked: boolean;
  now?: Date;
}): Promise<LabelCheckedResult> {
  const pointId = normaliseId(params.pointId);
  if (!pointId) return { error: "Invalid point id." };
  const read = await readPointState(params.supabase, pointId);
  if ("error" in read) return read;
  const plan = planPointChecked(
    read.row,
    params.checked,
    params.now ?? new Date(),
  );
  if ("error" in plan) return plan;
  const failed = await updateIfUnchanged(
    params.supabase,
    "label_points",
    pointId,
    read.row.status,
    { ...plan.write },
    params.checked ? "mark the point checked" : "clear the check",
  );
  return failed
    ? { error: failed }
    : { ok: true, checkedAt: plan.write.checked_at };
}

// ── The admin-gated entry points behind the server actions ─────────────────

const defaults = defaultLabelWriteDependencies;

export function deleteLabelShot(
  shotId: unknown,
  reason: unknown,
  deps: LabelWriteDependencies = defaults,
): Promise<LabelShotStatusResult> {
  return gated(
    deps,
    (supabase) => writeLabelShotDelete({ supabase, shotId, reason }),
    "delete the shot",
  );
}

export function restoreLabelShot(
  shotId: unknown,
  deps: LabelWriteDependencies = defaults,
): Promise<LabelShotStatusResult> {
  return gated(
    deps,
    (supabase) => writeLabelShotRestore({ supabase, shotId }),
    "restore the shot",
  );
}

export function addLabelShot(
  pointId: unknown,
  afterShotId: unknown,
  deps: LabelWriteDependencies = defaults,
): Promise<LabelAddShotResult> {
  return gated(
    deps,
    (supabase) => writeLabelShotAdd({ supabase, pointId, afterShotId }),
    "add the shot",
  );
}

export function deleteLabelPoint(
  pointId: unknown,
  deps: LabelWriteDependencies = defaults,
): Promise<LabelPointStatusResult> {
  return gated(
    deps,
    (supabase) => writeLabelPointDelete({ supabase, pointId }),
    "delete the point",
  );
}

export function restoreLabelPoint(
  pointId: unknown,
  deps: LabelWriteDependencies = defaults,
): Promise<LabelPointStatusResult> {
  return gated(
    deps,
    (supabase) => writeLabelPointRestore({ supabase, pointId }),
    "restore the point",
  );
}

export function moveLabelPoint(
  pointId: unknown,
  to: unknown,
  switchServer: unknown,
  deps: LabelWriteDependencies = defaults,
): Promise<LabelMovePointResult> {
  return gated(
    deps,
    (supabase) => writeLabelPointMove({ supabase, pointId, to, switchServer }),
    "move the point",
  );
}

export function markLabelPointChecked(
  pointId: unknown,
  deps: LabelWriteDependencies = defaults,
): Promise<LabelCheckedResult> {
  return gated(
    deps,
    (supabase) => writeLabelPointChecked({ supabase, pointId, checked: true }),
    "mark the point checked",
  );
}

export function unmarkLabelPointChecked(
  pointId: unknown,
  deps: LabelWriteDependencies = defaults,
): Promise<LabelCheckedResult> {
  return gated(
    deps,
    (supabase) => writeLabelPointChecked({ supabase, pointId, checked: false }),
    "clear the check",
  );
}
