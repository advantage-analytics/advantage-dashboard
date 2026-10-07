"use client";

import { useCallback, useEffect, useRef } from "react";

/**
 * The browser's own full screen, which is the console's full-screen layout: the
 * black layout (`label-black-view.tsx`) and the Fullscreen API are one state,
 * entered and left together. A browser with no Fullscreen API (`"unsupported"`)
 * shows the layer alone.
 *
 * - Asked of `document.documentElement`, never of the layer: the API shows only
 *   the fullscreened element's subtree, and menus, confirms and tooltips portal
 *   to `body`.
 * - Safari needs the `webkit` spellings on older versions; its
 *   `webkitRequestFullscreen` returns nothing rather than a promise.
 * - A browser may refuse (no gesture, a denied permission). A refusal is
 *   reported (`"refused"`), never thrown, and the console goes back to docked.
 * - Nothing is remembered: without a gesture a stored choice could not be
 *   restored on reload.
 *
 * The helpers take the document as an argument, so a spec drives them with a
 * plain object.
 */

type MaybePromise = Promise<unknown> | void;

/** The slice of `Document` the helpers read — standard and `webkit`. */
export interface FullscreenDocument {
  fullscreenEnabled?: boolean;
  fullscreenElement?: unknown;
  exitFullscreen?: () => MaybePromise;
  webkitFullscreenEnabled?: boolean;
  webkitFullscreenElement?: unknown;
  webkitExitFullscreen?: () => MaybePromise;
  documentElement: {
    requestFullscreen?: (options?: { navigationUI?: "hide" }) => MaybePromise;
    webkitRequestFullscreen?: () => MaybePromise;
  } | null;
}

/** Both spellings: an old Safari fires only the prefixed one. */
export const FULLSCREEN_EVENTS = [
  "fullscreenchange",
  "webkitfullscreenchange",
] as const;

export function fullscreenSupported(doc: FullscreenDocument): boolean {
  const root = doc.documentElement;
  if (!root) return false;
  if (
    doc.fullscreenEnabled === true &&
    typeof root.requestFullscreen === "function"
  ) {
    return true;
  }
  return (
    doc.webkitFullscreenEnabled === true &&
    typeof root.webkitRequestFullscreen === "function"
  );
}

export function fullscreenActive(doc: FullscreenDocument): boolean {
  return (
    (doc.fullscreenElement ?? doc.webkitFullscreenElement ?? null) !== null
  );
}

/** Runs a request and reports whether it went through; never throws. */
async function attempt(request: () => MaybePromise): Promise<boolean> {
  try {
    await request();
    return true;
  } catch {
    return false;
  }
}

/** Asks for the page full screen; false when refused. Never rejects. */
export function enterFullscreen(doc: FullscreenDocument): Promise<boolean> {
  const root = doc.documentElement;
  if (!root || !fullscreenSupported(doc)) return Promise.resolve(false);
  if (
    doc.fullscreenEnabled === true &&
    typeof root.requestFullscreen === "function"
  ) {
    return attempt(() => root.requestFullscreen?.({ navigationUI: "hide" }));
  }
  return attempt(() => root.webkitRequestFullscreen?.());
}

/** Leaves full screen. Resolves false when there was no way to; never rejects. */
export function exitFullscreen(doc: FullscreenDocument): Promise<boolean> {
  if (typeof doc.exitFullscreen === "function") {
    return attempt(() => doc.exitFullscreen?.());
  }
  if (typeof doc.webkitExitFullscreen === "function") {
    return attempt(() => doc.webkitExitFullscreen?.());
  }
  return Promise.resolve(false);
}

/**
 * How a request for the full screen came out:
 * - `"entered"` — the page is in the browser's full screen (it went along,
 *   or something had already put it there);
 * - `"refused"` — the browser has a full screen and would not give it;
 * - `"unsupported"` — the browser has none to give.
 */
export type FullscreenEntry = "entered" | "refused" | "unsupported";

/** Asks for the whole page full screen and says how it came out. */
export async function requestFullscreen(
  doc: FullscreenDocument,
): Promise<FullscreenEntry> {
  if (!fullscreenSupported(doc)) return "unsupported";
  if (fullscreenActive(doc)) return "entered";
  return (await enterFullscreen(doc)) ? "entered" : "refused";
}

/**
 * `enter()` must run inside the click that chose the full-screen layout: the
 * gesture the browser asks for. `leave()` leaves the browser's full screen only
 * if this hook entered it and it is still on; the same runs on unmount.
 * `onLeft` is called when the page leaves the browser's full screen by any
 * road, and only from a real change event, so a first render of the full-screen
 * layout is not bounced.
 */
export function useBrowserFullscreen(onLeft?: () => void): {
  enter: () => Promise<FullscreenEntry>;
  leave: () => void;
} {
  // Entered by this hook's own `enter`, and not left since.
  const entered = useRef(false);
  // The latest `onLeft`, so the listener is bound once.
  const left = useRef(onLeft);
  useEffect(() => {
    left.current = onLeft;
  });

  useEffect(() => {
    const changed = () => {
      if (fullscreenActive(document)) return;
      // Left by any road — Esc, the browser's own control, `leave()`.
      entered.current = false;
      left.current?.();
    };
    for (const name of FULLSCREEN_EVENTS) {
      document.addEventListener(name, changed);
    }
    return () => {
      for (const name of FULLSCREEN_EVENTS) {
        document.removeEventListener(name, changed);
      }
    };
  }, []);

  const enter = useCallback(async (): Promise<FullscreenEntry> => {
    // Already on by some other road: nothing of ours to leave later.
    const ours = !fullscreenActive(document);
    if (ours) entered.current = true;
    const outcome = await requestFullscreen(document);
    // Refused or not offered: nothing was entered, so nothing to leave.
    if (ours && outcome !== "entered") entered.current = false;
    return outcome;
  }, []);

  const leave = useCallback(() => {
    if (!entered.current) return;
    entered.current = false;
    if (fullscreenActive(document)) void exitFullscreen(document);
  }, []);
  useEffect(() => leave, [leave]);

  return { enter, leave };
}
