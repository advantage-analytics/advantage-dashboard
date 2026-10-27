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
 *
 * A shot reset does clear its point's `checked_at`: the point the labeller
 * checked is not the point it is once a stroke goes back to the vendor's
 * reading, so it is asked again.
 */

import { readAllPages } from "@/lib/data/admin-range-read";
import { readLabelPointsByIds } from "@/lib/data/labels-server";
import type { AdminClient } from "@/lib/supabase/admin";
import {
  defaultLabelWriteDependencies,
  readSessionGate,
  updateIfUnchanged,
  type LabelWriteDependencies,
} from "./edit-session";
import { parseLabelPointSeed, parseLabelShotSeed } from "./edit";
import {
  endingSyncFailed,
  withSyncedPoint,
  readPointShots,
  readShotsOfPoints,
  syncEndingAfterShotChange,
} from "./ending-session";
import {
  gated,
  normaliseId,
  writeLabelShotDelete,
  writeLabelShotsRestore,
  writeShotSwaps,
  type LabelOpResult,
  type LabelShotStatusResult,
} from "./operations-session";
import { sharesVendorRally } from "./point-split";
import type { ShotSwapWrite } from "./player-swap";
import {
  applyShotReset,
  planPointReset,
  planShotReset,
  pointResetScope,
} from "./reset";
import type { LabelPoint, LabelPointStatus, LabelShotStatus } from "./session";

export type LabelPointResetResult = LabelOpResult<{
  status: LabelPointStatus;
  /** The strokes whose hitter went back to its seed; empty when none. */
  shots: ShotSwapWrite[];
}>;

interface ResetRow<S> {
  id: string;
  session_id: string;
  status: S;
  /** Raw jsonb — parsed before anything is written from it. */
  seed: unknown;
}

/** The row; a shot's also names its point (`E`), which a point row cannot. */
async function readResetRow<S, E extends object = object>(
  supabase: AdminClient,
  table: "label_shots" | "label_points",
  id: string,
  what: "shot" | "point",
): Promise<{ row: ResetRow<S> & E } | { error: string }> {
  const { data, error } = await supabase
    .from(table)
    .select(
      what === "shot"
        ? "id, session_id, label_point_id, status, seed"
        : "id, session_id, status, seed",
    )
    .eq("id", id)
    .maybeSingle<ResetRow<S> & E>();
  if (error) return { error: `Could not read the ${what}: ${error.message}` };
  if (!data)
    return { error: what === "shot" ? "Shot not found." : "Point not found." };
  return { row: data };
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
  const read = await readResetRow<LabelShotStatus, { label_point_id: string }>(
    params.supabase,
    "label_shots",
    shotId,
    "shot",
  );
  if ("error" in read) return read;
  const pointId = read.row.label_point_id;
  // Independent reads, the gate's refusal first.
  const [gate, owned] = await Promise.all([
    readSessionGate(params.supabase, read.row.session_id),
    readPointShots(params.supabase, pointId),
  ]);
  if ("error" in gate) return gate;
  const plan = planShotReset({
    status: read.row.status,
    seed: parseLabelShotSeed(read.row.seed ?? null),
  });
  if ("error" in plan) return plan;
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
  const { error: uncheckError } = await params.supabase
    .from("label_points")
    .update({ checked_at: null })
    .eq("id", pointId);
  if (uncheckError) {
    return {
      error: `The shot was reset, but its point is still checked: ${uncheckError.message}`,
    };
  }
  const synced = await syncEndingAfterShotChange({
    supabase: params.supabase,
    pointId,
    ghosts: gate.ghosts,
    before: owned.shots,
    after: owned.shots.map((shot) =>
      shot.id === shotId ? applyShotReset(shot) : shot,
    ),
  });
  if ("error" in synced) return { error: endingSyncFailed(synced.error) };
  return {
    ok: true,
    status: plan.write.status,
    ...withSyncedPoint(synced),
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
  const [gate, owned] = await Promise.all([
    readSessionGate(params.supabase, read.row.session_id),
    readShotsOfPoints(params.supabase, [pointId]),
  ]);
  if ("error" in gate) return gate;
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

/**
 * Every point of the session with just what `sharesVendorRally` reads — its
 * id, status and vendor rallies — never its strokes or other columns. Paged
 * (`readAllPages`), as every session-wide label read is: an unpaged select
 * stops at PostgREST's row cap, and a split half past it would read as whole.
 */
async function readSessionRallies(
  supabase: AdminClient,
  sessionId: string,
): Promise<
  | { points: Pick<LabelPoint, "id" | "status" | "vendorRallyIds">[] }
  | { error: string }
> {
  const message = "Could not read the points.";
  try {
    const rows = await readAllPages<{
      id: string;
      status: LabelPointStatus;
      vendor_rally_ids: number[] | null;
    }>(
      supabase
        .from("label_points")
        .select("id, status, vendor_rally_ids")
        .eq("session_id", sessionId)
        .order("id"),
      message,
    );
    return {
      points: rows.map((row) => ({
        id: row.id,
        status: row.status,
        vendorRallyIds: row.vendor_rally_ids ?? [],
      })),
    };
  } catch {
    return { error: message };
  }
}

/**
 * The point read back after the writes, or null when it is gone or the read
 * failed — never a throw, so a refusal part-way still answers its own error.
 */
async function readBack(
  supabase: AdminClient,
  sessionId: string,
  pointId: string,
): Promise<LabelPoint | null> {
  try {
    const [point] = await readLabelPointsByIds(supabase, sessionId, [pointId]);
    return point ?? null;
  } catch {
    return null;
  }
}

/**
 * Run label writes all at once (`together`) or one after another, stopping at
 * the first refusal. Answers the first error, or null when every write landed.
 */
async function runWrites(
  together: boolean,
  writes: readonly (() => Promise<object>)[],
): Promise<{ error: string } | null> {
  const isError = (r: object): r is { error: string } => "error" in r;
  if (together) {
    const results = await Promise.all(writes.map((write) => write()));
    return results.find(isError) ?? null;
  }
  for (const write of writes) {
    const result = await write();
    if (isError(result)) return result;
  }
  return null;
}

/**
 * The whole point's Reset: the point as it now stands, whole with its shots.
 * A refusal part-way carries the point too, read back after the writes that
 * landed, so the console draws what the database holds rather than the rows
 * from before the reset.
 */
export type LabelPointWholeResetResult =
  LabelOpResult<{ point: LabelPoint }> | { error: string; point: LabelPoint };

/**
 * Reset the whole point (`pointResetScope`): the labeller's deletes restored,
 * their added strokes deleted again (reason `other`), every edited stroke
 * reset, then the point's own fields — whose seed has the last word, as the
 * console's one-at-a-time Reset had it. The caller runs it inside one
 * `withLabelOp`, so it is one Undo step whatever it wrote. A write that fails
 * stops the rest and says why; what landed before it is Undo's to take back.
 * Answers the point read back whole, refused or not.
 *
 * The session is the console's (`sessionId`), checked by the reads: the point
 * is read within it, so a point of another session reads as not found. That
 * read and the session's rallies (id, status and vendor rallies alone, for
 * `sharesVendorRally`) go out together, before any write.
 */
/**
 * The reads and writes a whole Reset is made of, on one client — the
 * defaults below; a spec hands its own to drive a refusal part-way.
 */
export interface WholeResetSteps {
  /** The point whole, within the session; null when it is not there. */
  readPoint: () => Promise<LabelPoint | null>;
  readRallies: () => ReturnType<typeof readSessionRallies>;
  restoreShots: (shotIds: string[]) => Promise<object>;
  deleteShot: (shotId: string) => Promise<object>;
  resetShot: (shotId: string) => Promise<object>;
  resetPoint: () => Promise<object>;
}

function wholeResetSteps(
  supabase: AdminClient,
  sessionId: string,
  pointId: string,
): WholeResetSteps {
  return {
    readPoint: () => readBack(supabase, sessionId, pointId),
    readRallies: () => readSessionRallies(supabase, sessionId),
    restoreShots: (shotIds) => writeLabelShotsRestore({ supabase, shotIds }),
    deleteShot: (shotId) =>
      writeLabelShotDelete({ supabase, shotId, reason: "other" }),
    resetShot: (shotId) => writeLabelShotReset({ supabase, shotId }),
    resetPoint: () => writeLabelPointReset({ supabase, pointId }),
  };
}

export async function writeLabelPointWholeReset(params: {
  supabase: AdminClient;
  pointId: unknown;
  sessionId: unknown;
  /** For a spec: the steps on stand-ins, else on `supabase`. */
  steps?: WholeResetSteps;
}): Promise<LabelPointWholeResetResult> {
  const pointId = normaliseId(params.pointId);
  if (!pointId) return { error: "Invalid point id." };
  const sessionId = normaliseId(params.sessionId);
  if (!sessionId) return { error: "Invalid session id." };
  const steps =
    params.steps ?? wholeResetSteps(params.supabase, sessionId, pointId);
  const [point, rallies] = await Promise.all([
    steps.readPoint(),
    steps.readRallies(),
  ]);
  if (!point) return { error: "Point not found." };
  if ("error" in rallies) return rallies;
  const scope = pointResetScope(
    point,
    sharesVendorRally(point, rallies.points),
  );
  if (!scope) return { error: "There is nothing on this point to reset." };

  // Each stroke write re-reads the point's ending. With the point's own
  // fields reset last, its seed overwrites whatever those wrote, so the
  // stroke writes do not depend on one another and go out together. A split
  // half keeps its fields: there the ending each write leaves is the answer,
  // so they run one at a time, in this order.
  const together = scope.fields;
  const restoredFirst = new Set(scope.deletedIds);
  const failed =
    (await runWrites(together, [
      ...(scope.deletedIds.length > 0
        ? [() => steps.restoreShots(scope.deletedIds)]
        : []),
      ...scope.addedIds.map((shotId) => () => steps.deleteShot(shotId)),
      ...scope.shotIds
        .filter((shotId) => !restoredFirst.has(shotId))
        .map((shotId) => () => steps.resetShot(shotId)),
    ])) ??
    // An edited stroke the labeller deleted resets once it is back.
    (await runWrites(
      together,
      scope.shotIds
        .filter((shotId) => restoredFirst.has(shotId))
        .map((shotId) => () => steps.resetShot(shotId)),
    )) ??
    (scope.fields ? await runWrites(false, [() => steps.resetPoint()]) : null);
  // Read back whatever landed — a refusal part-way carries it too.
  const after = await steps.readPoint();
  if (failed) return after ? { ...failed, point: after } : failed;
  if (!after)
    return { error: "The point was reset but could not be read back." };
  return { ok: true, point: after };
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

export function resetLabelPointWhole(
  pointId: unknown,
  sessionId: unknown,
  deps: LabelWriteDependencies = defaults,
): Promise<LabelPointWholeResetResult> {
  return gated(
    deps,
    (supabase) => writeLabelPointWholeReset({ supabase, pointId, sessionId }),
    "reset the point",
  );
}
