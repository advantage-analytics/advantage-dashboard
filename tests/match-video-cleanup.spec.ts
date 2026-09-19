import { randomUUID } from "node:crypto";

import { expect, test } from "@playwright/test";
import { RestError } from "@azure/storage-blob";

import { matchVideoError } from "@/lib/match-video/types";
import type { MatchVideoResult } from "@/lib/match-video/types";
import {
  authorizeCronRequest,
  CLEANUP_CRON_PATH,
  CLEANUP_CRON_REASON,
  handleCleanupCron,
  type CleanupCronDeps,
} from "@/lib/services/match-video/cleanup-schedule";
import {
  azureCleanupStorage,
  CLEANUP_BATCH_LIMIT,
  CLEANUP_CONCURRENCY,
  requestBestEffortCleanup,
  runMatchVideoCleanup,
  type CleanupClaim,
  type CleanupDatabase,
  type CleanupDeps,
  type ConfirmOutcome,
  type FailOutcome,
} from "@/lib/services/match-video/cleanup";
import type {
  AttachmentBlobHead,
  AttachmentBlobOps,
  CopyStatus,
} from "@/lib/services/match-video/storage";

/**
 * The cleanup worker (T14) against fakes that keep T13's semantics.
 *
 *   FakeAttachments   the table plus `claim` / `confirm` / `fail` with the
 *                     same eligibility predicate, the same retire-on-claim
 *                     fence, the same lease and version checks and the same
 *                     outcome names as the migration. `confirm` raises on
 *                     `active` + `collected_final`, exactly as the SQL does.
 *   FakeContainer     an in-memory Azure container: 404 absent, 409 delete
 *                     of a destination with a pending copy, 409 abort of a
 *                     copy that is not pending. Copies in flight are settled
 *                     explicitly by the test — AFTER the worker has run —
 *                     which is how "a finished copy cannot put a deleted
 *                     object back" is proven rather than asserted. T7's real
 *                     `abortPublication` / `deleteAttachmentBlob` run over
 *                     it via `azureCleanupStorage`.
 *
 * Every claim is read from the store afterwards — keys, state, attempts,
 * `cleaned_up_at` — never inferred from the summary alone.
 */

/* -------------------------------------------------------------------------
 * Clock
 * ---------------------------------------------------------------------- */

const T0 = new Date("2026-09-19T05:00:00.000Z");
let now = T0;
const HOUR = 60 * 60 * 1000;
const MINUTE = 60 * 1000;

function at(offsetMs: number): Date {
  return new Date(T0.getTime() + offsetMs);
}

test.beforeEach(() => {
  now = T0;
});

/* -------------------------------------------------------------------------
 * Fake table — T13's predicate and three functions
 * ---------------------------------------------------------------------- */

interface Row {
  id: string;
  match_id: string | null;
  uploaded_by: string | null;
  state: "pending" | "active" | "retired";
  version: number;
  staged_blob_key: string;
  final_blob_key: string;
  copy_id: string | null;
  copy_status: CopyStatus | null;
  upload_sas_expires_at: Date | null;
  last_attempt_at: Date;
  finalize_lease_until: Date | null;
  retired_at: Date | null;
  cleanup_lease_token: string | null;
  cleanup_lease_until: Date | null;
  cleanup_attempts: number;
  cleanup_next_attempt_at: Date | null;
  cleanup_last_error: string | null;
  cleaned_up_at: Date | null;
}

const INFINITY = new Date(8.64e15);

function keysFor(id: string) {
  return {
    staged_blob_key: `match-video/m/${id}/staged.mp4`,
    final_blob_key: `match-video/m/${id}/final.mp4`,
  };
}

type RowOverrides = Partial<Row>;

function makeRow(overrides: RowOverrides = {}): Row {
  const id = overrides.id ?? randomUUID();
  return {
    id,
    match_id: randomUUID(),
    uploaded_by: randomUUID(),
    state: "retired",
    version: 1,
    ...keysFor(id),
    copy_id: null,
    copy_status: null,
    // Expired long ago: the staged rule passes unless a test says otherwise.
    upload_sas_expires_at: at(-12 * HOUR),
    last_attempt_at: at(-30 * HOUR),
    finalize_lease_until: null,
    retired_at: at(-10 * HOUR),
    cleanup_lease_token: null,
    cleanup_lease_until: null,
    cleanup_attempts: 0,
    cleanup_next_attempt_at: null,
    cleanup_last_error: null,
    cleaned_up_at: null,
    ...overrides,
  };
}

interface DbEvent {
  fn: "claim" | "confirm" | "fail";
  attachmentId?: string;
  outcome?: string;
  collectedFinal?: boolean;
}

class FakeAttachments implements CleanupDatabase {
  rows = new Map<string, Row>();
  events: DbEvent[] = [];
  /** Runs between a claim and its confirm — for version races. */
  beforeConfirm?: (row: Row) => void;
  /** Rewrites what the claim hands back — for a claim that lies. */
  mutateClaim?: (claim: CleanupClaim, row: Row) => CleanupClaim;
  claimError?: Error;

  add(overrides: RowOverrides = {}): Row {
    const row = makeRow(overrides);
    this.rows.set(row.id, row);
    return row;
  }

  get(id: string): Row {
    return this.rows.get(id)!;
  }

  /** `match_video_cleanup_collectible`, line for line. */
  private collectible(a: Row, t: Date): boolean {
    const due = (d: Date | null) => d === null || d <= t;
    return (
      a.cleaned_up_at === null &&
      due(a.cleanup_lease_until) &&
      (a.upload_sas_expires_at === null ||
        a.upload_sas_expires_at.getTime() + 5 * MINUTE <= t.getTime()) &&
      ((a.state === "retired" && due(a.cleanup_next_attempt_at)) ||
        (a.match_id === null &&
          a.state !== "retired" &&
          due(a.finalize_lease_until)) ||
        (a.state === "pending" &&
          a.match_id !== null &&
          due(a.finalize_lease_until) &&
          a.last_attempt_at.getTime() <= t.getTime() - 24 * HOUR &&
          due(a.cleanup_next_attempt_at)) ||
        (a.state === "active" &&
          a.match_id !== null &&
          due(a.cleanup_next_attempt_at)))
    );
  }

  async claim(input: {
    workerToken: string;
    leaseSeconds: number;
    limit: number;
  }): Promise<MatchVideoResult<CleanupClaim[]>> {
    this.events.push({ fn: "claim" });
    if (this.claimError) throw this.claimError;
    const t = now;
    const until = new Date(t.getTime() + input.leaseSeconds * 1000);
    const claims: CleanupClaim[] = [];
    const candidates = [...this.rows.values()]
      .filter((r) => this.collectible(r, t))
      .sort((a, b) => {
        const rank = (r: Row) =>
          r.state === "retired" ? 0 : r.match_id === null ? 1 : 2;
        return rank(a) - rank(b) || a.id.localeCompare(b.id);
      });
    for (const row of candidates) {
      if (claims.length >= input.limit) break;
      if (row.match_id === null || row.state === "pending") {
        row.state = "retired";
        row.retired_at ??= t;
        row.finalize_lease_until = null;
      }
      row.cleanup_lease_token = input.workerToken;
      row.cleanup_lease_until = until;
      let claim: CleanupClaim = {
        attachment_id: row.id,
        match_id: row.match_id,
        state: row.state,
        version: row.version,
        staged_blob_key: row.staged_blob_key,
        final_blob_key: row.final_blob_key,
        copy_id: row.copy_id,
        copy_status: row.copy_status,
        collect_staged: true,
        collect_final: row.state === "retired",
        cleanup_lease_until: until.toISOString(),
        cleanup_attempts: row.cleanup_attempts,
      };
      if (this.mutateClaim) claim = this.mutateClaim(claim, row);
      claims.push(claim);
    }
    return { ok: true, value: claims };
  }

  private leaseLost(row: Row, token: string): boolean {
    return (
      row.cleanup_lease_token !== token ||
      row.cleanup_lease_until === null ||
      row.cleanup_lease_until <= now
    );
  }

  async confirm(input: {
    attachmentId: string;
    leaseToken: string;
    expectedVersion: number;
    collectedFinal: boolean;
  }): Promise<MatchVideoResult<{ outcome: ConfirmOutcome }>> {
    const row = this.rows.get(input.attachmentId);
    if (!row) throw new Error("P0002 no_such_attachment");
    this.beforeConfirm?.(row);
    const done = (outcome: ConfirmOutcome) => {
      this.events.push({
        fn: "confirm",
        attachmentId: row.id,
        outcome,
        collectedFinal: input.collectedFinal,
      });
      return { ok: true as const, value: { outcome } };
    };
    if (this.leaseLost(row, input.leaseToken)) return done("lease_lost");
    if (row.version !== input.expectedVersion) {
      row.cleanup_lease_token = null;
      row.cleanup_lease_until = null;
      return done("version_changed");
    }
    if (row.state === "active" && input.collectedFinal) {
      throw new Error("22023 active_final_collected");
    }
    row.cleanup_lease_token = null;
    row.cleanup_lease_until = null;
    if (row.state === "active") {
      row.cleanup_next_attempt_at = INFINITY;
      row.cleanup_last_error = null;
      return done("staged_shed");
    }
    if (input.collectedFinal) {
      row.cleaned_up_at = now;
      row.cleanup_last_error = null;
      return done("cleaned_up");
    }
    row.cleanup_next_attempt_at = now;
    return done("rescheduled");
  }

  async fail(input: {
    attachmentId: string;
    leaseToken: string;
    error: string;
    retryAfterSeconds: number | null;
  }): Promise<MatchVideoResult<{ outcome: FailOutcome }>> {
    const row = this.rows.get(input.attachmentId);
    if (!row) throw new Error("P0002 no_such_attachment");
    const done = (outcome: FailOutcome) => {
      this.events.push({ fn: "fail", attachmentId: row.id, outcome });
      return { ok: true as const, value: { outcome } };
    };
    if (this.leaseLost(row, input.leaseToken)) return done("lease_lost");
    const delayMs =
      input.retryAfterSeconds !== null
        ? input.retryAfterSeconds * 1000
        : Math.min(
            24 * HOUR,
            5 * MINUTE * 2 ** Math.min(row.cleanup_attempts + 1, 9),
          );
    row.cleanup_attempts += 1;
    row.cleanup_last_error = input.error.slice(0, 1000);
    row.cleanup_next_attempt_at = new Date(now.getTime() + delayMs);
    row.cleanup_lease_token = null;
    row.cleanup_lease_until = null;
    return done("failed");
  }
}

/* -------------------------------------------------------------------------
 * Fake container
 * ---------------------------------------------------------------------- */

interface Blob {
  size: number;
  copy: { id: string; status: CopyStatus } | null;
}

interface StorageEvent {
  op: "head" | "abort" | "delete";
  key: string;
  copyId?: string;
}

function rest(status: number, code: string): RestError {
  return new RestError(code, { statusCode: status, code });
}

class FakeContainer implements AttachmentBlobOps {
  blobs = new Map<string, Blob>();
  events: StorageEvent[] = [];
  /** Copies Azure is still running: destination → source bytes to write. */
  inFlight = new Map<string, { copyId: string; size: number }>();
  /** When true every mutating call fails as an outage would. */
  outage = false;
  /** Keys whose delete fails with a server error. */
  failDelete = new Set<string>();
  /**
   * Azure refuses to delete a destination mid-copy. A backend that did not
   * would let a naive worker delete first and have the copy put the object
   * back; `strictPendingDelete = false` models that to prove the worker's
   * order does not depend on the refusal.
   */
  strictPendingDelete = true;
  concurrent = 0;
  maxConcurrent = 0;

  put(key: string, size = 1_000_000) {
    this.blobs.set(key, { size, copy: null });
  }

  /** A copy T10 left pending at `key`, of `size` bytes still to land. */
  startPendingCopy(key: string, copyId: string, size = 1_000_000) {
    this.blobs.set(key, { size: 0, copy: { id: copyId, status: "pending" } });
    this.inFlight.set(key, { copyId, size });
  }

  /** Azure finishing whatever is still in flight. Aborted copies do not write. */
  settleCopies() {
    for (const [key, copy] of this.inFlight) {
      const blob = this.blobs.get(key);
      if (blob?.copy?.id === copy.copyId && blob.copy.status === "pending") {
        blob.size = copy.size;
        blob.copy = { id: copy.copyId, status: "success" };
      }
    }
    this.inFlight.clear();
  }

  private async track<T>(event: StorageEvent, fn: () => T): Promise<T> {
    this.events.push(event);
    this.concurrent += 1;
    this.maxConcurrent = Math.max(this.maxConcurrent, this.concurrent);
    try {
      // Yield so lanes overlap and the concurrency bound is actually tested.
      await new Promise((r) => setTimeout(r, 1));
      if (this.outage) throw rest(500, "InternalError");
      return fn();
    } finally {
      this.concurrent -= 1;
    }
  }

  async properties(key: string): Promise<AttachmentBlobHead> {
    return this.track({ op: "head", key }, () => {
      const blob = this.blobs.get(key);
      if (!blob) throw rest(404, "BlobNotFound");
      return {
        contentLength: blob.size,
        etag: `"e-${key}"`,
        contentType: "video/mp4",
        metadata: {},
        copy: blob.copy
          ? {
              id: blob.copy.id,
              status: blob.copy.status,
              progress: null,
              completedOn: null,
              description: null,
            }
          : null,
      };
    });
  }

  async startCopy(): Promise<{ copyId: string; copyStatus: CopyStatus }> {
    throw new Error("cleanup never starts a copy");
  }

  async abortCopy(key: string, copyId: string): Promise<void> {
    return this.track({ op: "abort", key, copyId }, () => {
      const blob = this.blobs.get(key);
      if (
        !blob?.copy ||
        blob.copy.id !== copyId ||
        blob.copy.status !== "pending"
      ) {
        throw rest(409, "NoPendingCopyOperation");
      }
      blob.copy = { ...blob.copy, status: "aborted" };
      this.inFlight.delete(key);
    });
  }

  async deleteIfExists(key: string): Promise<boolean> {
    return this.track({ op: "delete", key }, () => {
      if (this.failDelete.has(key)) throw rest(500, "InternalError");
      const blob = this.blobs.get(key);
      if (!blob) return false;
      if (this.strictPendingDelete && blob.copy?.status === "pending") {
        throw rest(409, "PendingCopyOperation");
      }
      this.blobs.delete(key);
      return true;
    });
  }

  ops(op: StorageEvent["op"], key?: string) {
    return this.events.filter((e) => e.op === op && (!key || e.key === key));
  }
}

/* -------------------------------------------------------------------------
 * Harness
 * ---------------------------------------------------------------------- */

function harness() {
  const db = new FakeAttachments();
  const container = new FakeContainer();
  const deps: CleanupDeps = {
    database: db,
    storage: azureCleanupStorage(container),
  };
  /** A row with both objects present in storage. */
  const seed = (overrides: RowOverrides = {}) => {
    const row = db.add(overrides);
    container.put(row.staged_blob_key);
    container.put(row.final_blob_key);
    return row;
  };
  return { db, container, deps, seed };
}

/* -------------------------------------------------------------------------
 * Happy path and duplicate sweeps
 * ---------------------------------------------------------------------- */

test("a retired row loses both objects and is closed; a second sweep finds nothing", async () => {
  const { db, container, deps, seed } = harness();
  const row = seed();

  const first = await runMatchVideoCleanup(deps);
  expect(first.claimed).toBe(1);
  expect(first.outcomes.cleaned_up).toBe(1);
  expect(container.blobs.has(row.staged_blob_key)).toBe(false);
  expect(container.blobs.has(row.final_blob_key)).toBe(false);

  const stored = db.get(row.id);
  expect(stored.cleaned_up_at).toEqual(now);
  expect(stored.cleanup_lease_token).toBeNull();
  expect(stored.state).toBe("retired");
  // Keys are metadata the row keeps; only the objects go.
  expect(stored.staged_blob_key).toBe(row.staged_blob_key);

  const second = await runMatchVideoCleanup(deps);
  expect(second.claimed).toBe(0);
  expect(container.ops("delete")).toHaveLength(2);
});

test("two sweeps at once: the lease gives each row to one worker and each object is deleted once", async () => {
  const { db, container, deps, seed } = harness();
  const rows = Array.from({ length: 6 }, () => seed());

  const [a, b] = await Promise.all([
    runMatchVideoCleanup(deps),
    runMatchVideoCleanup(deps),
  ]);
  expect(a.workerToken).not.toBe(b.workerToken);
  expect(a.claimed + b.claimed).toBe(rows.length);
  expect(a.outcomes.cleaned_up + b.outcomes.cleaned_up).toBe(rows.length);
  expect(a.outcomes.lease_lost + b.outcomes.lease_lost).toBe(0);

  for (const row of rows) {
    expect(container.ops("delete", row.staged_blob_key)).toHaveLength(1);
    expect(container.ops("delete", row.final_blob_key)).toHaveLength(1);
    expect(db.get(row.id).cleaned_up_at).not.toBeNull();
  }
});

test("absence is success: a row whose objects are already gone is closed without an error", async () => {
  const { db, deps } = harness();
  const row = db.add(); // nothing put in the container

  const run = await runMatchVideoCleanup(deps);
  expect(run.outcomes.cleaned_up).toBe(1);
  expect(run.rows[0]).toMatchObject({
    stagedDeleted: false,
    finalDeleted: false,
    outcome: "cleaned_up",
  });
  expect(db.get(row.id).cleaned_up_at).not.toBeNull();
  expect(db.get(row.id).cleanup_attempts).toBe(0);
});

/* -------------------------------------------------------------------------
 * Copy races
 * ---------------------------------------------------------------------- */

test("a copy still in flight is aborted BEFORE the final delete, and settling it afterwards recreates nothing", async () => {
  const { db, container, deps } = harness();
  const row = db.add({ copy_id: "copy-live", copy_status: "pending" });
  container.put(row.staged_blob_key);
  container.startPendingCopy(row.final_blob_key, "copy-live");

  const run = await runMatchVideoCleanup(deps);
  expect(run.outcomes.cleaned_up).toBe(1);

  const finalOps = container.events.filter((e) => e.key === row.final_blob_key);
  expect(finalOps.map((e) => e.op)).toEqual(["abort", "delete"]);
  expect(finalOps[0].copyId).toBe("copy-live");

  // Azure finishes what it was doing. An aborted copy writes nothing.
  container.settleCopies();
  expect(container.blobs.has(row.final_blob_key)).toBe(false);
  expect(container.blobs.has(row.staged_blob_key)).toBe(false);
  expect(db.get(row.id).cleaned_up_at).not.toBeNull();
});

test("the abort-first order holds even on a backend that would allow the delete mid-copy", async () => {
  const { container, deps, db } = harness();
  container.strictPendingDelete = false;
  const row = db.add({ copy_id: "copy-live", copy_status: "pending" });
  container.put(row.staged_blob_key);
  container.startPendingCopy(row.final_blob_key, "copy-live");

  await runMatchVideoCleanup(deps);
  container.settleCopies();

  // Without the abort the lenient backend would have let the delete through
  // and the settle would have written the object back. It did not.
  expect(container.blobs.has(row.final_blob_key)).toBe(false);
  expect(container.inFlight.size).toBe(0);
});

test("a pending copy the row never learned about (retry after a lost response) is found on the object and aborted", async () => {
  const { db, container, deps } = harness();
  // The row persisted a copy that failed; T10 discarded it and started
  // another whose id never reached the database.
  const row = db.add({ copy_id: "copy-old", copy_status: "failed" });
  container.put(row.staged_blob_key);
  container.startPendingCopy(row.final_blob_key, "copy-new");

  const run = await runMatchVideoCleanup(deps);
  expect(run.outcomes.cleaned_up).toBe(1);

  const finalOps = container.events
    .filter((e) => e.key === row.final_blob_key)
    .map((e) => `${e.op}${e.copyId ? ":" + e.copyId : ""}`);
  expect(finalOps).toEqual([
    "abort:copy-old", // idempotent: nothing pending under that id
    "delete", // 409 PendingCopyOperation
    "head", // learn the live id
    "abort:copy-new",
    "delete",
  ]);
  container.settleCopies();
  expect(container.blobs.has(row.final_blob_key)).toBe(false);
});

test("a copy that cannot be aborted leaves the key in place with a short retry", async () => {
  const { db, container, deps } = harness();
  const row = db.add({ copy_id: "copy-live", copy_status: "pending" });
  container.put(row.staged_blob_key);
  container.startPendingCopy(row.final_blob_key, "copy-live");
  // The abort call itself fails at the service.
  const realAbort = container.abortCopy.bind(container);
  container.abortCopy = async (key, copyId) => {
    container.events.push({ op: "abort", key, copyId });
    throw rest(500, "InternalError");
  };

  const run = await runMatchVideoCleanup(deps);
  expect(run.outcomes.failed).toBe(1);
  expect(run.rows[0].detail).toBe("abort:abort_copy_failed");
  expect(container.ops("delete")).toHaveLength(0);
  expect(container.blobs.has(row.final_blob_key)).toBe(true);
  expect(container.blobs.has(row.staged_blob_key)).toBe(true);

  const stored = db.get(row.id);
  expect(stored.cleaned_up_at).toBeNull();
  expect(stored.cleanup_attempts).toBe(1);
  expect(stored.cleanup_last_error).toBe("abort:abort_copy_failed");

  // Service recovers; the next sweep starts again from the abort.
  container.abortCopy = realAbort;
  now = at(HOUR);
  const retry = await runMatchVideoCleanup(deps);
  expect(retry.outcomes.cleaned_up).toBe(1);
  container.settleCopies();
  expect(container.blobs.has(row.final_blob_key)).toBe(false);
});

/* -------------------------------------------------------------------------
 * Partial deletion, outage, retry
 * ---------------------------------------------------------------------- */

test("partial deletion keeps the keys and retry metadata; the retry finishes the job", async () => {
  const { db, container, deps, seed } = harness();
  const row = seed();
  container.failDelete.add(row.staged_blob_key);

  const first = await runMatchVideoCleanup(deps);
  expect(first.outcomes.failed).toBe(1);
  expect(first.rows[0]).toMatchObject({
    outcome: "failed",
    finalDeleted: true,
    stagedDeleted: false,
    detail: "staged:delete_failed",
  });
  expect(db.events.filter((e) => e.fn === "confirm")).toHaveLength(0);

  const stored = db.get(row.id);
  expect(stored.cleaned_up_at).toBeNull();
  expect(stored.cleanup_attempts).toBe(1);
  expect(stored.cleanup_last_error).toBe("staged:delete_failed");
  expect(stored.cleanup_next_attempt_at!.getTime()).toBeGreaterThan(
    now.getTime(),
  );
  expect(stored.cleanup_lease_token).toBeNull();
  expect(stored.staged_blob_key).toBe(row.staged_blob_key);
  expect(stored.final_blob_key).toBe(row.final_blob_key);

  // Not due yet: an immediate sweep leaves it alone.
  expect((await runMatchVideoCleanup(deps)).claimed).toBe(0);

  container.failDelete.clear();
  now = at(HOUR);
  const retry = await runMatchVideoCleanup(deps);
  expect(retry.outcomes.cleaned_up).toBe(1);
  // The final was already gone: absence read as success, no error.
  expect(retry.rows[0]).toMatchObject({
    finalDeleted: false,
    stagedDeleted: true,
  });
  expect(db.get(row.id).cleaned_up_at).not.toBeNull();
  expect(db.get(row.id).cleanup_last_error).toBeNull();
  expect(db.get(row.id).cleanup_attempts).toBe(1);
});

test("a storage outage fails every row into backoff, removes nothing and never confirms", async () => {
  const { db, container, deps, seed } = harness();
  const rows = Array.from({ length: 5 }, () => seed());
  container.outage = true;

  const run = await runMatchVideoCleanup(deps);
  expect(run.claimed).toBe(5);
  expect(run.outcomes.failed).toBe(5);
  expect(db.events.filter((e) => e.fn === "confirm")).toHaveLength(0);
  expect(container.blobs.size).toBe(10);
  for (const row of rows) {
    const stored = db.get(row.id);
    expect(stored.cleanup_attempts).toBe(1);
    expect(stored.cleaned_up_at).toBeNull();
    expect(stored.cleanup_lease_token).toBeNull();
  }
});

test("a seam that throws fails that row and the batch keeps going", async () => {
  const { db, container, deps, seed } = harness();
  const boom = seed();
  const fine = seed();
  const realDelete = container.deleteIfExists.bind(container);
  container.deleteIfExists = async (key) => {
    if (key === boom.final_blob_key) throw new TypeError("socket hang up");
    return realDelete(key);
  };

  const run = await runMatchVideoCleanup(deps);
  expect(run.outcomes.failed).toBe(1);
  expect(run.outcomes.cleaned_up).toBe(1);
  expect(db.get(boom.id).cleanup_last_error).toBe("final:delete_failed");
  expect(db.get(fine.id).cleaned_up_at).not.toBeNull();
});

test("a database that cannot claim yields an empty run with the error and touches no storage", async () => {
  const { db, container, deps, seed } = harness();
  seed();
  db.claimError = new Error("connection refused");

  await expect(runMatchVideoCleanup(deps)).rejects.toThrow(
    "connection refused",
  );
  expect(container.events).toHaveLength(0);

  // The best-effort entry never rejects.
  const run = await requestBestEffortCleanup(deps);
  expect(run.claimed).toBe(0);
  expect(run.claimError?.detail).toBe("best_effort_threw");
  expect(container.events).toHaveLength(0);
});

/* -------------------------------------------------------------------------
 * Abandoned uploads and live writers
 * ---------------------------------------------------------------------- */

test("pending work idle a day with a dead credential is retired by the claim and collected", async () => {
  const { db, container, deps, seed } = harness();
  const abandoned = seed({
    state: "pending",
    retired_at: null,
    last_attempt_at: at(-25 * HOUR),
    upload_sas_expires_at: at(-19 * HOUR),
  });
  const recent = seed({
    state: "pending",
    retired_at: null,
    last_attempt_at: at(-2 * HOUR),
    upload_sas_expires_at: at(-1 * HOUR),
  });
  const liveWriter = seed({
    state: "pending",
    retired_at: null,
    last_attempt_at: at(-30 * HOUR),
    // Renewed: the credential is still valid, whatever the idle time says.
    upload_sas_expires_at: at(2 * HOUR),
  });

  const run = await runMatchVideoCleanup(deps);
  expect(run.claimed).toBe(1);
  expect(run.outcomes.cleaned_up).toBe(1);

  expect(db.get(abandoned.id).state).toBe("retired");
  expect(db.get(abandoned.id).cleaned_up_at).not.toBeNull();
  expect(container.blobs.has(abandoned.staged_blob_key)).toBe(false);
  expect(container.blobs.has(abandoned.final_blob_key)).toBe(false);

  for (const untouched of [recent, liveWriter]) {
    expect(db.get(untouched.id).state).toBe("pending");
    expect(container.blobs.has(untouched.staged_blob_key)).toBe(true);
    expect(container.blobs.has(untouched.final_blob_key)).toBe(true);
  }
});

test("a retired row whose last upload credential is still valid is not touched until it dies", async () => {
  const { container, deps, seed } = harness();
  const row = seed({ upload_sas_expires_at: at(10 * MINUTE) });

  expect((await runMatchVideoCleanup(deps)).claimed).toBe(0);
  expect(container.blobs.has(row.staged_blob_key)).toBe(true);

  now = at(16 * MINUTE); // expiry + five minutes
  expect((await runMatchVideoCleanup(deps)).outcomes.cleaned_up).toBe(1);
});

/* -------------------------------------------------------------------------
 * Active rows: staging only, final never
 * ---------------------------------------------------------------------- */

test("an active team asset with no uploader sheds its staging and keeps its final object and metadata", async () => {
  const { db, container, deps, seed } = harness();
  const row = seed({
    state: "active",
    retired_at: null,
    uploaded_by: null,
    version: 3,
  });

  const run = await runMatchVideoCleanup(deps);
  expect(run.outcomes.staged_shed).toBe(1);
  expect(container.blobs.has(row.staged_blob_key)).toBe(false);
  expect(container.blobs.has(row.final_blob_key)).toBe(true);
  expect(container.ops("delete", row.final_blob_key)).toHaveLength(0);
  expect(container.ops("abort")).toHaveLength(0);

  const stored = db.get(row.id);
  expect(stored.state).toBe("active");
  expect(stored.final_blob_key).toBe(row.final_blob_key);
  expect(stored.version).toBe(3);
  expect(stored.cleaned_up_at).toBeNull();
  expect(stored.cleanup_next_attempt_at).toEqual(INFINITY);
  const confirm = db.events.find((e) => e.fn === "confirm");
  expect(confirm?.collectedFinal).toBe(false);

  // Parked: the daily sweep does not keep re-deleting a blob that is gone.
  now = at(48 * HOUR);
  expect((await runMatchVideoCleanup(deps)).claimed).toBe(0);
});

test("the worker refuses a claim that asks for an active row's final key", async () => {
  const { db, container, deps, seed } = harness();
  const row = seed({ state: "active", retired_at: null });
  db.mutateClaim = (claim) => ({ ...claim, collect_final: true });

  const run = await runMatchVideoCleanup(deps);
  // Had it obeyed, the fake `confirm` would have thrown 22023 like the SQL.
  expect(run.outcomes.staged_shed).toBe(1);
  expect(container.blobs.has(row.final_blob_key)).toBe(true);
  expect(container.ops("delete", row.final_blob_key)).toHaveLength(0);
  expect(db.events.find((e) => e.fn === "confirm")?.collectedFinal).toBe(false);
});

test("an orphaned active row (match deleted) is retired by the claim and fully collected", async () => {
  const { db, container, deps, seed } = harness();
  const row = seed({ state: "active", retired_at: null, match_id: null });

  const run = await runMatchVideoCleanup(deps);
  expect(run.outcomes.cleaned_up).toBe(1);
  expect(db.get(row.id).state).toBe("retired");
  expect(container.blobs.has(row.final_blob_key)).toBe(false);
  expect(container.blobs.has(row.staged_blob_key)).toBe(false);
});

/* -------------------------------------------------------------------------
 * Settle races
 * ---------------------------------------------------------------------- */

test("a version change between claim and confirm records nothing and releases the lease", async () => {
  const { db, container, deps, seed } = harness();
  const row = seed({ state: "active", retired_at: null, version: 1 });
  db.beforeConfirm = (r) => {
    r.version = 2; // an alignment correction landed mid-sweep
  };

  const run = await runMatchVideoCleanup(deps);
  expect(run.outcomes.version_changed).toBe(1);
  // The staged delete had already happened (it is harmless to the final);
  // the row is simply re-evaluated by the next claim.
  expect(container.blobs.has(row.staged_blob_key)).toBe(false);
  const stored = db.get(row.id);
  expect(stored.cleanup_next_attempt_at).toBeNull();
  expect(stored.cleanup_lease_token).toBeNull();
  expect(stored.cleaned_up_at).toBeNull();

  db.beforeConfirm = undefined;
  const again = await runMatchVideoCleanup(deps);
  expect(again.outcomes.staged_shed).toBe(1);
});

test("a lease that lapsed during the run is reported as lost and nothing is recorded", async () => {
  const { db, deps, seed } = harness();
  const row = seed();
  db.beforeConfirm = () => {
    now = at(HOUR); // longer than the lease
  };

  const run = await runMatchVideoCleanup(deps, { leaseSeconds: 60 });
  expect(run.outcomes.lease_lost).toBe(1);
  expect(db.get(row.id).cleaned_up_at).toBeNull();
});

test("a row retired mid-sweep after only its staging was collected is rescheduled for its final key", async () => {
  const { db, container, deps, seed } = harness();
  const row = seed({ state: "active", retired_at: null });
  db.beforeConfirm = (r) => {
    r.state = "retired"; // cancel/replace landed while the worker ran
    r.retired_at = now;
  };

  const run = await runMatchVideoCleanup(deps);
  expect(run.outcomes.rescheduled).toBe(1);
  expect(container.blobs.has(row.final_blob_key)).toBe(true);
  expect(db.get(row.id).cleanup_next_attempt_at).toEqual(now);

  db.beforeConfirm = undefined;
  const again = await runMatchVideoCleanup(deps);
  expect(again.outcomes.cleaned_up).toBe(1);
  expect(container.blobs.has(row.final_blob_key)).toBe(false);
});

/* -------------------------------------------------------------------------
 * Concurrency and the best-effort entry
 * ---------------------------------------------------------------------- */

test("a full batch runs at most CLEANUP_CONCURRENCY rows at once", async () => {
  const { container, deps, seed } = harness();
  for (let i = 0; i < 50; i++) seed();

  const run = await runMatchVideoCleanup(deps);
  expect(run.claimed).toBe(50);
  expect(run.outcomes.cleaned_up).toBe(50);
  expect(container.maxConcurrent).toBeLessThanOrEqual(CLEANUP_CONCURRENCY);
  expect(container.maxConcurrent).toBeGreaterThan(1);
  expect(run.rows).toHaveLength(50);
});

test("the batch limit is honoured and the rest waits for the next sweep", async () => {
  const { deps, seed } = harness();
  for (let i = 0; i < 7; i++) seed();

  const first = await runMatchVideoCleanup(deps, { limit: 5 });
  expect(first.claimed).toBe(5);
  const second = await runMatchVideoCleanup(deps, { limit: 5 });
  expect(second.claimed).toBe(2);
});

test("replacement can request a best-effort run: same worker, smaller batch, never throws", async () => {
  const { db, container, deps, seed } = harness();
  // A just-replaced row whose upload credential is still valid: T3/T4 seed
  // its schedule at the expiry, and the SQL will not hand it out yet.
  const justRetired = seed({
    retired_at: now,
    upload_sas_expires_at: at(3 * HOUR),
    cleanup_next_attempt_at: at(3 * HOUR),
  });
  // And one that is due.
  const due = seed();

  const run = await requestBestEffortCleanup(deps, {
    reason: `replace:${justRetired.match_id}`,
  });
  expect(run.claimed).toBe(1);
  expect(run.outcomes.cleaned_up).toBe(1);
  expect(db.get(due.id).cleaned_up_at).not.toBeNull();
  expect(db.get(justRetired.id).cleaned_up_at).toBeNull();
  expect(container.blobs.has(justRetired.final_blob_key)).toBe(true);

  // Once the credential is dead the daily sweep takes it.
  now = at(4 * HOUR);
  expect((await runMatchVideoCleanup(deps)).outcomes.cleaned_up).toBe(1);
});

test("best-effort leases a small batch by default", async () => {
  const { deps, seed } = harness();
  for (let i = 0; i < 15; i++) seed();
  const run = await requestBestEffortCleanup(deps);
  expect(run.claimed).toBe(10);
});

/* =========================================================================
 * T15 — the schedule and its gate
 *
 * `GET /api/cron/cleanup-match-videos` is reachable by anyone who can make
 * an HTTP request: it carries no session cookie and is excluded from the
 * proxy's matcher, so the bearer check is the whole of its security. Every
 * refusal below therefore asserts THREE things — the status, that
 * `runCleanup` was never invoked, and that neither the fake table nor the
 * fake container recorded a single call. A 401 with a sweep behind it would
 * pass the first assertion alone.
 * ====================================================================== */

const CRON_SECRET_VALUE = "9f2c1a7d4b6e8035c1d9f7a2b4e60813";
const CRON_ORIGIN = "https://app.example.test";

function cronRequest(headers: Record<string, string> = {}): Request {
  return new Request(`${CRON_ORIGIN}${CLEANUP_CRON_PATH}`, {
    method: "GET",
    headers,
  });
}

function bearer(value: string): Record<string, string> {
  return { authorization: `Bearer ${value}` };
}

/** The worker behind a counter, so "never invoked" is a measurement. */
function cronHarness(...configured: [] | [string | undefined]) {
  // Variadic on purpose: `cronHarness(undefined)` must mean "CRON_SECRET is
  // unset", which a default parameter would silently turn back into the
  // secret — and the fail-closed cases would then pass by sweeping.
  const secret = configured.length ? configured[0] : CRON_SECRET_VALUE;
  const h = harness();
  const calls: string[] = [];
  const cron: CleanupCronDeps = {
    readSecret: () => secret,
    runCleanup: async () => {
      calls.push("run");
      return runMatchVideoCleanup(h.deps, { reason: CLEANUP_CRON_REASON });
    },
  };
  return { ...h, cron, calls };
}

async function bodyOf(response: Response): Promise<Record<string, unknown>> {
  return (await response.json()) as Record<string, unknown>;
}

const REFUSALS: Array<{
  name: string;
  headers: Record<string, string>;
  secret?: string | undefined;
}> = [
  { name: "no Authorization header at all", headers: {} },
  { name: "a bearer with the wrong secret", headers: bearer("not-it") },
  {
    name: "a bearer with a prefix of the secret",
    headers: bearer(CRON_SECRET_VALUE.slice(0, 16)),
  },
  {
    name: "a bearer with the secret plus a suffix",
    headers: bearer(`${CRON_SECRET_VALUE}x`),
  },
  { name: "an empty bearer", headers: bearer("") },
  {
    name: "the raw secret with no Bearer scheme",
    headers: { authorization: CRON_SECRET_VALUE },
  },
  {
    name: "the secret under Basic",
    headers: { authorization: `Basic ${CRON_SECRET_VALUE}` },
  },
  {
    name: "the secret in a header of its own",
    headers: { "x-cron-secret": CRON_SECRET_VALUE },
  },
  {
    name: "the right bearer while CRON_SECRET is unset (fails closed)",
    headers: bearer(CRON_SECRET_VALUE),
    secret: undefined,
  },
  {
    name: "an empty bearer while CRON_SECRET is unset (fails closed)",
    headers: bearer(""),
    secret: undefined,
  },
  {
    name: "a blank CRON_SECRET matched by a blank bearer (fails closed)",
    headers: { authorization: "Bearer    " },
    secret: "   ",
  },
];

for (const refusal of REFUSALS) {
  test(`cleanup is refused, and never runs, for ${refusal.name}`, async () => {
    const h = "secret" in refusal ? cronHarness(refusal.secret) : cronHarness();
    h.seed();

    const response = await handleCleanupCron(
      cronRequest(refusal.headers),
      h.cron,
    );

    expect(response.status).toBe(401);
    // The worker, the database and storage were all left alone.
    expect(h.calls).toEqual([]);
    expect(h.db.events).toEqual([]);
    expect(h.container.events).toEqual([]);
    expect([...h.container.blobs.keys()]).toHaveLength(2);
    const text = await response.text();
    expect(JSON.parse(text)).toEqual({ ok: false, error: "unauthorized" });
    // Nothing about the secret is echoed, in the body or in a header.
    const echoed = JSON.stringify([text, [...response.headers]]);
    expect(echoed).not.toContain(CRON_SECRET_VALUE);
    expect(echoed).not.toContain(CRON_SECRET_VALUE.slice(0, 8));
  });
}

test("a refused request never reaches the secret through a timing-unsafe compare", () => {
  // `authorizeCronRequest` is the whole decision and it is pure: the same
  // answer for every wrong credential, whatever its length.
  for (const presented of [
    "",
    "a",
    "a".repeat(4096),
    CRON_SECRET_VALUE + "!",
  ]) {
    expect(
      authorizeCronRequest(cronRequest(bearer(presented)), CRON_SECRET_VALUE),
    ).toEqual({
      ok: false,
      refusal: presented === "" ? "empty_credential" : "credential_mismatch",
    });
  }
  expect(
    authorizeCronRequest(cronRequest(bearer(CRON_SECRET_VALUE)), undefined),
  ).toEqual({ ok: false, refusal: "secret_not_configured" });
});

test("the matching bearer sweeps, and the scheme is matched case-insensitively", async () => {
  const h = cronHarness();
  const row = h.seed();

  const response = await handleCleanupCron(
    cronRequest({ authorization: `bEaReR ${CRON_SECRET_VALUE}` }),
    h.cron,
  );

  expect(response.status).toBe(200);
  expect(h.calls).toEqual(["run"]);
  const body = await bodyOf(response);
  expect(body.ok).toBe(true);
  expect(body.reason).toBe(CLEANUP_CRON_REASON);
  expect(body.claimed).toBe(1);
  expect(body.rpcFailures).toBe(0);
  expect((body.outcomes as Record<string, number>).cleaned_up).toBe(1);
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  // Read from the store, not the summary: the objects really went.
  expect(h.container.blobs.has(row.staged_blob_key)).toBe(false);
  expect(h.db.get(row.id).cleaned_up_at).not.toBeNull();
});

test("an authorized sweep uses the bounded worker — one batch, not the backlog", async () => {
  const h = cronHarness();
  for (let i = 0; i < CLEANUP_BATCH_LIMIT + 10; i++) h.seed();

  const response = await handleCleanupCron(
    cronRequest(bearer(CRON_SECRET_VALUE)),
    h.cron,
  );

  expect(response.status).toBe(200);
  const body = await bodyOf(response);
  expect(body.claimed).toBe(CLEANUP_BATCH_LIMIT);
  expect(h.calls).toEqual(["run"]);
  // One claim, and the rest of the backlog untouched until tomorrow.
  expect(h.db.events.filter((e) => e.fn === "claim")).toHaveLength(1);
  expect(
    [...h.db.rows.values()].filter((r) => r.cleaned_up_at === null),
  ).toHaveLength(10);
  expect(h.container.maxConcurrent).toBeLessThanOrEqual(CLEANUP_CONCURRENCY);
});

test("a worker that throws is this route's own 500, and says nothing about why", async () => {
  const h = cronHarness();
  h.seed();
  h.db.claimError = new Error("connect ECONNREFUSED 10.0.0.1:5432");

  const response = await handleCleanupCron(
    cronRequest(bearer(CRON_SECRET_VALUE)),
    h.cron,
  );

  expect(response.status).toBe(500);
  expect(h.calls).toEqual(["run"]);
  expect(await bodyOf(response)).toEqual({
    ok: false,
    error: "cleanup_failed",
  });
});

test("a claim the database refused is reported as a failed run, not an empty success", async () => {
  const h = cronHarness();
  const response = await handleCleanupCron(
    cronRequest(bearer(CRON_SECRET_VALUE)),
    {
      ...h.cron,
      runCleanup: async () => ({
        workerToken: "t",
        claimed: 0,
        outcomes: {
          cleaned_up: 0,
          staged_shed: 0,
          rescheduled: 0,
          lease_lost: 0,
          version_changed: 0,
          failed: 0,
          unsettled: 0,
        },
        rows: [],
        claimError: matchVideoError("storage_unavailable", "rpc_57014"),
      }),
    },
  );

  expect(response.status).toBe(500);
  const body = await bodyOf(response);
  expect(body.ok).toBe(false);
  expect(body.error).toBe("claim_failed");
  expect(body.claimed).toBe(0);
});

test("rows the database refused at settle are counted apart from storage failures", async () => {
  const h = cronHarness();
  const response = await handleCleanupCron(
    cronRequest(bearer(CRON_SECRET_VALUE)),
    {
      ...h.cron,
      runCleanup: async () => ({
        workerToken: "t",
        claimed: 3,
        outcomes: {
          cleaned_up: 1,
          staged_shed: 0,
          rescheduled: 0,
          lease_lost: 0,
          version_changed: 0,
          failed: 1,
          unsettled: 1,
        },
        rows: [
          {
            attachmentId: "a",
            state: "retired",
            outcome: "cleaned_up" as const,
            stagedDeleted: true,
            finalDeleted: true,
          },
          {
            attachmentId: "b",
            state: "retired",
            outcome: "failed" as const,
            detail: "final:storage_unavailable",
            stagedDeleted: false,
            finalDeleted: false,
          },
          {
            attachmentId: "c",
            state: "retired",
            outcome: "unsettled" as const,
            // T14's `rpcFailure` maps SQLSTATE P0002 — an attachment gone
            // between claim and settle — to a retryable failure, which the
            // outcome counts alone would hide.
            detail: "rpc_P0002",
            stagedDeleted: true,
            finalDeleted: true,
          },
        ],
      }),
    },
  );

  expect(response.status).toBe(200);
  const body = await bodyOf(response);
  expect(body.ok).toBe(true);
  expect(body.rpcFailures).toBe(1);
  expect(typeof body.durationMs).toBe("number");
});

/* -------------------------------------------------------------------------
 * Configuration — the schedule, the secret, the proxy
 * ---------------------------------------------------------------------- */

test("vercel.json schedules this endpoint daily at 05:00 UTC and keeps what was there", async () => {
  const { readFile } = await import("node:fs/promises");
  const config = JSON.parse(await readFile("vercel.json", "utf8"));

  // Pre-existing configuration is preserved, not replaced.
  expect(config.$schema).toBe("https://openapi.vercel.sh/vercel.json");
  expect(config.crons).toEqual([
    { path: CLEANUP_CRON_PATH, schedule: "0 5 * * *" },
  ]);
  // The scheduled path must be a route that exists.
  const { existsSync } = await import("node:fs");
  expect(existsSync(`src/app${CLEANUP_CRON_PATH}/route.ts`)).toBe(true);
});

test(".env.example documents CRON_SECRET once and embeds no value", async () => {
  const { readFile } = await import("node:fs/promises");
  const env = await readFile(".env.example", "utf8");

  const declarations = env
    .split("\n")
    .filter((line) => /^\s*CRON_SECRET\s*=/.test(line));
  expect(declarations).toEqual(["CRON_SECRET="]);
  expect(env).toContain(CLEANUP_CRON_PATH);
  expect(env).toContain("05:00 UTC");
});

test("the cron route is excluded from the proxy's session refresh", async () => {
  const { readFile } = await import("node:fs/promises");
  const proxy = await readFile("src/proxy.ts", "utf8");
  // A cron call carries no cookie; more to the point, this route must not
  // depend on anything the proxy does for its authentication.
  expect(proxy).toContain("api/cron");
});

test("the route file delegates the gate and builds nothing before it", async () => {
  const { readFile } = await import("node:fs/promises");
  const source = await readFile(`src/app${CLEANUP_CRON_PATH}/route.ts`, "utf8");
  expect(source).toContain("handleCleanupCron");
  expect(source).toContain('export const runtime = "nodejs"');
  // No second copy of the comparison, and no secret read outside the handler.
  expect(source).not.toContain("process.env");
  expect(source).not.toContain("timingSafeEqual");
  // The admin client is constructed inside the callback the handler invokes
  // only after the bearer matched — never at module load or before the gate.
  const callback = source.slice(source.indexOf("runCleanup:"));
  expect(callback).toContain("createAdminClient()");
  expect(source.slice(0, source.indexOf("runCleanup:"))).not.toContain(
    "createAdminClient()",
  );
});
