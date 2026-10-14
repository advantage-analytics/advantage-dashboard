/**
 * The console's Undo, server side: one call to `undo_label_op` (migration
 * `label_row_history_undo`), which rewinds the newest action the row triggers
 * journaled for the session, then the session's rows read back whole — an
 * undone split or combine moves strokes between points and shifts every later
 * index, so the console replaces its rows rather than patching them.
 *
 * Same gate as every label write: `requireAdmin`, then the service role. The
 * function itself refuses a session that is not `labelling`.
 */

import { isUuid } from "@/lib/admin/validation";
import { readLabelSessionRows } from "@/lib/data/labels-server";
import { requireAdmin } from "@/lib/services/programs/admin-guard";
import { createAdminClient, type AdminClient } from "@/lib/supabase/admin";
import type { LabelPoint } from "./session";

export type LabelUndoResult =
  | {
      ok: true;
      /** The undone action's name ("Split point"); null with nothing to undo. */
      undone: string | null;
      /** Actions still on the journal. */
      remaining: number;
      /** The session's rows after the rewind. */
      points: LabelPoint[];
    }
  | { error: string };

export interface UndoDependencies {
  requireAdmin: () => Promise<{ id: string } | null>;
  createAdminClient: () => AdminClient;
  readPoints: (
    db: AdminClient,
    sessionId: string,
  ) => Promise<LabelPoint[] | null>;
}

const defaults: UndoDependencies = {
  requireAdmin,
  createAdminClient,
  readPoints: async (db, sessionId) =>
    (await readLabelSessionRows(db, sessionId))?.session.points ?? null,
};

export async function undoLabelOp(
  sessionId: string,
  deps: UndoDependencies = defaults,
): Promise<LabelUndoResult> {
  const viewer = await deps.requireAdmin();
  if (!viewer) return { error: "Admin access required." };
  if (!isUuid(sessionId)) return { error: "No such session." };

  const db = deps.createAdminClient();
  const { data, error } = await db.rpc("undo_label_op", {
    p_session_id: sessionId,
  });
  if (error) {
    console.error("[labels] undo failed", {
      sessionId,
      message: error.message,
    });
    // P0001 is the function's own refusal, written to be shown.
    return {
      error:
        error.code === "P0001"
          ? error.message
          : "Could not undo. Nothing was changed.",
    };
  }
  const answer = (data ?? {}) as { undone?: string | null; remaining?: number };
  const points = await deps.readPoints(db, sessionId);
  if (!points) return { error: "No such session." };
  return {
    ok: true,
    undone: answer.undone ?? null,
    remaining: answer.remaining ?? 0,
    points,
  };
}
