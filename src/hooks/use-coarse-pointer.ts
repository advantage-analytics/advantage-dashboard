"use client";

import { useSyncExternalStore } from "react";

/**
 * The `touch:` variant's question, asked from JavaScript: is the primary
 * pointer a finger? True on an iPad or a phone with nothing paired; false
 * with a mouse or a trackpad, which report `hover: hover`.
 *
 * For behaviour CSS cannot carry — a tooltip that opens on press-and-hold, a
 * popover that opens on tap instead of hover. False on the server and on the
 * first client render, so markup never depends on it during hydration.
 */
const QUERY = "(hover: none) and (pointer: coarse)";

function subscribe(onChange: () => void): () => void {
  const mql = window.matchMedia(QUERY);
  mql.addEventListener("change", onChange);
  return () => mql.removeEventListener("change", onChange);
}

export function useCoarsePointer(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(QUERY).matches,
    () => false,
  );
}
