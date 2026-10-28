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
 *
 * Redo (⌘⇧Z) is the same round trip through `redo_label_op` (migration
 * `label_redo`): the undo keeps each row as the action left it, and redo
 * writes those back. Its server action runs inside `withLabelOp`, so the
 * redo is journaled and ⌘Z takes it back again.
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
      /** Undone actions waiting for a redo; 0 from the old function. */
      redoable: number;
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
  redoable?: number;
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
export function pointsToRead(answer: UndoAnswer | RedoAnswer): {
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

export type LabelRedoResult =
  | {
      ok: true;
      /** The redone action's name; null with nothing to redo. */
      redone: string | null;
      /** Undone actions still waiting for a redo. */
      remaining: number;
      /** As `LabelUndoResult`'s: every point the redo touched, whole. */
      changed: LabelPoint[];
      /** Points the redo deleted: the redone action had removed them. */
      removedPointIds: string[];
    }
  | { error: string };

/** What `redo_label_op` answers: undo's arrays, `redone` for `undone`. */
interface RedoAnswer extends Omit<UndoAnswer, "undone" | "redoable"> {
  redone?: string | null;
}

/** Call one of the two functions and read back the rows it touched. */
async function rewind<A extends UndoAnswer | RedoAnswer>(
  fn: "undo_label_op" | "redo_label_op",
  sessionId: string,
  deps: UndoDependencies,
): Promise<
  | { answer: A; changed: LabelPoint[]; removedPointIds: string[] }
  | { error: string }
> {
  const viewer = await deps.requireAdmin();
  if (!viewer) return { error: "Admin access required." };
  if (!isUuid(sessionId)) return { error: "No such session." };

  const verb = fn === "undo_label_op" ? "undo" : "redo";
  const db = deps.createAdminClient();
  const { data, error } = await db.rpc(fn, { p_session_id: sessionId });
  if (error) {
    console.error(`[labels] ${verb} failed`, {
      sessionId,
      message: error.message,
    });
    // P0001 is the function's own refusal, written to be shown.
    return {
      error:
        error.code === "P0001"
          ? error.message
          : `Could not ${verb}. Nothing was changed.`,
    };
  }
  const answer = (data ?? {}) as A;
  const { pointIds, removedPointIds } = pointsToRead(answer);
  try {
    const changed = await deps.readPoints(db, sessionId, pointIds);
    return { answer, changed, removedPointIds };
  } catch (cause: unknown) {
    // The rewind is committed; only the read-back failed.
    console.error(`[labels] ${verb} read-back failed`, {
      sessionId,
      message: (cause as Error)?.message,
    });
    return {
      error: `${verb === "undo" ? "Undone" : "Redone"}, but the rows could not be read. Reload.`,
    };
  }
}

export async function undoLabelOp(
  sessionId: string,
  deps: UndoDependencies = defaults,
): Promise<LabelUndoResult> {
  const done = await rewind<UndoAnswer>("undo_label_op", sessionId, deps);
  if ("error" in done) return done;
  return {
    ok: true,
    undone: done.answer.undone ?? null,
    remaining: done.answer.remaining ?? 0,
    redoable: done.answer.redoable ?? 0,
    changed: done.changed,
    removedPointIds: done.removedPointIds,
  };
}

export async function redoLabelOp(
  sessionId: string,
  deps: UndoDependencies = defaults,
): Promise<LabelRedoResult> {
  const done = await rewind<RedoAnswer>("redo_label_op", sessionId, deps);
  if ("error" in done) return done;
  return {
    ok: true,
    redone: done.answer.redone ?? null,
    remaining: done.answer.remaining ?? 0,
    changed: done.changed,
    removedPointIds: done.removedPointIds,
  };
}
