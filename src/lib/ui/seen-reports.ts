/**
 * Which analyzed matches this device has already opened.
 *
 * There is no `viewed_at` column, so "new" is tracked client-side rather than
 * with a migration — a match id lands here the moment its report page mounts,
 * and stays until removed by hand. `localStorage`, not `sessionStorage`: the
 * whole point of "New" is that it survives the visit where a report finished,
 * not just the tab that was open when it did.
 *
 * A match a viewer has never opened is new by definition — there is nothing to
 * migrate from a fresh install, so an empty set correctly marks everything
 * unseen rather than everything seen.
 */

import { useEffect, useState } from "react";

const STORAGE_KEY = "advantage.seenReports";

/**
 * Fired in-tab whenever a report is marked seen. The `storage` event only
 * reaches OTHER tabs, and the Matches list stays mounted while a report is
 * open (the router keeps the page alive), so without this the list's dots were
 * computed once and never cleared after the report had been read.
 */
const SEEN_EVENT = "advantage:report-seen";

function readSet(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed)
      ? new Set(parsed.filter((v): v is string => typeof v === "string"))
      : new Set();
  } catch {
    return new Set();
  }
}

function writeSet(ids: Set<string>): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify([...ids]));
  } catch {
    // ignore quota / privacy mode
  }
}

export function isSeenReport(matchId: string): boolean {
  return readSet().has(matchId);
}

/** Every id NOT in this set, among the ones passed in, is unseen. */
export function unseenReportIds(matchIds: readonly string[]): string[] {
  const seen = readSet();
  return matchIds.filter((id) => !seen.has(id));
}

export function markReportSeen(matchId: string): void {
  const seen = readSet();
  if (seen.has(matchId)) return;
  seen.add(matchId);
  writeSet(seen);
  if (typeof window !== "undefined")
    window.dispatchEvent(new Event(SEEN_EVENT));
}

/**
 * Which of these ids are unseen, resolved after mount.
 *
 * Starts empty rather than reading `localStorage` during the initial render —
 * the server has no localStorage, so seeding this from it would render one
 * "New" count during SSR and a different one the instant hydration's effect
 * ran, which React reports as a mismatch.
 */
export function useUnseenReportIds(
  candidateIds: readonly string[],
): Set<string> {
  const key = candidateIds.join(",");
  const [unseen, setUnseen] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    const sync = () =>
      setUnseen(new Set(unseenReportIds(key ? key.split(",") : [])));
    sync();
    // Re-read when a report is opened here, in another tab, or when this page
    // is shown again after being kept alive in the background.
    window.addEventListener(SEEN_EVENT, sync);
    window.addEventListener("storage", sync);
    document.addEventListener("visibilitychange", sync);
    return () => {
      window.removeEventListener(SEEN_EVENT, sync);
      window.removeEventListener("storage", sync);
      document.removeEventListener("visibilitychange", sync);
    };
    // key is a stable join of candidateIds — re-derives whenever the id set changes.
  }, [key]);

  return unseen;
}
