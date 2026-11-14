/**
 * Which of a page's matches are "Verification pending" — read through
 * `match_label_states()` (migration `20261114151350`), the one place a
 * customer learns anything about the label queue.
 *
 * Always the CALLER's client: the signed-in cookie client on the server, the
 * browser client on Home's client refresh. Never the service role — the
 * function answers only for `visible_match_ids()`, and with no `auth.uid()`
 * it answers nothing at all. That is also why this module carries no
 * `server-only` guard despite its name: `home-recent-data.ts` runs in both.
 *
 * Never fatal. A list, a report or Home is more useful without the badge than
 * not at all, and the function may not exist yet on the database a branch
 * runs against — so any error reads as "nothing pending", logged once.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { MatchAnalysis } from "@/lib/data/match-analysis";
import {
  showsVerificationPending,
  verificationPendingFor,
  type MatchLabelState,
  type MatchVerification,
} from "@/lib/data/match-verification";

/** Ids per RPC call: one call for any ordinary page, a few for a long list. */
const BATCH_SIZE = 500;

/** Error codes already logged in this process, so each is logged once. */
const logged = new Set<string>();

function logOnce(error: { code?: string; message?: string }): void {
  const key = error.code ?? error.message ?? "unknown";
  if (logged.has(key)) return;
  logged.add(key);
  // PGRST202 / 42883: the function is not on this database yet.
  console.warn("[match-verification] could not read label states", {
    code: error.code,
    message: error.message,
  });
}

/** Only what `MatchLabelState` names leaves the call, whatever comes back. */
function toLabelState(row: Record<string, unknown>): MatchLabelState | null {
  if (typeof row.match_id !== "string") return null;
  return {
    match_id: row.match_id,
    results_at: typeof row.results_at === "string" ? row.results_at : null,
    has_video: row.has_video === true,
    labelling: row.labelling === true,
  };
}

/**
 * The ids among `matchIds` that are waiting on a labeller
 * (`verificationPendingFor`). Batched, never per row. Resolves to an empty
 * set on any error, without throwing.
 */
export async function loadVerificationPending(
  supabase: SupabaseClient,
  matchIds: readonly string[],
): Promise<Set<string>> {
  const pending = new Set<string>();
  const ids = [...new Set(matchIds)];
  if (ids.length === 0) return pending;

  const batches: string[][] = [];
  for (let i = 0; i < ids.length; i += BATCH_SIZE) {
    batches.push(ids.slice(i, i + BATCH_SIZE));
  }

  try {
    const results = await Promise.all(
      batches.map((batch) =>
        supabase.rpc("match_label_states", { p_match_ids: batch }),
      ),
    );
    for (const { data, error } of results) {
      if (error) {
        logOnce(error);
        return new Set();
      }
      for (const raw of (data ?? []) as Record<string, unknown>[]) {
        const state = toLabelState(raw);
        if (state && verificationPendingFor(state)) pending.add(state.match_id);
      }
    }
  } catch (error) {
    logOnce({
      code: "thrown",
      message: error instanceof Error ? error.message : String(error),
    });
    return new Set();
  }
  return pending;
}

/**
 * A list's rows with `verificationPending` set, once both the rows and the
 * pending read have resolved. The two are started apart and awaited together,
 * so the label-state read never sits in series behind the list's enrichment.
 */
export async function withVerificationPending<
  T extends {
    id: string;
    verification?: MatchVerification | null;
    analysis?: Pick<MatchAnalysis, "status" | "recovery">;
    verificationPending: boolean;
  },
>(rows: Promise<T[]>, pending: Promise<Set<string>>): Promise<T[]> {
  const [list, ids] = await Promise.all([rows, pending]);
  return list.map((row) => ({
    ...row,
    verificationPending: showsVerificationPending({
      verification: row.verification,
      pending: ids.has(row.id),
      analysis: row.analysis,
    }),
  }));
}
