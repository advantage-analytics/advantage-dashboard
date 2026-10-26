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

/**
 * Run `check` on the next frame and again after any change to the document,
 * at most once a frame, until it answers `true`. Everything the hint waits on
 * is a DOM change — the anchor mounting, a dialog or menu opening or closing,
 * the anchor leaving — so a `MutationObserver` wakes it exactly then, and a
 * page that sits still costs nothing: no per-frame loop for however long a
 * dialog stays open or an anchor stays away. Returns the cleanup.
 *
 * Here rather than in `hint-runner.tsx` because that file imports the
 * `markTourDone` server action, and the film player's hint
 * (`film/film-skip-dead-hint.tsx`) must not pull a `"use server"` module
 * into the Film tab — nor can the specs' webpack harnesses bundle one.
 */
export function watchDocument(check: () => boolean): () => void {
  let frame = 0;
  let done = false;
  const observer = new MutationObserver(() => schedule());
  function run() {
    frame = 0;
    if (done) return;
    if (check()) {
      done = true;
      observer.disconnect();
    }
  }
  function schedule() {
    if (!done && frame === 0) frame = requestAnimationFrame(run);
  }
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["role", "data-tour"],
  });
  schedule();
  return () => {
    done = true;
    observer.disconnect();
    if (frame) cancelAnimationFrame(frame);
  };
}
