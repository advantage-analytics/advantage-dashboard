/**
 * "New question" from the keyboard: ⇧⌘O on macOS, Ctrl+Shift+O elsewhere.
 *
 * Pure, so a spec can hold the matching: what counts is one modifier pair and
 * the O key, and nothing else held. The other platform's pair is refused on
 * purpose — Ctrl+Shift+O on a Mac is not this shortcut, and answering it
 * would take a chord the player may have bound to something else.
 */

/** The parts of a `KeyboardEvent` the matcher reads. */
export interface AskShortcutEvent {
  key: string;
  code?: string;
  shiftKey: boolean;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
}

export function isNewQuestionShortcut(
  event: AskShortcutEvent,
  mac: boolean,
): boolean {
  if (!event.shiftKey || event.altKey) return false;
  // `code` first: with Shift held some layouts report a different `key`.
  const isO = event.code ? event.code === "KeyO" : /^o$/i.test(event.key);
  if (!isO) return false;
  return mac
    ? event.metaKey && !event.ctrlKey
    : event.ctrlKey && !event.metaKey;
}

/** `navigator.platform` (or a user-agent string) → is this a Mac? */
export function isMacPlatform(platform: string): boolean {
  return /mac|iphone|ipad|ipod/i.test(platform);
}

/** The keycaps printed on the button, and the tooltip's one-string form. */
export function newQuestionKeys(mac: boolean): readonly string[] {
  return mac ? ["⇧", "⌘", "O"] : ["Ctrl", "⇧", "O"];
}
