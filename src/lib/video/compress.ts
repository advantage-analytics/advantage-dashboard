/**
 * Client-side video compression using FFmpeg.wasm.
 *
 * Transcodes video to 720p H.264 before upload, reducing multi-GB match
 * recordings to ~500MB. Runs in a Web Worker so the UI stays responsive.
 *
 * Limitation: FFmpeg.wasm loads the entire input into WASM memory, so files
 * larger than ~2GB may exceed browser memory limits. Callers should check
 * file size before calling this.
 */

import type { FFmpeg } from "@ffmpeg/ffmpeg";

// Singleton FFmpeg instance — loading the WASM core (~25MB) is expensive,
// so we only do it once per session.
let ffmpegInstance: FFmpeg | null = null;
let loadPromise: Promise<FFmpeg> | null = null;

async function getFFmpeg(): Promise<FFmpeg> {
  if (ffmpegInstance?.loaded) return ffmpegInstance;

  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    const { FFmpeg } = await import("@ffmpeg/ffmpeg");
    const ffmpeg = new FFmpeg();
    await ffmpeg.load();
    ffmpegInstance = ffmpeg;
    return ffmpeg;
  })();

  try {
    return await loadPromise;
  } catch (e) {
    loadPromise = null;
    throw e;
  }
}

export interface CompressOptions {
  file: File;
  onProgress: (pct: number) => void;
  signal?: AbortSignal;
}

export interface CompressResult {
  file: File;
  originalSize: number;
  compressedSize: number;
}

/**
 * Compress a video file to 720p H.264.
 *
 * @returns A new File object with the compressed video (.mp4).
 * @throws If compression fails, is cancelled, or the file is too large for WASM.
 */
export async function compressVideo({
  file,
  onProgress,
  signal,
}: CompressOptions): Promise<CompressResult> {
  const ffmpeg = await getFFmpeg();

  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");

  const inputName = "input" + getExtension(file.name);
  const outputName = "output.mp4";

  // Wire up progress reporting
  const progressHandler = ({ progress }: { progress: number }) => {
    // FFmpeg reports progress as 0-1 float
    onProgress(Math.min(100, Math.round(progress * 100)));
  };
  ffmpeg.on("progress", progressHandler);

  // Wire up abort signal
  const abortHandler = () => {
    // FFmpeg.wasm doesn't have a clean cancel API — we terminate by
    // throwing in the next progress tick. The exec promise will reject.
    ffmpeg.off("progress", progressHandler);
  };
  signal?.addEventListener("abort", abortHandler, { once: true });

  try {
    // Write input file to virtual filesystem
    const { fetchFile } = await import("@ffmpeg/util");
    await ffmpeg.writeFile(inputName, await fetchFile(file));

    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");

    // Transcode to 720p
    // -vf scale=-2:720  → 720p height, auto width (divisible by 2)
    // -c:v libx264       → H.264 codec (universally supported)
    // -preset fast        → good speed/quality for WASM
    // -crf 28            → visually transparent for match footage
    // -c:a aac -b:a 128k → compressed audio
    // -movflags +faststart → metadata at file start for streaming
    const exitCode = await ffmpeg.exec(
      [
        "-i", inputName,
        "-vf", "scale=-2:720",
        "-c:v", "libx264",
        "-preset", "fast",
        "-crf", "28",
        "-c:a", "aac",
        "-b:a", "128k",
        "-movflags", "+faststart",
        outputName,
      ],
      undefined,
      { signal },
    );

    if (exitCode !== 0) {
      throw new Error(`FFmpeg exited with code ${exitCode}`);
    }

    // Read the compressed output
    const data = await ffmpeg.readFile(outputName);
    if (typeof data === "string") {
      throw new Error("Unexpected string output from FFmpeg");
    }

    const compressedBlob = new Blob([data as unknown as BlobPart], { type: "video/mp4" });
    const compressedFile = new File(
      [compressedBlob],
      file.name.replace(/\.[^.]+$/, ".mp4"),
      { type: "video/mp4" },
    );

    return {
      file: compressedFile,
      originalSize: file.size,
      compressedSize: compressedFile.size,
    };
  } finally {
    ffmpeg.off("progress", progressHandler);
    signal?.removeEventListener("abort", abortHandler);

    // Clean up virtual filesystem
    try { await ffmpeg.deleteFile(inputName); } catch { /* ignore */ }
    try { await ffmpeg.deleteFile(outputName); } catch { /* ignore */ }
  }
}

function getExtension(filename: string): string {
  const idx = filename.lastIndexOf(".");
  return idx === -1 ? "" : filename.slice(idx).toLowerCase();
}

/** Max file size that can be auto-compressed (WASM memory limit). */
export const MAX_COMPRESS_SIZE = 2 * 1024 * 1024 * 1024; // 2 GB
