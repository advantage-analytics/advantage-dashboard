/**
 * The console's Undo, server side: one call to `undo_label_op` (migrations
 * `label_row_history_undo`, `undo_label_op_returns_rows`), which rewinds the
 * newest action the row triggers journaled for the session and names the rows
 * it touched. Only those are read back — each touched point whole with its
 * shots, plus the owning point of every touched shot — and the console applies
 * them as a diff (undo-diff.ts). An undone split or combine moves strokes
 * between two points; both owners are in the answer, so both come back.
 *
 * Same gate as every label write: `requireAdmin`, then the service role. The
 * function itself refuses a session that is not `labelling`.
 */

import { isUuid } from "@/lib/admin/validation";
import { readLabelPointsByIds } from "@/lib/data/labels-server";
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
      /**
       * Every point the rewind touched — or that owns a shot it touched —
       * as it now stands, whole. Replaces the console's row of the same id,
       * or joins the rows for a point the rewind re-inserted.
       */
      changed: LabelPoint[];
      /** Points the rewind deleted: the undone action had added them. */
      removedPointIds: string[];
    }
  | { error: string };

/** What `undo_label_op` answers. Arrays are absent from the old function. */
interface UndoAnswer {
  undone?: string | null;
  remaining?: number;
  points?: string[];
  shots?: string[];
  deleted_points?: string[];
  deleted_shots?: string[];
  shot_points?: string[];
}

export interface UndoDependencies {
  requireAdmin: () => Promise<{ id: string } | null>;
  createAdminClient: () => AdminClient;
  /** The named points, each whole with its shots. */
  readPoints: (
    db: AdminClient,
    sessionId: string,
    pointIds: readonly string[],
  ) => Promise<LabelPoint[]>;
}

const defaults: UndoDependencies = {
  requireAdmin,
  createAdminClient,
  readPoints: readLabelPointsByIds,
};

/**
 * The points to read back: the touched points and every touched shot's
 * owner, less the points the rewind deleted. Order is the function's;
 * duplicates are folded.
 */
export function pointsToRead(answer: UndoAnswer): {
  pointIds: string[];
  removedPointIds: string[];
} {
  const removedPointIds = [...new Set(answer.deleted_points ?? [])];
  const removed = new Set(removedPointIds);
  const pointIds = [
    ...new Set([...(answer.points ?? []), ...(answer.shot_points ?? [])]),
  ].filter((id) => !removed.has(id));
  return { pointIds, removedPointIds };
}

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
  const answer = (data ?? {}) as UndoAnswer;
  const { pointIds, removedPointIds } = pointsToRead(answer);
  let changed: LabelPoint[];
  try {
    changed = await deps.readPoints(db, sessionId, pointIds);
  } catch (cause: unknown) {
    // The rewind is committed; only the read-back failed.
    console.error("[labels] undo read-back failed", {
      sessionId,
      message: (cause as Error)?.message,
    });
    return { error: "Undone, but the rows could not be read. Reload." };
  }
  return {
    ok: true,
    undone: answer.undone ?? null,
    remaining: answer.remaining ?? 0,
    changed,
    removedPointIds,
  };
}
