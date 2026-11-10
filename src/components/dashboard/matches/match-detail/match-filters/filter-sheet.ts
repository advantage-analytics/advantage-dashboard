import type { KeyboardEvent } from "react";

/**
 * The advanced-filters sheet's paint and keyboard — one placement for both
 * hosts: the Video tab's filters drawer (`filter-rail.tsx`) and the
 * Visualizations lightbox's "Advanced filters"
 * (`shots/lightbox-advanced-drawer.tsx`).
 *
 * The panel holds a draft the reader commits ("Show N points"), so it is
 * modal: a 340px sheet on the WINDOW's right edge, its whole height, over
 * everything — the icon rail and the header included on the Video tab, the
 * lightbox's box on the Visualizations tab — with the rest of the window
 * dimmed under the peek drawers' wash (`bg-black/20`) and a click there
 * closing it. Peek drawers (a Matches row, a roster player) are not this:
 * they browse, hold no draft, and sit under the header with the chrome live
 * (`shared/drawer-sheet.tsx`).
 *
 * Both are `fixed`, so each host keeps them where `fixed` resolves to the
 * viewport: the rail portals to <body> (`#match-report-pane`'s `@container`
 * would otherwise be their box), the lightbox renders them inside its
 * `DialogPrimitive.Content` (a fixed box with no transform at rest) so the
 * dialog's focus scope and outside-click rule still count them as inside.
 *
 * The shell is the roster's (`team/player-drawer.tsx`): the WIDTH runs
 * `roster-drawer-in` / `-out` (200ms `--ease-primary`) and the sheet leaves
 * the DOM when the out animation ends.
 */

/**
 * The dim behind the sheet: the whole window. Fades with the sheet. The
 * peek drawers' `DrawerScrim` (`shared/drawer-sheet.tsx`) is the same wash
 * stopped under the header — keep the two in step. `touch-none`: a drag on
 * it must not scroll the page underneath.
 */
export const FILTER_SHEET_SCRIM_CLASS =
  "fixed inset-0 z-50 cursor-default touch-none bg-black/20 transition-opacity duration-200 ease-[var(--ease-primary)] motion-reduce:transition-none starting:opacity-0";

/** The sheet itself, at rest; `filterSheetWidthClass` adds the slide. */
export const FILTER_SHEET_CLASS =
  "fixed inset-y-0 right-0 z-50 overflow-hidden border-l border-[var(--border-hairline)] bg-[var(--surface-card)] pb-[env(safe-area-inset-bottom)] shadow-[var(--shadow-dropdown)] motion-reduce:animate-none";

/** Open: 340px sliding in. Closing: shrinking to nothing. */
export function filterSheetWidthClass(closing: boolean): string {
  return closing
    ? "w-0 animate-[roster-drawer-out_200ms_var(--ease-primary)_both]"
    : "w-[340px] max-w-full animate-[roster-drawer-in_200ms_var(--ease-primary)_both]";
}

/**
 * Make everything on the page behind a <body>-level sheet `inert`, so a
 * screen reader's virtual cursor cannot walk into the dimmed chrome and
 * follow a link that drops the draft. Marks each child of <body> that holds
 * none of `keep` (the scrim and the sheet) and is not inert already; layers
 * portalled in later (a tooltip on the sheet's X) are untouched. Returns the
 * undo, which must run before focus goes back to anything behind the sheet.
 *
 * The lightbox host does not need this: its shell marks the rest of the box
 * `inert`, and Radix hides the page behind the dialog already.
 */
export function inertPageBehind(keep: readonly Element[]): () => void {
  const marked: Element[] = [];
  for (const child of Array.from(document.body.children)) {
    if (keep.some((el) => child.contains(el))) continue;
    if (child.hasAttribute("inert")) continue;
    child.setAttribute("inert", "");
    marked.push(child);
  }
  return () => {
    for (const el of marked) el.removeAttribute("inert");
  };
}

/** What Tab may land on inside the sheet. */
const TABBABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Tab and Shift+Tab wrap inside the sheet: the sheet's `onKeyDown`. The
 * page (or the lightbox box) behind is covered by the scrim, so focus must
 * not walk out into it. `panel` is the sheet's focusable container — the
 * element focus lands on at open.
 */
export function wrapTabInSheet(
  event: KeyboardEvent<HTMLElement>,
  panel: HTMLElement | null,
): void {
  if (event.key !== "Tab" || event.altKey || event.metaKey || event.ctrlKey)
    return;
  const items = [
    ...event.currentTarget.querySelectorAll<HTMLElement>(TABBABLE),
  ].filter((el) => el.getClientRects().length > 0);
  if (items.length === 0) return;
  const first = items[0];
  const last = items[items.length - 1];
  const active = document.activeElement;
  const atEdge = event.shiftKey
    ? active === first || active === panel
    : active === last;
  if (!atEdge) return;
  event.preventDefault();
  event.stopPropagation();
  (event.shiftKey ? last : first).focus();
}
