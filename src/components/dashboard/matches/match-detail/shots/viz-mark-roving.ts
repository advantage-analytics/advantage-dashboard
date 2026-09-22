/**
 * The fullscreen viewer's marks are ONE tab stop, not N.
 *
 * Every mark used to carry `tabIndex={0}`, and the stage precedes the chrome
 * slabs in DOM order — so on `rallyPosition` a keyboard user pressed Tab once
 * per rally shot (150–250 in a full match) before reaching the View menu or
 * the zoom buttons. The readout being keyboard-reachable is right; being the
 * only route through the viewer is not.
 *
 * The APG pattern for that is a roving tabindex: exactly one mark is
 * `tabIndex=0` (the last one focused, or the first), the rest are `-1`, and
 * the arrows move focus WITHIN the group. This module is the pure half — what
 * the next index is — so it can be tested without a DOM.
 *
 * Ends CLAMP rather than wrap. Wrapping would send focus from the far corner
 * of the court to the opposite corner on one keypress, with the viewport
 * following it; stopping at the end is the quieter answer, and the key is
 * still consumed either way so the court never pans out from under a mark.
 */
export const MARK_ROVING_KEYS = [
  "ArrowRight",
  "ArrowDown",
  "ArrowLeft",
  "ArrowUp",
  "Home",
  "End",
] as const;

export type MarkRovingKey = (typeof MARK_ROVING_KEYS)[number];

/** True for a key this module handles — the viewer's window-level pan
 *  handler checks it so an arrow pressed on a mark moves focus, not the
 *  court. */
export function isMarkRovingKey(key: string): key is MarkRovingKey {
  return (MARK_ROVING_KEYS as readonly string[]).includes(key);
}

/**
 * The index to move focus to, or `null` when the key isn't ours or there is
 * nowhere to go (an empty list, or an out-of-range `current`). `null` also
 * comes back when the move would land on the index that already has focus,
 * so a caller never re-focuses the element it is already on.
 */
export function nextMarkIndex(
  current: number,
  count: number,
  key: string,
): number | null {
  if (count <= 0) return null;
  if (!Number.isInteger(current) || current < 0 || current >= count)
    return null;
  if (!isMarkRovingKey(key)) return null;

  let next: number;
  switch (key) {
    case "ArrowRight":
    case "ArrowDown":
      next = Math.min(current + 1, count - 1);
      break;
    case "ArrowLeft":
    case "ArrowUp":
      next = Math.max(current - 1, 0);
      break;
    case "Home":
      next = 0;
      break;
    case "End":
      next = count - 1;
      break;
  }
  return next === current ? null : next;
}
