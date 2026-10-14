import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";

/**
 * One labeller action, as the database sees it.
 *
 * The labelling console's Undo is a journal kept by row triggers
 * (`label_row_history`, migration `label_row_history_undo`). A trigger cannot
 * tell which of several PostgREST requests belong to one click, so the server
 * action says so: every request made inside `withLabelOp` carries the same
 * `x-label-op` id and the action's name, and the triggers file each row's
 * before-image under that id. A write made outside one — seeding, a script —
 * carries no header and is never journaled, so Undo cannot take it back.
 *
 * `createAdminClient()` reads the headers when it builds a client, which is
 * why the scope must be open before the action's service builds its own.
 */
const store = new AsyncLocalStorage<Record<string, string>>();

/** Run one console action with its writes grouped as one undo step. */
export function withLabelOp<T>(
  action: string,
  run: () => Promise<T>,
): Promise<T> {
  return store.run(
    { "x-label-op": randomUUID(), "x-label-action": action },
    run,
  );
}

/** The headers of the action in flight, or none. */
export function opHeaders(): Record<string, string> | undefined {
  return store.getStore();
}
