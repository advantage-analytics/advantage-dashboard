"use client";

/**
 * useVideoFilmstrip — decode a strip of thumbnails from a local video File.
 *
 * Feeds the trim rail so the user scrubs against what they filmed rather than a
 * grey bar. Everything happens against the local file through an object URL; no
 * bytes leave the browser and nothing here touches the upload path.
 *
 * Seeks are strictly sequential. A video element services one seek at a time,
 * and these are multi-gigabyte 4K files — firing them in parallel (or across
 * several elements) multiplies decode cost for no wall-clock gain. Frames are
 * published as they land so the rail fills in progressively instead of sitting
 * empty until the last one decodes.
 *
 * Extraction is deliberately one pass over the WHOLE clip. The rail's precision
 * zoom is a transient that lives for the length of a drag, so re-sampling for a
 * zoomed window would deliver frames after the user has already let go.
 */

import { useEffect, useMemo, useState } from "react";

/** Frames sampled across the clip. Enough to read the shape of a match at 1×. */
const DEFAULT_FRAME_COUNT = 20;

/** Thumbnail height in device pixels — 2× a 56px rail, so it stays crisp. */
const THUMB_HEIGHT_PX = 112;

/** Fallback aspect when the browser reports no intrinsic size. */
const FALLBACK_ASPECT = 16 / 9;

const LOAD_TIMEOUT_MS = 15_000;
const SEEK_TIMEOUT_MS = 4_000;
const JPEG_QUALITY = 0.55;

export interface VideoFilmstrip {
  /** One slot per sample, in time order. `null` until that frame decodes. */
  frames: (string | null)[];
  /** True while frames are still landing. */
  isExtracting: boolean;
  /** True when no frame could be decoded at all — callers should fall back. */
  unavailable: boolean;
}

const EMPTY: VideoFilmstrip = { frames: [], isExtracting: false, unavailable: false };

/** Reported for a file whose extraction job hasn't published anything yet. */
const PENDING: VideoFilmstrip = { frames: [], isExtracting: true, unavailable: false };

/** Published frames, tagged with the file they came from. */
interface StripState extends VideoFilmstrip {
  source: File | null;
}

/**
 * Resolve on `event`, or `false` on error/timeout.
 *
 * A single stuck seek must not strand the whole strip, so every wait is bounded
 * and a failed sample is skipped rather than thrown.
 */
function nextEvent(
  target: HTMLVideoElement,
  event: "loadeddata" | "seeked",
  timeoutMs: number
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

export function useVideoFilmstrip(
  file: File | null,
  durationSeconds: number,
  frameCount: number = DEFAULT_FRAME_COUNT
): VideoFilmstrip {
  const [state, setState] = useState<StripState>({ source: null, ...EMPTY });
  const active = !!file && durationSeconds > 0 && frameCount > 0;

  useEffect(() => {
    if (!file || durationSeconds <= 0 || frameCount <= 0) return;

    let cancelled = false;
    const objectUrl = URL.createObjectURL(file);
    const video = document.createElement("video");
    const canvas = document.createElement("canvas");

    const publish = (index: number, dataUrl: string) => {
      setState((prev) => {
        const frames = prev.frames.slice();
        frames[index] = dataUrl;
        return { ...prev, frames };
      });
    };

    // Every write lives inside the job rather than the effect body: this hook
    // is a subscription to an external producer (the decoder), and publishing
    // from the effect body instead would be a synchronous cascade.
    void (async () => {
      let decoded = 0;
      try {
        setState({
          source: file,
          frames: new Array(frameCount).fill(null),
          isExtracting: true,
          unavailable: false,
        });

        // `auto` rather than `metadata`: every sample is a seek, and starting
        // from metadata-only makes the first few stall while data arrives.
        video.preload = "auto";
        video.muted = true;
        video.playsInline = true;
        video.src = objectUrl;

        if (!(await nextEvent(video, "loadeddata", LOAD_TIMEOUT_MS))) return;
        if (cancelled) return;

        const aspect =
          video.videoWidth > 0 && video.videoHeight > 0
            ? video.videoWidth / video.videoHeight
            : FALLBACK_ASPECT;
        canvas.height = THUMB_HEIGHT_PX;
        canvas.width = Math.max(1, Math.round(THUMB_HEIGHT_PX * aspect));

        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        // Nudge off the very last frame: seeking exactly to `duration` lands
        // past the final sample on some containers and yields a black frame.
        const lastSeekable = Math.max(0, durationSeconds - 0.05);

        for (let i = 0; i < frameCount; i++) {
          if (cancelled) return;

          // Sample at slot centres so the first thumb isn't frame zero, which
          // is a fade-in or a lens cap more often than it is the court.
          video.currentTime = Math.min(((i + 0.5) / frameCount) * durationSeconds, lastSeekable);
          if (!(await nextEvent(video, "seeked", SEEK_TIMEOUT_MS))) continue;
          if (cancelled) return;

          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          publish(i, canvas.toDataURL("image/jpeg", JPEG_QUALITY));
          decoded++;
        }
      } catch {
        // Fall through to the unavailable flag below — a browser that refuses
        // to paint this codec to a canvas is a degraded rail, not a failed
        // upload. The probe has already accepted the file.
      } finally {
        if (!cancelled) {
          setState((prev) => ({ ...prev, isExtracting: false, unavailable: decoded === 0 }));
        }
      }
    })();

    return () => {
      cancelled = true;
      // Same teardown order as probe.ts: detach before revoking, or Safari
      // keeps a handle on a multi-gigabyte blob for the life of the page.
      video.pause();
      video.removeAttribute("src");
      video.load();
      URL.revokeObjectURL(objectUrl);
    };
  }, [file, durationSeconds, frameCount]);

  // Frames are only reported for the file they were decoded from. Without the
  // tag, swapping videos would show the previous one's thumbnails for the
  // render or two before the new job's first publish lands.
  return useMemo<VideoFilmstrip>(() => {
    if (!active) return EMPTY;
    if (state.source !== file) return PENDING;
    return {
      frames: state.frames,
      isExtracting: state.isExtracting,
      unavailable: state.unavailable,
    };
  }, [active, file, state]);
}
