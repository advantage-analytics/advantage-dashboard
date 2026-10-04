/**
 * The labelling console's autosave writes: one field (or one position pair)
 * of one `label_shots` or `label_points` row per call.
 *
 * Writes go to those two tables and nowhere else. Each call re-checks the
 * admin session, validates the patch whole against edit.ts's allowlist and
 * vocabularies before anything is read, refuses a row in a `complete` session
 * (the run is frozen for scoring) or a tombstone (T7 restores those), and
 * writes the patch together with the status it implies — measured against the
 * row's frozen `seed` by the same pure rule the console used for its
 * optimistic update.
 *
 * Runs on the service-role client, like seed-session.ts and the loader behind
 * the page (`getLabelSession`), with `requireAdmin` as the gate.
 */

import type { AdminClient } from "@/lib/supabase/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/services/programs/admin-guard";
import { UUID_RE } from "@/lib/admin/validation";
import type { LabelPointStatus, LabelShotStatus } from "./session";
import {
  LABEL_POINT_SEED_FIELDS,
  LABEL_SHOT_VALUE_FIELDS,
  labelPointStatusAfterPatch,
  labelShotStatusAfterPatch,
  parseLabelPointPatch,
  parseLabelPointSeed,
  parseLabelShotPatch,
  parseLabelShotSeed,
  type LabelPointFields,
  type LabelShotValues,
} from "./edit";

const LOG = "[labels:edit]";

export type LabelShotEditResult =
  { ok: true; status: LabelShotStatus } | { error: string };
export type LabelPointEditResult =
  { ok: true; status: LabelPointStatus } | { error: string };

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
const FROZEN = "This session is complete, so its labels can no longer change.";
const BUSY = "This row changed while it was saving. Try again.";

/**
 * How many times an edit re-reads and retries when the row changed under it.
 *
 * The status an edit writes is worked out from the row as it was read, so a
 * second save landing in between would leave it stale — a changed shot marked
 * `kept`, with no Reset. Each write is therefore guarded on the `updated_at`
 * it read (the touch trigger moves it on every update): a write that matches
 * nothing means the row changed, and the edit starts again from a fresh read.
 * A delete is such a change too, and the fresh read then refuses the tombstone.
 */
const MAX_EDIT_ATTEMPTS = 3;

/** Refuses anything but a `labelling` session. */
export async function checkSessionOpen(
  supabase: AdminClient,
  sessionId: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from("label_sessions")
    .select("status")
    .eq("id", sessionId)
    .maybeSingle<{ status: string }>();
  if (error) return `Could not read the session: ${error.message}`;
  if (!data) return "Session not found.";
  return data.status === "labelling" ? null : FROZEN;
}

type ShotRow = LabelShotValues & {
  id: string;
  session_id: string;
  updated_at: string;
  status: LabelShotStatus;
  /** Raw jsonb — parsed before the status rule trusts it. */
  seed: unknown;
};

/** Validate, then write `patch` and its status to one shot. Never throws. */
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
    for (let attempt = 0; attempt < MAX_EDIT_ATTEMPTS; attempt += 1) {
      const { data: row, error } = await supabase
        .from("label_shots")
        .select(
          `id, session_id, updated_at, status, seed, ${LABEL_SHOT_VALUE_FIELDS.join(", ")}`,
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
        const closed = await checkSessionOpen(supabase, row.session_id);
        if (closed) return { error: closed };
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
      if (written && written.length > 0) return { ok: true, status };
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

/** Validate, then write `patch` and its status to one point. Never throws. */
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
        const closed = await checkSessionOpen(supabase, row.session_id);
        if (closed) return { error: closed };
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
      if (written && written.length > 0) return { ok: true, status };
    }
    return { error: BUSY };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`${LOG} point threw`, { pointId, message });
    return { error: `Could not save the point: ${message}` };
  }
}

/** The admin-gated entry point behind the `updateLabelShot` action. */
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

/** The admin-gated entry point behind the `updateLabelPoint` action. */
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
