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
 *
 * A stroke deleted, restored or added changes what its point's rows say, so
 * each of those settles the point's ending in the same call
 * (`syncEndingAfterShotChange`, ending-session.ts) and answers with the point
 * when that moved it.
 *
 * Two batched forms for the hint line under a rally ball marked out: every
 * live stroke after it removed as hit after the point, and a removal's
 * tombstones put back — one call each, the ending settled once.
 */

import type { AdminClient } from "@/lib/supabase/admin";
import { UUID_RE } from "@/lib/admin/validation";
import {
  ADMIN_REQUIRED,
  defaultLabelWriteDependencies,
  racedMessage,
  readSessionGate,
  updateIfUnchanged,
  writeShotTombstones,
  type LabelWriteDependencies,
} from "./edit-session";
import { applyLabelEdit, type LabelEditOp } from "./apply-edit-session";
import {
  endingSyncFailed,
  withSyncedPoint,
  readPointShots,
  readShotsOfPoints,
  syncEndingAfterShotChange,
  type LabelPointEndingSynced,
} from "./ending-session";
import { chunksOf } from "./chunks";
import { LABEL_SHOT_COLUMNS, toLabelShot, type LabelShotRow } from "./rows";
import {
  applyShotsRemoved,
  deadBallReason,
  applyShotsRestored,
  gameServer,
  isLabelGame,
  liveShotsAfter,
  planAddedShot,
  ADD_SHOT_AT_START,
  planPointChecked,
  planPointDelete,
  planPointMove,
  planPointRestore,
  planShotDelete,
  planShotRestore,
  type LabelGame,
  type LabelShotRemoved,
  type LabelShotRestored,
  type ShotRestoreWrite,
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

/** The shot's point, when a stroke write moved its ending. */
export interface WithSyncedPoint {
  point?: LabelPointEndingSynced;
}
export type LabelShotStatusResult = LabelOpResult<
  { status: LabelShotStatus } & WithSyncedPoint
>;
export type LabelPointStatusResult = LabelOpResult<{
  status: LabelPointStatus;
}>;
export type LabelAddShotResult = LabelOpResult<
  { shot: LabelShot } & WithSyncedPoint
>;
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
/** One point of a multi-point move, as `LabelMovePointResult` with its id. */
export type LabelMovedPoint = Extract<LabelMovePointResult, { ok: true }> & {
  id: string;
};
export type LabelMovePointsResult = LabelOpResult<{ moves: LabelMovedPoint[] }>;
export type LabelCheckedResult = LabelOpResult<{ checkedAt: string | null }>;
/** Every live stroke after one, tombstoned; the point when that moved its ending. */
export type LabelShotsRemoveResult = LabelOpResult<
  { removed: LabelShotRemoved[] } & WithSyncedPoint
>;
/** A removal's tombstones put back; the point when that moved its ending. */
export type LabelShotsRestoreResult = LabelOpResult<
  { restored: LabelShotRestored[] } & WithSyncedPoint
>;

export function normaliseId(id: unknown): string | null {
  if (typeof id !== "string") return null;
  const lower = id.toLowerCase();
  return UUID_RE.test(lower) ? lower : null;
}

/** `normaliseId` over a list: one or more, each valid, duplicates dropped. */
function normaliseIds(ids: unknown): string[] | null {
  if (!Array.isArray(ids) || ids.length === 0) return null;
  const out: string[] = [];
  for (const id of ids) {
    const lower = normaliseId(id);
    if (!lower) return null;
    if (!out.includes(lower)) out.push(lower);
  }
  return out;
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
 * Write a swap's flipped strokes (player-swap.ts): one UPDATE on
 * `label_shots` per distinct value tuple and status as read (`was`), by id
 * list, in the order the tuples first appear — as game-shift-session.ts
 * groups its point writes. Each group is compare-and-set on `was`, so a
 * stroke another tab deleted or restored since the read is neither brought
 * back nor written against the CHECK: a group that writes fewer rows than
 * it named stops the rest with the raced message, the groups before it
 * landed. Returns an error sentence, or null when every group was written.
 */
export async function writeShotSwaps(
  supabase: AdminClient,
  shots: readonly ShotSwapWrite[],
  what: string,
): Promise<string | null> {
  const groups = new Map<
    string,
    { values: Omit<ShotSwapWrite, "id" | "was">; was: string; ids: string[] }
  >();
  for (const { id, was, ...values } of shots) {
    const key = JSON.stringify([
      values.hitter,
      values.status,
      values.status_before_delete,
      was,
    ]);
    const group = groups.get(key);
    if (group) group.ids.push(id);
    else groups.set(key, { values, was, ids: [id] });
  }
  for (const group of groups.values()) {
    for (const ids of idChunks(group.ids)) {
      const { data, error } = await supabase
        .from("label_shots")
        .update(group.values)
        .in("id", ids)
        .eq("status", group.was)
        .select("id");
      if (error) return `Could not ${what}: ${error.message}`;
      if (!data || data.length !== ids.length) return racedMessage("row");
    }
  }
  return null;
}

/**
 * A swap's flipped strokes as `label_apply_edit` updates: one per distinct
 * value tuple and status as read (`was`), guarded on `was` — `writeShotSwaps`'
 * groups, inside the edit's one transaction, so a miss writes none of it.
 */
export function shotSwapOps(shots: readonly ShotSwapWrite[]): LabelEditOp[] {
  const groups = new Map<
    string,
    { values: Omit<ShotSwapWrite, "id" | "was">; was: string; ids: string[] }
  >();
  for (const { id, was, ...values } of shots) {
    const key = JSON.stringify([
      values.hitter,
      values.status,
      values.status_before_delete,
      was,
    ]);
    const group = groups.get(key);
    if (group) group.ids.push(id);
    else groups.set(key, { values, was, ids: [id] });
  }
  return [...groups.values()].map((group) => ({
    op: "update",
    table: "label_shots",
    ids: group.ids,
    set: { ...group.values },
    expect_status: group.was,
  }));
}

/**
 * `ids` in runs short enough for one request. An `.in()` filter travels in
 * the URL, a uuid is 37 characters of it, and a long cascade flips every
 * stroke of every point it moves: a few hundred ids is past what the gateway
 * takes, and the write is refused after the points before it have landed.
 */
const ID_CHUNK = 100;
export function idChunks(ids: readonly string[]): string[][] {
  return chunksOf(ids, ID_CHUNK);
}

/** `points` each with its strokes from `shots`, matched on `labelPointId`. */
export function withShots<P extends { id: string }>(
  points: readonly P[],
  shots: readonly LabelShot[],
): (P & { shots: LabelShot[] })[] {
  const shotsOf = new Map<string, LabelShot[]>();
  for (const shot of shots) {
    const list = shotsOf.get(shot.labelPointId);
    if (list) list.push(shot);
    else shotsOf.set(shot.labelPointId, [shot]);
  }
  return points.map((point) => ({
    ...point,
    shots: shotsOf.get(point.id) ?? [],
  }));
}

// ── Shots ───────────────────────────────────────────────────────────────────

interface ShotStateRow {
  id: string;
  session_id: string;
  label_point_id: string;
  status: LabelShotStatus;
  status_before_delete: Exclude<LabelShotStatus, "deleted"> | null;
  event_id: number | null;
}

/** The shot, its session's gate (`ghosts`) and its point's rows as read. */
interface ShotState {
  row: ShotStateRow;
  ghosts: boolean;
  shots: LabelShot[];
}

async function readShotState(
  supabase: AdminClient,
  shotId: string,
): Promise<ShotState | { error: string }> {
  const { data, error } = await supabase
    .from("label_shots")
    .select(
      "id, session_id, label_point_id, status, status_before_delete, event_id",
    )
    .eq("id", shotId)
    .maybeSingle<ShotStateRow>();
  if (error) return { error: `Could not read the shot: ${error.message}` };
  if (!data) return { error: "Shot not found." };
  const [gate, owned] = await Promise.all([
    readSessionGate(supabase, data.session_id),
    readPointShots(supabase, data.label_point_id),
  ]);
  if ("error" in gate) return gate;
  if ("error" in owned) return owned;
  return { row: data, ghosts: gate.ghosts, shots: owned.shots };
}

/**
 * A status write on one stroke, then its point's ending: `before` is the
 * point's rows as read, `after` the same with the stroke at `status`. The
 * result the two status writes share.
 */
async function writeShotStatus(
  supabase: AdminClient,
  read: ShotState,
  write: { status: LabelShotStatus },
  what: string,
): Promise<LabelShotStatusResult> {
  const failed = await updateIfUnchanged(
    supabase,
    "label_shots",
    read.row.id,
    read.row.status,
    { ...write },
    what,
  );
  if (failed) return { error: failed };
  const synced = await syncEndingAfterShotChange({
    supabase,
    pointId: read.row.label_point_id,
    ghosts: read.ghosts,
    before: read.shots,
    after: read.shots.map((shot) =>
      shot.id === read.row.id ? { ...shot, status: write.status } : shot,
    ),
  });
  if ("error" in synced) return { error: endingSyncFailed(synced.error) };
  return {
    ok: true,
    status: write.status,
    ...withSyncedPoint(synced),
  };
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
  return writeShotStatus(params.supabase, read, plan.write, "delete the shot");
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
  return writeShotStatus(params.supabase, read, plan.write, "restore the shot");
}

/**
 * Tombstone every live stroke after `shotId` in its point, as hit after the
 * point ended (`deadBallReason`: `dead_ball_after_fault` after a second
 * serve's double fault, else `dead_ball_after_point`) — any number of them, the hint line's
 * "Remove N" where an edit left three or more alone. One tombstone per
 * stroke, compare-and-set (`writeShotTombstones`), then the point's ending
 * once. Refused on a tombstone and with no live stroke after. Never throws.
 */
export async function writeLabelShotsRemoveAfter(params: {
  supabase: AdminClient;
  shotId: unknown;
}): Promise<LabelShotsRemoveResult> {
  const { supabase } = params;
  const shotId = normaliseId(params.shotId);
  if (!shotId) return { error: "Invalid shot id." };
  const read = await readShotState(supabase, shotId);
  if ("error" in read) return read;
  if (read.row.status === "deleted") {
    return { error: "Restore this shot before removing the shots after it." };
  }
  const after = liveShotsAfter(read.shots, shotId, read.ghosts);
  if (after.length === 0) {
    return { error: "There is no live shot after this one to remove." };
  }
  const reason = deadBallReason(
    read.shots.find((s) => s.id === shotId)?.stroke,
  );
  const written = await writeShotTombstones(
    supabase,
    after,
    reason,
    "remove the shots after it",
  );
  if ("error" in written) return written;
  const synced = await syncEndingAfterShotChange({
    supabase,
    pointId: read.row.label_point_id,
    ghosts: read.ghosts,
    before: read.shots,
    after: applyShotsRemoved(read.shots, written.removed, reason),
  });
  if ("error" in synced) {
    return {
      error: endingSyncFailed(synced.error, "The shots were removed"),
    };
  }
  return {
    ok: true,
    removed: written.removed,
    ...withSyncedPoint(synced),
  };
}

/**
 * Undo a batched removal: every tombstone in `shotIds` — all of one point —
 * back to the status it had (`planShotRestore`, the single Undo's rule), each
 * compare-and-set, then the point's ending once. Every plan is checked before
 * the first write, so a refused id leaves nothing half done. Never throws.
 */
export async function writeLabelShotsRestore(params: {
  supabase: AdminClient;
  shotIds: unknown;
}): Promise<LabelShotsRestoreResult> {
  const { supabase } = params;
  const shotIds = normaliseIds(params.shotIds);
  if (!shotIds) return { error: "Invalid shot ids." };
  const { data, error } = await supabase
    .from("label_shots")
    .select("id, session_id, label_point_id")
    .in("id", shotIds)
    .returns<{ id: string; session_id: string; label_point_id: string }[]>();
  if (error) return { error: `Could not read the shots: ${error.message}` };
  const found = data ?? [];
  if (found.length !== shotIds.length) return { error: "Shot not found." };
  const first = found[0];
  if (found.some((row) => row.label_point_id !== first.label_point_id)) {
    return { error: "The shots to restore must all be of one point." };
  }
  const [gate, owned] = await Promise.all([
    readSessionGate(supabase, first.session_id),
    readPointShots(supabase, first.label_point_id),
  ]);
  if ("error" in gate) return gate;
  if ("error" in owned) return owned;

  const byId = new Map(owned.shots.map((shot) => [shot.id, shot]));
  const plans: { shot: LabelShot; write: ShotRestoreWrite }[] = [];
  for (const id of shotIds) {
    const shot = byId.get(id);
    if (!shot) return { error: "Shot not found." };
    const plan = planShotRestore({
      status: shot.status,
      status_before_delete: shot.statusBeforeDelete,
      event_id: shot.eventId,
    });
    if ("error" in plan) return plan;
    plans.push({ shot, write: plan.write });
  }
  const restored: LabelShotRestored[] = [];
  for (const { shot, write } of plans) {
    const failed = await updateIfUnchanged(
      supabase,
      "label_shots",
      shot.id,
      shot.status,
      { ...write },
      "restore the shots",
    );
    if (failed) return { error: failed };
    restored.push({ id: shot.id, status: write.status });
  }
  const synced = await syncEndingAfterShotChange({
    supabase,
    pointId: first.label_point_id,
    ghosts: gate.ghosts,
    before: owned.shots,
    after: applyShotsRestored(owned.shots, restored),
  });
  if ("error" in synced) {
    return {
      error: endingSyncFailed(synced.error, "The shots were restored"),
    };
  }
  return {
    ok: true,
    restored,
    ...withSyncedPoint(synced),
  };
}

/**
 * INSERT one labeller-added stroke into a point, after `afterShotId` (at the
 * end of the rally when null, first when `ADD_SHOT_AT_START`) — see
 * `planAddedShot` for what it is seeded with, `filmTime` included. Returns the
 * new row as the console draws it. Never throws.
 */
export async function writeLabelShotAdd(params: {
  supabase: AdminClient;
  pointId: unknown;
  afterShotId: unknown;
  filmTime?: unknown;
}): Promise<LabelAddShotResult> {
  const { supabase } = params;
  const pointId = normaliseId(params.pointId);
  if (!pointId) return { error: "Invalid point id." };
  const filmTime =
    typeof params.filmTime === "number" && Number.isFinite(params.filmTime)
      ? params.filmTime
      : null;
  let afterShotId: string | null = null;
  if (params.afterShotId === ADD_SHOT_AT_START) {
    afterShotId = ADD_SHOT_AT_START;
  } else if (params.afterShotId !== null && params.afterShotId !== undefined) {
    afterShotId = normaliseId(params.afterShotId);
    if (!afterShotId) return { error: "Invalid shot id." };
  }

  const [read, owned] = await Promise.all([
    readPointState(supabase, pointId),
    readPointShots(supabase, pointId),
  ]);
  if ("error" in read) return read;
  if ("error" in owned) return owned;
  const shots = orderLabelShots(owned.shots);
  const plan = planAddedShot(
    { status: read.row.status, server: read.row.server, shots },
    afterShotId,
    filmTime,
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
  const shot = toLabelShot(inserted);
  const synced = await syncEndingAfterShotChange({
    supabase,
    pointId,
    ghosts: read.ghosts,
    before: shots,
    after: [...shots, shot],
  });
  if ("error" in synced) return { error: endingSyncFailed(synced.error) };
  return { ok: true, shot, ...withSyncedPoint(synced) };
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

/** The point and its session's gate (`ghosts`, edit-session.ts). */
export async function readPointState(
  supabase: AdminClient,
  pointId: string,
): Promise<{ row: PointStateRow; ghosts: boolean } | { error: string }> {
  const { data, error } = await supabase
    .from("label_points")
    .select(
      "id, session_id, status, status_before_delete, server, set_number, game_number, serve_side, winner, ending, ended_by, seed",
    )
    .eq("id", pointId)
    .maybeSingle<PointStateRow>();
  if (error) return { error: `Could not read the point: ${error.message}` };
  if (!data) return { error: "Point not found." };
  const gate = await readSessionGate(supabase, data.session_id);
  if ("error" in gate) return gate;
  return { row: data, ghosts: gate.ghosts };
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
 * The strokes of the points a move takes, a few points per request: each
 * read is one URL's worth of ids and stays well under PostgREST's row cap,
 * which a whole set's strokes in one select could pass and silently cut.
 */
const MOVED_SHOTS_CHUNK = 40;
async function readMovedShots(
  supabase: AdminClient,
  pointIds: readonly string[],
): Promise<{ shots: LabelShot[] } | { error: string }> {
  const reads = await Promise.all(
    chunksOf(pointIds, MOVED_SHOTS_CHUNK).map((ids) =>
      readShotsOfPoints(supabase, ids),
    ),
  );
  const failed = reads.find((read) => "error" in read);
  if (failed && "error" in failed) return failed;
  return {
    shots: reads.flatMap((read) => ("shots" in read ? read.shots : [])),
  };
}

/** The most points one move takes: a header dragged across a whole set. */
const MAX_MOVED_POINTS = 200;

type MoveRow = PointStateRow & { point_index: number };

/**
 * Move points into game `to`, in order (`planPointMove` each) — one point for
 * "Move to game…", the run a dragged game header passed. Each point's
 * destination server counts the points moved before it, as the console plans
 * the drag. One read of the points, then the gate, the game and (when the
 * server may switch) their strokes side by side, then every write in one
 * transaction (`applyLabelEdit`): each point's row guarded on the status it
 * was read with, and its flipped strokes on theirs. A miss writes nothing.
 */
export async function writeLabelPointsMove(params: {
  supabase: AdminClient;
  pointIds: unknown;
  to: unknown;
  switchServer: unknown;
}): Promise<LabelMovePointsResult> {
  const { supabase } = params;
  if (
    !Array.isArray(params.pointIds) ||
    params.pointIds.length === 0 ||
    params.pointIds.length > MAX_MOVED_POINTS
  ) {
    return { error: "Name the points to move." };
  }
  const pointIds: string[] = [];
  for (const raw of params.pointIds) {
    const id = normaliseId(raw);
    if (!id) return { error: "Invalid point id." };
    if (!pointIds.includes(id)) pointIds.push(id);
  }
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
  const switchServer = params.switchServer;

  // In `idChunks` runs: an `.in()` list travels in the URL (see ID_CHUNK).
  const reads = await Promise.all(
    idChunks(pointIds).map((ids) =>
      supabase
        .from("label_points")
        .select(
          "id, session_id, point_index, status, status_before_delete, server, set_number, game_number, serve_side, winner, ending, ended_by, seed",
        )
        .in("id", ids)
        .returns<MoveRow[]>(),
    ),
  );
  const readError = reads.find((read) => read.error)?.error;
  if (readError) {
    return { error: `Could not read the point: ${readError.message}` };
  }
  const rows = new Map(
    reads.flatMap((read) => read.data ?? []).map((row) => [row.id, row]),
  );
  if (pointIds.some((id) => !rows.has(id)))
    return { error: "Point not found." };
  const sessionId = rows.get(pointIds[0])!.session_id;
  if ([...rows.values()].some((row) => row.session_id !== sessionId)) {
    return { error: "These points are not of one session." };
  }

  // The strokes matter only to a move that may switch the server; one not
  // yet confirmed is refused by the plan before any of them is used.
  const [gate, othersRead, shotsRead] = await Promise.all([
    readSessionGate(supabase, sessionId),
    supabase
      .from("label_points")
      .select("id, server, point_index")
      .eq("session_id", sessionId)
      .eq("set_number", to.setNumber)
      .eq("game_number", to.gameNumber)
      .neq("status", "deleted")
      .returns<
        { id: string; server: LabelSide | null; point_index: number }[]
      >(),
    switchServer
      ? readMovedShots(supabase, pointIds)
      : Promise.resolve({ shots: [] as LabelShot[] }),
  ]);
  if ("error" in gate) return gate;
  if (othersRead.error) {
    return { error: `Could not read that game: ${othersRead.error.message}` };
  }
  if ("error" in shotsRead) return shotsRead;

  const moving = new Set(pointIds);
  const inGame = (othersRead.data ?? [])
    .filter((p) => !moving.has(p.id))
    .map((p) => ({ server: p.server, pointIndex: p.point_index }));
  const ops: LabelEditOp[] = [];
  const moves: LabelMovedPoint[] = [];
  for (const id of pointIds) {
    const row = rows.get(id)!;
    const plan = planPointMove(
      {
        status: row.status,
        server: row.server,
        setNumber: row.set_number,
        gameNumber: row.game_number,
        serveSide: row.serve_side,
        winner: row.winner,
        ending: row.ending,
        endedBy: row.ended_by,
        seed: parseLabelPointSeed(row.seed ?? null),
        shots: shotsRead.shots.filter((shot) => shot.labelPointId === id),
      },
      to,
      gameServer(inGame),
      switchServer,
    );
    if ("error" in plan) return plan;
    ops.push(
      {
        op: "update",
        table: "label_points",
        ids: [id],
        set: { ...plan.write },
        expect_status: row.status,
      },
      ...shotSwapOps(plan.shots),
    );
    const server = plan.write.server ?? row.server;
    inGame.push({ server, pointIndex: row.point_index });
    moves.push({
      ok: true,
      id,
      status: plan.write.status,
      server,
      setNumber: plan.write.set_number,
      gameNumber: plan.write.game_number,
      winner: "winner" in plan.write ? (plan.write.winner ?? null) : row.winner,
      endedBy:
        "ended_by" in plan.write ? (plan.write.ended_by ?? null) : row.ended_by,
      shots: plan.shots,
    });
  }

  const applied = await applyLabelEdit(
    supabase,
    sessionId,
    ops,
    pointIds.length > 1 ? "move the points" : "move the point",
  );
  if ("error" in applied) return applied;
  return { ok: true, moves };
}

/** One point into game `to`: `writeLabelPointsMove` with a list of one. */
export async function writeLabelPointMove(params: {
  supabase: AdminClient;
  pointId: unknown;
  to: unknown;
  switchServer: unknown;
}): Promise<LabelMovePointResult> {
  const pointId = normaliseId(params.pointId);
  if (!pointId) return { error: "Invalid point id." };
  const result = await writeLabelPointsMove({
    supabase: params.supabase,
    pointIds: [pointId],
    to: params.to,
    switchServer: params.switchServer,
  });
  if ("error" in result) return result;
  const { id: _id, ...move } = result.moves[0];
  return move;
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

export function removeLabelShotsAfter(
  shotId: unknown,
  deps: LabelWriteDependencies = defaults,
): Promise<LabelShotsRemoveResult> {
  return gated(
    deps,
    (supabase) => writeLabelShotsRemoveAfter({ supabase, shotId }),
    "remove the shots after it",
  );
}

export function restoreLabelShots(
  shotIds: unknown,
  deps: LabelWriteDependencies = defaults,
): Promise<LabelShotsRestoreResult> {
  return gated(
    deps,
    (supabase) => writeLabelShotsRestore({ supabase, shotIds }),
    "restore the shots",
  );
}

export function addLabelShot(
  pointId: unknown,
  afterShotId: unknown,
  filmTime: unknown = null,
  deps: LabelWriteDependencies = defaults,
): Promise<LabelAddShotResult> {
  return gated(
    deps,
    (supabase) =>
      writeLabelShotAdd({ supabase, pointId, afterShotId, filmTime }),
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

export function moveLabelPoints(
  pointIds: unknown,
  to: unknown,
  switchServer: unknown,
  deps: LabelWriteDependencies = defaults,
): Promise<LabelMovePointsResult> {
  return gated(
    deps,
    (supabase) =>
      writeLabelPointsMove({ supabase, pointIds, to, switchServer }),
    "move the points",
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
