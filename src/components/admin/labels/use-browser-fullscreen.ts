"use client";

import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";

/**
 * The browser's own full screen, for the console's two full-screen layouts.
 *
 * "Full screen" and "Film full screen" are `fixed inset-0` layers: they fill
 * the browser's viewport, and the browser's tabs and address bar stay above
 * them. This is the second step — the Fullscreen API — that takes those away
 * too, so the film has the whole display.
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
 * and a refusal is swallowed: the button simply stays off.
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

/** The control's words. Never the layout's own "Exit full screen". */
export const WHOLE_SCREEN_COPY = {
  enter: "Fill the whole screen",
  leave: "Leave the whole screen",
  detail: "Hides the browser's bars · Esc leaves",
} as const;

/** What a view needs to draw the control. */
export interface BrowserFullscreenControl {
  /** The browser can do it; false on the server and until mounted. */
  supported: boolean;
  /** The page is in the browser's full screen right now. */
  active: boolean;
  /** Enter or leave — call it from the click, which is the gesture. */
  toggle: () => void;
}

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
 * Enters when nothing is fullscreened, leaves when something is. Resolves
 * with the state it asked for and whether the browser went along.
 */
export async function toggleFullscreen(
  doc: FullscreenDocument,
): Promise<{ asked: "enter" | "exit"; ok: boolean }> {
  if (fullscreenActive(doc)) {
    return { asked: "exit", ok: await exitFullscreen(doc) };
  }
  return { asked: "enter", ok: await enterFullscreen(doc) };
}

const neverChanges = () => () => {};
const notActive = () => false;
const readSupported = () => fullscreenSupported(document);
const readActive = () => fullscreenActive(document);

/**
 * The control's state and its verbs.
 *
 * `enter()` is for the console, when the labeller chooses the full-screen
 * layout: it must run inside that click, which is the gesture the browser
 * asks for. Nothing happens where it is already on or not offered.
 *
 * `leave()` is for the console, when a full-screen layout goes away: it
 * leaves the browser's full screen only if THIS hook entered it and it is
 * still on — a full screen the labeller got some other way is theirs. The
 * same runs on unmount. The browser's own Esc leaves the browser's full
 * screen and nothing else; the layout stays as it is.
 *
 * `initialSupported` is the server render's answer, for specs: there is no
 * document there, so it is false unless a spec says otherwise. Once mounted
 * the real document decides.
 */
export function useBrowserFullscreen(
  initialSupported?: boolean,
): BrowserFullscreenControl & { enter: () => void; leave: () => void } {
  // Entered by this hook's own toggle, and not left since.
  const entered = useRef(false);

  const supported = useSyncExternalStore(
    neverChanges,
    readSupported,
    () => initialSupported ?? false,
  );
  const subscribe = useCallback((onChange: () => void) => {
    const changed = () => {
      // Left by any road — Esc, the browser's own control, this button.
      if (!fullscreenActive(document)) entered.current = false;
      onChange();
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
  const active = useSyncExternalStore(subscribe, readActive, notActive);

  const toggle = useCallback(() => {
    const entering = !fullscreenActive(document);
    entered.current = entering;
    void toggleFullscreen(document).then(({ asked, ok }) => {
      // Refused: nothing was entered, so there is nothing to leave later.
      if (asked === "enter" && !ok) entered.current = false;
    });
  }, []);

  const enter = useCallback(() => {
    if (!fullscreenSupported(document) || fullscreenActive(document)) return;
    entered.current = true;
    void enterFullscreen(document).then((ok) => {
      if (!ok) entered.current = false;
    });
  }, []);

  const leave = useCallback(() => {
    if (!entered.current) return;
    entered.current = false;
    if (fullscreenActive(document)) void exitFullscreen(document);
  }, []);
  useEffect(() => leave, [leave]);

  return { supported, active, toggle, enter, leave };
}
