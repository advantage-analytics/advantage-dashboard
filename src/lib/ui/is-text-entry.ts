/**
 * True when `target` is where typed text actually lands — an `<input>`,
 * `<textarea>`, `<select>` or a `contenteditable` node. A single-letter
 * window-level shortcut (Esc/0/+/-/arrows in `viz-fullscreen.tsx`, `F` in
 * `viz-focused.tsx`) bails on this so a keystroke meant for a text field
 * never fires the shortcut instead.
 *
 * Deliberately NOT the new-match-wizard's `isFormControl`
 * (`@/components/dashboard/matches/new-match-wizard/useWizardKeys`) — that
 * one also treats anything with `aria-haspopup`/`role="combobox"`/
 * `role="spinbutton"` as a control, which in the fullscreen viewer and the
 * focused court is every slab trigger and the filter pill. Radix returns
 * focus to a trigger when its menu closes, so `isFormControl` made a
 * shortcut key dead exactly where a viewer would press it right after
 * closing a menu. An actually-open menu or dialog is still handled, by
 * `overlayIsOpen()` (`./overlay-is-open`), which is the correct test for
 * that case — this function only answers "is the target itself a text
 * field", nothing about what else might be open.
 *
 * Lifted out of `viz-fullscreen.tsx` (fix round 1, Task 5) into this shared
 * module so `viz-focused.tsx`'s `F` handler uses the exact same test rather
 * than a second copy that could drift from it.
 */
export function isTextEntry(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    target.isContentEditable
  );
}
