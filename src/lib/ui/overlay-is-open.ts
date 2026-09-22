/**
 * True when a menu or dialog is up — a fullscreen surface's own window-level
 * keys stand down.
 *
 * Radix gives both its Dialog content and its Popover content (the float
 * menus) `role="dialog"` with `data-state`, and a tooltip `role="tooltip"`,
 * so this one selector catches the two surfaces that take keys and ignores
 * the one that must never eat the space bar. `data-state="open"` matters: a
 * closing menu stays in the DOM through its exit animation.
 *
 * Lifted out of `match-detail/film/film-fullscreen.tsx` (Phase 2A, Task 4) so
 * the visualizations tab's fullscreen court viewer
 * (`match-detail/shots/viz-fullscreen.tsx`) shares the film room's rule
 * rather than carrying a second copy that could drift from it.
 */
export function overlayIsOpen(): boolean {
  return document.querySelector('[role="dialog"][data-state="open"]') !== null;
}
