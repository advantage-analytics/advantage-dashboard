"use client";

import { useCallback, useEffect, type RefObject } from "react";

/**
 * The film's clock as CSS custom properties, written every frame.
 *
 * `timeupdate` fires about four times a second, so a progress rule or a
 * playhead driven by React state steps visibly — a 2px bar jumping in quarter
 * second hops reads as lag, not playback. This writes `--film-t` (seconds) and
 * `--film-d` (duration) onto an ancestor on every animation frame while the
 * video plays, and once on every seek or metadata change while it doesn't.
 * The bars read those variables in CSS (`scaleX(...)`, a gradient stop, a
 * `translateX(...)`), so the motion is continuous and costs no React render.
 *
 * React state still drives everything that is text or identity — which row
 * is playing, the clock readout — at the element's own cadence.
 */

/** `transform` for a fill that grows across a window as the film plays. */
export function filmProgressTransform(start: number, end: number): string {
  const span = Math.max(end - start, 0.001);
  return `scaleX(clamp(0, calc((var(--film-t, 0) - ${start}) / ${span}), 1))`;
}

export function useFilmClockVars(
  videoRef: RefObject<HTMLVideoElement | null>,
  targetRef: RefObject<HTMLElement | null>,
  playing: boolean,
): () => void {
  const sync = useCallback(() => {
    const video = videoRef.current;
    const target = targetRef.current;
    if (!video || !target) return;
    target.style.setProperty("--film-t", String(video.currentTime));
    if (Number.isFinite(video.duration) && video.duration > 0) {
      target.style.setProperty("--film-d", String(video.duration));
    }
  }, [videoRef, targetRef]);

  useEffect(() => {
    if (!playing) {
      sync();
      return;
    }
    let frame = 0;
    const tick = () => {
      sync();
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing, sync]);

  return sync;
}
