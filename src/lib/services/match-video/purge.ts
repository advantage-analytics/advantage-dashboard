/**
 * Plan step 10 — what match and account deletion do about video attachments.
 *
 * The short answer is: almost nothing themselves, on purpose. The attachment
 * table (T2) keeps its rows when a match is deleted — `match_id` is
 * `on delete set null` — precisely so the blob keys survive for the cleanup
 * worker, and T13's claim treats a row with no match as an orphan: it is
 * retired under the cleanup lease in ANY state and both of its objects are
 * collected. So the delete itself is the fence. Every attachment RPC (T3
 * reserve/renew/cancel, T4 begin_finalization/activate) looks the row up by
 * `id AND match_id` behind `match_video_authorize_match`, and a null
 * `match_id` matches nothing: a late renewal, a completion whose copy was
 * still running, an activation racing the delete — all refuse with
 * `match_not_found` the moment the delete commits. A browser still holding a
 * valid upload SAS can keep writing the staged blob, which is exactly why the
 * predicate holds an orphan until that credential is dead plus five minutes.
 * Nothing here needs to delete a blob inside the deletion transaction, and
 * nothing here tries to.
 *
 * What the branch DOES, inside `purgeMatchStorage()`'s isolated fourth lane:
 *
 *   1. authorize   the caller's own client re-reads `matches` for the ids it
 *                  was given. The attachment table has no client-role access
 *                  and everything below runs as service role, so an id the
 *                  caller cannot read is dropped before it reaches that
 *                  client. Both callers already filtered to matches the user
 *                  created; this narrows, never widens.
 *   2. snapshot    the rows filed under those matches, read as service role,
 *                  so the log can say how many objects the delete will strand
 *                  for the worker — and so a match with no attachment (the
 *                  common case) costs one read and schedules nothing.
 *   3. schedule    a best-effort run of T14's worker for AFTER the caller's
 *                  response — `after()` from `next/server` — which is after
 *                  the row delete has committed and the foreign key has done
 *                  its work. The run is the same worker the daily cron uses,
 *                  leasing a batch sized for this delete on top of the usual
 *                  best-effort ten. Whatever it cannot take yet (a staged key
 *                  under a live SAS, a copy under a finalization lease) it
 *                  leaves for the schedule; whatever it fails on keeps its
 *                  keys and its retry metadata, by T14's contract.
 *
 * The retention policy is untouched. Account deletion passes only personal
 * matches here; a team's retained match keeps its row, its `match_id` and
 * its active final object when the uploader's `uploaded_by` goes null —
 * T13's predicate never looks at that column, and this module never lists a
 * match it was not given.
 *
 * SERVER ONLY: reaches the service-role client and, through `cleanup.ts`,
 * `@azure/storage-blob`. `tests/client-bundle-boundary.spec.ts` enforces it.
 *
 * Injected (`AttachmentPurgeDeps`) so `tests/match-video-purge.spec.ts` can
 * run the whole deletion sequence — purge, delete, foreign-key null, the
 * scheduled run, the next sweep — against the same fakes as the worker.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { createAdminClient } from "@/lib/supabase/admin";

import {
  BEST_EFFORT_BATCH_LIMIT,
  CLEANUP_BATCH_LIMIT,
  productionCleanupDeps,
  requestBestEffortCleanup,
  type CleanupDeps,
  type CleanupRunSummary,
} from "./cleanup";

const LOG = "[match-video-purge]";

/* -------------------------------------------------------------------------
 * Deps
 * ---------------------------------------------------------------------- */

/** The two columns the branch needs to describe what the delete strands. */
export interface AttachmentPurgeRow {
  id: string;
  state: string;
}

export interface AttachmentPurgeDeps {
  /** Service-role read of the rows filed under these matches. */
  listAttachments(matchIds: string[]): Promise<AttachmentPurgeRow[]>;
  /** T14's seams — the same worker the cron runs. */
  cleanup: CleanupDeps;
  /**
   * Runs `task` after the caller's response, i.e. after the match rows are
   * gone. Resolves once the task is scheduled, not once it has run.
   */
  schedule(task: () => Promise<void>): Promise<void>;
}

export interface AttachmentPurgeReport {
  /** The ids the caller's client could read — the only ones acted on. */
  authorizedMatchIds: string[];
  /** Rows under those matches at the time of the purge, before the delete. */
  attachments: AttachmentPurgeRow[];
  /** Whether a post-delete worker run was scheduled. */
  scheduled: boolean;
}

/* -------------------------------------------------------------------------
 * The branch
 * ---------------------------------------------------------------------- */

/**
 * The attachment lane of `purgeMatchStorage()`. Throws on a failed read so
 * the caller's per-lane catch logs it; never touches storage itself.
 */
export async function purgeMatchAttachments(input: {
  /** The caller's client — RLS-scoped for the match route, admin for account deletion. */
  caller: SupabaseClient;
  matchIds: string[];
  label: string;
  deps: AttachmentPurgeDeps;
}): Promise<AttachmentPurgeReport> {
  const { caller, matchIds, label, deps } = input;
  const none: AttachmentPurgeReport = {
    authorizedMatchIds: [],
    attachments: [],
    scheduled: false,
  };
  if (matchIds.length === 0) return none;

  // 1. Authorize through the caller's own client. For the match route that
  //    is the user's RLS view; for account deletion it is the admin client
  //    over ids the action already filtered to the caller's personal matches.
  const { data: visible, error: visibleError } = await caller
    .from("matches")
    .select("id")
    .in("id", matchIds);
  if (visibleError) {
    throw new Error(`could not authorize match ids: ${visibleError.message}`);
  }
  const authorized = (visible ?? [])
    .map((m) => m.id as string)
    .filter((id) => matchIds.includes(id));
  if (authorized.length === 0) return none;

  // 2. Snapshot. A match with no attachment — most of them — stops here.
  const attachments = await deps.listAttachments(authorized);
  if (attachments.length === 0) {
    return { ...none, authorizedMatchIds: authorized };
  }

  console.log(
    `[${label}] ${attachments.length} video attachment row(s) on ` +
      `${authorized.length} match(es) will be orphaned by the delete; ` +
      `their objects are collected by the cleanup worker`,
  );

  // 3. Schedule the worker for after the delete has committed. Sized so this
  //    delete's own rows fit even when the usual backlog is ahead of them in
  //    claim order (already-retired rows come first).
  const limit = Math.min(
    CLEANUP_BATCH_LIMIT,
    BEST_EFFORT_BATCH_LIMIT + attachments.length,
  );
  const ids = new Set(attachments.map((a) => a.id));
  await deps.schedule(async () => {
    const summary = await requestBestEffortCleanup(deps.cleanup, {
      reason: `${label}:attachments`,
      limit,
    });
    console.log(`${LOG} post-delete run`, {
      label,
      ...describeRun(ids, summary),
    });
  });

  return { authorizedMatchIds: authorized, attachments, scheduled: true };
}

/**
 * What the post-delete run did with THIS delete's rows: collected outright,
 * failed into retry (keys kept), or not yet claimable — a staged key under
 * a live upload credential, a copy under a finalization lease — and left
 * for the daily sweep.
 */
export function describeRun(
  ids: Set<string>,
  summary: CleanupRunSummary,
): {
  collected: number;
  retrying: number;
  deferred: number;
  claimError?: string;
} {
  let collected = 0;
  let retrying = 0;
  for (const row of summary.rows) {
    if (!ids.has(row.attachmentId)) continue;
    if (row.outcome === "cleaned_up") collected += 1;
    else retrying += 1;
  }
  return {
    collected,
    retrying,
    deferred: ids.size - collected - retrying,
    ...(summary.claimError ? { claimError: summary.claimError.detail } : {}),
  };
}

/* -------------------------------------------------------------------------
 * Production deps
 * ---------------------------------------------------------------------- */

/**
 * `after()` from `next/server`, so the run starts once the route handler or
 * server action has answered — after its match delete. Outside a request
 * scope (a script driving `purgeMatchStorage` by hand) `after` throws; the
 * task then runs inline, which is harmless: it is the same bounded worker,
 * and the rows it cannot take yet wait for the schedule.
 */
async function scheduleAfterResponse(task: () => Promise<void>): Promise<void> {
  try {
    const { after } = await import("next/server");
    after(task);
  } catch (cause) {
    console.warn(
      `${LOG} no request scope — running the post-delete task inline`,
      {
        message: cause instanceof Error ? cause.message : String(cause),
      },
    );
    await task();
  }
}

/** The service-role client, T14's production seams and Next's `after`. */
export function productionAttachmentPurgeDeps(
  admin: SupabaseClient = createAdminClient(),
): AttachmentPurgeDeps {
  return {
    async listAttachments(matchIds) {
      const { data, error } = await admin
        .from("match_video_attachments")
        .select("id, state")
        .in("match_id", matchIds);
      if (error) {
        throw new Error(`could not list attachments: ${error.message}`);
      }
      return (data ?? []) as AttachmentPurgeRow[];
    },
    cleanup: productionCleanupDeps(admin),
    schedule: scheduleAfterResponse,
  };
}
