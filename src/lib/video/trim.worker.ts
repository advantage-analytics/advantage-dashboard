/// <reference lib="webworker" />
/**
 * The remux, off the main thread.
 *
 * Reads the picked `File` lazily (Mediabunny's `BlobSource` slices it; nothing
 * close to the whole file is ever in memory) and writes the cut MP4 into the
 * Origin Private File System through a sync access handle, at each chunk's own
 * byte offset — the MP4 writer back-patches earlier regions, so chunks must be
 * placed, never appended.
 *
 * Copy only (`mode: 'forced'`): a track that can't be copied is DISCARDED by
 * Mediabunny, and a discarded video or audio track is reported back as
 * "unsupported" so the caller uploads the original instead. Silently shipping
 * a file without its audio is the exact failure this exists to fix.
 */

import {
  ALL_FORMATS,
  BlobSource,
  Conversion,
  Input,
  Mp4OutputFormat,
  Output,
  StreamTarget,
  type StreamTargetChunk,
} from "mediabunny";

import { decideTrim } from "./trim-plan";
import type { TrimWorkerRequest, TrimWorkerResponse } from "./trim-protocol";

const scope = self as unknown as DedicatedWorkerGlobalScope;

let conversion: Conversion | null = null;
let cancelled = false;

function post(message: TrimWorkerResponse) {
  scope.postMessage(message);
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

    const decision = decideTrim({
      startSeconds: msg.startSeconds,
      endSeconds: msg.endSeconds,
      sourceDurationSeconds,
      fileSizeBytes: msg.file.size,
      opfsAvailable,
      quotaFreeBytes,
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

    conversion = await Conversion.init({
      input,
      output,
      trim: { start: decision.startSeconds, end: decision.endSeconds },
      // Shift 0 keeps the timeline exact: output t=0 is the selected start.
      // `expand` keeps every selected frame even when the nearest keyframe is
      // a little earlier.
      copy: { mode: "forced", shiftTolerance: 0, boundaryPolicy: "expand" },
      showWarnings: false,
    });

    const lostMedia = conversion.discardedTracks.some(
      (d) => d.track.type === "video" || d.track.type === "audio",
    );
    if (!conversion.isValid || lostMedia) {
      post({ type: "skip", reason: "unsupported" });
      return;
    }

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

    post({ type: "done", outputName: msg.outputName, durationSeconds });
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
