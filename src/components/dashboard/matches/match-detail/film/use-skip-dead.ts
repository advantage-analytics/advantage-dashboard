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

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  window.addEventListener("storage", onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}

function serverSnapshot(): boolean {
  return DEFAULT_SKIP_DEAD;
}

export function useSkipDead(): [skipDead: boolean, toggle: () => void] {
  const skipDead = useSyncExternalStore(
    subscribe,
    readSkipDead,
    serverSnapshot,
  );
  const toggle = useCallback(() => {
    writeSkipDead(!readSkipDead());
    for (const notify of listeners) notify();
  }, []);
  return [skipDead, toggle];
}
