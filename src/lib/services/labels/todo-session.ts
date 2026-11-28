/**
 * The admin's two answers on the labellers' To do (`label_todo`, migration
 * `20261117182112`): Add puts analysed matches in it, Remove takes one out.
 *
 * Both are admin-only (`requireAdminActor`, refused with `ADMIN_REQUIRED`),
 * and both re-read what they act on rather than trusting the ids a page
 * sent: Add inserts only jobs `buildTodoCandidates` still offers, and Remove
 * deletes only a To do row nobody holds. A claim landing between Remove's
 * read and its delete leaves the session held; it stays on the board as
 * work past To do, so nothing a labeller started is lost.
 *
 * From `PLANS_BEGIN` Add is also where human review is gated: the source it
 * re-reads (`readTodoSource`) carries which matches were paid for, and a
 * match that was not is no candidate, whatever id the page sent.
 */

import { isUuid } from "@/lib/admin/validation";
import {
  buildTodoCandidates,
  readLabelQueue,
  readTodoSource,
  type LabelQueueEntry,
  type LabelQueueSource,
} from "@/lib/data/label-queue-server";
import type { AdminClient } from "@/lib/supabase/admin";
import {
  ADMIN_REQUIRED,
  defaultLabelWriteDependencies,
  requireAdminActor,
  type LabelWriteDependencies,
} from "./edit-session";
import { NO_SESSION } from "./label-actor";
import { isOpenToClaim } from "./queue";

const LOG = "[labels:todo]";

/** More than an admin would tick at once; bounds one insert. */
export const TODO_ADD_MAX = 100;

export const TODO_NOTHING_CHOSEN = "Choose at least one match to add.";
export const TODO_TOO_MANY = `Add ${TODO_ADD_MAX} matches or fewer at a time.`;
/** Every chosen match was taken, published or added meanwhile. */
export const TODO_NONE_ADDABLE =
  "None of those matches can be added any more. Reload to see where they stand.";
export const TODO_NOT_REMOVABLE =
  "This match is not waiting in To do any more, so it can't be removed. Reload to see where it stands.";

export type TodoAddResult = { ok: true; added: number } | { error: string };
export type TodoRemoveResult = { ok: true } | { error: string };

export interface TodoDependencies extends LabelWriteDependencies {
  readSource?: (db: AdminClient) => Promise<Omit<LabelQueueSource, "photoUrl">>;
  readQueue?: (db: AdminClient) => Promise<LabelQueueEntry[]>;
}

/** The distinct, lower-cased ids, or the sentence that refuses them. */
function parseJobIds(jobIds: unknown): { ids: string[] } | { error: string } {
  if (!Array.isArray(jobIds) || jobIds.length === 0) {
    return { error: TODO_NOTHING_CHOSEN };
  }
  const ids = [...new Set(jobIds.filter(isUuid).map((id) => id.toLowerCase()))];
  if (ids.length === 0) return { error: "Invalid match id." };
  if (ids.length > TODO_ADD_MAX) return { error: TODO_TOO_MANY };
  return { ids };
}

/**
 * Add: put the chosen jobs in To do, due 36 h from now. Jobs no longer on
 * offer (claimed, published or added meanwhile) are skipped, not refused;
 * only when none is left is the call refused. Never throws.
 */
export async function addToLabelTodo(
  jobIds: unknown,
  deps: TodoDependencies = defaultLabelWriteDependencies,
): Promise<TodoAddResult> {
  const actor = await requireAdminActor(deps, NO_SESSION);
  if (!actor) return { error: ADMIN_REQUIRED };
  const parsed = parseJobIds(jobIds);
  if ("error" in parsed) return parsed;
  try {
    const db = deps.createAdminClient();
    const source = await (deps.readSource ?? readTodoSource)(db);
    const wanted = new Set(parsed.ids);
    const rows = buildTodoCandidates(source)
      .filter((candidate) => wanted.has(candidate.jobId))
      .map((candidate) => ({
        job_id: candidate.jobId,
        match_id: candidate.matchId,
        added_by: actor.id,
      }));
    if (rows.length === 0) return { error: TODO_NONE_ADDABLE };
    const { data, error } = await db
      .from("label_todo")
      .upsert(rows, { onConflict: "job_id", ignoreDuplicates: true })
      .select("job_id");
    if (error) return { error: `Could not add to To do: ${error.message}` };
    return { ok: true, added: data?.length ?? 0 };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`${LOG} add threw`, { message });
    return { error: `Could not add to To do: ${message}` };
  }
}

/**
 * Remove: take one job out of To do. Only while it waits there — added, and
 * no session or an open one nobody holds or was sent. Never throws.
 */
export async function removeFromLabelTodo(
  jobId: unknown,
  deps: TodoDependencies = defaultLabelWriteDependencies,
): Promise<TodoRemoveResult> {
  const actor = await requireAdminActor(deps, NO_SESSION);
  if (!actor) return { error: ADMIN_REQUIRED };
  if (!isUuid(jobId)) return { error: "Invalid match id." };
  const id = jobId.toLowerCase();
  try {
    const db = deps.createAdminClient();
    const entries = await (deps.readQueue ?? readLabelQueue)(db);
    const entry = entries.find((row) => row.id === id);
    if (!entry || !entry.addedAt || !isOpenToClaim(entry.session)) {
      return { error: TODO_NOT_REMOVABLE };
    }
    const { error } = await db.from("label_todo").delete().eq("job_id", id);
    if (error)
      return { error: `Could not remove from To do: ${error.message}` };
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`${LOG} remove threw`, { message });
    return { error: `Could not remove from To do: ${message}` };
  }
}
