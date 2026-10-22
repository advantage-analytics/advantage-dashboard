"use client";

import { cn } from "@/lib/utils";

/*
 * The peek drawers' shared seat: the rail's classes and the scrim behind it
 * when it lifts out as a sheet. Its own module, importing nothing but `cn`, so
 * the Roster's and the Schedule's drawers can share it without pulling in the
 * match drawer's data layer (a bundled spec of the schedule drawer failed on
 * `next/cache` the moment they did).
 */

/**
 * Where a 340px peek rail sits — `PeekDrawerFrame`'s, the Roster's and the
 * Schedule's alike. At `lg` and up it is a sticky flex sibling of the page
 * column, so the table reflows beside it. Below `lg` (an iPad, a narrow
 * window) the column has no width to give — 340px beside a 704px pane leaves
 * the table under 400 — so the same rail lifts out as a fixed sheet over the
 * table, under the 44px header, with `DrawerScrim` dimming what it covers.
 * The width keyframes run in both places: anchored right, the sheet grows in
 * from the edge. The bottom inset keeps the footer's primary off the home
 * indicator (zero on a desktop).
 */
export const DRAWER_RAIL =
  "shrink-0 overflow-hidden border-l border-[var(--border-hairline)] bg-[var(--surface-card)] pb-[env(safe-area-inset-bottom)] shadow-[var(--shadow-dropdown)] motion-reduce:animate-none max-lg:fixed max-lg:top-11 max-lg:right-0 max-lg:bottom-0 max-lg:z-[45] max-lg:max-w-full max-lg:overscroll-contain lg:sticky lg:top-11 lg:z-[2] lg:h-[calc(100dvh-44px)] lg:self-start";

/**
 * The dim behind a rail that has lifted out as a sheet (below `lg` — see
 * `DRAWER_RAIL`); a tap on it closes, as Esc and the X do. Above the icon rail
 * (z-40) so the sheet reads as the one live thing, under the header so the
 * chrome band stays usable. It fades with the rail; `touch-none` keeps a drag
 * on it from scrolling the page underneath. Not a tab stop: Esc already
 * closes from anywhere.
 */
export function DrawerScrim({
  closing,
  onClose,
}: {
  closing: boolean;
  onClose: () => void;
}) {
  return (
    <button
      type="button"
      aria-label="Close drawer"
      tabIndex={-1}
      onClick={onClose}
      className={cn(
        "fixed inset-x-0 top-11 bottom-0 z-[45] cursor-default touch-none bg-black/20 transition-opacity duration-200 ease-[var(--ease-primary)] motion-reduce:transition-none lg:hidden starting:opacity-0",
        closing && "pointer-events-none opacity-0",
      )}
    />
  );
}
