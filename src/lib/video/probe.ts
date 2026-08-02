/**
 * Client-side video probing.
 *
 * Reads resolution, duration and frame rate from a local File before a single
 * byte is uploaded. Rejecting an unusable file after a twenty-minute upload is
 * the worst failure in the ingest pipeline, so this runs at pick time.
 *
 * Deliberately separate from src/lib/video/compress.ts. That module transcodes
 * to 720p, which is below the analysis provider's 1080p floor — video destined
 * for analysis must never take that path.
 */

/** Metadata read from a local video file. */
export interface VideoProbe {
  width: number;
  height: number;
  durationSeconds: number;
  /** Measured frame rate, or null when the browser cannot report one. */
  fps: number | null;
  mimeType: string;
  sizeBytes: number;
}

/** Milliseconds to wait for `loadedmetadata` before giving up. */
const METADATA_TIMEOUT_MS = 15_000;

/** Milliseconds to spend sampling frames for the frame-rate estimate. */
const FPS_SAMPLE_TIMEOUT_MS = 2_000;

/** Frames to observe before computing a rate. */
const FPS_SAMPLE_FRAMES = 20;

/** Minimum media-time span required for a trustworthy estimate. */
const FPS_MIN_SPAN_SECONDS = 0.2;

/**
 * Standard broadcast/camera frame rates.
 *
 * Measured rates are snapped to the nearest of these when within tolerance.
 * This matters at the 30 fps floor: NTSC video runs at 29.97, and a naive
 * `measured < 30` check would reject an enormous amount of legitimate footage.
 */
const STANDARD_FPS = [23.976, 24, 25, 29.97, 30, 48, 50, 59.94, 60, 90, 120];

/** Relative tolerance for snapping a measured rate to a standard one. */
const FPS_SNAP_TOLERANCE = 0.02;

function snapToStandardFps(measured: number): number {
  let closest = measured;
  let closestDelta = Infinity;

  for (const candidate of STANDARD_FPS) {
    const delta = Math.abs(candidate - measured) / candidate;
    if (delta < closestDelta) {
      closestDelta = delta;
      closest = candidate;
    }
  }

  if (closestDelta > FPS_SNAP_TOLERANCE) {
    return Math.round(measured * 100) / 100;
  }

  // 29.97 and 59.94 are the NTSC rates; report them as their nominal 30/60 so
  // the number shown to the user matches what their camera claims.
  if (closest === 29.97) return 30;
  if (closest === 59.94) return 60;
  if (closest === 23.976) return 24;
  return closest;
}

interface VideoFrameMetadata {
  mediaTime: number;
  presentedFrames: number;
}

type FrameCallbackVideo = HTMLVideoElement & {
  requestVideoFrameCallback?: (
    cb: (now: number, metadata: VideoFrameMetadata) => void
  ) => number;
  cancelVideoFrameCallback?: (handle: number) => void;
};

/**
 * Estimate frame rate by sampling presented frames during a brief playback.
 *
 * Returns null when `requestVideoFrameCallback` is unavailable (Firefox) or the
 * sample is too short to be meaningful. Callers must treat null as "unknown",
 * not as "invalid" — blocking a good file because the browser is reticent is
 * worse than letting the vendor make the call.
 */
function measureFps(video: FrameCallbackVideo): Promise<number | null> {
  return new Promise((resolve) => {
    if (typeof video.requestVideoFrameCallback !== 'function') {
      resolve(null);
      return;
    }

    let firstSample: VideoFrameMetadata | null = null;
    let handle: number | null = null;
    let settled = false;

    const finish = (value: number | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (handle !== null && typeof video.cancelVideoFrameCallback === 'function') {
        video.cancelVideoFrameCallback(handle);
      }
      video.pause();
      resolve(value);
    };

    const computeFrom = (last: VideoFrameMetadata): number | null => {
      if (!firstSample) return null;
      const frameSpan = last.presentedFrames - firstSample.presentedFrames;
      const timeSpan = last.mediaTime - firstSample.mediaTime;
      if (frameSpan <= 0 || timeSpan < FPS_MIN_SPAN_SECONDS) return null;
      return snapToStandardFps(frameSpan / timeSpan);
    };

    let lastSample: VideoFrameMetadata | null = null;

    const timer = setTimeout(() => {
      finish(lastSample ? computeFrom(lastSample) : null);
    }, FPS_SAMPLE_TIMEOUT_MS);

    const onFrame = (_now: number, metadata: VideoFrameMetadata) => {
      if (!firstSample) {
        firstSample = metadata;
      }
      lastSample = metadata;

      const frameSpan = metadata.presentedFrames - firstSample.presentedFrames;
      if (frameSpan >= FPS_SAMPLE_FRAMES) {
        finish(computeFrom(metadata));
        return;
      }

      handle = video.requestVideoFrameCallback!(onFrame);
    };

    handle = video.requestVideoFrameCallback(onFrame);

    // Autoplay policy requires muted playback. If play() is rejected outright we
    // simply report an unknown rate rather than failing the whole probe.
    video.play().catch(() => finish(null));
  });
}

/**
 * Read metadata from a local video file.
 *
 * @throws Error when the browser cannot decode the file at all — that is a real
 * validation failure (corrupt file, unsupported codec) and callers should
 * surface it.
 */
export async function probeVideo(file: File): Promise<VideoProbe> {
  const objectUrl = URL.createObjectURL(file);
  const video = document.createElement('video') as FrameCallbackVideo;

  try {
    video.preload = 'metadata';
    video.muted = true;
    video.playsInline = true;
    video.src = objectUrl;

    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error('Timed out reading video metadata.')),
        METADATA_TIMEOUT_MS
      );
      const cleanup = () => {
        clearTimeout(timer);
        video.removeEventListener('loadedmetadata', onLoaded);
        video.removeEventListener('error', onError);
      };
      const onLoaded = () => {
        cleanup();
        resolve();
      };
      const onError = () => {
        cleanup();
        reject(
          new Error(
            "Couldn't read this video. It may be corrupt or use a codec this browser can't decode."
          )
        );
      };
      video.addEventListener('loadedmetadata', onLoaded);
      video.addEventListener('error', onError);
    });

    const width = video.videoWidth;
    const height = video.videoHeight;
    const durationSeconds = Number.isFinite(video.duration) ? video.duration : 0;

    if (!width || !height) {
      throw new Error("Couldn't read this video's dimensions. It may not contain a video track.");
    }

    const fps = await measureFps(video);

    return {
      width,
      height,
      durationSeconds,
      fps,
      mimeType: file.type,
      sizeBytes: file.size,
    };
  } finally {
    // Order matters: detach the source before revoking, or Safari keeps a
    // handle on a multi-gigabyte blob for the life of the page.
    video.pause();
    video.removeAttribute('src');
    video.load();
    URL.revokeObjectURL(objectUrl);
  }
}
