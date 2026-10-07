/**
 * The labelling console's autosave writes: one field (or one position pair) of
 * one `label_shots` or `label_points` row per call.
 *
 * The shape every `*-session.ts` write shares: re-check the admin session
 * (`requireAdmin`), run on the service-role client, refuse a session that is
 * not `labelling` (`checkSessionOpen`), and decide what to write with the same
 * pure rule the console ran for its optimistic update.
 *
 * Here the patch is validated whole against edit.ts's allowlist before anything
 * is read, a tombstone is refused, and the patch is written together with the
 * status it implies, measured against the row's frozen `seed`.
 *
 * A shot write then settles its point's ending in the same call
 * (ending-session.ts), and answers with the point when that moved it. A serve
 * relabelled in frees the ghost the site removed after it
 * (`ghostFreedByServeIn`) in the same call too, and a rally ball marked out
 * takes the one or two live strokes after it as tombstones
 * (`deadBallsAfterMiss`, answered as `removedAfter`).
 *
 * Also home to the compare-and-set UPDATE every status write shares
 * (`updateIfUnchanged`) and the batched tombstone over it
 * (`writeShotTombstones`): operations-session.ts imports from here, so they
 * cannot live there without a cycle.
 */

import type { AdminClient } from "@/lib/supabase/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/services/programs/admin-guard";
import { UUID_RE } from "@/lib/admin/validation";
import type { LabelPointStatus, LabelShot, LabelShotStatus } from "./session";
import {
  LABEL_POINT_SEED_FIELDS,
  LABEL_SHOT_VALUE_FIELDS,
  applyLabelShotPatch,
  labelPointStatusAfterPatch,
  labelShotStatusAfterPatch,
  parseLabelPointPatch,
  parseLabelPointSeed,
  parseLabelShotPatch,
  parseLabelShotSeed,
  type LabelPointFields,
  type LabelShotValues,
} from "./edit";
import {
  endingSyncFailed,
  readPointShots,
  reconcileEnding,
  syncEndingAfterShotChange,
  type LabelPointEndingSynced,
} from "./ending-session";
import {
  applyShotsRemoved,
  deadBallsAfterMiss,
  planShotDelete,
  type LabelDeleteReason,
  type LabelShotRemoved,
} from "./operations";
import { applySiteRemovalRestore, ghostFreedByServeIn } from "./site-removal";

const LOG = "[labels:edit]";

export type LabelShotEditResult =
  | {
      ok: true;
      status: LabelShotStatus;
      /** The shot's point, when the write moved its ending. */
      point?: LabelPointEndingSynced;
      /** The ghost a serve relabelled in put back, when one was. */
      restoredGhostId?: string;
      /**
       * The strokes a rally ball marked out took with it, as tombstones
       * (`dead_ball_after_point`), when it took any.
       */
      removedAfter?: LabelShotRemoved[];
    }
  | { error: string };
export type LabelPointEditResult =
  | {
      ok: true;
      status: LabelPointStatus;
      /** The point once a winner pick made its ending follow the rows. */
      point?: LabelPointEndingSynced;
    }
  | { error: string };

/** What every admin-gated label write needs; specs pass fakes. */
export interface LabelWriteDependencies {
  requireAdmin: () => Promise<{ id: string } | null>;
  createAdminClient: () => AdminClient;
}
export const defaultLabelWriteDependencies: LabelWriteDependencies = {
  requireAdmin,
  createAdminClient,
};
const defaults = defaultLabelWriteDependencies;

export const ADMIN_REQUIRED = "Administrator access is required.";
/** The refusal every write gives a `complete` session. */
export const FROZEN =
  "This session is complete, so its labels can no longer change.";
const BUSY = "This row changed while it was saving. Try again.";

/**
 * How many times an edit re-reads and retries when the row changed under it.
 * The status an edit writes is worked out from the row as read, so each write
 * is guarded on the `updated_at` it read (the touch trigger moves it on every
 * update): a write that matches nothing means the row changed, and the edit
 * starts again from a fresh read.
 */
const MAX_EDIT_ATTEMPTS = 3;

/**
 * The session's gate, in one read: refuses anything but a `labelling` session
 * with an error sentence, else answers `ghosts` — whether the session draws
 * the site's removed strokes as ghosts (`marks_enabled`), the flag every
 * reading of a point's rows takes (ending-derived.ts). With `blind`, also
 * refuses a session whose `marks_enabled` is false, the gate the marks' own
 * writes share (Restore a ghost, Dismiss a suggestion): that session was
 * labelled blind to the derivation and carries no mark to act on. `blind` is
 * the sentence that says so.
 */
export async function readSessionGate(
  supabase: AdminClient,
  sessionId: string,
  { blind }: { blind?: string } = {},
): Promise<{ ghosts: boolean } | { error: string }> {
  const { data, error } = await supabase
    .from("label_sessions")
    .select("status, marks_enabled")
    .eq("id", sessionId)
    .maybeSingle<{ status: string; marks_enabled?: boolean | null }>();
  if (error) return { error: `Could not read the session: ${error.message}` };
  if (!data) return { error: "Session not found." };
  if (data.status !== "labelling") return { error: FROZEN };
  const ghosts = data.marks_enabled === true;
  if (blind !== undefined && !ghosts) return { error: blind };
  return { ghosts };
}

/** `readSessionGate` as a refusal alone: an error sentence, or null to proceed. */
export async function checkSessionOpen(
  supabase: AdminClient,
  sessionId: string,
  options: { blind?: string } = {},
): Promise<string | null> {
  const gate = await readSessionGate(supabase, sessionId, options);
  return "error" in gate ? gate.error : null;
}

/** The row (or session) the write was aimed at is no longer in the state it was read in. */
export function racedMessage(noun: "row" | "session"): string {
  return `This ${noun} changed in another tab. Reload to see it.`;
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
  if (!data || data.length === 0) return racedMessage("row");
  return null;
}

/**
 * Tombstone `shots` with one `reason`, each compare-and-set on the status it
 * was read with (`planShotDelete`); the first refusal stops the rest. Answers
 * what was written, in the order given. Never a removed row.
 */
export async function writeShotTombstones(
  supabase: AdminClient,
  shots: readonly Pick<LabelShot, "id" | "status">[],
  reason: LabelDeleteReason,
  what: string,
): Promise<{ removed: LabelShotRemoved[] } | { error: string }> {
  const removed: LabelShotRemoved[] = [];
  for (const shot of shots) {
    const plan = planShotDelete(shot, reason);
    if ("error" in plan) return plan;
    const failed = await updateIfUnchanged(
      supabase,
      "label_shots",
      shot.id,
      shot.status,
      { ...plan.write },
      what,
    );
    if (failed) return { error: failed };
    removed.push({
      id: shot.id,
      statusBeforeDelete: plan.write.status_before_delete,
    });
  }
  return { removed };
}

type ShotRow = LabelShotValues & {
  id: string;
  session_id: string;
  label_point_id: string;
  updated_at: string;
  status: LabelShotStatus;
  /** Raw jsonb — parsed before the status rule trusts it. */
  seed: unknown;
};

/**
 * Validate, then write `patch` and its status to one shot; then the ghost a
 * serve relabelled in frees, and the point's ending. Never throws.
 */
export async function writeLabelShotEdit(params: {
  supabase: AdminClient;
  shotId: unknown;
  patch: unknown;
}): Promise<LabelShotEditResult> {
  const { supabase, shotId } = params;
  if (typeof shotId !== "string" || !UUID_RE.test(shotId)) {
    return { error: "Invalid shot id." };
  }
  const parsed = parseLabelShotPatch(params.patch);
  if ("error" in parsed) return parsed;
  const { patch } = parsed;

  try {
    // The session's gate and the point's rows, read once with the first
    // attempt: what the ending is derived from before and after the write.
    let ghosts = false;
    let before: LabelShot[] = [];
    for (let attempt = 0; attempt < MAX_EDIT_ATTEMPTS; attempt += 1) {
      const { data: row, error } = await supabase
        .from("label_shots")
        .select(
          `id, session_id, label_point_id, updated_at, status, seed, ${LABEL_SHOT_VALUE_FIELDS.join(", ")}`,
        )
        .eq("id", shotId)
        .maybeSingle<ShotRow>();
      if (error) {
        return { error: `Could not read the shot: ${error.message}` };
      }
      if (!row) return { error: "Shot not found." };
      if (row.status === "deleted") {
        return { error: "Restore this shot before editing it." };
      }
      if (attempt === 0) {
        const gate = await readSessionGate(supabase, row.session_id);
        if ("error" in gate) return gate;
        ghosts = gate.ghosts;
        const owned = await readPointShots(supabase, row.label_point_id);
        if ("error" in owned) return owned;
        before = owned.shots;
      }

      const status = labelShotStatusAfterPatch(
        { ...row, seed: parseLabelShotSeed(row.seed) },
        patch,
      );
      const { data: written, error: writeError } = await supabase
        .from("label_shots")
        .update({ ...patch, status })
        .eq("id", shotId)
        .eq("updated_at", row.updated_at)
        .select("id");
      if (writeError) {
        return { error: `Could not save the shot: ${writeError.message}` };
      }
      if (!written || written.length === 0) continue;

      let after = before.map((shot) =>
        shot.id === shotId ? applyLabelShotPatch(shot, patch) : shot,
      );
      // A serve marked in says the swing the site removed after it was a
      // return: put it back here, with no click of its own (see the console's
      // file comment). Only while the session draws ghosts at all.
      const freed = ghosts
        ? ghostFreedByServeIn(before, shotId, row, patch)
        : null;
      let restoredGhostId: string | undefined;
      if (freed) {
        const at = new Date().toISOString();
        const { data: unghosted, error: ghostError } = await supabase
          .from("label_shots")
          .update({ site_removal_restored_at: at })
          .eq("id", freed)
          .not("site_removal", "is", null)
          .is("site_removal_restored_at", null)
          .select("id");
        if (ghostError) {
          return {
            error: endingSyncFailed(
              `Could not restore the shot after the serve: ${ghostError.message}`,
            ),
          };
        }
        // Matched nothing: another tab put it back first. Either way it is a
        // stroke of the rally now.
        if (unghosted && unghosted.length > 0) restoredGhostId = freed;
        after = after.map((shot) =>
          shot.id === freed ? applySiteRemovalRestore(shot, at) : shot,
        );
      }

      // A rally ball just marked out or into the net ended the point there:
      // one or two live strokes still after it were hit after the point, and
      // go as tombstones in this same call, with no click of their own (the
      // other exception in the console's file comment). Three or more are
      // left for the hint line's Remove or Split — more likely a second
      // point in the rally. Read off the labeller's rows: with marks off a
      // ghost is a stroke like any other.
      const dead = deadBallsAfterMiss(after, shotId, row, patch, ghosts);
      let removedAfter: LabelShotRemoved[] | undefined;
      if (dead.length > 0) {
        const written = await writeShotTombstones(
          supabase,
          dead,
          "dead_ball_after_point",
          "remove the shots after it",
        );
        if ("error" in written) {
          return { error: endingSyncFailed(written.error) };
        }
        removedAfter = written.removed;
        after = applyShotsRemoved(after, written.removed);
      }

      const synced = await syncEndingAfterShotChange({
        supabase,
        pointId: row.label_point_id,
        ghosts,
        before,
        after,
      });
      if ("error" in synced) return { error: endingSyncFailed(synced.error) };
      return {
        ok: true,
        status,
        ...(synced.point ? { point: synced.point } : {}),
        ...(restoredGhostId ? { restoredGhostId } : {}),
        ...(removedAfter ? { removedAfter } : {}),
      };
    }
    return { error: BUSY };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`${LOG} shot threw`, { shotId, message });
    return { error: `Could not save the shot: ${message}` };
  }
}

type PointRow = LabelPointFields & {
  id: string;
  session_id: string;
  updated_at: string;
  status: LabelPointStatus;
  /** Raw jsonb — parsed before the status rule trusts it. */
  seed: unknown;
};

/**
 * Validate, then write `patch` and its status to one point. A patch that
 * names the `winner` then lets the ending follow (`reconcileEnding`): a last
 * stroke with no result reads the winner to say winner or error, so a pick
 * must not leave the ending saying the other. The winner itself is never
 * written back — the labeller just chose it. Never throws.
 */
export async function writeLabelPointEdit(params: {
  supabase: AdminClient;
  pointId: unknown;
  patch: unknown;
}): Promise<LabelPointEditResult> {
  const { supabase, pointId } = params;
  if (typeof pointId !== "string" || !UUID_RE.test(pointId)) {
    return { error: "Invalid point id." };
  }
  const parsed = parseLabelPointPatch(params.patch);
  if ("error" in parsed) return parsed;
  const { patch } = parsed;

  try {
    let ghosts = false;
    for (let attempt = 0; attempt < MAX_EDIT_ATTEMPTS; attempt += 1) {
      const { data: row, error } = await supabase
        .from("label_points")
        .select(
          `id, session_id, updated_at, status, seed, ${LABEL_POINT_SEED_FIELDS.join(", ")}`,
        )
        .eq("id", pointId)
        .maybeSingle<PointRow>();
      if (error) {
        return { error: `Could not read the point: ${error.message}` };
      }
      if (!row) return { error: "Point not found." };
      if (row.status === "deleted") {
        return { error: "Restore this point before editing it." };
      }
      if (attempt === 0) {
        const gate = await readSessionGate(supabase, row.session_id);
        if ("error" in gate) return gate;
        ghosts = gate.ghosts;
      }

      const status = labelPointStatusAfterPatch(
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
      if (!written || written.length === 0) continue;
      if (!("winner" in patch)) return { ok: true, status };

      const synced = await reconcileEnding({
        supabase,
        pointId,
        ghosts,
        settleWinner: false,
      });
      if ("error" in synced) {
        return {
          error: `${synced.error} The winner was saved; reload to see the point as it stands.`,
        };
      }
      return synced.point
        ? { ok: true, status: synced.point.status, point: synced.point }
        : { ok: true, status };
    }
    return { error: BUSY };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`${LOG} point threw`, { pointId, message });
    return { error: `Could not save the point: ${message}` };
  }
}

export async function editLabelShot(
  shotId: unknown,
  patch: unknown,
  deps: LabelWriteDependencies = defaults,
): Promise<LabelShotEditResult> {
  const actor = await deps.requireAdmin();
  if (!actor) return { error: ADMIN_REQUIRED };
  return writeLabelShotEdit({
    supabase: deps.createAdminClient(),
    shotId: typeof shotId === "string" ? shotId.toLowerCase() : shotId,
    patch,
  });
}

export async function editLabelPoint(
  pointId: unknown,
  patch: unknown,
  deps: LabelWriteDependencies = defaults,
): Promise<LabelPointEditResult> {
  const actor = await deps.requireAdmin();
  if (!actor) return { error: ADMIN_REQUIRED };
  return writeLabelPointEdit({
    supabase: deps.createAdminClient(),
    pointId: typeof pointId === "string" ? pointId.toLowerCase() : pointId,
    patch,
  });
}
