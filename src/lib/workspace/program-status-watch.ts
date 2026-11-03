/**
 * Notice a program's claim being decided while its coach is looking at it.
 *
 * `Workspace.programStatus` is read once, by the dashboard layout, and a soft
 * navigation never re-runs that layout. So an admin's decision changed nothing
 * on an open dashboard until a reload: on a program with players or matches,
 * "New match" stayed paused after approval.
 *
 * A poll and a focus check rather than a Realtime channel, because `programs`
 * is not in the `supabase_realtime` publication and this only runs for the few
 * minutes a program spends in review. Pure apart from what it is handed, so the
 * rules can be tested without a browser.
 */

export const PROGRAM_STATUS_POLL_MS = 30_000;

/**
 * How long one read may take before it counts as failed. supabase-js sets no
 * timeout, and a fetch left hanging by a sleeping laptop would otherwise hold
 * `reading` true and turn every later check away.
 */
export const PROGRAM_STATUS_READ_TIMEOUT_MS = 10_000;

/**
 * Routes where a refresh would cost the coach work: both mount the upload flow,
 * whose file selection does not survive one (see `WorkspaceSync`), and
 * SwingVision imports run on them during review. Leaving checks again.
 */
const UPLOAD_FLOW_ROUTES = ["/dashboard/matches/new", "/dashboard/team/upload"];

export function holdsUploadFlow(pathname: string): boolean {
  return UPLOAD_FLOW_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`),
  );
}

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
  readTimeoutMs = PROGRAM_STATUS_READ_TIMEOUT_MS,
}: {
  current: string;
  read: () => Promise<string | null>;
  onDecided: () => void;
  surface: WatchSurface;
  readTimeoutMs?: number;
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
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const status = await Promise.race([
        read(),
        new Promise<null>((resolve) => {
          timer = setTimeout(() => resolve(null), readTimeoutMs);
        }),
      ]);
      if (!stopped && status !== null && status !== current) {
        stop();
        onDecided();
      }
    } catch {
      // The next tick or focus asks again.
    } finally {
      clearTimeout(timer);
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
