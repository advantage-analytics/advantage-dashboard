/// <reference lib="webworker" />
/**
 * The remux — and, for a file not every browser can play, the re-encode — off
 * the main thread.
 *
 * Reads the picked `File` lazily (Mediabunny's `BlobSource` slices it; nothing
 * close to the whole file is ever in memory) and writes the cut MP4 into the
 * Origin Private File System through a sync access handle, at each chunk's own
 * byte offset — the MP4 writer back-patches earlier regions, so chunks must be
 * placed, never appended.
 *
 * Copy only (`mode: 'forced'`) for a file that is already 1080p-or-less H.264:
 * a track that can't be copied is DISCARDED by Mediabunny, and a discarded
 * video or audio track is reported back as "unsupported" so the caller uploads
 * the original instead. Silently shipping a file without its audio is the
 * exact failure this exists to fix.
 *
 * Anything else (`normaliseReason()`; in practice a phone's 4K HEVC) has its
 * video re-encoded to 1080p H.264 through WebCodecs, at the source's own frame
 * rate and timestamps, with audio still copied when it can be. A browser that
 * cannot decode the source or encode H.264 falls back to the copy-only rules:
 * a trimmed window is still cut, and a whole clip reports "no-encoder" and is
 * uploaded as shot, as with every other skip. See trim-plan.ts.
 */

import {
  ALL_FORMATS,
  BlobSource,
  canEncodeVideo,
  Conversion,
  Input,
  Mp4OutputFormat,
  Output,
  Quality,
  StreamTarget,
  type ConversionOptions,
  type ConversionVideoOptions,
  type StreamTargetChunk,
} from "mediabunny";

import {
  normaliseReason,
  PLAYBACK_MAX_SHORT_SIDE,
  PLAYBACK_SAFE_VIDEO_CODEC,
  type NormaliseReason,
} from "@/lib/match-video/playback-format";

import { decideTrim, type PreparedMode } from "./trim-plan";
import type { TrimWorkerRequest, TrimWorkerResponse } from "./trim-protocol";

const scope = self as unknown as DedicatedWorkerGlobalScope;

let conversion: Conversion | null = null;
let cancelled = false;

function post(message: TrimWorkerResponse) {
  scope.postMessage(message);
}

/** A second between key frames: every point start seeks to within one. */
const TRANSCODE_KEY_FRAME_INTERVAL_SECONDS = 1;

/** Packets averaged for the frame rate: ten seconds at 60 fps. */
const FRAME_RATE_SAMPLE_PACKETS = 600;

interface SourceVideo {
  normalise: NormaliseReason | null;
  /** Whether this browser can decode it and encode 1080p H.264. */
  canTranscode: boolean;
  frameRate: number | null;
  displayWidth: number;
  displayHeight: number;
}

/**
 * What the plan needs to know about the picture. Null when it cannot be read,
 * which leaves the file on the copy-only path it has always taken.
 */
async function readSourceVideo(input: Input): Promise<SourceVideo | null> {
  try {
    const track = await input.getPrimaryVideoTrack();
    if (!track) return null;
    const [videoCodec, codedWidth, codedHeight, displayWidth, displayHeight] =
      await Promise.all([
        track.getCodec(),
        track.getCodedWidth(),
        track.getCodedHeight(),
        track.getDisplayWidth(),
        track.getDisplayHeight(),
      ]);
    const normalise = normaliseReason({ videoCodec, codedWidth, codedHeight });
    let frameRate: number | null = null;
    let canTranscode = false;
    if (normalise) {
      const [decodes, encodes] = await Promise.all([
        track.canDecode(),
        canEncodeVideo(PLAYBACK_SAFE_VIDEO_CODEC, {
          width: 1920,
          height: 1080,
        }),
      ]);
      canTranscode = decodes && encodes;
    }
    if (normalise && canTranscode) {
      // Only read when it will be used, and only a sample: without a limit
      // this walks every packet, which for a container with no index (MKV,
      // WebM) means reading the whole file before anything is written.
      const { averagePacketRate } = await track.computePacketStats(
        FRAME_RATE_SAMPLE_PACKETS,
      );
      if (Number.isFinite(averagePacketRate) && averagePacketRate > 0) {
        frameRate = averagePacketRate;
      }
    }
    return { normalise, canTranscode, frameRate, displayWidth, displayHeight };
  } catch {
    return null;
  }
}

/** The frame rate an encoder budgets for when it is told none. */
const ENCODER_ASSUMED_FRAME_RATE = 30;

/**
 * The number to hand the encoder so the file lands on `videoBitrate`.
 *
 * Mediabunny passes no frame rate unless the output's is fixed, and fixing it
 * would resample the timestamps this cut exists to keep. An encoder told none
 * budgets per frame as if for 30 fps — measured in Chrome 154 on macOS: an
 * 8 Mbps request made 8.1 Mbps at 30 fps, a 12 Mbps one made 24.0 at 60. So
 * faster footage asks for proportionally less. An encoder that does honour the
 * figure exactly writes a 60 fps file at half the target, which is still well
 * above the ~2 Mbps most stored matches run at.
 */
function encoderBitrate(videoBitrate: number, frameRate: number | null) {
  if (frameRate === null || frameRate <= ENCODER_ASSUMED_FRAME_RATE) {
    return videoBitrate;
  }
  return Math.round((videoBitrate * ENCODER_ASSUMED_FRAME_RATE) / frameRate);
}

/**
 * The re-encode: H.264, the short side brought down to 1080 and never below
 * it, frame rate and timestamps left as shot.
 */
function transcodeVideoOptions(
  source: SourceVideo,
  videoBitrate: number,
): ConversionVideoOptions {
  const shortSide = Math.min(source.displayWidth, source.displayHeight);
  const scale: Pick<ConversionVideoOptions, "width" | "height"> =
    shortSide <= PLAYBACK_MAX_SHORT_SIDE
      ? {}
      : source.displayHeight <= source.displayWidth
        ? { height: PLAYBACK_MAX_SHORT_SIDE }
        : { width: PLAYBACK_MAX_SHORT_SIDE };
  return {
    ...scale,
    codec: PLAYBACK_SAFE_VIDEO_CODEC,
    // The object form: a bare number is a qualitative factor, not a bitrate
    // (measured: 20 s of 1080p came out at 331 Mbps).
    quality: new Quality({
      bitrate: encoderBitrate(videoBitrate, source.frameRate),
    }),
    keyFrameInterval: TRANSCODE_KEY_FRAME_INTERVAL_SECONDS,
    forceTranscode: true,
  };
}

scope.onmessage = async (event: MessageEvent<TrimWorkerRequest>) => {
  const msg = event.data;
  if (msg.type === "cancel") {
    cancelled = true;
    await conversion?.cancel().catch(() => {});
    return;
  }
  if (msg.type !== "start") return;

  let handle: FileSystemSyncAccessHandle | null = null;
  let root: FileSystemDirectoryHandle | null = null;
  try {
    const input = new Input({
      formats: ALL_FORMATS,
      source: new BlobSource(msg.file),
    });

    let sourceDurationSeconds: number;
    try {
      sourceDurationSeconds = await input.computeDuration();
    } catch {
      post({ type: "skip", reason: "unsupported" });
      return;
    }

    let opfsAvailable = false;
    try {
      root = await navigator.storage.getDirectory();
      opfsAvailable =
        typeof FileSystemFileHandle !== "undefined" &&
        "createSyncAccessHandle" in FileSystemFileHandle.prototype;
    } catch {
      opfsAvailable = false;
    }

    let quotaFreeBytes: number | null = null;
    try {
      const { quota, usage } = await navigator.storage.estimate();
      if (typeof quota === "number" && typeof usage === "number") {
        quotaFreeBytes = quota - usage;
      }
    } catch {
      quotaFreeBytes = null;
    }

    const sourceVideo = await readSourceVideo(input);

    const decision = decideTrim({
      startSeconds: msg.startSeconds,
      endSeconds: msg.endSeconds,
      sourceDurationSeconds,
      fileSizeBytes: msg.file.size,
      opfsAvailable,
      quotaFreeBytes,
      normalise: sourceVideo?.normalise ?? null,
      frameRate: sourceVideo?.frameRate ?? null,
      canTranscode: sourceVideo?.canTranscode,
    });
    if (decision.kind === "skip" || !root) {
      post({
        type: "skip",
        reason: decision.kind === "skip" ? decision.reason : "no-opfs",
      });
      return;
    }

    const fileHandle = await root.getFileHandle(msg.outputName, {
      create: true,
    });
    const access = await fileHandle.createSyncAccessHandle();
    handle = access;
    access.truncate(0);

    // Mediabunny closes this stream once the output is finalized. The file is
    // only complete when that close has run — `execute()` resolving is not
    // enough to know the last chunk (the moov, written at the end) is on disk.
    let streamClosed!: () => void;
    const closed = new Promise<void>((resolve) => {
      streamClosed = resolve;
    });
    const writable = new WritableStream<StreamTargetChunk>({
      write(chunk) {
        // A sync handle can store FEWER bytes than asked without throwing —
        // measured: an embedded Chromium stopped a private-storage file at
        // exactly 2000 MiB. Ignoring the count would ship a silently truncated
        // MP4 (no moov, unplayable). Throwing lands in the catch below, which
        // falls back to uploading the original.
        const written = access.write(chunk.data, { at: chunk.position });
        if (written !== chunk.data.byteLength) {
          throw new Error(
            `short write: ${written} of ${chunk.data.byteLength} bytes at ${chunk.position}`,
          );
        }
      },
      close() {
        streamClosed();
      },
    });

    const output = new Output({
      // The moov stays at the END — so every fresh <video> must range-request
      // the tail before it can seek, and the frame is black meanwhile. That
      // cost is accepted because neither faststart mode fits a copy-only
      // Conversion (Mediabunny 1.56.2):
      // - 'reserve' needs `maximumPacketCount` on every track
      //   (mediabunny/dist/modules/src/output-format.d.ts:92, field at
      //   output.d.ts:130), but Conversion adds the tracks itself and never
      //   passes it; there is no option to supply it. Measured on
      //   tests/fixtures/match-video/h264-tail.mp4: execute() throws "All
      //   tracks must specify maximumPacketCount … when using fastStart:
      //   'reserve'", which here would fall back to uploading the original.
      // - 'in-memory' (output-format.d.ts:86) holds every media chunk in
      //   memory until finalization — the whole multi-GB cut, which is exactly
      //   what writing to OPFS exists to avoid.
      // Not 'fragmented' either: an fMP4 with no sidx seeks worse over plain
      // HTTP ranges. `false` streams positioned writes with nothing buffered.
      format: new Mp4OutputFormat({ fastStart: false }),
      target: new StreamTarget(writable, { chunked: true }),
    });

    const transcoding = decision.kind === "transcode" && sourceVideo;
    const mode: PreparedMode = transcoding ? "transcode" : "remux";
    const how: Pick<ConversionOptions, "video" | "copy"> = transcoding
      ? {
          video: transcodeVideoOptions(sourceVideo, decision.videoBitrate),
          // Audio is still copied when MP4 can hold it. Shift 0 keeps the
          // timeline exact either way: output t=0 is the selected start.
          copy: { shiftTolerance: 0, boundaryPolicy: "expand" },
        }
      : {
          // `expand` keeps every selected frame even when the nearest
          // keyframe is a little earlier.
          copy: {
            mode: "forced",
            shiftTolerance: 0,
            boundaryPolicy: "expand",
          },
        };

    conversion = await Conversion.init({
      input,
      output,
      trim: { start: decision.startSeconds, end: decision.endSeconds },
      ...how,
      showWarnings: false,
    });

    const lost = conversion.discardedTracks.filter(
      (d) => d.track.type === "video" || d.track.type === "audio",
    );
    if (!conversion.isValid || lost.length > 0) {
      // A re-encode this browser has no decoder or encoder for is its own
      // reason: the caller can say so, where "unsupported" means the file.
      const noCodec =
        mode === "transcode" &&
        (lost.length === 0 ||
          lost.some(
            (d) =>
              d.reason === "undecodable_source_codec" ||
              d.reason === "no_encodable_target_codec",
          ));
      post({ type: "skip", reason: noCodec ? "no-encoder" : "unsupported" });
      return;
    }

    post({ type: "mode", mode });

    conversion.onProgress = (progress) => {
      post({ type: "progress", progress });
    };

    await conversion.execute();
    if (cancelled) {
      post({ type: "cancelled" });
      return;
    }
    await closed;

    access.flush();
    access.close();
    handle = null;

    // The window the job row will carry. Measured from the written file rather
    // than taken from the request: the cut ends on a frame/audio-packet boundary,
    // so it can run a few hundredths longer, and the vendor analyses the file.
    let durationSeconds = decision.endSeconds - decision.startSeconds;
    try {
      const written = new Input({
        formats: ALL_FORMATS,
        source: new BlobSource(await fileHandle.getFile()),
      });
      const measured = await written.computeDuration();
      if (Number.isFinite(measured) && measured > 0) durationSeconds = measured;
    } catch {
      /* keep the requested length */
    }

    post({ type: "done", outputName: msg.outputName, durationSeconds, mode });
  } catch (error) {
    if (cancelled) {
      post({ type: "cancelled" });
    } else {
      post({
        type: "skip",
        reason: "failed",
        detail: error instanceof Error ? error.message : String(error),
      });
    }
  } finally {
    try {
      handle?.close();
    } catch {
      /* already closed */
    }
    conversion = null;
  }
};
