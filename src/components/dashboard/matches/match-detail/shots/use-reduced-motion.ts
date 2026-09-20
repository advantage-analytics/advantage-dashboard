"use client";

import { useSyncExternalStore } from "react";

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

function subscribeReducedMotion(onChange: () => void): () => void {
  const mq = window.matchMedia(REDUCED_MOTION_QUERY);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

function getReducedMotionSnapshot(): boolean {
  return window.matchMedia(REDUCED_MOTION_QUERY).matches;
}

function getReducedMotionServerSnapshot(): boolean {
  return false;
}

/**
 * `useSyncExternalStore` rather than an effect + `useState` — the same
 * value, but read as React's own recommended way to subscribe to an
 * external source of truth (the browser's media query), which sidesteps
 * `react-hooks/set-state-in-effect` entirely instead of triggering it.
 *
 * Originally lived inline in `saved-views-band.tsx` (its reorder
 * animation's own reduced-motion check); pulled out here, unchanged, so F5's
 * wall ↔ focused transition (`viz-state-context.tsx`'s `runCourtMorph`,
 * `court-tile.tsx`, `viz-focused.tsx`) reads the SAME preference instead of
 * standing up a second `useSyncExternalStore` that could drift from the
 * first — the task brief for F5 calls this out by name: "reuse that hook."
 */
export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribeReducedMotion,
    getReducedMotionSnapshot,
    getReducedMotionServerSnapshot,
  );
}
