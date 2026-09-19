/**
 * Azure storage adapter for SwingVision video attachments (plan step 5).
 *
 * The attachment flow moves bytes twice. A browser uploads to a STAGED key
 * under a write-only credential; after the server has measured what landed
 * (T6, `probe.ts`), the staged object is copied server-side to a FINAL key
 * that nothing outside this module ever has write access to. The final object
 * is immutable: it is written exactly once, by that copy, and a destination
 * that already exists but is not the copy this row expects is refused rather
 * than overwritten.
 *
 * Every Azure call goes through the primitives in
 * `services/splitstep/video-url/azure-sas.ts` — the same account-key
 * credential, the same container client, the same SAS signer. This module
 * adds no second way to reach storage; it adds the attachment-specific rules
 * on top:
 *
 *   * The upload SAS names only the staged key and carries `cw` — create and
 *     write, no read, no delete. The playback SAS names only the final key
 *     and carries `r`. There is no function here, and no parameter on any
 *     function here, through which a caller can obtain a write credential for
 *     the final key. `tests/match-video-storage.spec.ts` recomputes the
 *     signature to prove the upload credential is bound to the staged name.
 *   * Publication is an ASYNCHRONOUS Copy Blob, conditioned on the staged
 *     ETag (`x-ms-source-if-match`) and on the destination not existing
 *     (`If-None-Match: *`). {@link beginPublication} issues one request and
 *     returns; it never waits for a multi-gigabyte copy. Progress is read back
 *     by {@link inspectPublication}, one `Get Blob Properties` at a time, and
 *     the caller (T10) persists `copy_id` / `copy_status` between polls.
 *   * The copy's source URL is a short read-only SAS minted here, passed to
 *     Azure, and dropped. It is never part of a return value.
 *   * Ownership of a destination is recorded as blob metadata (attachment id
 *     and the source ETag the copy was conditioned on). That is what lets a
 *     retry after a lost response find its own copy, and what lets a foreign
 *     object at the final key be recognised as one.
 *
 * ── Container and key prefix ─────────────────────────────────────────────────
 * Attachments live in the SAME container as the vendor pipeline's source
 * videos (`AZURE_STORAGE_CONTAINER`), under the `match-video/` prefix that T3's
 * reservation RPC mints. Chosen deliberately: the primitives above are bound
 * to that one container, the browser upload needs the CORS rule that
 * container's storage account already has, and `cleanup-orphan-storage.ts`
 * explains at length why a second "which container holds videos" definition
 * is the drift it exists to clean up after. The cost is that the orphan
 * sweeper's third-segment rule does not fit `match-video/<match>/<id>/…` —
 * see the follow-up noted in the T7 report; nothing here changes the sweeper.
 *
 * SERVER ONLY. Imports `@azure/storage-blob`, a `serverExternalPackages` entry
 * in `next.config.ts`; `tests/client-bundle-boundary.spec.ts` enforces that.
 *
 * Not in scope: the database row. Every function returns state for T10 to
 * store and takes the row shape T10 reads; nothing here touches Supabase.
 */

import { RestError } from "@azure/storage-blob";
import type { BlobBeginCopyFromUrlPollState } from "@azure/storage-blob";

import { fail, ok, type MatchVideoResult } from "@/lib/match-video/types";
import {
  mintPlaybackSas,
  mintUploadSas,
  UPLOAD_SAS_TTL_SECONDS,
  videoContainerClient,
} from "@/lib/services/splitstep/video-url/azure-sas";

import {
  publishedBlobOf,
  stagedBlobOf,
  type StoredAttachmentBlobRow,
  type StoredVideoBlob,
} from "./probe";

/* -------------------------------------------------------------------------
 * Row shape and constants
 * ---------------------------------------------------------------------- */

/**
 * The columns this module reads. `id` is added to T6's row shape because the
 * destination's ownership metadata is keyed by it.
 */
export interface AttachmentStorageRow extends StoredAttachmentBlobRow {
  id: string;
}

/**
 * Lifetime of the read SAS the copy's SOURCE is fetched through.
 *
 * Server-only: minted inside {@link beginPublication}, handed to Azure in the
 * `x-ms-copy-source` header, and discarded. An hour is generous for a
 * same-account copy of an under-8 GB object and short enough that a leaked
 * request log is not a durable credential. It is not the six-hour upload
 * window because nothing on the browser side is involved.
 */
export const PUBLICATION_SOURCE_SAS_TTL_SECONDS = 60 * 60;

/** Re-exported so T8/T10 cite one number for the credential window. */
export const ATTACHMENT_UPLOAD_SAS_TTL_SECONDS = UPLOAD_SAS_TTL_SECONDS;

/**
 * Metadata written onto the destination when the copy starts.
 *
 * Azure lower-cases metadata names and requires C#-identifier characters, so
 * these are lower-case with underscores. The values are what a resumed
 * attempt compares against to decide whether an existing destination is its
 * own copy or a stranger's.
 */
const META_ATTACHMENT_ID = "adv_attachment_id";
const META_SOURCE_ETAG = "adv_source_etag";
const META_STAGED_KEY = "adv_staged_key";

/* -------------------------------------------------------------------------
 * Storage seam
 * ---------------------------------------------------------------------- */

/** Azure's own copy states — identical to the `copy_status` check constraint. */
export type CopyStatus = "pending" | "success" | "aborted" | "failed";

/** What one `Get Blob Properties` returns, and nothing a byte read would. */
export interface AttachmentBlobHead {
  contentLength: number;
  etag: string;
  contentType: string | null;
  metadata: Record<string, string>;
  /** Present when the blob is (or was) a copy destination. */
  copy: {
    id: string;
    status: CopyStatus;
    /** Azure's `bytes/total` string, e.g. `"1048576/8000000000"`. */
    progress: string | null;
    completedOn: Date | null;
    /** Azure's failure description, when the copy failed or was aborted. */
    description: string | null;
  } | null;
}

/**
 * The four blob operations this adapter needs.
 *
 * An interface rather than a `ContainerClient` so the refusals and resumptions
 * can be exercised without an account. Deliberately NO download or range read:
 * "bounded metadata access" is enforced by there being no method through which
 * bytes could come back. Byte inspection is T6's probe.
 *
 * Every method throws Azure's `RestError` (or anything else) on failure; the
 * classification into result codes happens in one place below.
 */
export interface AttachmentBlobOps {
  properties(key: string): Promise<AttachmentBlobHead>;
  /**
   * Start an asynchronous Copy Blob to `destinationKey`.
   *
   * Must send `x-ms-source-if-match: sourceIfMatch` and `If-None-Match: *`,
   * and must set `metadata` on the destination. Returns as soon as Azure has
   * accepted the copy; a small same-account copy may already be `success`.
   */
  startCopy(input: {
    destinationKey: string;
    sourceUrl: string;
    sourceIfMatch: string;
    metadata: Record<string, string>;
  }): Promise<{ copyId: string; copyStatus: CopyStatus }>;
  abortCopy(key: string, copyId: string): Promise<void>;
  deleteIfExists(key: string): Promise<boolean>;
}

/**
 * The production implementation: the pipeline's account-key container client,
 * scoped to whichever key each call names. It cannot be pointed at another
 * container or account.
 */
export function azureAttachmentBlobOps(): AttachmentBlobOps {
  const container = videoContainerClient();

  return {
    async properties(key) {
      const response = await container.getBlockBlobClient(key).getProperties();
      return {
        contentLength: response.contentLength ?? -1,
        etag: response.etag ?? "",
        contentType: response.contentType ?? null,
        metadata: response.metadata ?? {},
        copy:
          response.copyId && response.copyStatus
            ? {
                id: response.copyId,
                status: response.copyStatus,
                progress: response.copyProgress ?? null,
                completedOn: response.copyCompletedOn ?? null,
                description: response.copyStatusDescription ?? null,
              }
            : null,
      };
    },

    async startCopy({ destinationKey, sourceUrl, sourceIfMatch, metadata }) {
      // `beginCopyFromURL` returns a poller whose first `poll()` issues the
      // Start Copy request and returns without waiting for completion. The
      // poller is then dropped: polling is this module's job, one request per
      // caller poll, never a loop inside a request.
      const poller = await container
        .getBlockBlobClient(destinationKey)
        .beginCopyFromURL(sourceUrl, {
          conditions: { ifNoneMatch: "*" },
          sourceConditions: { ifMatch: sourceIfMatch },
          metadata,
        });
      // `getOperationState()` is typed as the generic LRO state; the concrete
      // poller state (exported as `BlobBeginCopyFromUrlPollState`) carries the
      // copy id. `isCompleted` after the first poll means Azure answered
      // `success` inside the Start Copy request itself.
      const state = poller.getOperationState() as BlobBeginCopyFromUrlPollState;
      const copyId = state.copyId;
      if (!copyId) {
        throw new Error("Start Copy returned no copy id");
      }
      return {
        copyId,
        copyStatus: state.isCompleted ? "success" : "pending",
      };
    },

    async abortCopy(key, copyId) {
      await container.getBlockBlobClient(key).abortCopyFromURL(copyId);
    },

    async deleteIfExists(key) {
      const response = await container.getBlockBlobClient(key).deleteIfExists();
      return response.succeeded;
    },
  };
}

/* -------------------------------------------------------------------------
 * Credentials
 * ---------------------------------------------------------------------- */

export interface AttachmentUploadCredential {
  /** Write-only (`cw`) SAS for the STAGED key. Never names the final object. */
  uploadUrl: string;
  expiresAt: Date;
}

export interface AttachmentPlaybackCredential {
  /** Read-only (`r`) SAS for the FINAL key. */
  playbackUrl: string;
  expiresAt: Date;
}

/**
 * The browser's upload credential: six hours, create+write, staged key only.
 *
 * Takes the ROW, not a key. The staged key is read from `staged_blob_key`
 * through {@link stagedBlobOf}; there is no argument through which the final
 * key — or any other name — could be signed for writing.
 *
 * `notAfter` (T8) is the expiry the database has ALREADY recorded for this
 * attempt. The credential is cut to end at or before it — never after — so
 * `upload_sas_expires_at` is never behind a live credential, which is what the
 * cleanup worker relies on to know when a staged key stops being writable.
 * A recorded expiry that has already passed is refused rather than signed
 * for zero seconds.
 */
export function mintAttachmentUploadCredential(
  row: AttachmentStorageRow,
  options: { notAfter?: Date } = {},
): MatchVideoResult<AttachmentUploadCredential> {
  const staged = stagedBlobOf(row);
  if (!staged.ok) return staged;
  if (row.staged_blob_key === row.final_blob_key) {
    return fail("storage_unavailable", "keys_not_distinct");
  }
  let ttlSeconds = ATTACHMENT_UPLOAD_SAS_TTL_SECONDS;
  if (options.notAfter) {
    // Floor, then one more second off: the signer stamps its own `Date.now()`
    // a tick after this one, and a SAS expiry is serialised to whole seconds.
    // Both round the wrong way for "never after"; the extra second covers them.
    const remaining = Math.floor(
      (options.notAfter.getTime() - Date.now()) / 1000,
    );
    ttlSeconds = Math.min(ttlSeconds, remaining - 1);
    if (ttlSeconds <= 0) {
      return fail("storage_unavailable", "upload_window_closed");
    }
  }
  try {
    const { uploadUrl, expiresAt } = mintUploadSas({
      blobName: staged.value.blobName,
      ttlSeconds,
    });
    return ok({ uploadUrl, expiresAt });
  } catch (cause) {
    return fail("storage_unavailable", configDetail(cause));
  }
}

/**
 * A viewer's playback credential: read-only, final key only, thirty minutes
 * (the pipeline's `PLAYBACK_SAS_TTL_SECONDS` default).
 */
export function mintAttachmentPlaybackCredential(
  row: AttachmentStorageRow,
): MatchVideoResult<AttachmentPlaybackCredential> {
  const published = publishedBlobOf(row);
  if (!published.ok) return published;
  try {
    const { playbackUrl, expiresAt } = mintPlaybackSas({
      blobName: published.value.blobName,
    });
    return ok({ playbackUrl, expiresAt });
  } catch (cause) {
    return fail("storage_unavailable", configDetail(cause));
  }
}

/** Distinguish "Azure is not configured" from any other signing failure. */
function configDetail(cause: unknown): string {
  return cause instanceof Error && cause.message.includes("is not set")
    ? "storage_not_configured"
    : "sas_signing_failed";
}

/* -------------------------------------------------------------------------
 * Bounded metadata
 * ---------------------------------------------------------------------- */

export interface AttachmentBlobMetadata {
  contentLength: number;
  etag: string;
  contentType: string | null;
}

/**
 * One `Get Blob Properties` for a server-chosen blob. `null` when absent.
 *
 * Reads no bytes. When a caller needs the duration or the container type it
 * runs T6's `probeStoredVideo`; this is for "did anything land, and how much".
 */
export async function inspectAttachmentBlob(
  blob: StoredVideoBlob,
  ops: AttachmentBlobOps = azureAttachmentBlobOps(),
): Promise<MatchVideoResult<AttachmentBlobMetadata | null>> {
  let head: AttachmentBlobHead;
  try {
    head = await ops.properties(blob.blobName);
  } catch (cause) {
    if (isRestStatus(cause, 404)) return ok(null);
    return fail("storage_unavailable", "properties_failed");
  }
  if (!head.etag) return fail("storage_unavailable", "missing_etag");
  if (head.contentLength < 0) {
    return fail("storage_unavailable", "missing_content_length");
  }
  if (blob.expectedEtag && blob.expectedEtag !== head.etag) {
    return fail("stale_attachment", "etag_mismatch");
  }
  return ok({
    contentLength: head.contentLength,
    etag: head.etag,
    contentType: head.contentType,
  });
}

/* -------------------------------------------------------------------------
 * Publication
 * ---------------------------------------------------------------------- */

/**
 * Where a publication stands, as far as one request can tell.
 *
 *   absent   nothing at the final key; a copy may be started
 *   pending  Azure is copying; poll again after `COMPLETION_RETRY_SECONDS`
 *   success  the final object exists and is complete
 *   failed / aborted   the destination holds a dead copy; discard, then retry
 *
 * `copyId` is what T10 persists as `copy_id` and what T14 passes to
 * {@link abortPublication}. `startedAt` is set only by {@link beginPublication}
 * — Azure does not report when a copy began, so a poll leaves it alone.
 */
export type PublicationState =
  | { status: "absent" }
  | {
      status: "pending";
      copyId: string;
      startedAt: Date | null;
      bytesCopied: number | null;
      bytesTotal: number | null;
    }
  | {
      status: "success";
      copyId: string;
      startedAt: Date | null;
      completedAt: Date | null;
      contentLength: number;
      etag: string;
      contentType: string | null;
    }
  | {
      status: "failed" | "aborted";
      copyId: string;
      startedAt: Date | null;
      description: string | null;
    };

export interface PublicationInput {
  row: AttachmentStorageRow;
  /**
   * The staged ETag the copy is conditioned on — the one T6's probe measured
   * the file under. Passed explicitly rather than read from `row.source_etag`
   * so the caller cannot accidentally publish under an ETag it never verified.
   */
  sourceEtag: string;
}

/**
 * Start the server-side copy from the staged key to the final key.
 *
 * One Start Copy request, then return. Conditioned on `sourceEtag` (a staged
 * object that changed since it was measured is refused as `stale_attachment`)
 * and on the destination not existing. When the destination does exist the
 * call does not fail outright: it reads the destination's properties once and
 * decides whether that object is this row's own copy — a concurrent attempt,
 * or an earlier attempt whose response was lost — in which case its state is
 * returned as if this call had started it, or a mismatch, which is refused.
 * Nothing at the final key is ever overwritten.
 */
export async function beginPublication(
  input: PublicationInput,
  ops: AttachmentBlobOps = azureAttachmentBlobOps(),
): Promise<MatchVideoResult<PublicationState>> {
  const keys = publicationKeys(input.row);
  if (!keys.ok) return keys;
  if (!input.sourceEtag) {
    return fail("storage_unavailable", "missing_source_etag");
  }

  let sourceUrl: string;
  try {
    sourceUrl = mintPlaybackSas({
      blobName: keys.value.staged,
      ttlSeconds: PUBLICATION_SOURCE_SAS_TTL_SECONDS,
    }).playbackUrl;
  } catch (cause) {
    return fail("storage_unavailable", configDetail(cause));
  }

  const startedAt = new Date();
  let started: { copyId: string; copyStatus: CopyStatus };
  try {
    started = await ops.startCopy({
      destinationKey: keys.value.final,
      sourceUrl,
      sourceIfMatch: input.sourceEtag,
      metadata: ownershipMetadata(input.row, input.sourceEtag),
    });
  } catch (cause) {
    // Both conditions come back as a precondition failure or a conflict, and
    // Azure's error code does not reliably say which one tripped. Reading the
    // destination settles it: nothing there means the SOURCE condition
    // failed; something there is either ours (resume) or not (refuse).
    if (isRestStatus(cause, 409) || isRestStatus(cause, 412)) {
      const existing = await resolveExistingDestination(input, keys.value, ops);
      if (!existing.ok) return existing;
      if (existing.value.status === "absent") {
        return fail("stale_attachment", "source_etag_mismatch");
      }
      return ok(existing.value);
    }
    if (isRestStatus(cause, 404)) {
      return fail("storage_unavailable", "source_not_found");
    }
    return fail("storage_unavailable", "start_copy_failed");
  }

  if (started.copyStatus === "pending") {
    return ok({
      status: "pending",
      copyId: started.copyId,
      startedAt,
      bytesCopied: null,
      bytesTotal: null,
    });
  }

  // A same-account copy of a small object can complete inside the Start Copy
  // request. Read the destination once so the success state carries what T10
  // checks (length, ETag) rather than a bare status.
  const head = await inspectPublication(input, ops);
  if (!head.ok) return head;
  if (head.value.status === "absent") {
    return fail("storage_unavailable", "destination_vanished");
  }
  return ok({ ...head.value, startedAt });
}

/**
 * Where the copy at the final key stands. One `Get Blob Properties`.
 *
 * Refuses (`stale_attachment` / `destination_mismatch`) when the object at
 * the final key does not carry this row's ownership metadata for this source
 * ETag. A matching object whose `copyId` differs from what the caller last
 * persisted is NOT refused: that is the shape of a lost response after a
 * discard-and-retry, and the returned `copyId` is the one to persist now.
 */
export async function inspectPublication(
  input: PublicationInput,
  ops: AttachmentBlobOps = azureAttachmentBlobOps(),
): Promise<MatchVideoResult<PublicationState>> {
  const keys = publicationKeys(input.row);
  if (!keys.ok) return keys;
  return resolveExistingDestination(input, keys.value, ops);
}

/**
 * Abort a pending copy. Idempotent: a copy that already finished, was already
 * aborted, or whose destination is gone reports `aborted: false` and no error.
 *
 * Azure leaves an aborted destination in place at zero length; the caller
 * follows with {@link discardFailedPublication} when it wants the key clear.
 * This is the seam T14's cleanup uses before deleting a retired row's blobs,
 * since a destination with a pending copy cannot be deleted.
 */
export async function abortPublication(
  input: { row: AttachmentStorageRow; copyId: string },
  ops: AttachmentBlobOps = azureAttachmentBlobOps(),
): Promise<MatchVideoResult<{ aborted: boolean }>> {
  const keys = publicationKeys(input.row);
  if (!keys.ok) return keys;
  if (!input.copyId) return fail("storage_unavailable", "missing_copy_id");
  try {
    await ops.abortCopy(keys.value.final, input.copyId);
    return ok({ aborted: true });
  } catch (cause) {
    // 409 NoPendingCopyOperation / CopyIdMismatch: nothing to abort any more.
    if (isRestStatus(cause, 409) || isRestStatus(cause, 404)) {
      return ok({ aborted: false });
    }
    return fail("storage_unavailable", "abort_copy_failed");
  }
}

/**
 * Remove a dead copy from the final key so publication can be retried.
 *
 * The ONLY path in this module that deletes a final object outside cleanup,
 * and it is narrow on purpose: the destination must carry this row's
 * ownership metadata for this source ETag AND be in `failed` or `aborted`.
 * A pending copy, a successful one, or anything not ours is refused. That is
 * the immutability rule stated once more from the other side — a retry may
 * clear its own wreckage and nothing else.
 */
export async function discardFailedPublication(
  input: PublicationInput,
  ops: AttachmentBlobOps = azureAttachmentBlobOps(),
): Promise<MatchVideoResult<{ discarded: boolean }>> {
  const state = await inspectPublication(input, ops);
  if (!state.ok) return state;
  switch (state.value.status) {
    case "absent":
      return ok({ discarded: false });
    case "pending":
      return fail("stale_attachment", "copy_still_pending");
    case "success":
      return fail("stale_attachment", "copy_already_succeeded");
    case "failed":
    case "aborted": {
      const keys = publicationKeys(input.row);
      if (!keys.ok) return keys;
      const deleted = await deleteKey(keys.value.final, ops);
      if (!deleted.ok) return deleted;
      return ok({ discarded: deleted.value.deleted });
    }
  }
}

/* -------------------------------------------------------------------------
 * Deletion
 * ---------------------------------------------------------------------- */

/**
 * Delete one of the row's blobs. Idempotent: absence is the desired state.
 *
 * A destination whose copy is still pending cannot be deleted (Azure answers
 * 409 `PendingCopyOperation`); that comes back as `storage_unavailable` /
 * `pending_copy_blocks_delete` so the caller aborts first and retries, rather
 * than as success it did not get.
 */
export async function deleteAttachmentBlob(
  blob: StoredVideoBlob,
  ops: AttachmentBlobOps = azureAttachmentBlobOps(),
): Promise<MatchVideoResult<{ deleted: boolean }>> {
  return deleteKey(blob.blobName, ops);
}

async function deleteKey(
  key: string,
  ops: AttachmentBlobOps,
): Promise<MatchVideoResult<{ deleted: boolean }>> {
  try {
    const deleted = await ops.deleteIfExists(key);
    return ok({ deleted });
  } catch (cause) {
    if (isRestStatus(cause, 404)) return ok({ deleted: false });
    if (isRestStatus(cause, 409)) {
      return fail("storage_unavailable", "pending_copy_blocks_delete");
    }
    return fail("storage_unavailable", "delete_failed");
  }
}

/* -------------------------------------------------------------------------
 * Pure helpers for the caller
 * ---------------------------------------------------------------------- */

/**
 * The final object's metadata, checked against what the staged probe measured.
 *
 * A successful copy conditioned on the staged ETag cannot differ in length
 * from the source it was conditioned on — so if it does, the row and the
 * object have parted company and activation must not proceed. Content type
 * is not compared: Azure copies the header the browser set on upload, which
 * T6 already treats as advisory; the deep check is T6's probe on the final
 * key, which T10 runs after this passes.
 */
export function checkPublishedMetadata(
  state: PublicationState,
  expected: { sizeBytes: number },
): MatchVideoResult<{ contentLength: number; etag: string }> {
  if (state.status !== "success") {
    return fail("storage_unavailable", `copy_${state.status}`);
  }
  if (!state.etag) return fail("storage_unavailable", "missing_etag");
  if (state.contentLength !== expected.sizeBytes) {
    return fail("stale_attachment", "published_length_mismatch");
  }
  return ok({ contentLength: state.contentLength, etag: state.etag });
}

/**
 * The `match_video_attachments` columns a publication state maps onto.
 *
 * `copy_started_at` is included only when the state carries one (i.e. it came
 * from {@link beginPublication}); a poll result leaves the persisted value
 * alone. `absent` clears the copy columns, since there is nothing to resume.
 */
export function publicationColumns(
  state: PublicationState,
  sourceEtag: string,
): {
  source_etag: string;
  copy_id: string | null;
  copy_status: CopyStatus | null;
  copy_started_at?: string;
} {
  if (state.status === "absent") {
    return { source_etag: sourceEtag, copy_id: null, copy_status: null };
  }
  return {
    source_etag: sourceEtag,
    copy_id: state.copyId,
    copy_status: state.status,
    ...(state.startedAt
      ? { copy_started_at: state.startedAt.toISOString() }
      : {}),
  };
}

/* -------------------------------------------------------------------------
 * Internals
 * ---------------------------------------------------------------------- */

function publicationKeys(
  row: AttachmentStorageRow,
): MatchVideoResult<{ staged: string; final: string }> {
  const staged = stagedBlobOf(row);
  if (!staged.ok) return staged;
  const final = publishedBlobOf(row);
  if (!final.ok) return final;
  if (staged.value.blobName === final.value.blobName) {
    return fail("storage_unavailable", "keys_not_distinct");
  }
  return ok({ staged: staged.value.blobName, final: final.value.blobName });
}

function ownershipMetadata(
  row: AttachmentStorageRow,
  sourceEtag: string,
): Record<string, string> {
  return {
    [META_ATTACHMENT_ID]: row.id,
    [META_SOURCE_ETAG]: sourceEtag,
    [META_STAGED_KEY]: row.staged_blob_key,
  };
}

/** Whether the object at the final key is this row's copy of this source. */
function ownedBy(
  head: AttachmentBlobHead,
  row: AttachmentStorageRow,
  sourceEtag: string,
): boolean {
  const meta = lowerKeys(head.metadata);
  return (
    meta[META_ATTACHMENT_ID] === row.id &&
    meta[META_SOURCE_ETAG] === sourceEtag &&
    meta[META_STAGED_KEY] === row.staged_blob_key
  );
}

/** Azure returns metadata names lower-cased; a fake might not. */
function lowerKeys(metadata: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(metadata)) {
    out[key.toLowerCase()] = value;
  }
  return out;
}

async function resolveExistingDestination(
  input: PublicationInput,
  keys: { staged: string; final: string },
  ops: AttachmentBlobOps,
): Promise<MatchVideoResult<PublicationState>> {
  let head: AttachmentBlobHead;
  try {
    head = await ops.properties(keys.final);
  } catch (cause) {
    if (isRestStatus(cause, 404)) return ok({ status: "absent" });
    return fail("storage_unavailable", "properties_failed");
  }

  if (!ownedBy(head, input.row, input.sourceEtag)) {
    return fail("stale_attachment", "destination_mismatch");
  }
  if (!head.copy) {
    // Our metadata but no copy record: something PUT an object here under our
    // name. Not a copy we started, so not one we can report on or replace.
    return fail("stale_attachment", "destination_not_a_copy");
  }

  return ok(stateFromHead(head, head.copy));
}

function stateFromHead(
  head: AttachmentBlobHead,
  copy: NonNullable<AttachmentBlobHead["copy"]>,
): PublicationState {
  switch (copy.status) {
    case "pending": {
      const progress = parseProgress(copy.progress);
      return {
        status: "pending",
        copyId: copy.id,
        startedAt: null,
        bytesCopied: progress?.copied ?? null,
        bytesTotal: progress?.total ?? null,
      };
    }
    case "success":
      return {
        status: "success",
        copyId: copy.id,
        startedAt: null,
        completedAt: copy.completedOn,
        contentLength: head.contentLength,
        etag: head.etag,
        contentType: head.contentType,
      };
    case "failed":
    case "aborted":
      return {
        status: copy.status,
        copyId: copy.id,
        startedAt: null,
        description: copy.description,
      };
  }
}

/** `"1048576/8000000000"` → `{ copied, total }`; anything else → null. */
function parseProgress(
  progress: string | null,
): { copied: number; total: number } | null {
  if (!progress) return null;
  const match = /^(\d+)\/(\d+)$/.exec(progress);
  if (!match) return null;
  return { copied: Number(match[1]), total: Number(match[2]) };
}

function isRestStatus(cause: unknown, status: number): boolean {
  return cause instanceof RestError && cause.statusCode === status;
}
