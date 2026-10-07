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
 * Refuses anything but a `labelling` session: an error sentence, or null to
 * proceed. With `blind`, also refuses a session whose `marks_enabled` is false,
 * the gate the marks' own writes share (Restore a ghost, Dismiss a suggestion):
 * that session was labelled blind to the derivation and carries no mark to act
 * on. `blind` is the sentence that says so.
 */
export async function checkSessionOpen(
  supabase: AdminClient,
  sessionId: string,
  { blind }: { blind?: string } = {},
): Promise<string | null> {
  const { data, error } = await supabase
    .from("label_sessions")
    .select(blind === undefined ? "status" : "status, marks_enabled")
    .eq("id", sessionId)
    .maybeSingle<{ status: string; marks_enabled?: boolean | null }>();
  if (error) return `Could not read the session: ${error.message}`;
  if (!data) return "Session not found.";
  if (data.status !== "labelling") return FROZEN;
  if (blind !== undefined && data.marks_enabled !== true) return blind;
  return null;
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
