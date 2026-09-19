import { randomUUID } from "node:crypto";

import { RestError } from "@azure/storage-blob";

import type { MatchVideoResult } from "@/lib/match-video/types";
import {
  azureCleanupStorage,
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
 * Fakes that keep T13's semantics, shared by `tests/match-video-cleanup.spec.ts`
 * (the worker, T14) and `tests/match-video-purge.spec.ts` (deletion
 * integration, T16).
 *
 *   FakeAttachments   the table plus `claim` / `confirm` / `fail` with the
 *                     same eligibility predicate, the same retire-on-claim
 *                     fence, the same lease and version checks and the same
 *                     outcome names as the migration. `confirm` raises on
 *                     `active` + `collected_final`, exactly as the SQL does.
 *                     `orphan(matchId)` is the `on delete set null` foreign
 *                     key: what a committed match delete does to the rows.
 *   FakeContainer     an in-memory Azure container: 404 absent, 409 delete
 *                     of a destination with a pending copy, 409 abort of a
 *                     copy that is not pending. Copies in flight are settled
 *                     explicitly by the test — AFTER the worker has run —
 *                     which is how "a finished copy cannot put a deleted
 *                     object back" is proven rather than asserted. T7's real
 *                     `abortPublication` / `deleteAttachmentBlob` run over
 *                     it via `azureCleanupStorage`.
 */

/* -------------------------------------------------------------------------
 * Clock
 * ---------------------------------------------------------------------- */

export const T0 = new Date("2026-09-19T05:00:00.000Z");

/**
 * The fakes' clock. A spec moves time with `clock.now = at(...)`; every
 * predicate, lease and schedule reads it. `resetClock()` in `beforeEach`.
 */
export const clock = { now: T0 };

export function resetClock() {
  clock.now = T0;
}
export const HOUR = 60 * 60 * 1000;
export const MINUTE = 60 * 1000;

export function at(offsetMs: number): Date {
  return new Date(T0.getTime() + offsetMs);
}

/* -------------------------------------------------------------------------
 * Fake table — T13's predicate and three functions
 * ---------------------------------------------------------------------- */

export interface Row {
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

export const INFINITY = new Date(8.64e15);

function keysFor(id: string) {
  return {
    staged_blob_key: `match-video/m/${id}/staged.mp4`,
    final_blob_key: `match-video/m/${id}/final.mp4`,
  };
}

export type RowOverrides = Partial<Row>;

export function makeRow(overrides: RowOverrides = {}): Row {
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

export interface DbEvent {
  fn: "claim" | "confirm" | "fail";
  attachmentId?: string;
  outcome?: string;
  collectedFinal?: boolean;
}

export class FakeAttachments implements CleanupDatabase {
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

  /** Rows filed under a match, as the deletion branch would list them. */
  forMatches(matchIds: string[]): Row[] {
    return [...this.rows.values()].filter(
      (r) => r.match_id !== null && matchIds.includes(r.match_id),
    );
  }

  /**
   * `matches.id` → `match_video_attachments.match_id ON DELETE SET NULL`:
   * what a committed match delete does to this table, and nothing else.
   */
  orphan(matchId: string): void {
    for (const row of this.rows.values()) {
      if (row.match_id === matchId) row.match_id = null;
    }
  }

  /**
   * A late `match_video_activate_attachment` (or renew / begin_finalization)
   * for a match the caller still believes exists. T4 looks the row up by
   * `id AND match_id` behind `match_video_authorize_match`, then refuses a
   * retired row: the two fences the deletion path relies on, in that order.
   */
  lateActivation(
    attachmentId: string,
    matchId: string,
  ): "match_not_found" | "attempt_retired" | "activated" {
    const row = this.rows.get(attachmentId);
    if (!row || row.match_id !== matchId) return "match_not_found";
    if (row.state === "retired") return "attempt_retired";
    row.state = "active";
    return "activated";
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
    const t = clock.now;
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
      row.cleanup_lease_until <= clock.now
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
      row.cleaned_up_at = clock.now;
      row.cleanup_last_error = null;
      return done("cleaned_up");
    }
    row.cleanup_next_attempt_at = clock.now;
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
    row.cleanup_next_attempt_at = new Date(clock.now.getTime() + delayMs);
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

export interface StorageEvent {
  op: "head" | "abort" | "delete";
  key: string;
  copyId?: string;
}

export function rest(status: number, code: string): RestError {
  return new RestError(code, { statusCode: status, code });
}

export class FakeContainer implements AttachmentBlobOps {
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

export function harness() {
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
