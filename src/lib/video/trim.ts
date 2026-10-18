"use client";

import {
  exceedsUploadLimit,
  oversizeVideoMessage,
  remuxedFileName,
  type PreparedMode,
  type TrimSkipReason,
} from "./trim-plan";
import type { TrimWorkerRequest, TrimWorkerResponse } from "./trim-protocol";

/**
 * Cut the selected window out of a picked video before it is uploaded, and
 * re-encode it to 1080p H.264 on the way when it is not already a shape every
 * browser plays (`mode: "transcode"`; see trim-plan.ts).
 *
 * Resolves to the file to upload and whether it is the cut. It never rejects
 * for "couldn't cut" — those resolve to the original with a reason, because a
 * larger upload is always better than no upload. It rejects with
 * `TrimCancelledError` when the signal aborts, and with `OversizeVideoError`
 * when what it would resolve to is over the upload limit: a file the vendor
 * refuses is the one case where no upload IS better.
 *
 * The cut lives in the Origin Private File System until the upload commits;
 * call `discardPreparedVideo` then. `sweepPreparedVideos` removes leftovers
 * from a tab that closed mid-upload.
 */

const OPFS_PREFIX = "prepared-video-";

export class TrimCancelledError extends Error {
  constructor() {
    super("Preparing the video was cancelled");
    this.name = "TrimCancelledError";
  }
}

export type PreparedVideo =
  | {
      trimmed: true;
      file: File;
      /** Length of the cut, in seconds. The job window becomes [0, this]. */
      durationSeconds: number;
      /** Copied as shot, or re-encoded to 1080p H.264. */
      mode: PreparedMode;
      /** OPFS name, for `discardPreparedVideo`. */
      storageName: string;
    }
  | { trimmed: false; file: File; reason: TrimSkipReason };

/**
 * The file to upload would be over `MAX_VIDEO_SIZE_BYTES`: it was picked that
 * large and this browser couldn't bring it under. `message` is the sentence to
 * show.
 */
export class OversizeVideoError extends Error {
  constructor(
    readonly sizeBytes: number,
    readonly reason: TrimSkipReason,
  ) {
    super(oversizeVideoMessage(sizeBytes, reason));
    this.name = "OversizeVideoError";
  }
}

export async function prepareVideoForUpload(
  file: File,
  options: Parameters<typeof prepareInBrowser>[1],
): Promise<PreparedVideo> {
  const prepared = await prepareInBrowser(file, options);
  if (!exceedsUploadLimit(prepared.file.size)) return prepared;
  if (prepared.trimmed) await discardPreparedVideo(prepared.storageName);
  // A cut that came out larger than a picked file which already fit: send
  // the original, as for any other cut that didn't work.
  if (!exceedsUploadLimit(file.size)) {
    return { trimmed: false, file, reason: "failed" };
  }
  throw new OversizeVideoError(
    file.size,
    prepared.trimmed ? "failed" : prepared.reason,
  );
}

async function prepareInBrowser(
  file: File,
  {
    startSeconds,
    endSeconds,
    onProgress,
    onMode,
    signal,
  }: {
    startSeconds: number;
    endSeconds: number;
    /** 0–1. */
    onProgress?: (progress: number) => void;
    /** Fired once, before the first progress, when a file will be written. */
    onMode?: (mode: PreparedMode) => void;
    signal?: AbortSignal;
  },
): Promise<PreparedVideo> {
  if (signal?.aborted) throw new TrimCancelledError();
  if (typeof Worker === "undefined" || !navigator.storage?.getDirectory) {
    return { trimmed: false, file, reason: "no-opfs" };
  }

  const storageName = `${OPFS_PREFIX}${crypto.randomUUID()}.mp4`;
  let worker: Worker;
  try {
    worker = new Worker(new URL("./trim.worker.ts", import.meta.url), {
      type: "module",
    });
  } catch {
    return { trimmed: false, file, reason: "no-opfs" };
  }

  const result = await new Promise<TrimWorkerResponse>((resolve) => {
    const onAbort = () => {
      worker.postMessage({ type: "cancel" } satisfies TrimWorkerRequest);
    };
    signal?.addEventListener("abort", onAbort, { once: true });

    worker.onmessage = (event: MessageEvent<TrimWorkerResponse>) => {
      const msg = event.data;
      if (msg.type === "progress") {
        onProgress?.(msg.progress);
        return;
      }
      if (msg.type === "mode") {
        onMode?.(msg.mode);
        return;
      }
      signal?.removeEventListener("abort", onAbort);
      resolve(msg);
    };
    worker.onerror = (event) => {
      signal?.removeEventListener("abort", onAbort);
      resolve({ type: "skip", reason: "failed", detail: event.message });
    };

    worker.postMessage({
      type: "start",
      file,
      startSeconds,
      endSeconds,
      outputName: storageName,
    } satisfies TrimWorkerRequest);
  });
  worker.terminate();

  if (result.type === "cancelled" || signal?.aborted) {
    await discardPreparedVideo(storageName);
    throw new TrimCancelledError();
  }

  if (result.type !== "done") {
    await discardPreparedVideo(storageName);
    const reason = result.type === "skip" ? result.reason : "failed";
    if (result.type === "skip" && result.detail) {
      console.warn(
        "Uploading the original video — trim failed:",
        result.detail,
      );
    }
    return { trimmed: false, file, reason };
  }

  try {
    const root = await navigator.storage.getDirectory();
    const handle = await root.getFileHandle(result.outputName);
    const disk = await handle.getFile();
    // Re-wrap to carry a meaningful name and type; the bytes stay on disk.
    const cut = new File([disk], remuxedFileName(file.name), {
      type: "video/mp4",
      lastModified: file.lastModified,
    });
    return {
      trimmed: true,
      file: cut,
      durationSeconds: result.durationSeconds,
      mode: result.mode,
      storageName,
    };
  } catch (error) {
    await discardPreparedVideo(storageName);
    console.warn("Uploading the original video — cut file unreadable:", error);
    return { trimmed: false, file, reason: "failed" };
  }
}

export async function discardPreparedVideo(storageName: string): Promise<void> {
  try {
    const root = await navigator.storage.getDirectory();
    await root.removeEntry(storageName);
  } catch {
    /* already gone, or OPFS unavailable */
  }
}

/**
 * Remove cut files left by a tab that closed mid-upload.
 *
 * Only files untouched for `STALE_AFTER_MS`: another open tab may be uploading
 * one right now, and a sync handle's writes keep `lastModified` fresh while the
 * cut is being written. An upload that sits idle longer than this is long past
 * the twenty-minute "upload paused" rule anyway.
 */
const STALE_AFTER_MS = 12 * 60 * 60 * 1000;

export async function sweepPreparedVideos(): Promise<void> {
  try {
    const root = await navigator.storage.getDirectory();
    const stale: string[] = [];
    // `keys()` is widely supported but missing from older lib.dom typings.
    const entries = (
      root as unknown as { keys: () => AsyncIterable<string> }
    ).keys();
    for await (const name of entries) {
      if (!name.startsWith(OPFS_PREFIX)) continue;
      const handle = await root.getFileHandle(name).catch(() => null);
      const file = await handle?.getFile().catch(() => null);
      if (file && Date.now() - file.lastModified > STALE_AFTER_MS) {
        stale.push(name);
      }
    }
    await Promise.all(
      stale.map((name) => root.removeEntry(name).catch(() => {})),
    );
  } catch {
    /* OPFS unavailable */
  }
}
