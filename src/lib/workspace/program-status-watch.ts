/**
 * Notice a program's claim being decided while its coach is looking at it.
 *
 * `Workspace.programStatus` is read once, by the dashboard layout, and a soft
 * navigation never re-runs that layout. So an admin approving a claim changed
 * nothing on the coach's screen: "New match" stayed paused until they reloaded,
 * which is what a UGA coach had to do ten seconds after approval on a live demo.
 *
 * A poll and a focus check rather than a Realtime channel, because `programs`
 * is not in the `supabase_realtime` publication and this only runs for the few
 * minutes a program spends in review. Pure apart from what it is handed, so the
 * rules can be tested without a browser.
 */

export const PROGRAM_STATUS_POLL_MS = 30_000;

/** The one browser surface this needs, so a test can stand in for it. */
export interface WatchSurface {
  isHidden(): boolean;
  /** Fires when the tab regains focus or becomes visible. Returns its cleanup. */
  onReturn(listener: () => void): () => void;
  setInterval(run: () => void, ms: number): () => void;
}

/**
 * Calls `onDecided` once, the first time `read` answers with anything other
 * than `current`. A failed read (null) says nothing, so a dropped request can
 * never refresh the page. Returns the cleanup.
 */
export function watchProgramStatus({
  current,
  read,
  onDecided,
  surface,
}: {
  current: string;
  read: () => Promise<string | null>;
  onDecided: () => void;
  surface: WatchSurface;
}): () => void {
  let stopped = false;
  let reading = false;

  const stop = () => {
    stopped = true;
    stopReturn();
    stopInterval();
  };

  const check = async () => {
    if (stopped || reading || surface.isHidden()) return;
    reading = true;
    try {
      const status = await read();
      if (!stopped && status !== null && status !== current) {
        stop();
        onDecided();
      }
    } catch {
      // The next tick or focus asks again.
    } finally {
      reading = false;
    }
  };

  const stopReturn = surface.onReturn(() => void check());
  const stopInterval = surface.setInterval(
    () => void check(),
    PROGRAM_STATUS_POLL_MS,
  );
  // At once, because a coach can arrive from a page this was not watching on.
  void check();

  return stop;
}
