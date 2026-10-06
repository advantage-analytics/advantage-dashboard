"use client";

import { useCallback, useEffect, useRef } from "react";

/**
 * The browser's own full screen — which IS the console's full-screen layout.
 *
 * "Full screen" means the whole display: the black layout
 * (`label-black-view.tsx`, a `fixed inset-0` layer) and the Fullscreen API
 * are one state, entered together and left together. There is no black
 * layout under the browser's tabs and address bar, and no separate control
 * for the second step. The one exception is a browser with no Fullscreen API
 * at all (`"unsupported"`): there the layer alone is the only full screen
 * there can be, so the feature is not lost.
 *
 * It is asked of `document.documentElement`, the whole page, never of the
 * layer: the Fullscreen API shows only the fullscreened element's subtree,
 * and every menu, confirm and tooltip here portals to `body` (see the top of
 * `film-fullscreen.tsx`). With the page itself fullscreened they stay
 * visible.
 *
 * Safari still needs the `webkit` spellings on older versions, so each read
 * falls back to them; its `webkitRequestFullscreen` returns nothing rather
 * than a promise, which the helpers allow for. A browser may refuse — no
 * gesture, a denied permission, an embedding frame without the allowance —
 * and a refusal is reported (`"refused"`), never thrown: the console goes
 * back to its docked layout.
 *
 * Nothing is remembered. A browser refuses full screen without a gesture, so
 * a stored choice could never be restored on reload.
 *
 * The helpers take the document as an argument, so a spec drives them with a
 * plain object; the hook is the only thing here that touches the real one,
 * and only after mount.
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

/** Can this document be fullscreened, by either spelling? */
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

/** Is anything fullscreened in this document? */
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

/**
 * Asks for the whole page full screen. Resolves false when the browser has
 * no such thing or refuses; never rejects.
 */
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
 * What a `fullscreenchange` means to whoever is listening: `true` when the
 * page has LEFT the browser's full screen. Only ever asked from the event —
 * a document that was never fullscreened has left nothing.
 */
export function fullscreenLeft(doc: FullscreenDocument): boolean {
  return !fullscreenActive(doc);
}

/**
 * The console's two verbs, and the one thing it is told.
 *
 * `enter()` runs when the labeller chooses the full-screen layout: it must
 * run inside that click, which is the gesture the browser asks for. It
 * resolves with how the request came out ({@link FullscreenEntry}).
 *
 * `leave()` runs when the full-screen layout goes away: it leaves the
 * browser's full screen only if THIS hook entered it and it is still on — a
 * full screen the labeller got some other way is theirs. The same runs on
 * unmount.
 *
 * `onLeft` is called when the page leaves the browser's full screen by ANY
 * road — the browser's own Esc or control, or `leave()` — and only from a
 * real change event: never for the not-active state a page starts in, so a
 * first render (or a static one) of the full-screen layout is not bounced.
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
      if (!fullscreenLeft(document)) return;
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
