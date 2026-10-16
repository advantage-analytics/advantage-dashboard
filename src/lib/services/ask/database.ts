/**
 * The `AskDatabase` the orchestrator (`ask.ts`) is handed — and THE ONE PLACE
 * ASK USES THE SERVICE ROLE.
 *
 * The rule, in full:
 *
 *   - The service-role client is used for exactly three function calls —
 *     `ask_run_query`, `ask_run_team_query`, `ask_release_question` — and for
 *     no table access at all. This module never calls `.from()`, `.storage`
 *     or `.auth` on it; it is only ever asked to `.rpc()` one of those names.
 *   - Do not add to the list. A fourth function, or a table read, belongs on
 *     the signed-in user's client where RLS and `auth.uid()` decide.
 *     (One more service-role call exists outside this module:
 *     `ask_similar_examples`, made by the route itself before this database
 *     is built — `examples.ts`, `retrieveAskExamples()` — with the same
 *     viewer binding from the route's own `auth.getUser()`. It needs no plan
 *     and runs beside the pre-stream reads, which is why it is not routed
 *     here; it carries the identity argument the same way.)
 *
 * Why those three. They run SQL a language model wrote (or undo a question
 * reservation), and were once executable by any signed-in user straight from
 * the browser with any SELECT. They are now granted to `service_role` only,
 * so the only way to them is `POST /api/ask`, where the SQL guard
 * (`sql-guard.ts`, with its function allow-list) has already run. A
 * service-role caller has no `auth.uid()`, so each of the three takes the
 * viewer as an argument instead: `p_viewer` for the two query functions,
 * `p_user_id` for the release.
 *
 * Where that identity comes from. `viewerId` is the caller's own, freshly
 * verified `auth.getUser()` result (the route's session, the eval script's
 * sign-in). It is bound once, here, when the database is built. It never
 * comes from a request body and never from `args`: an identity key a caller
 * put in `args` is dropped before the bound one is written, so nothing
 * upstream — `ask.ts`, a plan, a model reply — can name another viewer.
 *
 * Everything else (`ask_reserve_question`, `ask_quota`, `ask_save_exchange`,
 * `ask_delete_conversation`, anything added later) goes to the user's client
 * untouched and runs as the signed-in user.
 *
 * `ask.ts` does not know any of this: it calls the same function names with
 * the same arguments as before.
 *
 * Server-only by construction: it takes its clients as arguments and imports
 * no client factory, so it can be loaded by the route, a script and an
 * offline spec alike — but a service-role client only exists on the server
 * (`src/lib/supabase/admin.ts`), and this must never be imported by a file
 * that carries `"use client"`.
 */

import { isUuid } from "@/lib/admin/validation";
import type { AskDatabase, AskRpcResult } from "@/lib/services/ask/ask";

/** The one method this module calls on either Supabase client. */
export interface AskRpcClient {
  rpc(fn: string, args?: Record<string, unknown>): PromiseLike<AskRpcResult>;
}

/**
 * The functions that run on the service-role client, each with the argument
 * that carries the viewer. Closed: see the rule at the top of this file.
 */
export const ASK_SERVICE_ROLE_CALLS: Readonly<Record<string, string>> =
  Object.freeze({
    ask_run_query: "p_viewer",
    ask_run_team_query: "p_viewer",
    ask_release_question: "p_user_id",
  });

/** Every name an identity argument goes by; none survives from a caller. */
const IDENTITY_ARGS: readonly string[] = [
  ...new Set(Object.values(ASK_SERVICE_ROLE_CALLS)),
];

export interface AskDatabaseClients {
  /** The signed-in user's client (cookie session, or a script's sign-in). */
  user: AskRpcClient;
  /** The service-role client. Reached for the three calls above only. */
  service: AskRpcClient;
  /** `auth.getUser()`'s id for `user` — the server's own word, nobody else's. */
  viewerId: string;
}

/**
 * Build the database `askQuestion()` and `reserveAskQuestion()` are handed.
 * Throws when `viewerId` is not a uuid: with the service role there is no
 * `auth.uid()` behind it to fall back on, so a missing viewer must stop here
 * and not reach the database as a null.
 */
export function createAskDatabase(clients: AskDatabaseClients): AskDatabase {
  const { user, service, viewerId } = clients;
  if (!isUuid(viewerId)) {
    throw new Error("createAskDatabase: viewerId must be the session user id.");
  }

  return {
    rpc(fn, args) {
      const identityArg = Object.hasOwn(ASK_SERVICE_ROLE_CALLS, fn)
        ? ASK_SERVICE_ROLE_CALLS[fn]
        : undefined;
      if (identityArg === undefined) return user.rpc(fn, args);

      const forwarded: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(args ?? {})) {
        if (!IDENTITY_ARGS.includes(key)) forwarded[key] = value;
      }
      forwarded[identityArg] = viewerId;
      return service.rpc(fn, forwarded);
    },
  };
}
