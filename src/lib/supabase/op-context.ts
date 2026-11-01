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

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Run one console action with its writes grouped as one undo step. `opId` joins
 * it to an earlier action of the same click, when one click takes two requests;
 * anything but a uuid starts a step of its own.
 */
export function withLabelOp<T>(
  action: string,
  run: () => Promise<T>,
  opId?: string,
): Promise<T> {
  return store.run(
    {
      "x-label-op": opId && UUID.test(opId) ? opId : randomUUID(),
      "x-label-action": action,
    },
    run,
  );
}

/** The headers of the action in flight, or none. */
export function opHeaders(): Record<string, string> | undefined {
  return store.getStore();
}
