/**
 * Which text a session replay may show: an allowlist, never a blocklist.
 *
 * Replays mask every text node (`maskTextSelector: "*"` in
 * instrumentation-client.ts), because the dashboard shows athletes' names and
 * results — some of them minors. That left replays unreadable: a parent stuck
 * behind a red message on the upload wizard's last step could not be helped,
 * because nobody could read the message.
 *
 * So text stays masked unless an ancestor carries `data-ph-unmask`, and rrweb
 * asks `maskReplayText` about every node the selector caught. The rule for the
 * mark is the whole of the privacy argument:
 *
 *   **Put `replayUnmask()` only on an element whose text is written in the
 *   source** — a step title, a button's verb, a field caption. Never on one
 *   that renders a value: a name, a score, a file name, a date, a message from
 *   the server or an exception. An element that mixes the two keeps the value
 *   in a child carrying `replayMask()`, which re-masks it.
 *
 * An unmarked element stays masked, so forgetting the mark only costs a
 * readable replay — never a leaked name.
 *
 * Spread either onto the element: `<h1 {...replayUnmask()}>`.
 */

/** Text under this element reads through in session replays. */
export function replayUnmask(): { "data-ph-unmask": "" } {
  return { "data-ph-unmask": "" };
}

/** Text under this element is masked again, inside a `replayUnmask()` one. */
export function replayMask(): { "data-ph-mask": "" } {
  return { "data-ph-mask": "" };
}

/** The slice of `Element` this needs, so it can be tested without a DOM. */
export interface ReplayTextElement {
  closest(selector: string): ReplayTextElement | null;
  contains(other: object | null): boolean;
}

/**
 * rrweb's `maskTextFn`: called with a text node's content and its parent
 * element, for every node `maskTextSelector` caught.
 *
 * Masks as rrweb does by default — every non-space character becomes `*`, so
 * the replay keeps the text's shape — unless the nearest mark above is
 * `data-ph-unmask`.
 */
export function maskReplayText(
  text: string,
  element?: ReplayTextElement | null,
): string {
  const masked = text.replace(/\S/g, "*");
  const unmasked = element?.closest("[data-ph-unmask]");
  if (!element || !unmasked) return masked;
  // The nearer mark wins: a re-mask inside the unmasked region masks, and an
  // unmask region nested inside a re-mask reads through.
  const remasked = element.closest("[data-ph-mask]");
  return remasked && unmasked.contains(remasked) ? masked : text;
}
