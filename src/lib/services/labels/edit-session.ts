/**
 * The labelling console's autosave writes: one field (or one position pair)
 * of one `label_shots` or `label_points` row per call.
 *
 * Writes go to those two tables and nowhere else. Each call re-checks the
 * admin session, validates the patch whole against edit.ts's allowlist and
 * vocabularies before anything is read, refuses a row in a `complete` session
 * (the run is frozen for scoring) or a tombstone (T7 restores those), and
 * writes the patch together with the status it implies — computed by the same
 * pure rule the console used for its optimistic update.
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
  LABEL_POINT_VALUE_FIELDS,
  LABEL_SHOT_VALUE_FIELDS,
  labelPointStatusAfterPatch,
  labelShotStatusAfterPatch,
  parseLabelPointPatch,
  parseLabelShotPatch,
  type LabelPointValues,
  type LabelShotValues,
} from "./edit";

const LOG = "[labels:edit]";

export type LabelShotEditResult =
  { ok: true; status: LabelShotStatus } | { error: string };
export type LabelPointEditResult =
  { ok: true; status: LabelPointStatus } | { error: string };

interface Dependencies {
  requireAdmin: () => Promise<{ id: string } | null>;
  createAdminClient: () => AdminClient;
}
const defaults: Dependencies = { requireAdmin, createAdminClient };

const ADMIN_REQUIRED = "Administrator access is required.";
const FROZEN = "This session is complete, so its labels can no longer change.";

/** Refuses anything but a `labelling` session. */
async function checkSessionOpen(
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
  status: LabelShotStatus;
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
    const { data: row, error } = await supabase
      .from("label_shots")
      .select(`id, session_id, status, ${LABEL_SHOT_VALUE_FIELDS.join(", ")}`)
      .eq("id", shotId)
      .maybeSingle<ShotRow>();
    if (error) return { error: `Could not read the shot: ${error.message}` };
    if (!row) return { error: "Shot not found." };
    if (row.status === "deleted") {
      return { error: "Restore this shot before editing it." };
    }
    const closed = await checkSessionOpen(supabase, row.session_id);
    if (closed) return { error: closed };

    const status = labelShotStatusAfterPatch(row, patch);
    const { error: writeError } = await supabase
      .from("label_shots")
      .update({ ...patch, status })
      .eq("id", shotId);
    if (writeError) {
      return { error: `Could not save the shot: ${writeError.message}` };
    }
    return { ok: true, status };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`${LOG} shot threw`, { shotId, message });
    return { error: `Could not save the shot: ${message}` };
  }
}

type PointRow = LabelPointValues & {
  id: string;
  session_id: string;
  status: LabelPointStatus;
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
    const { data: row, error } = await supabase
      .from("label_points")
      .select(`id, session_id, status, ${LABEL_POINT_VALUE_FIELDS.join(", ")}`)
      .eq("id", pointId)
      .maybeSingle<PointRow>();
    if (error) return { error: `Could not read the point: ${error.message}` };
    if (!row) return { error: "Point not found." };
    if (row.status === "deleted") {
      return { error: "Restore this point before editing it." };
    }
    const closed = await checkSessionOpen(supabase, row.session_id);
    if (closed) return { error: closed };

    const status = labelPointStatusAfterPatch(row, patch);
    const { error: writeError } = await supabase
      .from("label_points")
      .update({ ...patch, status })
      .eq("id", pointId);
    if (writeError) {
      return { error: `Could not save the point: ${writeError.message}` };
    }
    return { ok: true, status };
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
  deps: Dependencies = defaults,
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
  deps: Dependencies = defaults,
): Promise<LabelPointEditResult> {
  const actor = await deps.requireAdmin();
  if (!actor) return { error: ADMIN_REQUIRED };
  return writeLabelPointEdit({
    supabase: deps.createAdminClient(),
    pointId: typeof pointId === "string" ? pointId.toLowerCase() : pointId,
    patch,
  });
}
