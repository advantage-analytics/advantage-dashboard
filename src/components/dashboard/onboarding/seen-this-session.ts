import type { SeenId } from "@/lib/onboarding/tours";

/**
 * The this-session half of a tour's or hint's seen-state, shared by
 * `TourRunner` and `HintRunner`. `markTourDone` stamps the `users` column for
 * next session; `sessionStorage["tour-done:<id>:<viewerId>"]` stops THIS
 * session re-opening it before the server has re-read the row, and still
 * holds when the action fails. Keyed by viewer, so a sign-out and sign-in as
 * someone else in one tab is not blocked by the first viewer's guard.
 */

const guardKey = (id: SeenId, viewerId: string) =>
  `tour-done:${id}:${viewerId}`;

export function seenThisSession(id: SeenId, viewerId: string): boolean {
  try {
    return sessionStorage.getItem(guardKey(id, viewerId)) !== null;
  } catch {
    return false;
  }
}

export function rememberSeen(id: SeenId, viewerId: string) {
  try {
    sessionStorage.setItem(guardKey(id, viewerId), "1");
  } catch {
    // Private windows and blocked storage: the server stamp still lands.
  }
}

/** The element carrying `data-tour="<target>"`, if it is in the document. */
export function findTarget(target: string): HTMLElement | null {
  return document.querySelector<HTMLElement>(`[data-tour="${target}"]`);
}
