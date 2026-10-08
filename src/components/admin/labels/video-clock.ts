import type { PlayingRow } from "@/lib/services/labels/playback";

/**
 * The console's video clock: where the player is, on the analysis clock, as a
 * tiny external store for `useSyncExternalStore`.
 *
 * Two clocks: the `<video>` element speaks FILE seconds; a label's `videoTime`
 * is on the ANALYSIS clock. `LabelVideo.startTimeSeconds` is the offset between
 * them, applied in label-video.tsx and label-film-stops.ts and nowhere else.
 *
 * Not React state: `timeupdate` fires about four times a second, and state
 * would re-render the whole rail on each. The console subscribes with the
 * playing row's key ({@link playingRowKey}) as its snapshot, so React
 * re-renders only when the video crosses into another stroke or point; the
 * snapshot is taken from the current rows, so a retimed stroke moves the
 * highlight at once.
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
