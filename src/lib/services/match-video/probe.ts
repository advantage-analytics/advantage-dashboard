/**
 * Server-side verification of a video that is already in storage.
 *
 * T5 (`src/lib/match-video/media-inspection.ts`) answers "what is in these
 * bytes" for any byte source. This module is the half that decides WHICH bytes,
 * and it is the only half that can be lied to: by the time it runs, a browser
 * has uploaded a file and told us what it thinks that file is. None of what it
 * said is trusted here. The duration, the length and the media type returned
 * below are read out of the stored object, through the same bounded reader the
 * wizard runs locally, and the declared values are compared only so a mismatch
 * can be logged.
 *
 * Two properties this module exists to hold:
 *
 *   1. **No caller names a blob.** The probe accepts a {@link StoredVideoBlob},
 *      which is branded and can only be minted by {@link stagedBlobOf} /
 *      {@link publishedBlobOf} from a persisted `match_video_attachments` row.
 *      A request body — `ReserveUploadRequest`, a JSON object, anything a user
 *      can influence — is not assignable to it, so "the client supplied the
 *      storage key" is a compile error rather than a code review question.
 *      There is no URL, container, account or credential parameter at all.
 *
 *   2. **One file, or no answer.** Every range read is conditioned on a single
 *      pinned ETag and the ETag is re-checked after the parse. A blob replaced
 *      underneath a running probe is refused (`stale_attachment`); it never
 *      returns a duration derived from two files' bytes, which is the one
 *      failure here that would look completely fine on screen.
 *
 * SERVER ONLY. It imports `@azure/storage-blob`, which is a
 * `serverExternalPackages` entry in `next.config.ts` and must never reach a
 * client bundle; `tests/client-bundle-boundary.spec.ts` enforces that.
 *
 * Not in scope: minting credentials, copying the staged object to its final
 * key, or writing anything back to the row. That is the storage adapter (T7)
 * and the completion endpoint (T10). This module reads and judges.
 */

import { RestError } from "@azure/storage-blob";

import {
  inspectMedia,
  type InspectMediaOptions,
  type MediaByteSource,
} from "@/lib/match-video/media-inspection";
import {
  checkAttachmentSize,
  MATCH_VIDEO_MIME_TYPES,
} from "@/lib/match-video/limits";
import { fail, ok, type MatchVideoResult } from "@/lib/match-video/types";
import { videoContainerClient } from "@/lib/services/splitstep/video-url/azure-sas";

/* -------------------------------------------------------------------------
 * The server-selected blob
 * ---------------------------------------------------------------------- */

declare const serverSelectedBlob: unique symbol;

/**
 * A blob this server chose, carrying the ETag it expects to find there.
 *
 * The brand is the point. An interface with a `blobName: string` would be
 * structurally satisfied by a parsed request body, and the rule that a caller
 * may not name a storage key would live only in prose. With the brand, the sole
 * way to obtain one is {@link stagedBlobOf} or {@link publishedBlobOf}, whose
 * input is a row shape — columns that only server code ever writes.
 *
 * `expectedEtag` is `null` when the row has not recorded one yet. That is not a
 * weaker guarantee about which file is read: the probe pins the ETag it sees on
 * its first request and conditions every later read on that. `expectedEtag`
 * adds the stronger check that the file is still the one the row is about.
 */
export interface StoredVideoBlob {
  readonly [serverSelectedBlob]: true;
  readonly blobName: string;
  readonly expectedEtag: string | null;
}

/**
 * The columns of `match_video_attachments` this module reads.
 *
 * Deliberately snake_case and deliberately narrow: it is the database row, not
 * a DTO a route handler could assemble out of user input.
 */
export interface StoredAttachmentBlobRow {
  staged_blob_key: string;
  final_blob_key: string;
  source_etag: string | null;
}

/**
 * Reject a key that is not a plain object name.
 *
 * The table already refuses a key containing `://` or `?` with a check
 * constraint. This repeats it because the cost of being wrong is a server-side
 * request to somewhere a user chose, and a row written by a future code path
 * that forgot the constraint should fail here rather than fetch.
 */
function checkBlobKey(key: string): MatchVideoResult<string> {
  if (key.length === 0) return fail("storage_unavailable", "blob_key_empty");
  if (
    key.includes("://") ||
    key.includes("?") ||
    key.includes("#") ||
    key.startsWith("/") ||
    key.split("/").includes("..")
  ) {
    return fail("storage_unavailable", "blob_key_not_an_object_name");
  }
  return ok(key);
}

function brand(blobName: string, expectedEtag: string | null): StoredVideoBlob {
  return { blobName, expectedEtag } as StoredVideoBlob;
}

/**
 * The staged object a browser uploaded to, with the ETag the row recorded.
 *
 * This is what completion verifies before anything is published.
 */
export function stagedBlobOf(
  row: StoredAttachmentBlobRow,
): MatchVideoResult<StoredVideoBlob> {
  const key = checkBlobKey(row.staged_blob_key);
  if (!key.ok) return key;
  return ok(brand(key.value, row.source_etag));
}

/**
 * The published object, after the server-side copy.
 *
 * No expected ETag: `source_etag` belongs to the staged blob, and a copy's
 * destination gets its own. The probe pins whatever it finds and holds the
 * whole read to it, which is the guarantee that matters here — that the bytes
 * measured are one file's.
 */
export function publishedBlobOf(
  row: StoredAttachmentBlobRow,
): MatchVideoResult<StoredVideoBlob> {
  const key = checkBlobKey(row.final_blob_key);
  if (!key.ok) return key;
  return ok(brand(key.value, null));
}

/* -------------------------------------------------------------------------
 * Storage seam
 * ---------------------------------------------------------------------- */

export interface StoredBlobProperties {
  /** Actual length of the stored object. Never the declared size. */
  contentLength: number;
  etag: string;
  /** What storage was told on upload. Advisory, like every declared value. */
  contentType: string | null;
}

export interface StoredBlobRangeRead {
  bytes: Uint8Array;
  /** The ETag the range was actually served from. */
  etag: string;
}

/**
 * Range reads against one blob.
 *
 * An interface rather than a `BlockBlobClient` so the probe's refusals can be
 * exercised without an Azure account — a 412 mid-read, a blob that grows, a
 * socket that resets. The production implementation is
 * {@link azureBlobReader}; nothing here takes a URL.
 */
export interface StoredBlobReader {
  properties(signal: AbortSignal): Promise<StoredBlobProperties>;
  read(
    start: number,
    end: number,
    ifMatchEtag: string,
    signal: AbortSignal,
  ): Promise<StoredBlobRangeRead>;
}

/** The blob was replaced: a conditional request failed, or an ETag moved. */
class BlobReplacedError extends Error {
  constructor(readonly detail: string) {
    super(`stored blob changed: ${detail}`);
    this.name = "BlobReplacedError";
  }
}

/** Storage did not answer. Nothing was learned, so a retry is valid. */
class BlobUnavailableError extends Error {
  constructor(
    readonly detail: string,
    override readonly cause: unknown,
  ) {
    super(`stored blob unavailable: ${detail}`);
    this.name = "BlobUnavailableError";
  }
}

/**
 * Turn an Azure failure into one of the two kinds this module distinguishes.
 *
 * `412 ConditionNotMet` is the whole reason every read carries `ifMatch`: it is
 * storage telling us the object is no longer the one we started reading. It is
 * a refusal, not a retry — retrying would happily read the new file.
 */
function asBlobError(
  cause: unknown,
  detail: string,
): BlobReplacedError | BlobUnavailableError {
  if (cause instanceof BlobReplacedError) return cause;
  if (cause instanceof BlobUnavailableError) return cause;
  if (cause instanceof RestError) {
    if (cause.statusCode === 412 || cause.code === "ConditionNotMet") {
      return new BlobReplacedError("condition_not_met");
    }
    if (cause.statusCode === 404) {
      return new BlobUnavailableError("blob_not_found", cause);
    }
  }
  return new BlobUnavailableError(detail, cause);
}

/**
 * The production reader: the same account-key container client the rest of the
 * video pipeline signs against, scoped to one blob name.
 *
 * Reading through the SDK rather than through a minted SAS URL is deliberate.
 * A URL is a bearer credential that has to be built, carried and eventually
 * logged somewhere; this path has no URL to leak, and it cannot be pointed
 * anywhere but the container this deployment is configured for.
 */
export function azureBlobReader(blobName: string): StoredBlobReader {
  const blob = videoContainerClient().getBlockBlobClient(blobName);

  return {
    async properties(signal) {
      try {
        const response = await blob.getProperties({ abortSignal: signal });
        return {
          contentLength: response.contentLength ?? -1,
          etag: response.etag ?? "",
          contentType: response.contentType ?? null,
        };
      } catch (cause) {
        throw asBlobError(cause, "properties_failed");
      }
    },

    async read(start, end, ifMatchEtag, signal) {
      try {
        const response = await blob.download(start, end - start, {
          conditions: { ifMatch: ifMatchEtag },
          abortSignal: signal,
        });
        const body = response.readableStreamBody;
        if (!body) {
          throw new BlobUnavailableError("no_response_body", null);
        }
        const chunks: Buffer[] = [];
        for await (const chunk of body) {
          chunks.push(Buffer.from(chunk));
        }
        const joined = Buffer.concat(chunks);
        return {
          bytes: new Uint8Array(
            joined.buffer,
            joined.byteOffset,
            joined.byteLength,
          ),
          etag: response.etag ?? "",
        };
      } catch (cause) {
        throw asBlobError(cause, "range_read_failed");
      }
    },
  };
}

/* -------------------------------------------------------------------------
 * Pinned byte source
 * ---------------------------------------------------------------------- */

interface PinnedByteSource extends MediaByteSource {
  /** Set when a read observed a different file. Checked on every exit path. */
  readonly replaced: boolean;
}

/**
 * Adapt a {@link StoredBlobReader} to T5's byte-source seam, pinned to one ETag.
 *
 * The budgets are not re-implemented here and must not be: `MeteredSource`
 * inside `inspectMedia` charges every chunk against the 32 MiB total, the 2 MiB
 * chunk size, the 128-request count and the 15-second deadline, and disposes on
 * every path. This adapter only supplies bytes and notices when they stop
 * coming from the same object.
 *
 * `replaced` is carried out of band because `MeteredSource` maps ANY thrown
 * read failure to `storage_unavailable` — correct for a reset socket, wrong for
 * a replaced blob, and the caller must not retry into the new file.
 */
function pinnedByteSource(
  reader: StoredBlobReader,
  etag: string,
  byteLength: number,
): PinnedByteSource {
  let replaced = false;

  return {
    byteLength,
    // A network profile: Mediabunny then prefetches in the coarser pattern that
    // suits a round trip per read, instead of the fine one it uses for a disk.
    prefetchProfile: "network",
    get replaced() {
      return replaced;
    },
    async read(start, end, signal) {
      let range: StoredBlobRangeRead;
      try {
        range = await reader.read(start, end, etag, signal);
      } catch (cause) {
        // Classified here as well as in the reader, because Mediabunny may
        // swallow a failed read it had only prefetched and finish the parse
        // from what it already holds. The flag survives that; the throw does
        // not.
        const failure = asBlobError(cause, "range_read_failed");
        if (failure instanceof BlobReplacedError) replaced = true;
        throw failure;
      }
      if (range.etag !== etag) {
        // Storage answered from a different version than the one we pinned.
        // Returning these bytes would splice two files together.
        replaced = true;
        throw new BlobReplacedError("etag_moved_mid_read");
      }
      return range.bytes;
    },
  };
}

/* -------------------------------------------------------------------------
 * Declared metadata (advisory)
 * ---------------------------------------------------------------------- */

/**
 * What the browser said about the file.
 *
 * Every field is optional and none of them can change a verdict. They exist so
 * that a disagreement between what was declared and what was stored can be
 * recorded — a useful signal when an upload transport is misbehaving, and
 * nothing more than that.
 */
export interface DeclaredVideoMetadata {
  sizeBytes?: number;
  contentType?: string;
  durationSeconds?: number;
}

/** Slack allowed before a declared duration is called a mismatch. Log-only. */
const DECLARED_DURATION_TOLERANCE_SECONDS = 0.5;

/** Which declared fields disagreed with the stored bytes. Never a refusal. */
export type DeclaredMismatch = "size" | "content_type" | "duration";

function declaredMismatches(
  declared: DeclaredVideoMetadata | undefined,
  verified: { sizeBytes: number; contentType: string; durationSeconds: number },
): DeclaredMismatch[] {
  if (!declared) return [];
  const mismatches: DeclaredMismatch[] = [];
  if (
    declared.sizeBytes !== undefined &&
    declared.sizeBytes !== verified.sizeBytes
  ) {
    mismatches.push("size");
  }
  if (
    declared.contentType !== undefined &&
    baseMediaType(declared.contentType) !== verified.contentType
  ) {
    mismatches.push("content_type");
  }
  if (
    declared.durationSeconds !== undefined &&
    !(
      Math.abs(declared.durationSeconds - verified.durationSeconds) <=
      DECLARED_DURATION_TOLERANCE_SECONDS
    )
  ) {
    mismatches.push("duration");
  }
  return mismatches;
}

/** `video/mp4; codecs="avc1.4d401f"` → `video/mp4`. */
function baseMediaType(mimeType: string): string {
  return mimeType.split(";")[0].trim().toLowerCase();
}

/* -------------------------------------------------------------------------
 * Probe
 * ---------------------------------------------------------------------- */

export interface ProbeStoredVideoInput {
  /** Chosen by server code from a persisted row. See {@link StoredVideoBlob}. */
  blob: StoredVideoBlob;
  /** Advisory only. Absent is as good as present. */
  declared?: DeclaredVideoMetadata;
}

export interface ProbedStoredVideo {
  /** The ETag every byte below was read under. */
  etag: string;
  /** Measured length of the stored object, in bytes. */
  sizeBytes: number;
  /** Media type derived from the container, not from the upload header. */
  contentType: string;
  /** Media end of the primary video track, in seconds. */
  durationSeconds: number;
  videoCodec: string | null;
  codedWidth: number;
  codedHeight: number;
  /** Bytes pulled from storage. Asserted by the bounded-read tests. */
  bytesRead: number;
  rangeRequests: number;
  /** Declared fields the stored bytes contradict. Log signal only. */
  declaredMismatches: DeclaredMismatch[];
}

export interface ProbeStoredVideoOptions extends InspectMediaOptions {
  /**
   * Reader override.
   *
   * A test seam, like `deadlineMs` on `inspectMedia`, and it is NOT a way for a
   * request to choose a blob: it is a second positional argument supplied by
   * the calling module, never parsed from a body. Production callers omit it
   * and get {@link azureBlobReader} for `blob.blobName`.
   */
  reader?: StoredBlobReader;
}

/**
 * Verify the video stored at a server-chosen blob.
 *
 * The order is deliberate. Properties first, so an empty or oversized object is
 * refused for what it measures rather than for what it claims, and before a
 * single range is read. Then the bounded parse, under a pinned ETag. Then the
 * ETag again, because a blob that changed after the last read but before we
 * answered is still a blob we cannot report a duration for.
 */
export async function probeStoredVideo(
  input: ProbeStoredVideoInput,
  options: ProbeStoredVideoOptions = {},
): Promise<MatchVideoResult<ProbedStoredVideo>> {
  const reader = options.reader ?? azureBlobReader(input.blob.blobName);
  const controller = new AbortController();

  let before: StoredBlobProperties;
  try {
    before = await reader.properties(controller.signal);
  } catch (error) {
    return classifyStorageFailure(error);
  }

  if (!before.etag) {
    return fail("storage_unavailable", "missing_etag");
  }
  if (before.contentLength < 0) {
    // Storage did not report a length. That is storage failing to answer, not
    // an empty file, and calling it `empty_file` would tell a user with a
    // perfectly good upload to go and pick a different one.
    return fail("storage_unavailable", "missing_content_length");
  }
  if (input.blob.expectedEtag && input.blob.expectedEtag !== before.etag) {
    // The row is about a file that is no longer there. Refusing before any
    // range read also means a replaced blob costs one request, not a parse.
    return fail("stale_attachment", "etag_mismatch");
  }

  const size = checkAttachmentSize(before.contentLength);
  if (!size.ok) return { ok: false, error: size.error };

  const source = pinnedByteSource(reader, before.etag, before.contentLength);
  const inspected = await inspectMedia(source, options);

  // Checked before the result is read: a replaced blob outranks whatever the
  // bytes happened to parse as, including a successful parse.
  if (source.replaced) {
    return fail("stale_attachment", "etag_changed_during_read");
  }
  if (!inspected.ok) return { ok: false, error: inspected.error };

  let after: StoredBlobProperties;
  try {
    after = await reader.properties(controller.signal);
  } catch (error) {
    return classifyStorageFailure(error);
  }
  if (after.etag !== before.etag) {
    return fail("stale_attachment", "etag_changed_during_read");
  }
  if (after.contentLength !== before.contentLength) {
    // Belt and braces: an object that grew without its ETag moving is not one
    // whose measured length we are willing to store.
    return fail("stale_attachment", "length_changed_during_read");
  }

  const contentType = baseMediaType(inspected.value.mimeType);
  if (!(MATCH_VIDEO_MIME_TYPES as readonly string[]).includes(contentType)) {
    return fail("unsupported_media", "content_type_not_supported");
  }

  const verified = {
    sizeBytes: before.contentLength,
    contentType,
    durationSeconds: inspected.value.durationSeconds,
  };

  return ok({
    etag: before.etag,
    ...verified,
    videoCodec: inspected.value.videoCodec,
    codedWidth: inspected.value.codedWidth,
    codedHeight: inspected.value.codedHeight,
    bytesRead: inspected.value.bytesRead,
    rangeRequests: inspected.value.rangeRequests,
    declaredMismatches: declaredMismatches(input.declared, verified),
  });
}

/**
 * Map a failure raised outside the parse onto a code.
 *
 * The same split T5 draws: a replaced blob is a conflict the caller must see
 * (`stale_attachment`, 409, "The video changed"), while anything else storage
 * does is transient (`storage_unavailable`, 503, "Try again in a moment").
 * Neither is `media_probe_budget`, which only a file's own structure earns.
 */
function classifyStorageFailure<T>(error: unknown): MatchVideoResult<T> {
  const failure = asBlobError(error, "properties_failed");
  if (failure instanceof BlobReplacedError) {
    return fail("stale_attachment", "etag_changed_during_read");
  }
  return fail("storage_unavailable", failure.detail);
}
