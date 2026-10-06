import type { PlayingRow } from "@/lib/services/labels/playback";

/**
 * The console's video clock: where the player is, on the analysis clock,
 * as a tiny external store for `useSyncExternalStore`.
 *
 * Not React state. `timeupdate` fires about four times a second and a seek
 * fires `seeking` on every scrub step; state would re-render the whole points
 * rail on each. The console subscribes with a snapshot that is the PLAYING
 * ROW's key ({@link playingRowKey}), so React re-renders only when the video
 * crosses into another stroke or point — and, because the snapshot is taken
 * from the current rows on every render, an edit that retimes a stroke moves
 * the highlight at once, even with the video paused.
 */
export interface VideoClock {
  get: () => number | null;
  set: (time: number | null) => void;
  subscribe: (listener: () => void) => () => void;
}

export function createVideoClock(initial: number | null = null): VideoClock {
  let time = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => time,
    set(next) {
      if (next === time) return;
      time = next;
      for (const listener of listeners) listener();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

/** A string, so two snapshots of the same rows compare equal with `===`. */
export function playingRowKey(row: PlayingRow | null): string {
  return row ? `${row.pointId}\n${row.shotId}` : "";
}

export function parsePlayingRowKey(key: string): PlayingRow | null {
  if (!key) return null;
  const [pointId, shotId] = key.split("\n");
  return { pointId, shotId };
}
