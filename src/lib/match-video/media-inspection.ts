/**
 * Bounded media inspection for SwingVision video attachment.
 *
 * One number decides whether an attachment is usable: the media end of its
 * primary video track. Every coverage check and every seek in the match room is
 * derived from it, so it is parsed from the container here rather than taken
 * from a client, from an audio track, or from a filename.
 *
 * The module is isomorphic on purpose. The browser runs it over `File.slice`
 * before a byte is uploaded; the server runs the SAME code over Azure range
 * reads after the bytes land (T6 supplies that byte source). It therefore
 * imports no Azure, no Supabase and no Next.js — only `mediabunny` and this
 * feature's own pure contracts.
 *
 * Inspection is bounded because the input is a file a stranger chose. A crafted
 * container can ask a naive parser to walk a multi-gigabyte chain of boxes, and
 * the natural implementation — buffer the file, hand it to the parser — turns
 * an 8 GB upload into 8 GB of server memory. Every read here is metered: total
 * bytes, per-read size, read count, cache size and wall clock. Exhausting one
 * of those is a refusal (`media_probe_budget`), not a hang.
 */

import {
  CustomSource,
  Input,
  MATROSKA,
  MP4,
  QTFF,
  WEBM,
  type InputVideoTrack,
} from "mediabunny";

import { checkAttachmentSize, MATCH_VIDEO_EXTENSIONS } from "./limits";
import { fail, ok, type MatchVideoResult } from "./types";

/* -------------------------------------------------------------------------
 * Budgets
 * ---------------------------------------------------------------------- */

/**
 * Total bytes a single inspection may pull from the byte source.
 *
 * Container metadata — a `moov` sample table, a Matroska Cues element — grows
 * with the number of frames, not with the size of the file, so a three-hour
 * phone recording still indexes in a few megabytes. 32 MiB is far above any
 * honest file and far below anything that threatens a serverless function.
 */
export const MEDIA_PROBE_MAX_TOTAL_BYTES = 32 * 1024 * 1024;

/**
 * Largest single read issued to the byte source.
 *
 * The parser may ask for a range larger than this; it is split into chunks of
 * at most this size rather than refused, because the request is legitimate and
 * only the allocation is not. This is what keeps peak memory bounded even when
 * a file's metadata region is contiguous and huge.
 */
export const MEDIA_PROBE_MAX_CHUNK_BYTES = 2 * 1024 * 1024;

/**
 * Reads allowed per inspection, counted after chunk splitting.
 *
 * A well-formed file needs a handful. A file that seeks endlessly — a box chain
 * pointing at itself, an index scattered across a file — burns this instead of
 * burning the request. 128 × 2 MiB is deliberately larger than the byte budget,
 * so a pathological file trips whichever limit it actually abuses.
 */
export const MEDIA_PROBE_MAX_RANGE_REQUESTS = 128;

/** In-memory read cache handed to Mediabunny. Bounds re-read amplification. */
export const MEDIA_PROBE_CACHE_BYTES = 8 * 1024 * 1024;

/**
 * Wall-clock deadline for one inspection.
 *
 * This is a STRUCTURAL limit, not a network one: hitting it means the file's
 * layout is asking for more work than an upload preflight may spend, and the
 * user is told to export an MP4. A byte source that itself fails or times out
 * throws, and that is reported as `storage_unavailable` — retryable — because
 * nothing was learned about the file.
 */
export const MEDIA_PROBE_DEADLINE_MS = 15_000;

/**
 * How far a track's first timestamp may sit from zero.
 *
 * The saved offset assumes video time zero is the first frame. A container that
 * starts its media clock somewhere else (an edit list we do not apply, a
 * Unix-epoch mapping) would shift every seek in the match by that amount with
 * nothing looking broken, so it is refused rather than approximated.
 */
export const MEDIA_PROBE_START_TOLERANCE_SECONDS = 0.5;

/**
 * Input formats this module will parse.
 *
 * Constructed explicitly instead of using Mediabunny's `ALL_FORMATS`, which
 * includes HLS. An HLS manifest is a list of URLs: parsing one would make the
 * inspector fetch resources the uploader names, from the server, which is a
 * request-forgery primitive rather than a video check. Audio-only containers
 * (MP3, Ogg, WAVE, ADTS) are absent for the same reason the list is explicit —
 * they can never satisfy the video-track requirement, so refusing them at the
 * format gate gives a clearer failure than refusing them a layer later.
 *
 * AVI is absent because the pinned Mediabunny build ships no AVI reader.
 */
const INSPECTED_FORMATS = [MP4, QTFF, MATROSKA, WEBM];

/* -------------------------------------------------------------------------
 * Byte source seam
 * ---------------------------------------------------------------------- */

/**
 * The injectable byte source.
 *
 * This is the seam that makes the module isomorphic: the browser implements it
 * with `File.slice`, the server with an Azure range read pinned to a known blob
 * and ETag. Neither variant is referenced here.
 *
 * `read` receives an `AbortSignal` that fires on the deadline and on every
 * failure path, and is expected to honour it. Any error it throws is treated as
 * a transient source failure.
 */
export interface MediaByteSource {
  /** Total length of the file in bytes. */
  readonly byteLength: number;
  /** Resolve the bytes in `[start, end)`. */
  read(start: number, end: number, signal: AbortSignal): Promise<Uint8Array>;
  /** Called once when inspection finishes, on every path. */
  dispose?(): void | Promise<void>;
  /**
   * Read-latency profile passed to Mediabunny's prefetcher. `"fileSystem"` for
   * a local file, `"network"` for a remote blob.
   */
  readonly prefetchProfile?: "none" | "fileSystem" | "network";
}

/** A `File`/`Blob` without depending on the DOM lib at runtime. */
export interface SliceableFile {
  readonly name: string;
  readonly size: number;
  readonly type: string;
  slice(start: number, end: number): { arrayBuffer(): Promise<ArrayBuffer> };
}

/**
 * A byte source over a local `File`.
 *
 * `slice` then `arrayBuffer` materialises ONLY the requested window. Calling
 * `file.arrayBuffer()` would be one line shorter and would read an 8 GB
 * selection into the tab before the user learned the file is unusable.
 */
export function fileByteSource(file: SliceableFile): MediaByteSource {
  return {
    byteLength: file.size,
    prefetchProfile: "fileSystem",
    async read(start, end) {
      const buffer = await file.slice(start, end).arrayBuffer();
      return new Uint8Array(buffer);
    },
  };
}

/** A byte source over bytes already in memory. Used by tests and small reads. */
export function bufferByteSource(bytes: Uint8Array): MediaByteSource {
  return {
    byteLength: bytes.byteLength,
    prefetchProfile: "fileSystem",
    async read(start, end) {
      return bytes.subarray(start, end);
    },
  };
}

/* -------------------------------------------------------------------------
 * Result
 * ---------------------------------------------------------------------- */

export interface InspectedMedia {
  /**
   * Media end of the primary VIDEO track, in seconds.
   *
   * Not the container duration and not the audio duration: a recording whose
   * audio runs two seconds past its last frame would otherwise claim coverage
   * it cannot play.
   */
  durationSeconds: number;
  /** Mediabunny's name for the detected container. */
  formatName: string;
  /** Full MIME type including track codecs, as parsed. */
  mimeType: string;
  /** Primary video codec, or null when the container does not name one. */
  videoCodec: string | null;
  codedWidth: number;
  codedHeight: number;
  /** Bytes actually pulled from the source. Asserted by the bounded-read tests. */
  bytesRead: number;
  /** Reads issued to the source, after chunk splitting. */
  rangeRequests: number;
}

/* -------------------------------------------------------------------------
 * Internal failure kinds
 * ---------------------------------------------------------------------- */

/** A budget was exhausted: the file's structure costs too much to inspect. */
class ProbeBudgetError extends Error {
  constructor(readonly detail: string) {
    super(`media probe budget exhausted: ${detail}`);
    this.name = "ProbeBudgetError";
  }
}

/** The byte source failed. Nothing was learned about the file; retry is valid. */
class ProbeSourceError extends Error {
  constructor(
    readonly detail: string,
    override readonly cause: unknown,
  ) {
    super(`media probe source failure: ${detail}`);
    this.name = "ProbeSourceError";
  }
}

/* -------------------------------------------------------------------------
 * Metered source
 * ---------------------------------------------------------------------- */

/**
 * Wraps a `MediaByteSource` in the read budget and adapts it to Mediabunny.
 *
 * Splitting oversized requests rather than rejecting them matters: the parser
 * asking for 6 MiB of sample table is not misbehaviour, and refusing it would
 * reject ordinary long recordings. What must stay bounded is the allocation per
 * read and the total, and both do.
 */
class MeteredSource {
  bytesRead = 0;
  rangeRequests = 0;

  constructor(
    private readonly source: MediaByteSource,
    private readonly signal: AbortSignal,
  ) {}

  async read(start: number, end: number): Promise<Uint8Array> {
    const clampedEnd = Math.min(end, this.source.byteLength);
    if (clampedEnd <= start) return new Uint8Array(0);

    const chunks: Uint8Array[] = [];
    for (
      let cursor = start;
      cursor < clampedEnd;
      cursor += MEDIA_PROBE_MAX_CHUNK_BYTES
    ) {
      const chunkEnd = Math.min(
        cursor + MEDIA_PROBE_MAX_CHUNK_BYTES,
        clampedEnd,
      );
      this.charge(chunkEnd - cursor);
      chunks.push(await this.readChunk(cursor, chunkEnd));
    }

    if (chunks.length === 1) return chunks[0];
    const total = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
    const joined = new Uint8Array(total);
    let at = 0;
    for (const chunk of chunks) {
      joined.set(chunk, at);
      at += chunk.byteLength;
    }
    return joined;
  }

  /** Charges one chunk against both counters BEFORE it is fetched. */
  private charge(byteCount: number): void {
    if (this.rangeRequests + 1 > MEDIA_PROBE_MAX_RANGE_REQUESTS) {
      throw new ProbeBudgetError("range_request_limit");
    }
    if (this.bytesRead + byteCount > MEDIA_PROBE_MAX_TOTAL_BYTES) {
      throw new ProbeBudgetError("total_bytes_limit");
    }
    this.rangeRequests += 1;
    this.bytesRead += byteCount;
  }

  private async readChunk(start: number, end: number): Promise<Uint8Array> {
    if (this.signal.aborted) throw new ProbeBudgetError("deadline_exceeded");
    let bytes: Uint8Array;
    try {
      bytes = await this.source.read(start, end, this.signal);
    } catch (cause) {
      if (this.signal.aborted) throw new ProbeBudgetError("deadline_exceeded");
      throw new ProbeSourceError("read_failed", cause);
    }
    if (bytes.byteLength !== end - start) {
      throw new ProbeSourceError("short_read", null);
    }
    return bytes;
  }
}

/* -------------------------------------------------------------------------
 * Inspection
 * ---------------------------------------------------------------------- */

export interface InspectMediaOptions {
  /**
   * Wall-clock deadline override, in milliseconds.
   *
   * Exists so the deadline path can be exercised without a fifteen-second test.
   * Production callers leave it unset and get {@link MEDIA_PROBE_DEADLINE_MS};
   * the read budgets — total bytes, chunk size, request count — have no
   * override at all, because those are the limits a hostile file actually
   * attacks.
   */
  deadlineMs?: number;

  /**
   * Read-cache size override, in bytes.
   *
   * Also a test seam, for the same reason as {@link deadlineMs}: the cache is
   * not a refusal limit, so nothing a file can do reveals it. Setting it to 0
   * disables caching and makes the re-read amplification this budget exists to
   * prevent observable. Production callers leave it unset and get
   * {@link MEDIA_PROBE_CACHE_BYTES}.
   */
  cacheBytes?: number;
}

/**
 * Parse the primary video track's media end from `source`, within budget.
 *
 * Returns a `MatchVideoResult` rather than throwing, because every caller —
 * wizard, route handler, cleanup job — has to render or log the same codes.
 */
export async function inspectMedia(
  source: MediaByteSource,
  options: InspectMediaOptions = {},
): Promise<MatchVideoResult<InspectedMedia>> {
  const size = checkAttachmentSize(source.byteLength);
  if (!size.ok) return size;

  const controller = new AbortController();
  const deadline = setTimeout(
    () => controller.abort(),
    options.deadlineMs ?? MEDIA_PROBE_DEADLINE_MS,
  );
  const metered = new MeteredSource(source, controller.signal);

  const input = new Input({
    formats: INSPECTED_FORMATS,
    source: new CustomSource({
      getSize: () => source.byteLength,
      read: (start, end) => metered.read(start, end),
      maxCacheSize: options.cacheBytes ?? MEDIA_PROBE_CACHE_BYTES,
      prefetchProfile: source.prefetchProfile ?? "none",
      // Out-of-band read failures must not become unhandled rejections; the
      // pending call path reports the same failure with its own detail.
      handleUnhandledError: () => undefined,
    }),
  });

  try {
    return await Promise.race([
      readPrimaryVideo(input, metered),
      deadlineRejection(controller.signal),
    ]);
  } catch (error) {
    return classify(error);
  } finally {
    clearTimeout(deadline);
    controller.abort();
    input.dispose();
    await source.dispose?.();
  }
}

/** Rejects when the deadline aborts, so a wedged parse cannot outlive it. */
function deadlineRejection(signal: AbortSignal): Promise<never> {
  return new Promise((_resolve, reject) => {
    if (signal.aborted) {
      reject(new ProbeBudgetError("deadline_exceeded"));
      return;
    }
    signal.addEventListener(
      "abort",
      () => reject(new ProbeBudgetError("deadline_exceeded")),
      { once: true },
    );
  });
}

async function readPrimaryVideo(
  input: Input,
  metered: MeteredSource,
): Promise<MatchVideoResult<InspectedMedia>> {
  if (!(await input.canRead())) {
    return fail("unsupported_media", "format_not_readable");
  }

  const track = await input.getPrimaryVideoTrack();
  if (!track) {
    // Audio-only files land here: a readable container with no picture.
    return fail("unsupported_media", "no_video_track");
  }

  const timing = await checkTiming(track);
  if (timing) return timing;

  const durationSeconds = await track.computeDuration();
  if (!Number.isFinite(durationSeconds)) {
    return fail("unsupported_media", "nonfinite_duration");
  }
  if (durationSeconds <= 0) {
    return fail("unsupported_media", "nonpositive_duration");
  }

  const [formatName, mimeType, videoCodec, codedWidth, codedHeight] =
    await Promise.all([
      input.getFormat().then((format) => format.name),
      input.getMimeType(),
      track.getCodec(),
      track.getCodedWidth(),
      track.getCodedHeight(),
    ]);

  return ok({
    durationSeconds,
    formatName,
    mimeType,
    videoCodec,
    codedWidth,
    codedHeight,
    bytesRead: metered.bytesRead,
    rangeRequests: metered.rangeRequests,
  });
}

/**
 * Refuse timing layouts the saved offset cannot express.
 *
 * A live track has no end. A track whose clock is anchored to the Unix epoch,
 * or which simply starts well away from zero, would make every derived seek
 * wrong by a constant — the one failure mode of this feature that looks fine on
 * screen. Both are refused instead of silently corrected.
 */
async function checkTiming(
  track: InputVideoTrack,
): Promise<MatchVideoResult<InspectedMedia> | null> {
  if (await track.isLive()) {
    return fail("unsupported_media", "live_track");
  }
  if (await track.isRelativeToUnixEpoch()) {
    return fail("unsupported_media", "epoch_relative_timestamps");
  }
  const first = await track.getFirstTimestamp();
  if (!Number.isFinite(first)) {
    return fail("unsupported_media", "nonfinite_first_timestamp");
  }
  if (Math.abs(first) > MEDIA_PROBE_START_TOLERANCE_SECONDS) {
    return fail("unsupported_media", "media_clock_not_zero_based");
  }
  return null;
}

/**
 * Map a thrown failure onto a code.
 *
 * The split that matters: a budget refusal is the file's fault and ends in the
 * MP4 export guidance; a source failure is the network's fault and stays
 * retryable. Anything else is an unparseable file.
 */
function classify(error: unknown): MatchVideoResult<InspectedMedia> {
  if (error instanceof ProbeBudgetError) {
    return fail("media_probe_budget", error.detail);
  }
  if (error instanceof ProbeSourceError) {
    return fail("storage_unavailable", error.detail);
  }
  return fail("unsupported_media", "parse_failed");
}

/* -------------------------------------------------------------------------
 * Local preflight
 * ---------------------------------------------------------------------- */

/**
 * Inspect a file the user just picked, before any byte is uploaded.
 *
 * The extension gate runs first and reads nothing. It exists so that an `.avi`
 * — a real format this build cannot verify — gets the MP4 export guidance
 * instantly instead of after a futile parse. An accepted extension is a
 * precondition, never acceptance: the file still has to parse, carry video and
 * report a finite, zero-based duration.
 */
export async function inspectLocalVideoFile(
  file: SliceableFile,
): Promise<MatchVideoResult<InspectedMedia>> {
  if (!hasInspectableExtension(file.name)) {
    return fail("unsupported_media", "extension_not_supported");
  }
  return inspectMedia(fileByteSource(file));
}

/** Whether a filename ends in an extension this module can verify. */
export function hasInspectableExtension(filename: string): boolean {
  const lowered = filename.toLowerCase();
  return MATCH_VIDEO_EXTENSIONS.some((extension) =>
    lowered.endsWith(extension),
  );
}
