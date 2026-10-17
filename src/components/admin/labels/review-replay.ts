/**
 * A review step's end-of-point replay, run: the film seeks to the window's
 * start and plays, and a subscription on the console's clock pauses it at
 * the stop. The labeller moving the film themselves (a scrub, a step — any
 * tick that is not playback, `replayTick`) lets the replay go without
 * pausing anything; the console cancels it outright on a jump, a selection,
 * an answer or a key of its own. One replay at a time: starting another
 * cancels the one running.
 */

import {
  replayTick,
  type ReplayWindow,
} from "@/lib/services/labels/review-flow";

/** What the replay needs of the player and the clock. */
export interface ReplayDeps {
  seekTo: (videoTime: number) => void;
  play: () => void;
  pause: () => void;
  clock: {
    get: () => number | null;
    subscribe: (listener: () => void) => () => void;
  };
}

export interface ReplayHandle {
  /** Let the replay go without touching the film. */
  cancel: () => void;
  /** Whether it is still waiting for its stop. */
  running: () => boolean;
}

export function runReplay(
  window: ReplayWindow,
  deps: ReplayDeps,
): ReplayHandle {
  let active = true;
  let last: number | null = null;
  let unsubscribe = () => {};
  const finish = () => {
    if (!active) return;
    active = false;
    unsubscribe();
  };
  // The seek is the one that wins: subscribed before it, the subscription
  // would read the seek's own landing as a jump and let go at once.
  deps.seekTo(window.start);
  unsubscribe = deps.clock.subscribe(() => {
    if (!active) return;
    const now = deps.clock.get();
    if (now === null) return;
    const verdict = replayTick(window, last, now);
    last = now;
    if (verdict === "run") return;
    finish();
    if (verdict === "stop") deps.pause();
  });
  deps.play();
  return { cancel: finish, running: () => active };
}
