import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * The Ask page's frame: earlier questions in a rail on the left, the thread
 * beside it. Shared with the route's `loading.tsx` so the skeleton cannot
 * drift from the layout it stands in for. Its own file, with no
 * `"use client"`, because a Server Component reads the constants below as
 * strings: imported from a client module they would arrive as references, not
 * values.
 *
 * ── Height and scroll ───────────────────────────────────────────────────────
 * The dashboard shell scrolls a page as a whole: its `<main>` and
 * `PageTransition` pass no bounded height down, so a tall page simply grows.
 * A chat needs the opposite — the list of earlier questions and the thread
 * scroll on their own, and the composer stays at the foot — so this box
 * sizes itself from the viewport (`100dvh` less the header) and clips, the
 * way the match report's layout does. Everything inside it is a flex child
 * carrying `min-h-0`, and the two scrollers are the rail's list and the
 * thread.
 *
 * The rail slot is the rail's own `<nav>` (`AskRail`), which owns its width
 * because open or closed is the viewer's choice. Not a `<main>` — the
 * dashboard shell already is one.
 *
 * ── Under 768px ─────────────────────────────────────────────────────────────
 * The frame stacks: the rail becomes a bar across the top (`AskRail` draws
 * it, with the list behind a sheet), the thread fills what is left and the
 * composer holds the foot. The height is the dynamic viewport's
 * (`100dvh`), so a phone's own chrome coming and going does not hide the
 * composer. The dashboard still shows its mobile gate below 768px
 * (`mobile-gate.tsx`); the page is ready for the day that lifts.
 */
export function AskFrame({
  children,
  rail,
  className,
}: {
  /** The thread area: a column that fills what the rail leaves. */
  children: ReactNode;
  /** The left rail, already a landmark of its own. */
  rail: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex h-[calc(100dvh-var(--header-h))] w-full overflow-hidden bg-[var(--surface-card)] max-md:flex-col",
        className,
      )}
    >
      {rail}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">{children}</div>
    </div>
  );
}

/**
 * The page before a thread exists: the title, one line under it, then
 * whatever the caller puts there (the composer; a bar while loading). Set in
 * the upper part of the thread area rather than pinned to its foot — with
 * nothing above it yet, a composer at the bottom edge reads as a page that
 * failed to load. On a phone the air above it goes: a title a screen's
 * height below the bar reads as an empty page.
 */
export function AskIntro({
  lead,
  children,
}: {
  /** The line under the title. */
  lead: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className={cn(ASK_SCROLL, ASK_GUTTER, "pt-[14vh] pb-8 max-md:pt-6")}>
      <div className={cn(ASK_COLUMN, "flex flex-col gap-6")}>
        <div>
          <h1 className="text-display">Ask</h1>
          <div className="mt-[9px] flex min-h-[18px] items-center">{lead}</div>
        </div>
        {children}
      </div>
    </div>
  );
}

/** The measure the thread and the composer share, centred in the thread area. */
export const ASK_COLUMN = "mx-auto w-full max-w-[720px]";

/** The thread area's side gutter: 40px, and the phone's 16px under 768px. */
export const ASK_GUTTER = "px-10 max-md:px-4";

/**
 * A scroller inside the frame: the thread, and the rail's list. `relative`
 * is load-bearing: an `sr-only` heading is absolutely positioned, and without
 * a positioned scroller it is laid out against the page instead — it stops
 * scrolling with its exchange and stretches the document below the frame.
 */
export const ASK_SCROLL =
  "relative min-h-0 flex-1 overflow-y-auto [scrollbar-color:var(--ink-200)_transparent] [scrollbar-width:thin]";

/**
 * The rail's box, whatever its width. Hidden under 768px: there the rail is
 * the bar `AskRail` draws instead, and the route's skeleton has no bar to
 * stand in for.
 */
export const ASK_RAIL =
  "flex h-full shrink-0 flex-col overflow-hidden border-r border-[var(--border-hairline)] max-md:hidden";
export const ASK_RAIL_OPEN = "w-[280px]";
export const ASK_RAIL_CLOSED = "w-[52px]";
