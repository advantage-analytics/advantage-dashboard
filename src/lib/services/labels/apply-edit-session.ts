/**
 * One console edit's writes, applied in one transaction and one round trip
 * (`label_apply_edit`, migration `20261019090000_label_apply_edit`).
 *
 * The plan stays in TypeScript; this sends the rows it computed, in order.
 * Either every write lands or none does: an update that does not find every
 * row it names — or, with `expect_status`, finds one whose status moved since
 * it was read — rolls the whole edit back, and the answer says the row changed
 * in another tab. Before this a split made one request per later point, ~160
 * ms each from a laptop, and a failure part-way left half an edit saved.
 *
 * Undo keeps journalling every row: the call carries the action's
 * `x-label-op` like any other request (op-context.ts).
 */

import type { AdminClient } from "@/lib/supabase/admin";
import { racedMessage } from "./edit-session";

export type LabelEditTable = "label_points" | "label_shots";

export type LabelEditOp =
  | {
      op: "update";
      table: LabelEditTable;
      ids: readonly string[];
      set: Record<string, unknown>;
      /** The status every row must still have, as read. */
      expect_status?: string;
    }
  | {
      op: "insert";
      table: LabelEditTable;
      /** The row, with its `id` chosen here so later ops can name it. */
      values: Record<string, unknown>;
    };

/** The SQLSTATE `label_apply_edit` raises when a row was not as read. */
export const LABEL_EDIT_CONFLICT = "LB409";

/**
 * Apply `ops` to `sessionId`'s rows. Answers the inserted rows in order —
 * every column, as `to_jsonb` gives them — or an error sentence (`what` names
 * the edit: "split the point").
 */
export async function applyLabelEdit(
  supabase: AdminClient,
  sessionId: string,
  ops: readonly LabelEditOp[],
  what: string,
): Promise<{ inserted: unknown[] } | { error: string }> {
  if (ops.length === 0) return { inserted: [] };
  const { data, error } = await supabase.rpc("label_apply_edit", {
    p_session: sessionId,
    p_ops: ops,
  });
  if (error) {
    return {
      error:
        error.code === LABEL_EDIT_CONFLICT
          ? racedMessage("row")
          : `Could not ${what}: ${error.message}`,
    };
  }
  return { inserted: Array.isArray(data) ? data : [] };
}
