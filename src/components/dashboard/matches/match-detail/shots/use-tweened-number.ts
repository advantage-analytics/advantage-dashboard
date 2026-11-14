"use client";

import { useEffect, useState } from "react";

/**
 * A figure that counts to its new value instead of jumping — the lightbox's
 * Statistics column and the court's band rates, so a pick or a filter reads
 * as the numbers CHANGING, and a figure that did not change sits still (the
 * motion itself says which ones moved).
 *
 * `--duration-reveal` on `--ease-chart` (`effects.css`): the data-transition
 * curve, at the reveal length — long enough to read as a count, short enough
 * not to feel like waiting. Interrupting a count starts the next one from
 * wherever it had reached. Nothing counts on mount, to or from "no value"
 * (`null`), or under `prefers-reduced-motion`: there the figure just changes.
 */
const DURATION_MS = 400;

/** `cubic-bezier(0.2, 0, 0.4, 1)` — `--ease-chart` — solved for y at x. */
function easeChart(x: number): number {
  const x1 = 0.2;
  const x2 = 0.4;
  const y1 = 0;
  const y2 = 1;
  const bez = (t: number, a: number, b: number) =>
    3 * a * t * (1 - t) ** 2 + 3 * b * t ** 2 * (1 - t) + t ** 3;
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 20; i++) {
    const mid = (lo + hi) / 2;
    if (bez(mid, x1, x2) < x) lo = mid;
    else hi = mid;
  }
  return bez((lo + hi) / 2, y1, y2);
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

interface Tween {
  from: number;
  to: number;
  value: number;
}

export function useTweenedNumber(target: number | null): number | null {
  const [last, setLast] = useState(target);
  const [tween, setTween] = useState<Tween | null>(null);

  // Render-phase: a new target starts a count from what is on screen now.
  if (last !== target) {
    setLast(target);
    const shown = tween?.value ?? last;
    setTween(
      shown !== null && target !== null && !prefersReducedMotion()
        ? { from: shown, to: target, value: shown }
        : null,
    );
  }

  const from = tween?.from ?? null;
  const to = tween?.to ?? null;
  useEffect(() => {
    if (from === null || to === null) return;
    let frame = 0;
    const start = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / DURATION_MS);
      if (t >= 1) {
        setTween(null);
        return;
      }
      const value = from + (to - from) * easeChart(t);
      setTween((prev) =>
        prev !== null && prev.to === to ? { ...prev, value } : prev,
      );
      frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [from, to]);

  if (target === null) return null;
  return Math.round(
    tween !== null && tween.to === target ? tween.value : target,
  );
}
