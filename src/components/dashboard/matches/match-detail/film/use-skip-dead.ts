import { useCallback, useSyncExternalStore } from "react";

import {
  DEFAULT_SKIP_DEAD,
  readSkipDead,
  writeSkipDead,
} from "./film-room-prefs";

/**
 * The Skip dead time preference as React state, for the report player and
 * the room.
 *
 * Not a lazy `useState(readSkipDead)`: the report player is server-rendered
 * (its url comes with the match), and a lazy read of localStorage gives the
 * server one answer and a browser that stored "0" another — a different
 * glyph and label at hydration, React #418 on every Film tab for anyone who
 * turned skipping off. `useSyncExternalStore` takes the default as the
 * server snapshot, so the markup matches and the stored value lands in the
 * first client render. The room, mounted on click, gets the same hook for
 * the same answer — and both surfaces read one store, so a toggle in one is
 * seen by the other at once, and a `storage` event carries it across tabs.
 */

const listeners = new Set<() => void>();

/**
 * The value as this page last set it. With storage blocked, `writeSkipDead`
 * keeps nothing and `readSkipDead` would answer the default forever — the
 * glyph could never be turned off. This is what the toggle flips and the
 * snapshot reads then; with storage working it merely mirrors it.
 */
let current: boolean | null = null;

function snapshot(): boolean {
  return current ?? readSkipDead();
}

function subscribe(onChange: () => void): () => void {
  // Another tab wrote it: take storage's word over this page's last set.
  const fromStorage = () => {
    current = null;
    onChange();
  };
  listeners.add(onChange);
  window.addEventListener("storage", fromStorage);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", fromStorage);
  };
}

function serverSnapshot(): boolean {
  return DEFAULT_SKIP_DEAD;
}

export function useSkipDead(): [skipDead: boolean, toggle: () => void] {
  const skipDead = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  const toggle = useCallback(() => {
    current = !snapshot();
    writeSkipDead(current);
    for (const notify of listeners) notify();
  }, []);
  return [skipDead, toggle];
}
