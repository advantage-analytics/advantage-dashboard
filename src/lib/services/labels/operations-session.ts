/**
 * The labelling console's row operations: delete and Undo for a stroke or a
 * point, add a stroke, move a point to another game, mark a point checked.
 * Admin-gated like edit-session.ts, planned by operations.ts.
 *
 * Every write is an UPDATE or an INSERT on `label_points` / `label_shots`. No
 * row is ever removed: a delete is a tombstone. Status changes are
 * compare-and-set: the UPDATE matches the status the row was read with, so two
 * tabs racing to delete (or Undo) the same row cannot leave a tombstone
 * remembering `deleted` as its previous status.
 */

import type { AdminClient } from "@/lib/supabase/admin";
import { UUID_RE } from "@/lib/admin/validation";
import {
  ADMIN_REQUIRED,
  checkSessionOpen,
  defaultLabelWriteDependencies,
  type LabelWriteDependencies,
} from "./edit-session";
import { LABEL_SHOT_COLUMNS, toLabelShot, type LabelShotRow } from "./rows";
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
import { parseLabelPointSeed } from "./edit";
import type { ShotSwapWrite } from "./player-swap";
import {
  orderLabelShots,
  type LabelEnding,
  type LabelPointStatus,
  type LabelServeSide,
  type LabelShot,
  type LabelShotStatus,
  type LabelSide,
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
  winner: LabelSide | null;
  endedBy: LabelSide | null;
  /** The strokes flipped with the players (player-swap.ts); empty when none. */
  shots: ShotSwapWrite[];
}>;
export type LabelCheckedResult = LabelOpResult<{ checkedAt: string | null }>;

/** The row (or session) the write was aimed at is no longer in the state it was read in. */
export function racedMessage(noun: "row" | "session"): string {
  return `This ${noun} changed in another tab. Reload to see it.`;
}

const RACED = racedMessage("row");

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

/**
 * Write a swap's flipped strokes (player-swap.ts): one UPDATE on
 * `label_shots` per distinct value tuple, by id list, in the order the
 * tuples first appear — as game-shift-session.ts groups its point writes.
 * Returns an error sentence, or null when every group was written.
 */
export async function writeShotSwaps(
  supabase: AdminClient,
  shots: readonly ShotSwapWrite[],
  what: string,
): Promise<string | null> {
  const groups = new Map<
    string,
    { values: Omit<ShotSwapWrite, "id">; ids: string[] }
  >();
  for (const { id, ...values } of shots) {
    const key = JSON.stringify([
      values.hitter,
      values.status,
      values.status_before_delete,
    ]);
    const group = groups.get(key);
    if (group) group.ids.push(id);
    else groups.set(key, { values, ids: [id] });
  }
  for (const group of groups.values()) {
    const { error } = await supabase
      .from("label_shots")
      .update(group.values)
      .in("id", group.ids);
    if (error) return `Could not ${what}: ${error.message}`;
  }
  return null;
}

/** Every shot row of `pointIds`' points, as the console's rows. */
export async function readShotsOfPoints(
  supabase: AdminClient,
  pointIds: readonly string[],
): Promise<{ shots: LabelShot[] } | { error: string }> {
  if (pointIds.length === 0) return { shots: [] };
  const { data, error } = await supabase
    .from("label_shots")
    .select(LABEL_SHOT_COLUMNS)
    .in("label_point_id", pointIds)
    .returns<LabelShotRow[]>();
  if (error) {
    return { error: `Could not read the points' shots: ${error.message}` };
  }
  return { shots: (data ?? []).map(toLabelShot) };
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
    .select(LABEL_SHOT_COLUMNS)
    .eq("label_point_id", pointId)
    .returns<LabelShotRow[]>();
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
    .select(LABEL_SHOT_COLUMNS)
    .single<LabelShotRow>();
  if (insertError || !inserted) {
    return {
      error: `Could not add the shot: ${insertError?.message ?? "no row came back"}`,
    };
  }
  return { ok: true, shot: toLabelShot(inserted) };
}

// ── Points ──────────────────────────────────────────────────────────────────

export interface PointStateRow {
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

export async function readPointState(
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

/**
 * Undo a point's delete. A tombstone that owns no shot rows — what a
 * combine leaves behind (`point-combine.ts`) — is refused: restoring it
 * would bring back an empty point.
 */
export async function writeLabelPointRestore(params: {
  supabase: AdminClient;
  pointId: unknown;
}): Promise<LabelPointStatusResult> {
  const pointId = normaliseId(params.pointId);
  if (!pointId) return { error: "Invalid point id." };
  const read = await readPointState(params.supabase, pointId);
  if ("error" in read) return read;
  const { data: shots, error: shotsError } = await params.supabase
    .from("label_shots")
    .select("id")
    .eq("label_point_id", pointId)
    .returns<{ id: string }[]>();
  if (shotsError) {
    return { error: `Could not read the point's shots: ${shotsError.message}` };
  }
  const plan = planPointRestore({
    ...read.row,
    shot_count: (shots ?? []).length,
  });
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
 * Move a point into game `to` (`planPointMove`). The point's row is written
 * first (compare-and-set), then its flipped strokes in grouped UPDATEs. The
 * shots are read only when the server would switch.
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

  // The strokes matter only to a move that switches the server — and one
  // not yet confirmed is refused by the plan before any of them is read.
  const switches =
    params.switchServer &&
    destination !== null &&
    destination !== read.row.server;
  let shots: LabelShot[] = [];
  if (switches) {
    const owned = await readShotsOfPoints(supabase, [pointId]);
    if ("error" in owned) return owned;
    shots = owned.shots;
  }

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
      shots,
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
  const swapFailed = await writeShotSwaps(
    supabase,
    plan.shots,
    "switch the point's players",
  );
  if (swapFailed) return { error: swapFailed };
  return {
    ok: true,
    status: plan.write.status,
    server: plan.write.server ?? read.row.server,
    setNumber: plan.write.set_number,
    gameNumber: plan.write.game_number,
    winner:
      "winner" in plan.write ? (plan.write.winner ?? null) : read.row.winner,
    endedBy:
      "ended_by" in plan.write
        ? (plan.write.ended_by ?? null)
        : read.row.ended_by,
    shots: plan.shots,
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
