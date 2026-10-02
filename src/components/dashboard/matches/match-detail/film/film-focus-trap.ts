/**
 * The film room's focus trap, as one pure step (H2 R1: "focus trapped").
 *
 * JSX-free and DOM-free on purpose. The room collects its own focusables — it
 * is the only thing that knows which of them are currently drawn — and asks
 * this module the single question a trap actually has to answer: given the
 * ring, where focus is now, and whether Shift was held, what takes focus next?
 * Everything else about trapping (when to stand down, what to restore on
 * unmount) is the room's, and it can be tested here without a browser.
 *
 * Deliberately NOT `@radix-ui/react-focus-scope`: it is in `node_modules` only
 * as a transitive dependency of the Radix primitives this app uses, so
 * importing it would mean either adding it to `package.json` or depending on
 * someone else's lockfile resolution. The question is three lines of modular
 * arithmetic; it does not need a scope component.
 */

/**
 * What counts as focusable, for the room's own query.
 *
 * The selector is data, so it lives beside the function that consumes its
 * result. It is deliberately permissive — the caller filters out what is
 * hidden or has been taken out of the tab order (`tabIndex < 0`), because only
 * the DOM knows that, and only at the moment Tab is pressed.
 */
export const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
  '[contenteditable]:not([contenteditable="false"])',
].join(",");

/**
 * The element Tab should move to, or null when there is nowhere to go.
 *
 * `focusables` is the ring in tab order. `active` is what holds focus now;
 * when it is not in the ring — focus on the room root itself, on `body`, or on
 * something that has just been unmounted — Tab enters at the first element and
 * Shift+Tab at the last, which is what pulls a stray focus back inside.
 * Both ends wrap, so focus can never leave the room by tabbing.
 *
 * Generic rather than `HTMLElement` so the spec can run the same arithmetic on
 * plain ids without a DOM; `HTMLElement` satisfies the constraint.
 */
export function nextFocusTarget<T>(
  focusables: readonly T[],
  active: T | null | undefined,
  shiftKey: boolean,
): T | null {
  if (focusables.length === 0) return null;
  const here = active == null ? -1 : focusables.indexOf(active);
  if (here === -1) {
    return shiftKey ? focusables[focusables.length - 1] : focusables[0];
  }
  const step = shiftKey ? -1 : 1;
  const next = (here + step + focusables.length) % focusables.length;
  return focusables[next];
}
