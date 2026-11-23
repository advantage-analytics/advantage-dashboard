/**
 * Capture one still from a local video file and store it as the match's
 * thumbnail — so a list row can show a small image instead of opening the
 * video.
 *
 * Runs in the browser against the file the person just picked, the same way
 * `useVideoFilmstrip` reads its frames: an object URL, a detached `<video>`,
 * one seek, one canvas draw. No bytes of the video leave the browser here.
 *
 * Best effort end to end. {@link saveMatchThumbnail} never throws and never
 * rejects: a browser that cannot decode the file, a seek that stalls or a
 * refused request all end the same way — no thumbnail, and the row draws its
 * fallback. Nothing about the upload waits on it or learns how it went.
 */

import {
  THUMBNAIL_CONTENT_TYPE,
  THUMBNAIL_HEIGHT_PX,
  THUMBNAIL_MAX_BYTES,
  THUMBNAIL_WIDTH_PX,
  thumbnailCaptureTime,
} from "@/lib/match-thumbnail";

const LOAD_TIMEOUT_MS = 15_000;
const SEEK_TIMEOUT_MS = 8_000;
const JPEG_QUALITY = 0.72;

function nextEvent(
  target: HTMLVideoElement,
  event: "loadeddata" | "seeked",
  timeoutMs: number,
): Promise<boolean> {
  return new Promise((resolve) => {
    const settle = (ok: boolean) => {
      clearTimeout(timer);
      target.removeEventListener(event, onDone);
      target.removeEventListener("error", onError);
      resolve(ok);
    };
    const onDone = () => settle(true);
    const onError = () => settle(false);
    const timer = setTimeout(() => settle(false), timeoutMs);
    target.addEventListener(event, onDone);
    target.addEventListener("error", onError);
  });
}

export interface ThumbnailWindow {
  /** Where play starts in the file: the trim start, or the first serve. */
  startSeconds?: number | null;
  /** Where the kept window ends, when it is narrower than the file. */
  endSeconds?: number | null;
}

/**
 * One 320×180 JPEG from `file`, or null when no frame could be read.
 *
 * Always 16:9: a video of another shape is fitted inside and letterboxed in
 * black, so every row's image has the same box and nothing is cropped.
 */
export async function captureVideoThumbnail(
  file: File,
  window: ThumbnailWindow = {},
): Promise<Blob | null> {
  if (typeof document === "undefined") return null;

  const objectUrl = URL.createObjectURL(file);
  const video = document.createElement("video");
  try {
    video.preload = "auto";
    video.muted = true;
    video.playsInline = true;
    video.src = objectUrl;

    // `loadeddata`, not `loadedmetadata`: Safari paints nothing to a canvas
    // until frame data has arrived, and the still would be solid black.
    if (!(await nextEvent(video, "loadeddata", LOAD_TIMEOUT_MS))) {
      return null;
    }
    if (!(video.videoWidth > 0 && video.videoHeight > 0)) return null;
    // No known length means no way to pick a frame past the warm-up; frame
    // zero is worse than no thumbnail, which the backfill can still fill.
    if (!(Number.isFinite(video.duration) && video.duration > 0)) return null;

    video.currentTime = thumbnailCaptureTime({
      durationSeconds: video.duration,
      startSeconds: window.startSeconds,
      endSeconds: window.endSeconds,
    });
    if (!(await nextEvent(video, "seeked", SEEK_TIMEOUT_MS))) return null;

    const canvas = document.createElement("canvas");
    canvas.width = THUMBNAIL_WIDTH_PX;
    canvas.height = THUMBNAIL_HEIGHT_PX;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    const scale = Math.min(
      THUMBNAIL_WIDTH_PX / video.videoWidth,
      THUMBNAIL_HEIGHT_PX / video.videoHeight,
    );
    const width = Math.round(video.videoWidth * scale);
    const height = Math.round(video.videoHeight * scale);
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(
      video,
      Math.round((THUMBNAIL_WIDTH_PX - width) / 2),
      Math.round((THUMBNAIL_HEIGHT_PX - height) / 2),
      width,
      height,
    );

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, THUMBNAIL_CONTENT_TYPE, JPEG_QUALITY),
    );
    if (!blob || blob.size === 0 || blob.size > THUMBNAIL_MAX_BYTES) {
      return null;
    }
    return blob;
  } catch {
    return null;
  } finally {
    // Same teardown order as the filmstrip: detach before revoking, or Safari
    // keeps a handle on a multi-gigabyte blob for the life of the page.
    video.pause();
    video.removeAttribute("src");
    video.load();
    URL.revokeObjectURL(objectUrl);
  }
}

/**
 * Capture a still from `file` and store it as `matchId`'s thumbnail.
 *
 * Fire and forget: `void saveMatchThumbnail(…)`. Resolves to whether an
 * image was stored, for a caller that cares; never rejects.
 */
export async function saveMatchThumbnail(
  matchId: string,
  file: File,
  window: ThumbnailWindow = {},
): Promise<boolean> {
  try {
    const image = await captureVideoThumbnail(file, window);
    if (!image) return false;
    const response = await fetch(
      `/api/matches/${encodeURIComponent(matchId)}/video/thumbnail`,
      {
        method: "POST",
        headers: { "Content-Type": THUMBNAIL_CONTENT_TYPE },
        body: image,
      },
    );
    return response.ok;
  } catch {
    return false;
  }
}
