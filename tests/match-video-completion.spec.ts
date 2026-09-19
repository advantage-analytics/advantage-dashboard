import { randomUUID } from "node:crypto";

import { expect, test } from "@playwright/test";
import { RestError } from "@azure/storage-blob";

import { planAlignment, type SourcePoint } from "@/lib/match-video/alignment";
import {
  matchVideoError,
  type MatchVideoErrorCode,
  type MatchVideoResult,
} from "@/lib/match-video/types";
import type { VisibleMatchRow } from "@/lib/services/match-video/access";
import {
  FINALIZATION_LEASE_SECONDS,
  handleCompleteUpload,
  parseCompleteUploadBody,
  type ActivateAttachmentInput,
  type ActivatedAttachment,
  type BeginFinalizationInput,
  type CompleteUploadDeps,
  type CompletionStorage,
  type FinalizationRow,
  type PersistPublicationInput,
  type ReleaseFinalizationInput,
} from "@/lib/services/match-video/complete";
import type { MatchVideoHttpError } from "@/lib/services/match-video/http";
import type { ProbedStoredVideo } from "@/lib/services/match-video/probe";
import {
  beginPublication,
  discardFailedPublication,
  inspectAttachmentBlob,
  inspectPublication,
  type AttachmentBlobHead,
  type AttachmentBlobOps,
  type AttachmentStorageRow,
  type CopyStatus,
} from "@/lib/services/match-video/storage";
import { stagedBlobOf } from "@/lib/services/match-video/probe";
import type { Workspace } from "@/lib/workspace/types";

/**
 * `POST /api/matches/[matchId]/video/uploads/[attachmentId]/complete` (T10),
 * run against fakes that keep T3/T4's SQL semantics rather than approximate
 * them.
 *
 *   FakeAttachments   the table plus begin/release/activate/cancel and the
 *                     guarded copy-column write. Same checks, same order,
 *                     same detail slugs as the migrations; activation runs
 *                     T1's `planAlignment` over fixture source rows, which
 *                     is the TypeScript twin T4 is held to.
 *   FakeContainer     an in-memory Azure container answering the way Azure
 *                     does (404 absent, 409 existing destination, 412 failed
 *                     source condition, 409 delete-during-copy). T7's REAL
 *                     `beginPublication` / `inspectPublication` /
 *                     `discardFailedPublication` run over it, so ownership
 *                     metadata and lost-response resumption are T7's code,
 *                     not a stub's.
 *   probes            T6's parse is replaced by a per-blob media descriptor
 *                     (the file bytes are not the subject here), with T6's
 *                     pre-parse checks — 404, pinned ETag, size — kept.
 *
 * The claim under test, for every failure: the previous active row is
 * byte-for-byte what it was, the attempt is still `pending` with both keys,
 * and the lease was released. All three are read from the store, never
 * inferred from the status code.
 */

/* -------------------------------------------------------------------------
 * Fixtures
 * ---------------------------------------------------------------------- */

const SITE = "http://localhost:3000";
const CREATOR = randomUUID();
const OTHER_USER = randomUUID();
const PROGRAM = randomUUID();
const OTHER_PROGRAM = randomUUID();
const PERSONAL_MATCH = randomUUID();
const TEAM_MATCH = randomUUID();
const VENDOR_MATCH = randomUUID();
const NOW = new Date("2026-09-18T12:00:00.000Z");

/** Azure signing runs for real (T7 mints the copy's source SAS). */
test.beforeAll(() => {
  process.env.AZURE_STORAGE_ACCOUNT = "advtestaccount";
  process.env.AZURE_STORAGE_KEY = Buffer.from(
    "not-a-real-key-" + randomUUID(),
  ).toString("base64");
  process.env.AZURE_STORAGE_CONTAINER = CONTAINER;
});
const CONTAINER = "advantage-videos";

const MATCHES: Record<string, VisibleMatchRow> = {
  [PERSONAL_MATCH]: {
    id: PERSONAL_MATCH,
    created_by: CREATOR,
    program_id: null,
    source_provider: "swing-vision",
  },
  [TEAM_MATCH]: {
    id: TEAM_MATCH,
    created_by: CREATOR,
    program_id: PROGRAM,
    source_provider: "swing-vision",
  },
  [VENDOR_MATCH]: {
    id: VENDOR_MATCH,
    created_by: CREATOR,
    program_id: null,
    source_provider: "splitstep",
  },
};

/**
 * Source timing: anchor at 100 s, final point 300–320 s. With the first point
 * confirmed at 5 s the offset is 95 and the file must reach 225 s.
 */
const POINTS: SourcePoint[] = [
  { pointNumber: 1, videoTime: 100, duration: 10 },
  { pointNumber: 2, videoTime: 200, duration: 10 },
  { pointNumber: 3, videoTime: 300, duration: 20 },
];
const CONFIRMED = 5;
const OFFSET = 95;

const GOOD_MEDIA = { contentType: "video/mp4", durationSeconds: 300 };
const SHORT_MEDIA = { contentType: "video/mp4", durationSeconds: 200 };

function personal(userId: string): Pick<Workspace, "id" | "kind"> {
  return { id: userId, kind: "personal" };
}

function team(programId: string): Pick<Workspace, "id" | "kind"> {
  return { id: programId, kind: "team" };
}

function rpcRefusal(code: MatchVideoErrorCode, detail: string) {
  return { ok: false as const, error: matchVideoError(code, detail) };
}

function rest(status: number, code: string): RestError {
  return new RestError(code, { statusCode: status, code });
}

/* -------------------------------------------------------------------------
 * In-memory T3/T4
 * ---------------------------------------------------------------------- */

interface Row {
  id: string;
  matchId: string | null;
  uploadedBy: string;
  state: "pending" | "active" | "retired";
  version: number;
  filename: string;
  stagedBlobKey: string;
  finalBlobKey: string;
  expectedActiveId: string | null;
  expectedActiveVersion: number | null;
  confirmed: number | null;
  offset: number | null;
  sourceEtag: string | null;
  copyId: string | null;
  copyStatus: CopyStatus | null;
  copyStartedAt: string | null;
  leaseToken: string | null;
  leaseUntil: Date | null;
  uploadSasExpiresAt: Date | null;
  verifiedSize: number | null;
  verifiedType: string | null;
  verifiedDuration: number | null;
  activatedAt: Date | null;
  retiredAt: Date | null;
  cleanupNextAttemptAt: Date | null;
}

type MutationAccess = BeginFinalizationInput["access"];

class FakeAttachments {
  rows = new Map<string, Row>();
  clock = { now: NOW };
  points = new Map<string, SourcePoint[]>();

  constructor() {
    this.points.set(PERSONAL_MATCH, POINTS);
    this.points.set(TEAM_MATCH, POINTS);
  }

  private keys(matchId: string, id: string) {
    return {
      stagedBlobKey: `match-video/${matchId}/${id}/staged.mp4`,
      finalBlobKey: `match-video/${matchId}/${id}/final.mp4`,
    };
  }

  /** An active row as a previous activation would have left it. */
  seedActive(
    matchId: string,
    options: { id?: string; version?: number; confirmed?: number } = {},
  ): string {
    const id = options.id ?? randomUUID();
    this.rows.set(id, {
      id,
      matchId,
      uploadedBy: CREATOR,
      state: "active",
      version: options.version ?? 2,
      filename: "old.mp4",
      ...this.keys(matchId, id),
      expectedActiveId: null,
      expectedActiveVersion: null,
      confirmed: options.confirmed ?? 12.5,
      offset: 100 - (options.confirmed ?? 12.5),
      sourceEtag: '"old-staged"',
      copyId: "old-copy",
      copyStatus: "success",
      copyStartedAt: "2026-09-01T00:00:00.000Z",
      leaseToken: null,
      leaseUntil: null,
      uploadSasExpiresAt: new Date("2026-09-01T06:00:00.000Z"),
      verifiedSize: 999,
      verifiedType: "video/mp4",
      verifiedDuration: 400,
      activatedAt: new Date("2026-09-01T00:10:00.000Z"),
      retiredAt: null,
      cleanupNextAttemptAt: null,
    });
    return id;
  }

  /** A pending attempt as `match_video_reserve_upload` left it. */
  seedPending(
    matchId: string,
    options: {
      id?: string;
      uploadedBy?: string;
      expectedActive?: { id: string; version: number } | null;
      uploadSasExpiresAt?: Date | null;
      lease?: { token: string; until: Date };
      copy?: { sourceEtag: string; copyId: string; copyStatus: CopyStatus };
      confirmed?: number;
    } = {},
  ): string {
    const id = options.id ?? randomUUID();
    this.rows.set(id, {
      id,
      matchId,
      uploadedBy: options.uploadedBy ?? CREATOR,
      state: "pending",
      version: 0,
      filename: "match.mp4",
      ...this.keys(matchId, id),
      expectedActiveId: options.expectedActive?.id ?? null,
      expectedActiveVersion: options.expectedActive?.version ?? null,
      confirmed: options.confirmed ?? null,
      offset: null,
      sourceEtag: options.copy?.sourceEtag ?? null,
      copyId: options.copy?.copyId ?? null,
      copyStatus: options.copy?.copyStatus ?? null,
      copyStartedAt: options.copy ? NOW.toISOString() : null,
      leaseToken: options.lease?.token ?? null,
      leaseUntil: options.lease?.until ?? null,
      uploadSasExpiresAt:
        options.uploadSasExpiresAt === undefined
          ? new Date(NOW.getTime() + 6 * 3_600_000)
          : options.uploadSasExpiresAt,
      verifiedSize: null,
      verifiedType: null,
      verifiedDuration: null,
      activatedAt: null,
      retiredAt: null,
      cleanupNextAttemptAt: null,
    });
    return id;
  }

  /** `on delete set null`: the row survives, its match does not. */
  deleteMatch(matchId: string) {
    for (const row of this.rows.values()) {
      if (row.matchId === matchId) row.matchId = null;
    }
  }

  snapshot(id: string): Row {
    return structuredClone(this.rows.get(id)!);
  }

  storageRow(id: string): AttachmentStorageRow {
    const row = this.rows.get(id)!;
    return {
      id,
      staged_blob_key: row.stagedBlobKey,
      final_blob_key: row.finalBlobKey,
      source_etag: row.sourceEtag,
    };
  }

  private locate(access: MutationAccess, id: string) {
    const row = this.rows.get(id);
    if (!row || row.matchId !== access.match.id) {
      return rpcRefusal("match_not_found", "no_such_attachment");
    }
    if (row.uploadedBy !== access.actor.id) {
      return rpcRefusal("forbidden", "not_uploader");
    }
    return { ok: true as const, row };
  }

  private activeOf(matchId: string) {
    return [...this.rows.values()].find(
      (r) => r.matchId === matchId && r.state === "active",
    );
  }

  private realityMismatch(
    matchId: string,
    expectedId: string | null,
    expectedVersion: number | null,
  ) {
    const active = this.activeOf(matchId);
    const activeId = active?.id ?? null;
    const activeVersion = active?.version ?? null;
    if (activeId === expectedId && activeVersion === expectedVersion) {
      return null;
    }
    return rpcRefusal(
      "stale_attachment",
      activeId === null
        ? "no_active_attachment"
        : expectedId === null
          ? "attachment_now_active"
          : activeId !== expectedId
            ? "active_attachment_replaced"
            : "active_version_changed",
    );
  }

  private toFinalizationRow(row: Row): FinalizationRow {
    return {
      id: row.id,
      state: row.state,
      staged_blob_key: row.stagedBlobKey,
      final_blob_key: row.finalBlobKey,
      source_etag: row.sourceEtag,
      copy_id: row.copyId,
      copy_status: row.copyStatus,
      confirmed_video_time_seconds: row.confirmed ?? Number.NaN,
      finalize_lease_until: row.leaseUntil?.toISOString() ?? null,
    };
  }

  private leaseLive(row: Row) {
    return row.leaseUntil !== null && row.leaseUntil > this.clock.now;
  }

  /** T4's `match_video_begin_finalization`. */
  async begin(input: BeginFinalizationInput) {
    const found = this.locate(input.access, input.attachmentId);
    if (!found.ok) return found;
    const { row } = found;
    if (row.state === "active") {
      return { ok: true as const, value: this.toFinalizationRow(row) };
    }
    if (row.state === "retired") {
      return rpcRefusal("mode_conflict", "attempt_retired");
    }
    if (
      row.expectedActiveId !== (input.expectedActive?.id ?? null) ||
      row.expectedActiveVersion !== (input.expectedActive?.version ?? null)
    ) {
      return rpcRefusal("stale_attachment", "expected_active_changed");
    }
    const stale = this.realityMismatch(
      row.matchId!,
      row.expectedActiveId,
      row.expectedActiveVersion,
    );
    if (stale) return stale;
    if (this.leaseLive(row) && row.leaseToken !== input.leaseToken) {
      return rpcRefusal("pending_attempt_conflict", "finalizing");
    }
    if (
      this.leaseLive(row) &&
      row.leaseToken === input.leaseToken &&
      row.confirmed !== input.confirmedVideoTimeSeconds
    ) {
      return rpcRefusal(
        "pending_attempt_conflict",
        "finalization_inputs_changed",
      );
    }
    row.leaseToken = input.leaseToken;
    row.leaseUntil = new Date(
      this.clock.now.getTime() + input.leaseSeconds * 1000,
    );
    row.confirmed = input.confirmedVideoTimeSeconds;
    return { ok: true as const, value: this.toFinalizationRow(row) };
  }

  /** T4's `match_video_release_finalization`. */
  async release(input: ReleaseFinalizationInput) {
    const found = this.locate(input.access, input.attachmentId);
    if (!found.ok) return found;
    const { row } = found;
    if (row.state !== "pending" || row.leaseToken !== input.leaseToken) {
      return { ok: true as const, value: { released: false } };
    }
    row.leaseToken = null;
    row.leaseUntil = null;
    return { ok: true as const, value: { released: true } };
  }

  /** T4's `match_video_activate_attachment`. */
  async activate(
    input: ActivateAttachmentInput,
  ): Promise<
    { ok: true; value: ActivatedAttachment } | ReturnType<typeof rpcRefusal>
  > {
    const found = this.locate(input.access, input.attachmentId);
    if (!found.ok) return found;
    const { row } = found;
    if (row.state === "retired") {
      return rpcRefusal("mode_conflict", "attempt_retired");
    }
    if (row.state === "active") {
      if (row.confirmed !== input.confirmedVideoTimeSeconds) {
        return rpcRefusal("mode_conflict", "attachment_active_other_time");
      }
      return { ok: true, value: this.toActivated(row, null, true) };
    }
    if (!this.leaseLive(row)) {
      return rpcRefusal("pending_attempt_conflict", "lease_not_held");
    }
    if (row.leaseToken !== input.leaseToken) {
      return rpcRefusal("pending_attempt_conflict", "finalizing");
    }
    if (row.confirmed !== input.confirmedVideoTimeSeconds) {
      return rpcRefusal(
        "pending_attempt_conflict",
        "finalization_inputs_changed",
      );
    }
    const verified = input.verified;
    if (!verified || verified.sizeBytes <= 0) {
      return rpcRefusal("empty_file", "verified_size_not_positive");
    }
    if (!verified.contentType) {
      return rpcRefusal("unsupported_media", "verified_content_type_missing");
    }
    const stale = this.realityMismatch(
      row.matchId!,
      row.expectedActiveId,
      row.expectedActiveVersion,
    );
    if (stale) return stale;

    // Coverage from the source rows, via the TypeScript twin T4 must match.
    const plan = planAlignment({
      points: this.points.get(row.matchId!) ?? [],
      shots: [],
      confirmedVideoTime: input.confirmedVideoTimeSeconds,
      videoDurationSeconds: verified.durationSeconds,
    });
    if (!plan.ok) return { ok: false, error: plan.error };

    const previous = this.activeOf(row.matchId!);
    if (previous) {
      previous.state = "retired";
      previous.retiredAt = this.clock.now;
      previous.cleanupNextAttemptAt = new Date(
        Math.max(
          this.clock.now.getTime(),
          previous.uploadSasExpiresAt?.getTime() ?? 0,
        ),
      );
    }
    row.state = "active";
    row.verifiedSize = verified.sizeBytes;
    row.verifiedType = verified.contentType;
    row.verifiedDuration = verified.durationSeconds;
    row.confirmed = plan.value.confirmedVideoTimeSeconds;
    row.offset = plan.value.offsetSeconds;
    row.activatedAt = this.clock.now;
    row.leaseToken = null;
    row.leaseUntil = null;
    return {
      ok: true,
      value: this.toActivated(row, previous?.id ?? null, false),
    };
  }

  private toActivated(
    row: Row,
    previousActiveId: string | null,
    reused: boolean,
  ): ActivatedAttachment {
    return {
      attachment_id: row.id,
      version: row.version,
      offset_seconds: row.offset!,
      confirmed_video_time_seconds: row.confirmed!,
      duration_seconds: row.verifiedDuration!,
      content_type: row.verifiedType!,
      filename: row.filename,
      previous_active_id: previousActiveId,
      reused,
    };
  }

  /** The guarded copy-column write: only the live lease holder's lands. */
  async persist(input: PersistPublicationInput) {
    const row = this.rows.get(input.attachmentId);
    if (
      !row ||
      row.matchId !== input.access.match.id ||
      row.state !== "pending" ||
      row.leaseToken !== input.leaseToken
    ) {
      return rpcRefusal("pending_attempt_conflict", "lease_not_held");
    }
    row.sourceEtag = input.columns.source_etag;
    row.copyId = input.columns.copy_id;
    row.copyStatus = input.columns.copy_status;
    if (input.columns.copy_started_at !== undefined) {
      row.copyStartedAt = input.columns.copy_started_at;
    }
    return { ok: true as const, value: null };
  }

  async uploadWindowEndsAt(access: MutationAccess, id: string) {
    const row = this.rows.get(id);
    if (!row || row.matchId !== access.match.id) {
      return rpcRefusal("match_not_found", "no_such_attachment");
    }
    return { ok: true as const, value: row.uploadSasExpiresAt };
  }

  /** T3's cancellation, for the race tests: refuses a live lease. */
  cancel(id: string): MatchVideoResult<"retired"> {
    const row = this.rows.get(id)!;
    if (row.state === "active") {
      return rpcRefusal("mode_conflict", "attachment_active");
    }
    if (row.state === "retired") return { ok: true, value: "retired" };
    if (this.leaseLive(row)) {
      return rpcRefusal("pending_attempt_conflict", "finalizing");
    }
    row.state = "retired";
    row.retiredAt = this.clock.now;
    row.cleanupNextAttemptAt = new Date(
      Math.max(
        this.clock.now.getTime(),
        row.uploadSasExpiresAt?.getTime() ?? 0,
      ),
    );
    return { ok: true, value: "retired" };
  }
}

/* -------------------------------------------------------------------------
 * In-memory Azure
 * ---------------------------------------------------------------------- */

interface Media {
  contentType: string;
  durationSeconds: number;
}

interface Blob {
  etag: string;
  size: number;
  contentType: string | null;
  metadata: Record<string, string>;
  copy: NonNullable<AttachmentBlobHead["copy"]> | null;
  /** What T6 would parse out of the bytes; `null` = undecodable. */
  media: Media | null;
  /** For a copy destination: where its bytes come from. */
  source?: string;
}

class FakeContainer implements AttachmentBlobOps {
  blobs = new Map<string, Blob>();
  /** Whether a Start Copy completes inside the request (small object). */
  copyMode: "pending" | "instant" = "pending";
  copiesStarted = 0;
  /** Runs just before Start Copy reads the source — for overwrite races. */
  beforeStartCopy?: () => void;

  putStaged(
    key: string,
    options: { etag?: string; size?: number; media?: Media | null } = {},
  ) {
    this.blobs.set(key, {
      etag: options.etag ?? `"etag-${randomUUID().slice(0, 8)}"`,
      size: options.size ?? 1_234_567,
      contentType: "video/mp4",
      metadata: {},
      copy: null,
      media: options.media === undefined ? GOOD_MEDIA : options.media,
    });
  }

  async properties(key: string): Promise<AttachmentBlobHead> {
    const blob = this.blobs.get(key);
    if (!blob) throw rest(404, "BlobNotFound");
    return {
      contentLength: blob.size,
      etag: blob.etag,
      contentType: blob.contentType,
      metadata: { ...blob.metadata },
      copy: blob.copy ? { ...blob.copy } : null,
    };
  }

  async startCopy(input: {
    destinationKey: string;
    sourceUrl: string;
    sourceIfMatch: string;
    metadata: Record<string, string>;
  }) {
    this.beforeStartCopy?.();
    if (this.blobs.has(input.destinationKey)) {
      throw rest(409, "BlobAlreadyExists");
    }
    const sourceKey = decodeURIComponent(
      new URL(input.sourceUrl).pathname.slice(`/${CONTAINER}/`.length),
    );
    const source = this.blobs.get(sourceKey);
    if (!source) throw rest(404, "CannotVerifyCopySource");
    if (source.etag !== input.sourceIfMatch) {
      throw rest(412, "ConditionNotMet");
    }
    this.copiesStarted += 1;
    const copyId = `copy-${randomUUID().slice(0, 8)}`;
    const status: CopyStatus =
      this.copyMode === "instant" ? "success" : "pending";
    this.blobs.set(input.destinationKey, {
      etag: `"final-${randomUUID().slice(0, 8)}"`,
      size: status === "success" ? source.size : 0,
      contentType: source.contentType,
      metadata: { ...input.metadata },
      copy: {
        id: copyId,
        status,
        progress:
          status === "success"
            ? `${source.size}/${source.size}`
            : `0/${source.size}`,
        completedOn: status === "success" ? NOW : null,
        description: null,
      },
      media: status === "success" ? source.media : null,
      source: sourceKey,
    });
    return { copyId, copyStatus: status };
  }

  async abortCopy(key: string, copyId: string) {
    const blob = this.blobs.get(key);
    if (
      !blob?.copy ||
      blob.copy.id !== copyId ||
      blob.copy.status !== "pending"
    ) {
      throw rest(409, "NoPendingCopyOperation");
    }
    blob.copy = { ...blob.copy, status: "aborted" };
  }

  async deleteIfExists(key: string) {
    const blob = this.blobs.get(key);
    if (!blob) return false;
    if (blob.copy?.status === "pending")
      throw rest(409, "PendingCopyOperation");
    this.blobs.delete(key);
    return true;
  }

  /** Azure finishing (or failing) a copy between two polls. */
  advance(key: string, status: "success" | "failed") {
    const blob = this.blobs.get(key)!;
    const source = blob.source ? this.blobs.get(blob.source) : undefined;
    blob.copy = {
      ...blob.copy!,
      status,
      progress: status === "success" ? `${source?.size}/${source?.size}` : null,
      completedOn: status === "success" ? NOW : null,
      description: status === "failed" ? "500 InternalError" : null,
    };
    if (status === "success" && source) {
      blob.size = source.size;
      blob.media = source.media;
    }
  }

  /** T6's probe, minus the parse: its pre-parse checks over the descriptor. */
  probe(
    key: string,
    expectedEtag: string | null,
  ): MatchVideoResult<ProbedStoredVideo> {
    const blob = this.blobs.get(key);
    if (!blob) return rpcRefusal("storage_unavailable", "blob_not_found");
    if (expectedEtag && expectedEtag !== blob.etag) {
      return rpcRefusal("stale_attachment", "etag_mismatch");
    }
    if (blob.size <= 0) return rpcRefusal("empty_file", "size_not_positive");
    if (!blob.media) {
      return rpcRefusal("unsupported_media", "no_container_reader");
    }
    return {
      ok: true,
      value: {
        etag: blob.etag,
        sizeBytes: blob.size,
        contentType: blob.media.contentType,
        durationSeconds: blob.media.durationSeconds,
        videoCodec: "avc1.4d401f",
        codedWidth: 1920,
        codedHeight: 1080,
        bytesRead: 65_536,
        rangeRequests: 2,
        declaredMismatches: [],
      },
    };
  }
}

/* -------------------------------------------------------------------------
 * Harness
 * ---------------------------------------------------------------------- */

type Seam =
  | "begin"
  | "release"
  | "activate"
  | "persist"
  | "window"
  | "headStaged"
  | "probeStaged"
  | "beginPublication"
  | "inspectPublication"
  | "discard"
  | "probePublished";

type Injected = "throw" | MatchVideoHttpError;

interface HarnessOptions {
  userId?: string | null;
  workspace?: Pick<Workspace, "id" | "kind"> | null;
  visible?: string[];
  readError?: string;
  store?: FakeAttachments;
  container?: FakeContainer;
  /** Fail a seam on its Nth call (1-based; default every call). */
  fail?: Partial<Record<Seam, Injected | { on: number; with: Injected }>>;
  /** Runs before a seam is reached — for mid-request races. */
  before?: Partial<Record<Seam, () => void>>;
  leaseToken?: string;
}

interface Harness {
  deps: CompleteUploadDeps;
  events: string[];
  store: FakeAttachments;
  container: FakeContainer;
  leaseToken: string;
}

function harness(options: HarnessOptions = {}): Harness {
  const events: string[] = [];
  const store = options.store ?? new FakeAttachments();
  const container = options.container ?? new FakeContainer();
  const leaseToken = options.leaseToken ?? randomUUID();
  const userId = options.userId === undefined ? CREATOR : options.userId;
  const workspace =
    options.workspace === undefined ? personal(CREATOR) : options.workspace;
  const calls = new Map<Seam, number>();

  function seam<T>(name: Seam, run: () => Promise<T>): Promise<T> {
    events.push(name);
    const n = (calls.get(name) ?? 0) + 1;
    calls.set(name, n);
    options.before?.[name]?.();
    const spec = options.fail?.[name];
    const injected =
      spec === undefined
        ? undefined
        : typeof spec === "object" && "on" in spec
          ? spec.on === n
            ? spec.with
            : undefined
          : spec;
    if (injected === "throw") throw new Error(`${name} exploded`);
    if (injected) {
      return Promise.resolve({ ok: false, error: injected } as unknown as T);
    }
    return run();
  }

  const storage: CompletionStorage = {
    headStaged: (row) =>
      seam("headStaged", () =>
        inspectAttachmentBlob(
          (stagedBlobOf(row) as { ok: true; value: never }).value,
          container,
        ),
      ),
    probeStaged: (row) =>
      seam("probeStaged", async () =>
        container.probe(row.staged_blob_key, row.source_etag),
      ),
    beginPublication: (input) =>
      seam("beginPublication", () => beginPublication(input, container)),
    inspectPublication: (input) =>
      seam("inspectPublication", () => inspectPublication(input, container)),
    discardFailedPublication: (input) =>
      seam("discard", () => discardFailedPublication(input, container)),
    probePublished: (row) =>
      seam("probePublished", async () =>
        container.probe(row.final_blob_key, null),
      ),
  };

  const deps: CompleteUploadDeps = {
    async currentUserId() {
      events.push("auth");
      return userId;
    },
    async loadVisibleMatch(matchId) {
      events.push(`read:${matchId}`);
      if (options.readError) return { match: null, error: options.readError };
      const row = MATCHES[matchId];
      const visible = options.visible
        ? options.visible.includes(matchId)
        : Boolean(row);
      return { match: visible ? row : null, error: null };
    },
    async activeWorkspace() {
      events.push("workspace");
      return workspace;
    },
    allowedOrigins: [SITE],
    now: () => store.clock.now,
    mintLeaseToken: () => leaseToken,
    storage,
    beginFinalization: (input) => seam("begin", () => store.begin(input)),
    releaseFinalization: (input) => seam("release", () => store.release(input)),
    activate: (input) => seam("activate", () => store.activate(input)),
    persistPublication: (input) => seam("persist", () => store.persist(input)),
    uploadWindowEndsAt: (access, id) =>
      seam("window", () => store.uploadWindowEndsAt(access, id)),
  };

  return { deps, events, store, container, leaseToken };
}

interface RequestOptions {
  origin?: string | null;
  contentType?: string | null;
  body?: string;
}

function completeRequest(
  matchId: string,
  attachmentId: string,
  body: unknown,
  options: RequestOptions = {},
): Request {
  const headers = new Headers();
  if (options.origin !== null) headers.set("origin", options.origin ?? SITE);
  if (options.contentType !== null) {
    headers.set("content-type", options.contentType ?? "application/json");
  }
  return new Request(
    `${SITE}/api/matches/${matchId}/video/uploads/${attachmentId}/complete`,
    { method: "POST", headers, body: options.body ?? JSON.stringify(body) },
  );
}

function body(overrides: Record<string, unknown> = {}) {
  return {
    confirmedVideoTimeSeconds: CONFIRMED,
    expectedActive: null,
    ...overrides,
  };
}

async function complete(
  h: Harness,
  matchId: string,
  attachmentId: string,
  payload: unknown = body(),
  options?: RequestOptions,
) {
  const response = await handleCompleteUpload(
    completeRequest(matchId, attachmentId, payload, options),
    matchId,
    attachmentId,
    h.deps,
  );
  const json = (await response.json()) as Record<string, unknown>;
  return { response, json };
}

/** A pending attempt with its staged bytes landed, ready to complete. */
function readyAttempt(
  h: Harness,
  matchId: string,
  options: Parameters<FakeAttachments["seedPending"]>[1] & {
    media?: Media | null;
    size?: number;
  } = {},
) {
  const id = h.store.seedPending(matchId, options);
  h.container.putStaged(h.store.rows.get(id)!.stagedBlobKey, {
    media: options.media,
    size: options.size,
  });
  return id;
}

/** A replacement scenario: active A, pending B expecting {A, version}. */
function replacement(h: Harness, matchId = PERSONAL_MATCH) {
  const previousId = h.store.seedActive(matchId, { version: 2 });
  const attemptId = readyAttempt(h, matchId, {
    expectedActive: { id: previousId, version: 2 },
  });
  return { previousId, attemptId, before: h.store.snapshot(previousId) };
}

function expectNoStore(response: Response) {
  expect(response.headers.get("cache-control")).toBe("private, no-store");
}

/** The three facts every failure must leave true. */
function expectRecoverable(
  h: Harness,
  scenario: { previousId: string; attemptId: string; before: Row },
) {
  const previous = h.store.rows.get(scenario.previousId)!;
  expect(previous, "previous active row changed").toEqual(scenario.before);
  const attempt = h.store.rows.get(scenario.attemptId)!;
  expect(attempt.state).toBe("pending");
  expect(attempt.stagedBlobKey).toContain(scenario.attemptId);
  expect(attempt.finalBlobKey).toContain(scenario.attemptId);
  expect(attempt.leaseToken, "lease not released").toBeNull();
  expect(attempt.leaseUntil).toBeNull();
}

function expectNoStorage(h: Harness, copiesAlreadyStarted = 0) {
  for (const name of [
    "headStaged",
    "probeStaged",
    "beginPublication",
    "inspectPublication",
    "discard",
    "probePublished",
  ]) {
    expect(h.events, `${name} was reached`).not.toContain(name);
  }
  expect(h.container.copiesStarted).toBe(copiesAlreadyStarted);
}

/* =========================================================================
 * The edge — before the database is asked anything
 * ====================================================================== */

test("a cross-origin request is refused before sign-in or the body", async () => {
  const h = harness();
  const { response, json } = await complete(
    h,
    PERSONAL_MATCH,
    randomUUID(),
    body(),
    {
      origin: "https://evil.example",
    },
  );
  expect(response.status).toBe(403);
  expect(json.code).toBe("cross_origin");
  expect(h.events).toEqual([]);
  expectNoStore(response);
});

test("an anonymous caller is 401 with nothing read", async () => {
  const h = harness({ userId: null });
  const { response, json } = await complete(h, PERSONAL_MATCH, randomUUID());
  expect(response.status).toBe(401);
  expect(json.code).toBe("unauthenticated");
  expect(h.events).toEqual(["auth"]);
});

test("a non-UUID attachment id is 404 before the body is read", async () => {
  const h = harness();
  const { response, json } = await complete(
    h,
    PERSONAL_MATCH,
    "not-an-id",
    body(),
    {
      body: "{ this is not json",
    },
  );
  expect(response.status).toBe(404);
  expect(json.detail).toBe("malformed_attachment_id");
  expect(h.events).toEqual(["auth"]);
});

test("malformed JSON and a non-JSON content type are 400 before access", async () => {
  const bad = await complete(harness(), PERSONAL_MATCH, randomUUID(), null, {
    body: "{{",
  });
  expect(bad.response.status).toBe(400);
  expect(bad.json.detail).toBe("malformed_json");

  const h = harness();
  const text = await complete(h, PERSONAL_MATCH, randomUUID(), body(), {
    contentType: "text/plain",
  });
  expect(text.response.status).toBe(400);
  expect(text.json.detail).toBe("content_type");
  expect(h.events).toEqual(["auth"]);
});

/* -------------------------------------------------------------------------
 * Forged metadata — every field the server measures is refused by name
 * ---------------------------------------------------------------------- */

const FORGED: Record<string, unknown> = {
  attachmentId: randomUUID(),
  durationSeconds: 9999,
  verifiedDurationSeconds: 9999,
  sizeBytes: 1,
  verifiedSizeBytes: 1,
  contentType: "video/mp4",
  etag: '"forged"',
  sourceEtag: '"forged"',
  copyId: "forged",
  copyStatus: "success",
  offsetSeconds: 0,
  stagedBlobKey: "match-video/x/y/staged.mp4",
  finalBlobKey: "match-video/x/y/final.mp4",
  leaseToken: randomUUID(),
  userId: OTHER_USER,
  workspaceId: OTHER_PROGRAM,
  verified: { durationSeconds: 9999 },
};

for (const [field, value] of Object.entries(FORGED)) {
  test(`a body naming \`${field}\` is refused by name and reaches nothing`, async () => {
    const h = harness();
    const { response, json } = await complete(
      h,
      PERSONAL_MATCH,
      randomUUID(),
      body({ [field]: value }),
    );
    expect(response.status).toBe(400);
    expect(json.detail).toBe(`unexpected_field:${field}`);
    expect(h.events).toEqual(["auth"]);
  });
}

test("the confirmed time is parsed strictly; expectedActive must be present", () => {
  const cases: [Record<string, unknown>, string][] = [
    [{ expectedActive: null }, "confirmed_time_missing"],
    [
      { confirmedVideoTimeSeconds: -1, expectedActive: null },
      "confirmed_time_negative",
    ],
    [
      { confirmedVideoTimeSeconds: Number.NaN, expectedActive: null },
      "confirmed_time_not_finite",
    ],
    [
      { confirmedVideoTimeSeconds: "1:90:00", expectedActive: null },
      "confirmed_time_minutes_overflow",
    ],
    [
      { confirmedVideoTimeSeconds: "1:75", expectedActive: null },
      "confirmed_time_seconds_overflow",
    ],
    [
      { confirmedVideoTimeSeconds: "5.1234", expectedActive: null },
      "confirmed_time_malformed",
    ],
    [
      { confirmedVideoTimeSeconds: true, expectedActive: null },
      "confirmed_time_not_a_time",
    ],
    [{ confirmedVideoTimeSeconds: 5 }, "expected_active_missing"],
    [
      { confirmedVideoTimeSeconds: 5, expectedActive: "x" },
      "expected_active_type",
    ],
    [
      {
        confirmedVideoTimeSeconds: 5,
        expectedActive: { id: "nope", version: 1 },
      },
      "expected_active_id",
    ],
    [
      {
        confirmedVideoTimeSeconds: 5,
        expectedActive: { id: randomUUID(), version: -1 },
      },
      "expected_active_version",
    ],
    [
      {
        confirmedVideoTimeSeconds: 5,
        expectedActive: { id: randomUUID(), version: 1, extra: 1 },
      },
      "expected_active_field:extra",
    ],
  ];
  for (const [input, detail] of cases) {
    const parsed = parseCompleteUploadBody(input);
    expect(parsed.ok, JSON.stringify(input)).toBe(false);
    if (!parsed.ok) expect(parsed.error.detail).toBe(detail);
  }

  const clock = parseCompleteUploadBody({
    confirmedVideoTimeSeconds: "00:00:05.250",
    expectedActive: null,
  });
  expect(clock).toEqual({
    ok: true,
    value: { confirmedVideoTimeSeconds: 5.25, expectedActive: null },
  });
  const rounded = parseCompleteUploadBody({
    confirmedVideoTimeSeconds: 5.00049,
    expectedActive: { id: PERSONAL_MATCH.toUpperCase(), version: 3 },
  });
  expect(rounded).toEqual({
    ok: true,
    value: {
      confirmedVideoTimeSeconds: 5,
      expectedActive: { id: PERSONAL_MATCH, version: 3 },
    },
  });
});

/* -------------------------------------------------------------------------
 * Access — the same ladder as T8/T9, and no storage until it passes
 * ---------------------------------------------------------------------- */

test("the access ladder refuses before the lease, with no storage reached", async () => {
  const cases: [string, HarnessOptions, string, number, string][] = [
    ["invisible match", { visible: [] }, PERSONAL_MATCH, 404, "not_visible"],
    [
      "non-creator",
      { userId: OTHER_USER, workspace: personal(OTHER_USER) },
      PERSONAL_MATCH,
      403,
      "not_creator",
    ],
    ["vendor match", {}, VENDOR_MATCH, 403, "not_swingvision"],
    [
      "team match in personal workspace",
      {},
      TEAM_MATCH,
      403,
      "personal_match_in_team_workspace",
    ],
    [
      "team match in another program",
      { workspace: team(OTHER_PROGRAM) },
      TEAM_MATCH,
      403,
      "match_in_other_program",
    ],
    [
      "no active workspace",
      { workspace: null },
      PERSONAL_MATCH,
      403,
      "no_active_workspace",
    ],
    [
      "failed read",
      { readError: "boom" },
      PERSONAL_MATCH,
      503,
      "match_read_failed",
    ],
  ];
  for (const [name, options, matchId, status, detail] of cases) {
    const h = harness(options);
    const id = readyAttempt(h, matchId);
    const { response, json } = await complete(h, matchId, id);
    expect(response.status, name).toBe(status);
    expect(json.detail, name).toBe(detail);
    expect(h.events, name).not.toContain("begin");
    expectNoStorage(h);
    expect(h.store.rows.get(id)!.leaseToken).toBeNull();
  }
});

/* =========================================================================
 * The happy path — start, poll, commit
 * ====================================================================== */

test("first completion verifies the staged bytes, starts the copy, records it, releases the lease and answers 202", async () => {
  const h = harness();
  const id = readyAttempt(h, PERSONAL_MATCH);

  const { response, json } = await complete(h, PERSONAL_MATCH, id);
  expect(response.status).toBe(202);
  expect(response.headers.get("retry-after")).toBe("2");
  expectNoStore(response);
  expect(json).toEqual({
    status: "pending",
    attachmentId: id,
    retryAfterSeconds: 2,
  });

  expect(h.events).toEqual([
    "auth",
    "auth",
    `read:${PERSONAL_MATCH}`,
    "workspace",
    "begin",
    "probeStaged",
    "beginPublication",
    "persist",
    "release",
  ]);
  const row = h.store.rows.get(id)!;
  expect(row.state).toBe("pending");
  expect(row.confirmed).toBe(CONFIRMED);
  expect(row.sourceEtag).toBe(h.container.blobs.get(row.stagedBlobKey)!.etag);
  expect(row.copyId).toMatch(/^copy-/);
  expect(row.copyStatus).toBe("pending");
  expect(row.copyStartedAt).not.toBeNull();
  expect(row.leaseToken).toBeNull();
  expect(row.leaseUntil).toBeNull();
  expect(h.container.copiesStarted).toBe(1);
  // The destination carries the ownership T7 resumes by.
  const final = h.container.blobs.get(row.finalBlobKey)!;
  expect(final.metadata.adv_attachment_id).toBe(id);
  expect(final.metadata.adv_source_etag).toBe(row.sourceEtag);
});

test("a poll while the copy runs resumes it: no second copy, no re-parse, no write, 202 again", async () => {
  const h = harness();
  const id = readyAttempt(h, PERSONAL_MATCH);
  await complete(h, PERSONAL_MATCH, id);
  const recorded = h.store.snapshot(id);
  h.events.length = 0;

  const { response, json } = await complete(h, PERSONAL_MATCH, id);
  expect(response.status).toBe(202);
  expect(json.status).toBe("pending");
  expect(h.events).toEqual([
    "auth",
    "auth",
    `read:${PERSONAL_MATCH}`,
    "workspace",
    "begin",
    "headStaged",
    "inspectPublication",
    "release",
  ]);
  expect(h.container.copiesStarted).toBe(1);
  expect(h.store.rows.get(id)).toEqual(recorded);
});

test("when the copy has finished, the published bytes are probed and the row is activated", async () => {
  const h = harness();
  const id = readyAttempt(h, PERSONAL_MATCH);
  await complete(h, PERSONAL_MATCH, id);
  const row = h.store.rows.get(id)!;
  h.container.advance(row.finalBlobKey, "success");
  h.events.length = 0;

  const { response, json } = await complete(h, PERSONAL_MATCH, id);
  expect(response.status).toBe(200);
  expectNoStore(response);
  expect(json).toEqual({
    status: "committed",
    attachment: {
      id,
      version: 0,
      offsetSeconds: OFFSET,
      confirmedVideoTimeSeconds: CONFIRMED,
      durationSeconds: GOOD_MEDIA.durationSeconds,
      contentType: "video/mp4",
      filename: "match.mp4",
    },
  });
  expect(h.events).toEqual([
    "auth",
    "auth",
    `read:${PERSONAL_MATCH}`,
    "workspace",
    "begin",
    "headStaged",
    "inspectPublication",
    "persist",
    "probePublished",
    "activate",
  ]);
  expect(row.state).toBe("active");
  expect(row.copyStatus).toBe("success");
  expect(row.verifiedDuration).toBe(GOOD_MEDIA.durationSeconds);
  expect(row.verifiedSize).toBe(1_234_567);
  expect(row.offset).toBe(OFFSET);
  expect(row.leaseToken).toBeNull();
  expect(row.leaseUntil).toBeNull();
  expect(row.activatedAt).toEqual(NOW);
});

test("a small object whose copy completes inside Start Copy commits in one request", async () => {
  const h = harness();
  h.container.copyMode = "instant";
  const id = readyAttempt(h, PERSONAL_MATCH);

  const { response, json } = await complete(h, PERSONAL_MATCH, id);
  expect(response.status).toBe(200);
  expect(json.status).toBe("committed");
  expect(h.events).toEqual([
    "auth",
    "auth",
    `read:${PERSONAL_MATCH}`,
    "workspace",
    "begin",
    "probeStaged",
    "beginPublication",
    "persist",
    "probePublished",
    "activate",
  ]);
  expect(h.store.rows.get(id)!.state).toBe("active");
});

test("a replacement retires the previous active row and activates the new one in the same commit", async () => {
  const h = harness();
  h.container.copyMode = "instant";
  const { previousId, attemptId } = replacement(h);

  const { response, json } = await complete(
    h,
    PERSONAL_MATCH,
    attemptId,
    body({ expectedActive: { id: previousId, version: 2 } }),
  );
  expect(response.status).toBe(200);
  expect((json.attachment as { id: string }).id).toBe(attemptId);

  const previous = h.store.rows.get(previousId)!;
  expect(previous.state).toBe("retired");
  expect(previous.retiredAt).toEqual(NOW);
  // Its blobs are kept for the cleanup worker, and not before its last SAS.
  expect(previous.stagedBlobKey).toContain(previousId);
  expect(previous.finalBlobKey).toContain(previousId);
  expect(previous.cleanupNextAttemptAt!.getTime()).toBeGreaterThanOrEqual(
    previous.uploadSasExpiresAt!.getTime(),
  );
  expect(h.store.rows.get(attemptId)!.state).toBe("active");
  expect(
    [...h.store.rows.values()].filter(
      (r) => r.matchId === PERSONAL_MATCH && r.state === "active",
    ),
  ).toHaveLength(1);
});

test("activation is measured from the PUBLISHED bytes, never the staged probe or the client", async () => {
  const h = harness();
  const id = readyAttempt(h, PERSONAL_MATCH);
  await complete(h, PERSONAL_MATCH, id);
  const row = h.store.rows.get(id)!;
  h.container.advance(row.finalBlobKey, "success");
  // The staged descriptor said 300 s; the published object measures 200 s.
  h.container.blobs.get(row.finalBlobKey)!.media = SHORT_MEDIA;

  const { response, json } = await complete(h, PERSONAL_MATCH, id);
  expect(response.status).toBe(422);
  expect(json.code).toBe("insufficient_coverage");
  expect(row.state).toBe("pending");
});

/* =========================================================================
 * Idempotency — the lost 200
 * ====================================================================== */

test("replaying a completion whose 200 was lost answers 200 again, touches no storage and takes no lease", async () => {
  const h = harness();
  h.container.copyMode = "instant";
  const id = readyAttempt(h, PERSONAL_MATCH);
  const first = await complete(h, PERSONAL_MATCH, id);
  expect(first.response.status).toBe(200);
  const committed = h.store.snapshot(id);
  h.events.length = 0;

  const replay = await complete(h, PERSONAL_MATCH, id);
  expect(replay.response.status).toBe(200);
  expect(replay.json).toEqual(first.json);
  expect(h.events).toEqual([
    "auth",
    "auth",
    `read:${PERSONAL_MATCH}`,
    "workspace",
    "begin",
    "activate",
  ]);
  expect(h.store.rows.get(id)).toEqual(committed);
  expect(h.container.copiesStarted).toBe(1);
});

test("a replay with a different confirmed time is a conflict, not a silent realignment", async () => {
  const h = harness();
  h.container.copyMode = "instant";
  const id = readyAttempt(h, PERSONAL_MATCH);
  await complete(h, PERSONAL_MATCH, id);
  const committed = h.store.snapshot(id);

  const { response, json } = await complete(
    h,
    PERSONAL_MATCH,
    id,
    body({ confirmedVideoTimeSeconds: 6 }),
  );
  expect(response.status).toBe(409);
  expect(json.code).toBe("mode_conflict");
  expect(json.detail).toBe("attachment_active_other_time");
  expect(h.store.rows.get(id)).toEqual(committed);
});

test("a replay after another replacement retired the row is a conflict, never a reactivation", async () => {
  const h = harness();
  h.container.copyMode = "instant";
  const id = readyAttempt(h, PERSONAL_MATCH);
  await complete(h, PERSONAL_MATCH, id);
  const next = readyAttempt(h, PERSONAL_MATCH, {
    expectedActive: { id, version: 0 },
  });
  await complete(
    h,
    PERSONAL_MATCH,
    next,
    body({ expectedActive: { id, version: 0 } }),
  );
  expect(h.store.rows.get(id)!.state).toBe("retired");
  expect(h.store.rows.get(next)!.state).toBe("active");
  h.events.length = 0;

  const { response, json } = await complete(h, PERSONAL_MATCH, id);
  expect(response.status).toBe(409);
  expect(json.code).toBe("mode_conflict");
  expect(json.detail).toBe("attempt_retired");
  expect(h.store.rows.get(id)!.state).toBe("retired");
  expect(h.store.rows.get(next)!.state).toBe("active");
  expectNoStorage(h, 2);
});

/* =========================================================================
 * The lease — concurrency, expiry, loss
 * ====================================================================== */

test("a request against a row another completion holds is refused before any storage call, and the holder's lease survives", async () => {
  const h = harness();
  const other = randomUUID();
  const id = readyAttempt(h, PERSONAL_MATCH, {
    lease: { token: other, until: new Date(NOW.getTime() + 30_000) },
  });

  const { response, json } = await complete(h, PERSONAL_MATCH, id);
  expect(response.status).toBe(409);
  expect(json.code).toBe("pending_attempt_conflict");
  expect(json.detail).toBe("finalizing");
  expectNoStorage(h);
  expect(h.events).not.toContain("release");
  expect(h.store.rows.get(id)!.leaseToken).toBe(other);
});

test("an expired lease is free again: the next request takes it", async () => {
  const h = harness();
  const id = readyAttempt(h, PERSONAL_MATCH, {
    lease: { token: randomUUID(), until: new Date(NOW.getTime() - 1) },
  });
  const { response } = await complete(h, PERSONAL_MATCH, id);
  expect(response.status).toBe(202);
  expect(h.store.rows.get(id)!.leaseToken).toBeNull();
  expect(h.store.rows.get(id)!.copyStatus).toBe("pending");
});

test("the lease is taken for FINALIZATION_LEASE_SECONDS and the frozen time is what activation commits", async () => {
  const h = harness();
  const id = readyAttempt(h, PERSONAL_MATCH);
  let seenUntil: Date | null = null;
  h.deps.storage.probeStaged = async (row) => {
    seenUntil = h.store.rows.get(row.id)!.leaseUntil;
    return h.container.probe(row.staged_blob_key, row.source_etag);
  };
  await complete(
    h,
    PERSONAL_MATCH,
    id,
    body({ confirmedVideoTimeSeconds: "00:00:05.000" }),
  );
  expect(seenUntil).toEqual(
    new Date(NOW.getTime() + FINALIZATION_LEASE_SECONDS * 1000),
  );
  expect(h.store.rows.get(id)!.confirmed).toBe(5);
});

test("if the lease lapses mid-request, activation is refused and the previous video stays", async () => {
  let lapse = true;
  const h = harness({
    before: {
      // Azure was slow: by the time the published bytes are probed the lease
      // has lapsed.
      probePublished: () => {
        if (!lapse) return;
        lapse = false;
        h.store.clock.now = new Date(
          NOW.getTime() + (FINALIZATION_LEASE_SECONDS + 1) * 1000,
        );
      },
    },
  });
  h.container.copyMode = "instant";
  const scenario = replacement(h);

  const { response, json } = await complete(
    h,
    PERSONAL_MATCH,
    scenario.attemptId,
    body({ expectedActive: { id: scenario.previousId, version: 2 } }),
  );
  expect(response.status).toBe(409);
  expect(json.code).toBe("pending_attempt_conflict");
  expect(json.detail).toBe("lease_not_held");
  expect(h.events).toContain("release");
  expectRecoverable(h, scenario);
  // Nothing was lost: the copy is recorded and the next request activates.
  h.store.clock.now = NOW;
  const retry = await complete(
    h,
    PERSONAL_MATCH,
    scenario.attemptId,
    body({ expectedActive: { id: scenario.previousId, version: 2 } }),
  );
  expect(retry.response.status).toBe(200);
  expect(h.container.copiesStarted).toBe(1);
});

test("a lapsed lease taken by another request makes this one's copy-column write a no-op refusal", async () => {
  const h = harness({
    before: {
      persist: () => {
        // Between Start Copy and the write, this lease lapsed and a second
        // request began finalization under its own token.
        const row = h.store.rows.get(id)!;
        row.leaseToken = randomUUID();
        row.leaseUntil = new Date(NOW.getTime() + 60_000);
      },
    },
  });
  const id = readyAttempt(h, PERSONAL_MATCH);

  const { response, json } = await complete(h, PERSONAL_MATCH, id);
  expect(response.status).toBe(409);
  expect(json.detail).toBe("lease_not_held");
  const row = h.store.rows.get(id)!;
  expect(row.copyId).toBeNull();
  expect(row.state).toBe("pending");
  // Release is holder-only: the other request's lease is untouched.
  expect(row.leaseToken).not.toBeNull();
  expect(row.leaseToken).not.toBe(h.leaseToken);
});

test("a lost copy record is found again by the next request, which does not start a second copy", async () => {
  const h = harness({
    fail: {
      persist: {
        on: 1,
        with: matchVideoError("storage_unavailable", "persist_failed"),
      },
    },
  });
  const id = readyAttempt(h, PERSONAL_MATCH);

  const first = await complete(h, PERSONAL_MATCH, id);
  expect(first.response.status).toBe(503);
  const row = h.store.rows.get(id)!;
  expect(row.copyId).toBeNull();
  expect(row.leaseToken).toBeNull();
  expect(h.container.copiesStarted).toBe(1);
  h.events.length = 0;

  const second = await complete(h, PERSONAL_MATCH, id);
  expect(second.response.status).toBe(202);
  expect(h.events).toContain("probeStaged");
  expect(h.events).toContain("beginPublication");
  expect(h.container.copiesStarted).toBe(1);
  expect(row.copyId).toBe(h.container.blobs.get(row.finalBlobKey)!.copy!.id);
  expect(row.copyStatus).toBe("pending");
});

/* =========================================================================
 * Races with cancellation, deletion and access
 * ====================================================================== */

test("cancellation is refused while a completion holds the lease, allowed once the 202 released it, and then stops late activation", async () => {
  const h = harness({
    before: {
      beginPublication: () => {
        expect(h.store.cancel(id)).toEqual(
          rpcRefusal("pending_attempt_conflict", "finalizing"),
        );
      },
    },
  });
  const id = readyAttempt(h, PERSONAL_MATCH);

  const started = await complete(h, PERSONAL_MATCH, id);
  expect(started.response.status).toBe(202);
  expect(h.events).toContain("beginPublication");

  // The copy is running in Azure with no lease held: cancel is allowed.
  expect(h.store.cancel(id)).toEqual({ ok: true, value: "retired" });
  const row = h.store.rows.get(id)!;
  h.container.advance(row.finalBlobKey, "success");
  h.events.length = 0;

  const late = await complete(h, PERSONAL_MATCH, id);
  expect(late.response.status).toBe(409);
  expect(late.json.code).toBe("mode_conflict");
  expect(late.json.detail).toBe("attempt_retired");
  expect(row.state).toBe("retired");
  expectNoStorage(h, 1);
  expect(h.events).not.toContain("activate");
});

test("a cancelled attempt never publishes even when the copy already succeeded", async () => {
  const h = harness();
  h.container.copyMode = "instant";
  const scenario = replacement(h);
  h.store.rows.get(scenario.attemptId)!.state = "retired";
  h.store.rows.get(scenario.attemptId)!.retiredAt = NOW;

  const { response } = await complete(
    h,
    PERSONAL_MATCH,
    scenario.attemptId,
    body({ expectedActive: { id: scenario.previousId, version: 2 } }),
  );
  expect(response.status).toBe(409);
  expect(h.store.rows.get(scenario.previousId)).toEqual(scenario.before);
  expectNoStorage(h);
});

test("a match deleted between polls is 404 at access, before the lease", async () => {
  const h = harness({ visible: [] });
  const id = readyAttempt(h, PERSONAL_MATCH);
  h.store.deleteMatch(PERSONAL_MATCH);
  const { response } = await complete(h, PERSONAL_MATCH, id);
  expect(response.status).toBe(404);
  expect(h.events).not.toContain("begin");
  expectNoStorage(h);
});

test("a match deleted under a still-visible id is refused by the database's match predicate", async () => {
  const h = harness();
  const id = readyAttempt(h, PERSONAL_MATCH);
  await complete(h, PERSONAL_MATCH, id);
  h.store.deleteMatch(PERSONAL_MATCH);
  h.events.length = 0;

  const { response, json } = await complete(h, PERSONAL_MATCH, id);
  expect(response.status).toBe(404);
  expect(json.detail).toBe("no_such_attachment");
  expect(h.events).toContain("begin");
  expectNoStorage(h, 1);
  expect(h.events).not.toContain("activate");
});

test("a creator who switched workspace between polls is stopped, and the copy waits for them", async () => {
  const h = harness({ workspace: team(PROGRAM) });
  const id = readyAttempt(h, TEAM_MATCH);
  await complete(h, TEAM_MATCH, id);
  const recorded = h.store.snapshot(id);

  const wrong = harness({
    store: h.store,
    container: h.container,
    workspace: personal(CREATOR),
  });
  const { response, json } = await complete(wrong, TEAM_MATCH, id);
  expect(response.status).toBe(403);
  expect(json.code).toBe("workspace_mismatch");
  expectNoStorage(wrong, 1);
  expect(h.store.rows.get(id)).toEqual(recorded);

  h.container.advance(recorded.finalBlobKey, "success");
  const back = await complete(h, TEAM_MATCH, id);
  expect(back.response.status).toBe(200);
});

test("another person's attempt is 403 from the database's uploader test", async () => {
  const h = harness();
  const id = readyAttempt(h, PERSONAL_MATCH, { uploadedBy: OTHER_USER });
  const { response, json } = await complete(h, PERSONAL_MATCH, id);
  expect(response.status).toBe(403);
  expect(json.detail).toBe("not_uploader");
  expectNoStorage(h);
});

test("an expected-active belief that disagrees with the reservation, or with reality, is stale before any storage call", async () => {
  const h = harness();
  const scenario = replacement(h);

  const disagrees = await complete(
    h,
    PERSONAL_MATCH,
    scenario.attemptId,
    body(),
  );
  expect(disagrees.response.status).toBe(409);
  expect(disagrees.json.detail).toBe("expected_active_changed");

  // The reservation's belief was right; then a second tab replaced A.
  h.store.rows.get(scenario.previousId)!.version = 3;
  const reality = await complete(
    h,
    PERSONAL_MATCH,
    scenario.attemptId,
    body({ expectedActive: { id: scenario.previousId, version: 2 } }),
  );
  expect(reality.response.status).toBe(409);
  expect(reality.json.detail).toBe("active_version_changed");
  expectNoStorage(h);
  expect(h.store.rows.get(scenario.attemptId)!.leaseToken).toBeNull();
});

test("a replacement committed by another tab between the copy and activation is caught inside the transaction", async () => {
  const h = harness({
    before: {
      activate: () => {
        // Another tab's attempt became active first.
        const winner = h.store.seedActive(PERSONAL_MATCH, { version: 0 });
        h.store.rows.get(scenario.previousId)!.state = "retired";
        h.store.rows.get(scenario.previousId)!.retiredAt = NOW;
        void winner;
      },
    },
  });
  h.container.copyMode = "instant";
  const scenario = replacement(h);

  const { response, json } = await complete(
    h,
    PERSONAL_MATCH,
    scenario.attemptId,
    body({ expectedActive: { id: scenario.previousId, version: 2 } }),
  );
  expect(response.status).toBe(409);
  expect(json.code).toBe("stale_attachment");
  expect(json.detail).toBe("active_attachment_replaced");
  const attempt = h.store.rows.get(scenario.attemptId)!;
  expect(attempt.state).toBe("pending");
  expect(attempt.leaseToken).toBeNull();
  expect(
    [...h.store.rows.values()].filter((r) => r.state === "active"),
  ).toHaveLength(1);
});

/* =========================================================================
 * Storage verification
 * ====================================================================== */

test("staged bytes overwritten after the copy started are refused on resume, with no activation", async () => {
  const h = harness();
  const scenario = replacement(h);
  await complete(
    h,
    PERSONAL_MATCH,
    scenario.attemptId,
    body({ expectedActive: { id: scenario.previousId, version: 2 } }),
  );
  const row = h.store.rows.get(scenario.attemptId)!;
  h.container.advance(row.finalBlobKey, "success");
  // A second upload to the same staged key under a still-valid SAS.
  h.container.putStaged(row.stagedBlobKey, { media: SHORT_MEDIA });
  h.events.length = 0;

  const { response, json } = await complete(
    h,
    PERSONAL_MATCH,
    scenario.attemptId,
    body({ expectedActive: { id: scenario.previousId, version: 2 } }),
  );
  expect(response.status).toBe(409);
  expect(json.code).toBe("stale_attachment");
  expect(json.detail).toBe("etag_mismatch");
  expect(h.events).not.toContain("inspectPublication");
  expect(h.events).not.toContain("activate");
  expectRecoverable(h, scenario);
});

test("staged bytes overwritten between the probe and Start Copy fail the source condition", async () => {
  const h = harness();
  const scenario = replacement(h);
  const row = h.store.rows.get(scenario.attemptId)!;
  h.container.beforeStartCopy = () =>
    h.container.putStaged(row.stagedBlobKey, { media: SHORT_MEDIA });

  const { response, json } = await complete(
    h,
    PERSONAL_MATCH,
    scenario.attemptId,
    body({ expectedActive: { id: scenario.previousId, version: 2 } }),
  );
  expect(response.status).toBe(409);
  expect(json.detail).toBe("source_etag_mismatch");
  expect(h.container.copiesStarted).toBe(0);
  expect(h.container.blobs.has(row.finalBlobKey)).toBe(false);
  expect(row.copyId).toBeNull();
  expectRecoverable(h, scenario);
});

test("a staged object that has not landed is retryable only while a credential could still write it", async () => {
  // Window open: 503, try again.
  const open = harness();
  const openScenario = replacement(open);
  open.container.blobs.delete(
    open.store.rows.get(openScenario.attemptId)!.stagedBlobKey,
  );
  const retry = await complete(
    open,
    PERSONAL_MATCH,
    openScenario.attemptId,
    body({ expectedActive: { id: openScenario.previousId, version: 2 } }),
  );
  expect(retry.response.status).toBe(503);
  expect(retry.json.code).toBe("storage_unavailable");
  expect(retry.json.detail).toBe("staged_not_landed");
  expect(open.events).toContain("window");
  expect(open.events).not.toContain("beginPublication");
  expectRecoverable(open, openScenario);

  // Window closed: nothing can ever write the key; terminal.
  const closed = harness();
  const closedScenario = replacement(closed);
  const row = closed.store.rows.get(closedScenario.attemptId)!;
  row.uploadSasExpiresAt = new Date(NOW.getTime() - 1);
  closed.container.blobs.delete(row.stagedBlobKey);
  const never = await complete(
    closed,
    PERSONAL_MATCH,
    closedScenario.attemptId,
    body({ expectedActive: { id: closedScenario.previousId, version: 2 } }),
  );
  expect(never.response.status).toBe(413);
  expect(never.json.code).toBe("empty_file");
  expect(never.json.detail).toBe("staged_never_landed");
  expect(closed.events).not.toContain("beginPublication");
  expectRecoverable(closed, closedScenario);
  // Terminal for the attempt, but cancellable: the lease is gone.
  expect(closed.store.cancel(closedScenario.attemptId)).toEqual({
    ok: true,
    value: "retired",
  });
});

test("a staged object missing on resume is a conflict, not 'not landed yet'", async () => {
  const h = harness();
  const scenario = replacement(h);
  await complete(
    h,
    PERSONAL_MATCH,
    scenario.attemptId,
    body({ expectedActive: { id: scenario.previousId, version: 2 } }),
  );
  const row = h.store.rows.get(scenario.attemptId)!;
  h.container.blobs.delete(row.stagedBlobKey);

  const { response, json } = await complete(
    h,
    PERSONAL_MATCH,
    scenario.attemptId,
    body({ expectedActive: { id: scenario.previousId, version: 2 } }),
  );
  expect(response.status).toBe(409);
  expect(json.detail).toBe("staged_missing");
  expect(h.events).not.toContain("window");
  expectRecoverable(h, scenario);
});

test("a recording too short for the match is 422 with the coverage sentence, and the previous video stays", async () => {
  const h = harness();
  h.container.copyMode = "instant";
  const scenario = replacement(h);
  h.container.putStaged(h.store.rows.get(scenario.attemptId)!.stagedBlobKey, {
    media: SHORT_MEDIA,
  });

  const { response, json } = await complete(
    h,
    PERSONAL_MATCH,
    scenario.attemptId,
    body({ expectedActive: { id: scenario.previousId, version: 2 } }),
  );
  expect(response.status).toBe(422);
  expect(json.code).toBe("insufficient_coverage");
  expect(json.error).toBe("This video is not long enough.");
  expect(json.detail).toBe("coverage_past_end");
  expectRecoverable(h, scenario);
  // The published copy is kept: a corrected confirmed time can still use it.
  const row = h.store.rows.get(scenario.attemptId)!;
  expect(row.copyStatus).toBe("success");
  expect(h.container.blobs.has(row.finalBlobKey)).toBe(true);
});

test("a confirmed time past the end of the file is invalid_alignment inside the transaction", async () => {
  const h = harness();
  h.container.copyMode = "instant";
  const id = readyAttempt(h, PERSONAL_MATCH);
  const { response, json } = await complete(
    h,
    PERSONAL_MATCH,
    id,
    body({ confirmedVideoTimeSeconds: 301 }),
  );
  expect(response.status).toBe(422);
  expect(json.code).toBe("invalid_alignment");
  expect(json.detail).toBe("confirmed_time_past_end");
  expect(h.store.rows.get(id)!.state).toBe("pending");
});

test("an undecodable staged file is 422 unsupported_media and nothing is copied", async () => {
  const h = harness();
  const scenario = replacement(h);
  h.container.putStaged(h.store.rows.get(scenario.attemptId)!.stagedBlobKey, {
    media: null,
  });
  const { response, json } = await complete(
    h,
    PERSONAL_MATCH,
    scenario.attemptId,
    body({ expectedActive: { id: scenario.previousId, version: 2 } }),
  );
  expect(response.status).toBe(422);
  expect(json.code).toBe("unsupported_media");
  expect(h.container.copiesStarted).toBe(0);
  expectRecoverable(h, scenario);
});

test("a published object whose length disagrees with the staged one is never activated", async () => {
  const h = harness();
  h.container.copyMode = "instant";
  const scenario = replacement(h);
  const row = h.store.rows.get(scenario.attemptId)!;
  const restore = h.deps.storage.probePublished;
  h.deps.storage.probePublished = async (r) => {
    h.container.blobs.get(row.finalBlobKey)!.size = 42;
    return restore(r);
  };

  const { response, json } = await complete(
    h,
    PERSONAL_MATCH,
    scenario.attemptId,
    body({ expectedActive: { id: scenario.previousId, version: 2 } }),
  );
  expect(response.status).toBe(409);
  expect(json.detail).toBe("published_length_mismatch");
  expect(h.events).not.toContain("activate");
  expectRecoverable(h, scenario);
});

test("a failed copy is discarded and its record cleared; the next request starts afresh", async () => {
  const h = harness();
  const scenario = replacement(h);
  const expected = body({
    expectedActive: { id: scenario.previousId, version: 2 },
  });
  await complete(h, PERSONAL_MATCH, scenario.attemptId, expected);
  const row = h.store.rows.get(scenario.attemptId)!;
  h.container.advance(row.finalBlobKey, "failed");
  h.events.length = 0;

  const { response, json } = await complete(
    h,
    PERSONAL_MATCH,
    scenario.attemptId,
    expected,
  );
  expect(response.status).toBe(503);
  expect(json.detail).toBe("copy_failed");
  expect(h.events).toContain("discard");
  expect(h.container.blobs.has(row.finalBlobKey)).toBe(false);
  expect(row.copyId).toBeNull();
  expect(row.copyStatus).toBeNull();
  expectRecoverable(h, scenario);

  const again = await complete(h, PERSONAL_MATCH, scenario.attemptId, expected);
  expect(again.response.status).toBe(202);
  expect(h.container.copiesStarted).toBe(2);
});

test("a recorded copy whose destination vanished clears its record and asks for a retry", async () => {
  const h = harness();
  const scenario = replacement(h);
  const expected = body({
    expectedActive: { id: scenario.previousId, version: 2 },
  });
  await complete(h, PERSONAL_MATCH, scenario.attemptId, expected);
  const row = h.store.rows.get(scenario.attemptId)!;
  h.container.blobs.delete(row.finalBlobKey);

  const { response, json } = await complete(
    h,
    PERSONAL_MATCH,
    scenario.attemptId,
    expected,
  );
  expect(response.status).toBe(503);
  expect(json.detail).toBe("destination_absent");
  expect(row.copyId).toBeNull();
  expectRecoverable(h, scenario);

  const again = await complete(h, PERSONAL_MATCH, scenario.attemptId, expected);
  expect(again.response.status).toBe(202);
  expect(h.container.copiesStarted).toBe(2);
});

test("a stranger's object at the final key is a conflict, never overwritten", async () => {
  const h = harness();
  const scenario = replacement(h);
  const row = h.store.rows.get(scenario.attemptId)!;
  h.container.blobs.set(row.finalBlobKey, {
    etag: '"stranger"',
    size: 7,
    contentType: "video/mp4",
    metadata: {},
    copy: null,
    media: GOOD_MEDIA,
  });
  const { response, json } = await complete(
    h,
    PERSONAL_MATCH,
    scenario.attemptId,
    body({ expectedActive: { id: scenario.previousId, version: 2 } }),
  );
  expect(response.status).toBe(409);
  expect(json.detail).toBe("destination_mismatch");
  expect(h.container.blobs.get(row.finalBlobKey)!.etag).toBe('"stranger"');
  expectRecoverable(h, scenario);
});

/* =========================================================================
 * Injected failures at every boundary — the previous video survives each
 * ====================================================================== */

const unavailable = matchVideoError("storage_unavailable", "injected");

const BOUNDARIES: {
  name: string;
  fail: HarnessOptions["fail"];
  copyMode?: FakeContainer["copyMode"];
  status: number;
  detail: string;
  /** Whether the lease was ever taken (so release is expected). */
  leased: boolean;
}[] = [
  {
    name: "begin_finalization errors",
    fail: { begin: "throw" },
    status: 500,
    detail: "",
    leased: false,
  },
  {
    name: "staged probe unavailable",
    fail: { probeStaged: unavailable },
    status: 503,
    detail: "injected",
    leased: true,
  },
  {
    name: "staged probe throws",
    fail: { probeStaged: "throw" },
    status: 500,
    detail: "",
    leased: true,
  },
  {
    name: "Start Copy unavailable",
    fail: { beginPublication: unavailable },
    status: 503,
    detail: "injected",
    leased: true,
  },
  {
    name: "Start Copy throws",
    fail: { beginPublication: "throw" },
    status: 500,
    detail: "",
    leased: true,
  },
  {
    name: "copy-column write fails",
    fail: { persist: unavailable },
    status: 503,
    detail: "injected",
    leased: true,
  },
  {
    name: "copy-column write throws",
    fail: { persist: "throw" },
    status: 500,
    detail: "",
    leased: true,
  },
  {
    name: "published probe unavailable",
    fail: { probePublished: unavailable },
    copyMode: "instant",
    status: 503,
    detail: "injected",
    leased: true,
  },
  {
    name: "published probe throws",
    fail: { probePublished: "throw" },
    copyMode: "instant",
    status: 500,
    detail: "",
    leased: true,
  },
  {
    name: "activation transaction retryable",
    fail: {
      activate: matchVideoError("storage_unavailable", "transaction_40001"),
    },
    copyMode: "instant",
    status: 503,
    detail: "transaction_40001",
    leased: true,
  },
  {
    name: "activation throws",
    fail: { activate: "throw" },
    copyMode: "instant",
    status: 500,
    detail: "",
    leased: true,
  },
];

for (const boundary of BOUNDARIES) {
  test(`when ${boundary.name}, the previous active video survives, keys are kept and the lease is released`, async () => {
    const h = harness({ fail: boundary.fail });
    if (boundary.copyMode) h.container.copyMode = boundary.copyMode;
    const scenario = replacement(h);

    const { response, json } = await complete(
      h,
      PERSONAL_MATCH,
      scenario.attemptId,
      body({ expectedActive: { id: scenario.previousId, version: 2 } }),
    );
    expect(response.status).toBe(boundary.status);
    if (boundary.detail) expect(json.detail).toBe(boundary.detail);
    expectNoStore(response);
    expectRecoverable(h, scenario);
    if (boundary.leased) {
      expect(h.events[h.events.length - 1]).toBe("release");
    } else {
      expect(h.events).not.toContain("release");
    }
    expect(h.events).not.toContain("activate:ok");
    expect(h.store.rows.get(scenario.attemptId)!.state).toBe("pending");
  });
}

test("a failed lease release does not change the answer; the lease lapses on its own", async () => {
  const h = harness({ fail: { release: "throw" } });
  const id = readyAttempt(h, PERSONAL_MATCH);
  const { response, json } = await complete(h, PERSONAL_MATCH, id);
  expect(response.status).toBe(202);
  expect(json.status).toBe("pending");
  const row = h.store.rows.get(id)!;
  expect(row.copyStatus).toBe("pending");
  expect(row.leaseToken).toBe(h.leaseToken);
  expect(row.leaseUntil!.getTime()).toBe(
    NOW.getTime() + FINALIZATION_LEASE_SECONDS * 1000,
  );
});

test("a failed discard of a dead copy keeps the record so the next request tries the discard again", async () => {
  const h = harness({ fail: { discard: unavailable } });
  const scenario = replacement(h);
  const expected = body({
    expectedActive: { id: scenario.previousId, version: 2 },
  });
  await complete(h, PERSONAL_MATCH, scenario.attemptId, expected);
  const row = h.store.rows.get(scenario.attemptId)!;
  h.container.advance(row.finalBlobKey, "failed");

  const { response } = await complete(
    h,
    PERSONAL_MATCH,
    scenario.attemptId,
    expected,
  );
  expect(response.status).toBe(503);
  expect(row.copyStatus).toBe("failed");
  expect(row.copyId).not.toBeNull();
  expectRecoverable(h, scenario);
});

test("a successful commit does not release: activation already cleared the lease", async () => {
  const h = harness({ fail: { release: "throw" } });
  h.container.copyMode = "instant";
  const id = readyAttempt(h, PERSONAL_MATCH);
  const { response } = await complete(h, PERSONAL_MATCH, id);
  expect(response.status).toBe(200);
  expect(h.events).not.toContain("release");
  expect(h.store.rows.get(id)!.leaseToken).toBeNull();
});

test("the actor and workspace every RPC receives are the session's", async () => {
  const h = harness({ workspace: team(PROGRAM) });
  h.container.copyMode = "instant";
  const id = readyAttempt(h, TEAM_MATCH);
  const seen: BeginFinalizationInput["access"][] = [];
  const begin = h.deps.beginFinalization;
  h.deps.beginFinalization = (input) => {
    seen.push(input.access);
    return begin(input);
  };
  const activate = h.deps.activate;
  h.deps.activate = (input) => {
    seen.push(input.access);
    return activate(input);
  };
  await complete(h, TEAM_MATCH, id);
  expect(seen).toHaveLength(2);
  for (const access of seen) {
    expect(access.actor.id).toBe(CREATOR);
    expect(access.match.id).toBe(TEAM_MATCH);
    expect(access.workspace).toEqual({ kind: "team", id: PROGRAM });
  }
});
