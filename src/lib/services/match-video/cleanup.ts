/**
 * Plan step 9, worker half — collect the storage objects behind attachment
 * rows the database says are done with.
 *
 * The SQL (T13, `20260919080217_match_video_attachment_cleanup.sql`) owns
 * every decision about WHICH rows and WHICH keys: `match_video_claim_cleanup`
 * leases a batch under one worker token, retires abandoned pending work and
 * orphans in the same transaction (the fence that stops a late activation or
 * renewal), and answers per row with `collect_staged` / `collect_final`. This
 * module never re-derives that. It does exactly what a claim tells it to, in
 * this order, per row:
 *
 *   1. state guard    a final key is deleted only for a `retired` row. The
 *                     claim never says otherwise; if it ever did, the worker
 *                     still refuses, because `match_video_confirm_cleanup`
 *                     raises `active_final_collected` at a worker that lies
 *                     and the served asset would already be gone by then.
 *   2. abort the copy the final key may hold a copy T10 left in flight (a
 *                     cancel during publication is reachable). Azure refuses
 *                     to delete such a destination (409 PendingCopyOperation)
 *                     — and, worse, a copy that finished AFTER a delete would
 *                     put the object back with nothing tracking it. So the
 *                     copy is aborted first, with the id the row persisted,
 *                     and if the delete still meets a pending copy (a retry
 *                     whose new id was never persisted) the live id is read
 *                     from the destination and aborted too. Only then delete.
 *   3. delete final   when `collect_final`. Absence (404) is success.
 *   4. delete staged  when `collect_staged`. Absence is success.
 *   5. settle         every requested object gone → `confirm`, which rechecks
 *                     the lease and the row's `version` before recording it;
 *                     anything short of that → `fail`, which keeps every key,
 *                     counts the attempt and backs off. A row is never
 *                     confirmed on a partial delete.
 *
 * Bounded concurrency: {@link CLEANUP_CONCURRENCY} rows in flight at once,
 * never the whole batch. Each row is at most one HEAD, two aborts and two
 * deletes, so a full batch of {@link CLEANUP_BATCH_LIMIT} is a few hundred
 * short storage calls spread over four lanes — well inside the lease and a
 * serverless function's budget, and small enough that a storage outage fails
 * fifty rows into their backoff rather than hammering the account.
 *
 * Two entry points, one worker: {@link runMatchVideoCleanup} for the schedule
 * (T15), and {@link requestBestEffortCleanup} for replacement and cancel
 * paths (T16) that want an immediate attempt without caring whether it did
 * anything — it runs the same function with a smaller batch and never throws.
 * The SQL decides whether the just-retired row is collectible yet (its upload
 * credential must be dead first), so "best effort" is exactly that.
 *
 * SERVER ONLY: reaches `storage.ts` (`@azure/storage-blob`) and the
 * service-role RPCs. `tests/client-bundle-boundary.spec.ts` enforces it.
 *
 * Injected (`CleanupDeps`) so `tests/match-video-cleanup.spec.ts` can run
 * duplicate sweeps, copy races, partial deletes and outages against fakes
 * that keep T13's semantics, and read the outcome from the store.
 */

import { randomUUID } from "node:crypto";

import { RestError } from "@azure/storage-blob";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  fail,
  matchVideoError,
  ok,
  type MatchVideoError,
  type MatchVideoResult,
} from "@/lib/match-video/types";

import { publishedBlobOf, stagedBlobOf } from "./probe";
import { matchVideoRpcError, type RpcErrorLike } from "./rpc-errors";
import {
  abortPublication,
  azureAttachmentBlobOps,
  deleteAttachmentBlob,
  type AttachmentBlobOps,
  type AttachmentStorageRow,
  type CopyStatus,
} from "./storage";

const LOG = "[match-video-cleanup]";

/* -------------------------------------------------------------------------
 * Constants
 * ---------------------------------------------------------------------- */

/**
 * Rows in flight at once. Four: enough to keep a batch short (fifty rows is
 * about thirteen rounds of a handful of cheap calls per lane), few enough
 * that a slow or failing storage account sees a trickle, not a burst. It is
 * also the fan-out the plan gave the browser upload, so the account's
 * concurrent-request budget is spent the same way on both ends.
 */
export const CLEANUP_CONCURRENCY = 4;

/** The most rows one claim may lease — T13's upper bound. */
export const CLEANUP_BATCH_LIMIT = 50;

/**
 * How long a claim holds its rows. Must outlast a full batch's worst case
 * (fifty rows, five storage calls each, four lanes, generous per-call
 * timeouts) so a slow run cannot watch its own lease lapse and a second
 * sweep double-delete; must be short enough that a crashed run does not park
 * fifty rows for long. Fifteen minutes clears the first with a wide margin.
 */
export const CLEANUP_LEASE_SECONDS = 15 * 60;

/**
 * Backoff asked for when a delete is refused by a copy still pending after
 * an abort was attempted. Azure aborts are quick; ten minutes is enough for
 * the copy to settle either way, and shorter than T13's default first step.
 */
const PENDING_COPY_RETRY_SECONDS = 10 * 60;

/** The best-effort entry point leases fewer rows: it is not the daily sweep. */
export const BEST_EFFORT_BATCH_LIMIT = 10;

/* -------------------------------------------------------------------------
 * Database seam — T13's three functions
 * ---------------------------------------------------------------------- */

/** One row of `match_video_claim_cleanup`. */
export interface CleanupClaim {
  attachment_id: string;
  match_id: string | null;
  state: string;
  version: number;
  staged_blob_key: string;
  final_blob_key: string;
  copy_id: string | null;
  copy_status: CopyStatus | null;
  collect_staged: boolean;
  collect_final: boolean;
  cleanup_lease_until: string;
  cleanup_attempts: number;
}

export type ConfirmOutcome =
  | "cleaned_up"
  | "staged_shed"
  | "rescheduled"
  | "lease_lost"
  | "version_changed";

export type FailOutcome = "failed" | "lease_lost";

export interface CleanupDatabase {
  claim(input: {
    workerToken: string;
    leaseSeconds: number;
    limit: number;
  }): Promise<MatchVideoResult<CleanupClaim[]>>;
  confirm(input: {
    attachmentId: string;
    leaseToken: string;
    expectedVersion: number;
    collectedFinal: boolean;
  }): Promise<MatchVideoResult<{ outcome: ConfirmOutcome }>>;
  fail(input: {
    attachmentId: string;
    leaseToken: string;
    error: string;
    retryAfterSeconds: number | null;
  }): Promise<MatchVideoResult<{ outcome: FailOutcome }>>;
}

/* -------------------------------------------------------------------------
 * Storage seam — T7 behind one interface
 * ---------------------------------------------------------------------- */

/**
 * The four storage questions cleanup asks. Every method takes the row; none
 * takes a key. `pendingCopyAt` is the one thing T7 does not already export:
 * a HEAD of the final key that reports only whether a copy is in flight
 * there and under which id — the id a retry may have minted after the one
 * the row persisted.
 */
export interface CleanupStorage {
  pendingCopyAt(
    row: AttachmentStorageRow,
  ): Promise<MatchVideoResult<{ copyId: string } | null>>;
  abortPublication(input: {
    row: AttachmentStorageRow;
    copyId: string;
  }): Promise<MatchVideoResult<{ aborted: boolean }>>;
  deleteStaged(
    row: AttachmentStorageRow,
  ): Promise<MatchVideoResult<{ deleted: boolean }>>;
  deleteFinal(
    row: AttachmentStorageRow,
  ): Promise<MatchVideoResult<{ deleted: boolean }>>;
}

/** T7 over the given blob ops (production: the pipeline's container). */
export function azureCleanupStorage(
  ops: AttachmentBlobOps = azureAttachmentBlobOps(),
): CleanupStorage {
  return {
    async pendingCopyAt(row) {
      const published = publishedBlobOf(row);
      if (!published.ok) return published;
      try {
        const head = await ops.properties(published.value.blobName);
        return ok(
          head.copy?.status === "pending" ? { copyId: head.copy.id } : null,
        );
      } catch (cause) {
        if (cause instanceof RestError && cause.statusCode === 404) {
          return ok(null);
        }
        return fail("storage_unavailable", "properties_failed");
      }
    },
    abortPublication: (input) => abortPublication(input, ops),
    async deleteStaged(row) {
      const staged = stagedBlobOf(row);
      if (!staged.ok) return staged;
      return deleteAttachmentBlob(staged.value, ops);
    },
    async deleteFinal(row) {
      const published = publishedBlobOf(row);
      if (!published.ok) return published;
      return deleteAttachmentBlob(published.value, ops);
    },
  };
}

/* -------------------------------------------------------------------------
 * Deps and results
 * ---------------------------------------------------------------------- */

export interface CleanupDeps {
  database: CleanupDatabase;
  storage: CleanupStorage;
  /** Test seam; production mints a random UUID per run. */
  mintWorkerToken?: () => string;
}

export interface CleanupRunOptions {
  /** Rows to lease, 1–{@link CLEANUP_BATCH_LIMIT}. */
  limit?: number;
  leaseSeconds?: number;
  /** Free text for the log line, e.g. `"cron"` or `"replace:<match>"`. */
  reason?: string;
}

export type CleanupRowOutcome = ConfirmOutcome | FailOutcome | "unsettled";

export interface CleanupRowReport {
  attachmentId: string;
  state: string;
  outcome: CleanupRowOutcome;
  /** For a failure: the storage detail that stopped the row. */
  detail?: string;
  stagedDeleted: boolean;
  finalDeleted: boolean;
}

export interface CleanupRunSummary {
  workerToken: string;
  claimed: number;
  outcomes: Record<CleanupRowOutcome, number>;
  rows: CleanupRowReport[];
  /** Set when the claim itself failed; no row was touched. */
  claimError?: MatchVideoError;
}

function emptyOutcomes(): Record<CleanupRowOutcome, number> {
  return {
    cleaned_up: 0,
    staged_shed: 0,
    rescheduled: 0,
    lease_lost: 0,
    version_changed: 0,
    failed: 0,
    unsettled: 0,
  };
}

/* -------------------------------------------------------------------------
 * The worker
 * ---------------------------------------------------------------------- */

/**
 * One sweep: claim a batch, collect each row's objects with bounded
 * concurrency, settle each row. Never throws for a row's sake — a row that
 * blows up is failed (keys kept, attempt counted) and the batch continues.
 * Throws only if a seam throws outside any row, which the schedule route
 * should report as its own error.
 */
export async function runMatchVideoCleanup(
  deps: CleanupDeps,
  options: CleanupRunOptions = {},
): Promise<CleanupRunSummary> {
  const workerToken = (deps.mintWorkerToken ?? randomUUID)();
  const limit = clamp(
    options.limit ?? CLEANUP_BATCH_LIMIT,
    1,
    CLEANUP_BATCH_LIMIT,
  );
  const leaseSeconds = clamp(
    options.leaseSeconds ?? CLEANUP_LEASE_SECONDS,
    1,
    3600,
  );
  // Not an option: no caller has ever tuned lane count, and offering the knob
  // implied one did. The bound is the constant, whose reasoning lives with it.
  const concurrency = CLEANUP_CONCURRENCY;
  const reason = options.reason ?? "sweep";

  const summary: CleanupRunSummary = {
    workerToken,
    claimed: 0,
    outcomes: emptyOutcomes(),
    rows: [],
  };

  const claimed = await deps.database.claim({
    workerToken,
    leaseSeconds,
    limit,
  });
  if (!claimed.ok) {
    console.error(`${LOG} claim failed`, {
      reason,
      detail: claimed.error.detail,
    });
    summary.claimError = claimed.error;
    return summary;
  }
  summary.claimed = claimed.value.length;
  if (claimed.value.length === 0) return summary;

  // A bounded pool: `concurrency` lanes each pull the next row until the
  // batch is drained. Claims are processed in the order the SQL returned
  // them (oldest business first), so a lane never skips ahead.
  const queue = [...claimed.value];
  const reports: CleanupRowReport[] = [];
  const lane = async () => {
    for (;;) {
      const claim = queue.shift();
      if (!claim) return;
      reports.push(await collectRow(claim, workerToken, deps));
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(concurrency, queue.length) }, lane),
  );

  // Report in claim order regardless of which lane finished first.
  const order = new Map(claimed.value.map((c, i) => [c.attachment_id, i]));
  reports.sort(
    (a, b) => order.get(a.attachmentId)! - order.get(b.attachmentId)!,
  );
  summary.rows = reports;
  for (const report of reports) summary.outcomes[report.outcome] += 1;

  console.log(`${LOG} sweep done`, {
    reason,
    claimed: summary.claimed,
    ...summary.outcomes,
  });
  return summary;
}

/**
 * The same worker, for a caller that just retired a row (replacement,
 * cancel) and wants an immediate attempt it does not have to wait on or
 * handle. Smaller batch; resolves — never rejects — with the summary, or
 * with an empty one carrying the error when the run itself could not start.
 */
export async function requestBestEffortCleanup(
  deps: CleanupDeps,
  options: CleanupRunOptions = {},
): Promise<CleanupRunSummary> {
  const reason = options.reason ?? "best-effort";
  try {
    return await runMatchVideoCleanup(deps, {
      ...options,
      limit: options.limit ?? BEST_EFFORT_BATCH_LIMIT,
      reason,
    });
  } catch (cause) {
    console.error(`${LOG} best-effort run threw`, {
      reason,
      message: cause instanceof Error ? cause.message : String(cause),
    });
    return {
      workerToken: "",
      claimed: 0,
      outcomes: emptyOutcomes(),
      rows: [],
      claimError: matchVideoError("storage_unavailable", "best_effort_threw"),
    };
  }
}

/* -------------------------------------------------------------------------
 * One row
 * ---------------------------------------------------------------------- */

type Collected =
  | { ok: true; stagedDeleted: boolean; finalDeleted: boolean }
  | {
      ok: false;
      detail: string;
      retryAfterSeconds: number | null;
      stagedDeleted: boolean;
      finalDeleted: boolean;
    };

async function collectRow(
  claim: CleanupClaim,
  workerToken: string,
  deps: CleanupDeps,
): Promise<CleanupRowReport> {
  const context = {
    attachmentId: claim.attachment_id,
    matchId: claim.match_id,
    state: claim.state,
    version: claim.version,
    attempt: claim.cleanup_attempts + 1,
  };

  // State guard, before any storage call. `collect_final` is what the claim
  // computed; `state` is what it read. They agree by construction — this is
  // the check that keeps a served asset in place if they ever did not.
  let collectFinal = claim.collect_final;
  if (collectFinal && claim.state !== "retired") {
    console.error(
      `${LOG} claim asked for a non-retired row's final key — refusing`,
      context,
    );
    collectFinal = false;
  }

  let collected: Collected;
  try {
    collected = await collectObjects(claim, collectFinal, deps.storage);
  } catch (cause) {
    collected = {
      ok: false,
      detail: `exception:${cause instanceof Error ? cause.message : String(cause)}`,
      retryAfterSeconds: null,
      stagedDeleted: false,
      finalDeleted: false,
    };
  }

  const base = {
    attachmentId: claim.attachment_id,
    state: claim.state,
    stagedDeleted: collected.stagedDeleted,
    finalDeleted: collected.finalDeleted,
  };

  try {
    if (collected.ok) {
      const settled = await deps.database.confirm({
        attachmentId: claim.attachment_id,
        leaseToken: workerToken,
        expectedVersion: claim.version,
        collectedFinal: collectFinal,
      });
      if (!settled.ok) {
        console.error(`${LOG} confirm refused`, {
          ...context,
          detail: settled.error.detail,
        });
        return { ...base, outcome: "unsettled", detail: settled.error.detail };
      }
      if (settled.value.outcome !== "cleaned_up") {
        console.log(`${LOG} ${settled.value.outcome}`, context);
      }
      return { ...base, outcome: settled.value.outcome };
    }

    console.warn(`${LOG} could not collect — keys kept`, {
      ...context,
      detail: collected.detail,
      stagedDeleted: collected.stagedDeleted,
      finalDeleted: collected.finalDeleted,
    });
    const failed = await deps.database.fail({
      attachmentId: claim.attachment_id,
      leaseToken: workerToken,
      error: collected.detail,
      retryAfterSeconds: collected.retryAfterSeconds,
    });
    if (!failed.ok) {
      console.error(`${LOG} fail refused`, {
        ...context,
        detail: failed.error.detail,
      });
      return { ...base, outcome: "unsettled", detail: collected.detail };
    }
    return { ...base, outcome: failed.value.outcome, detail: collected.detail };
  } catch (cause) {
    // The settle itself threw. The lease expires on its own and the next
    // sweep re-evaluates the row; nothing about its keys was recorded wrong.
    console.error(`${LOG} settle threw — lease left to expire`, {
      ...context,
      message: cause instanceof Error ? cause.message : String(cause),
    });
    return {
      ...base,
      outcome: "unsettled",
      detail: collected.ok ? "settle_threw" : collected.detail,
    };
  }
}

/**
 * Delete what the claim asked for: final first (after aborting any copy
 * still writing it), then staged. Stops at the first refusal so the settle
 * reports one cause; whatever was already deleted is reported alongside.
 */
async function collectObjects(
  claim: CleanupClaim,
  collectFinal: boolean,
  storage: CleanupStorage,
): Promise<Collected> {
  const row: AttachmentStorageRow = {
    id: claim.attachment_id,
    staged_blob_key: claim.staged_blob_key,
    final_blob_key: claim.final_blob_key,
    // The staged ETag is not part of a claim and is not needed: a delete is
    // unconditional, and the abort is keyed by copy id.
    source_etag: null,
  };
  let stagedDeleted = false;
  let finalDeleted = false;

  if (collectFinal) {
    const final = await collectFinalObject(claim, row, storage);
    if (!final.ok) return { ...final, stagedDeleted, finalDeleted };
    finalDeleted = final.deleted;
  }

  if (claim.collect_staged) {
    const staged = await storage.deleteStaged(row);
    if (!staged.ok) {
      return {
        ok: false,
        detail: `staged:${staged.error.detail}`,
        retryAfterSeconds: null,
        stagedDeleted,
        finalDeleted,
      };
    }
    stagedDeleted = staged.value.deleted;
  }

  return { ok: true, stagedDeleted, finalDeleted };
}

type FinalResult =
  | { ok: true; deleted: boolean }
  | { ok: false; detail: string; retryAfterSeconds: number | null };

/**
 * Abort, then delete. The abort uses the copy id the row persisted; when the
 * delete is still refused for a pending copy, the destination is read once
 * for the id actually in flight — a retried publication whose new id was
 * never persisted — and that one is aborted before one more delete. A copy
 * that survives both is backed off, not worked around: the key stays and
 * the next attempt starts again from the abort.
 */
async function collectFinalObject(
  claim: CleanupClaim,
  row: AttachmentStorageRow,
  storage: CleanupStorage,
): Promise<FinalResult> {
  if (claim.copy_id && claim.copy_status !== "success") {
    const aborted = await storage.abortPublication({
      row,
      copyId: claim.copy_id,
    });
    if (!aborted.ok) {
      return {
        ok: false,
        detail: `abort:${aborted.error.detail}`,
        retryAfterSeconds: null,
      };
    }
  }

  const first = await storage.deleteFinal(row);
  if (first.ok) return { ok: true, deleted: first.value.deleted };
  if (first.error.detail !== "pending_copy_blocks_delete") {
    return {
      ok: false,
      detail: `final:${first.error.detail}`,
      retryAfterSeconds: null,
    };
  }

  // A copy the row does not know about. Learn its id from the object.
  const live = await storage.pendingCopyAt(row);
  if (!live.ok) {
    return {
      ok: false,
      detail: `final:pending_copy:${live.error.detail}`,
      retryAfterSeconds: PENDING_COPY_RETRY_SECONDS,
    };
  }
  if (live.value && live.value.copyId !== claim.copy_id) {
    const aborted = await storage.abortPublication({
      row,
      copyId: live.value.copyId,
    });
    if (!aborted.ok) {
      return {
        ok: false,
        detail: `abort:${aborted.error.detail}`,
        retryAfterSeconds: PENDING_COPY_RETRY_SECONDS,
      };
    }
  }

  const second = await storage.deleteFinal(row);
  if (second.ok) return { ok: true, deleted: second.value.deleted };
  return {
    ok: false,
    detail: `final:${second.error.detail}`,
    retryAfterSeconds:
      second.error.detail === "pending_copy_blocks_delete"
        ? PENDING_COPY_RETRY_SECONDS
        : null,
  };
}

/* -------------------------------------------------------------------------
 * Production database seam
 * ---------------------------------------------------------------------- */

/**
 * T13's three functions through the service-role client. The lease token
 * every settle sends is the run's worker token — the value the claim wrote
 * into `cleanup_lease_token` — so a row leased by another run answers
 * `lease_lost` in the row rather than being touched.
 */
export function supabaseCleanupDatabase(
  admin: SupabaseClient,
): CleanupDatabase {
  return {
    async claim(input) {
      const { data, error } = await admin.rpc("match_video_claim_cleanup", {
        p_worker_token: input.workerToken,
        p_lease_seconds: input.leaseSeconds,
        p_limit: input.limit,
      });
      if (error) return rpcFailure("match_video_claim_cleanup", error, {});
      const rows = (Array.isArray(data) ? data : []) as CleanupClaim[];
      return ok(rows.map(normalizeClaim));
    },

    async confirm(input) {
      const { data, error } = await admin.rpc("match_video_confirm_cleanup", {
        p_attachment_id: input.attachmentId,
        p_lease_token: input.leaseToken,
        p_expected_version: input.expectedVersion,
        p_collected_final: input.collectedFinal,
      });
      if (error) {
        return rpcFailure("match_video_confirm_cleanup", error, {
          attachmentId: input.attachmentId,
        });
      }
      const row = firstRow<{ outcome: ConfirmOutcome }>(data);
      if (!row) return fail("storage_unavailable", "rpc_empty");
      return ok({ outcome: row.outcome });
    },

    async fail(input) {
      const { data, error } = await admin.rpc("match_video_fail_cleanup", {
        p_attachment_id: input.attachmentId,
        p_lease_token: input.leaseToken,
        p_error: input.error,
        p_retry_after_seconds: input.retryAfterSeconds,
      });
      if (error) {
        return rpcFailure("match_video_fail_cleanup", error, {
          attachmentId: input.attachmentId,
        });
      }
      const row = firstRow<{ outcome: FailOutcome }>(data);
      if (!row) return fail("storage_unavailable", "rpc_empty");
      return ok({ outcome: row.outcome });
    },
  };
}

/** Production deps: the service-role client and the pipeline's container. */
export function productionCleanupDeps(admin: SupabaseClient): CleanupDeps {
  return {
    database: supabaseCleanupDatabase(admin),
    storage: azureCleanupStorage(),
  };
}

function normalizeClaim(row: CleanupClaim): CleanupClaim {
  return {
    ...row,
    version: Number(row.version),
    cleanup_attempts: Number(row.cleanup_attempts),
    collect_staged: Boolean(row.collect_staged),
    collect_final: Boolean(row.collect_final),
  };
}

function firstRow<Row>(data: unknown): Row | undefined {
  return (Array.isArray(data) ? data[0] : data) as Row | undefined;
}

function rpcFailure<T>(
  fn: string,
  error: RpcErrorLike,
  context: Record<string, unknown>,
): MatchVideoResult<T> {
  const mapped = matchVideoRpcError(error);
  if (mapped) return { ok: false, error: mapped };
  // 22023 (a malformed argument — a worker bug) and P0002 (unknown
  // attachment at settle) both land here: logged with the SQLSTATE, and
  // answered as a retryable failure so the batch keeps moving.
  console.error(`${LOG} ${fn} failed`, {
    ...context,
    sqlstate: error.code,
    message: error.message,
    details: error.details,
  });
  return fail("storage_unavailable", `rpc_${error.code || "unknown"}`);
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.trunc(value)));
}
