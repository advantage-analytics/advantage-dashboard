"use client";

import { useLayoutEffect, useRef, type RefObject } from "react";

/** Crossfade the complete viewer as a single surface. No moving crop,
 * stretched court, or separately staged controls. */
export function useFullscreenReveal(rootRef: RefObject<HTMLDivElement | null>) {
  const animation = useRef<Animation | null>(null);
  const closing = useRef(false);
  const mounted = useRef(false);
  const entranceFrame = useRef<number | null>(null);

  function play(entering: boolean) {
    const root = rootRef.current;
    if (!root?.animate) return null;
    // Read the current frame before cancelling so Escape during entrance
    // reverses smoothly rather than flashing the fully open viewer.
    const current = getComputedStyle(root);
    const start = { opacity: current.opacity };
    const keyframes: Keyframe[] = entering
      ? [{ opacity: 0 }, { opacity: 1 }]
      : [{ opacity: 1 }, { opacity: 0 }];
    if (
      !entering &&
      animation.current &&
      animation.current.playState !== "idle" &&
      animation.current.playState !== "finished"
    ) {
      keyframes[0] = start;
    }
    animation.current?.cancel();
    const reduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const token = entering && !reduced ? "--duration-hover" : "--duration-fast";
    // CSS optimizers may serialize 400ms as .4s. WAAPI always expects ms.
    const cssTime = current.getPropertyValue(token).trim();
    const time = cssTime.match(/^(\d*\.?\d+)(ms|s)$/);
    const duration = time
      ? Number(time[1]) * (time[2] === "s" ? 1000 : 1)
      : entering && !reduced
        ? 200
        : 150;
    const next = root.animate(keyframes, {
      duration,
      easing: current.getPropertyValue("--ease-primary").trim() || "ease-out",
      fill: "both",
    });
    animation.current = next;
    return next;
  }

  useLayoutEffect(() => {
    mounted.current = true;
    closing.current = false;
    const enter = play(true);
    // Stage measurement and fitting also run in layout effects. Keep the
    // entrance at its first frame until those synchronous renders finish,
    // so initial work cannot consume the animation before the first paint.
    enter?.pause();
    entranceFrame.current = requestAnimationFrame(() => {
      entranceFrame.current = null;
      if (!closing.current) enter?.play();
    });
    // Release the finished opacity effect once the viewer has arrived.
    enter?.finished.then(
      () => enter.cancel(),
      () => {},
    );
    return () => {
      mounted.current = false;
      if (entranceFrame.current !== null)
        cancelAnimationFrame(entranceFrame.current);
      animation.current?.cancel();
    };
    // This effect owns the portal's lifetime, not its filter/render updates.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (onExited: () => void) => {
    if (closing.current) return;
    closing.current = true;
    if (entranceFrame.current !== null)
      cancelAnimationFrame(entranceFrame.current);
    const leave = play(false);
    if (!leave) {
      onExited();
      return;
    }
    void leave.finished.then(
      () => {
        if (mounted.current) onExited();
      },
      () => {
        if (mounted.current) onExited();
      },
    );
  };
}
