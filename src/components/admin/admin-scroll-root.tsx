"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

/**
 * The admin console's own scroll container, and its Back/Forward memory.
 *
 * Why a container at all: `globals.css` gives html and body
 * `overflow-x: hidden`, which makes body a scroll container that never
 * scrolls — so anything `position: sticky` (the header, every page's
 * peek-drawer rail at `top-11`) stuck to a box that never moved and scrolled
 * away with the page. A viewport-tall scroller of our own is what they stick
 * to instead.
 *
 * The cost of that is the browser's scroll restoration, which only restores
 * the window: Back to a long list would land at its top. So this keeps each
 * page's offset in sessionStorage as it scrolls and puts it back when a
 * Back/Forward (`popstate`) lands on that page. A pushed navigation is left
 * to Next, which scrolls the new page's top into view itself.
 */
const KEY_PREFIX = "admin-scroll:";

export function AdminScrollRoot({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const popped = useRef(false);

  useEffect(() => {
    const onPop = () => {
      popped.current = true;
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  // Remember this page's offset while it scrolls.
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const key = KEY_PREFIX + pathname;
    const onScroll = () => {
      // Leaving this page, Next scrolls the shared box to the top before this
      // listener is unbound — by then the URL is the next page's, so that 0
      // must not overwrite this page's offset.
      if (window.location.pathname !== pathname) return;
      try {
        sessionStorage.setItem(key, String(Math.round(element.scrollTop)));
      } catch {
        // Private mode or blocked storage: Back simply lands at the top.
      }
    };
    element.addEventListener("scroll", onScroll, { passive: true });
    return () => element.removeEventListener("scroll", onScroll);
  }, [pathname]);

  // Back/Forward onto a page: put its offset back once it has painted.
  useEffect(() => {
    if (!popped.current) return;
    popped.current = false;
    let saved = 0;
    try {
      saved = Number(sessionStorage.getItem(KEY_PREFIX + pathname)) || 0;
    } catch {
      return;
    }
    if (saved <= 0) return;
    const frame = requestAnimationFrame(() => {
      if (ref.current) ref.current.scrollTop = saved;
    });
    return () => cancelAnimationFrame(frame);
  }, [pathname]);

  return (
    // `relative` is load-bearing: without it, every absolutely positioned
    // child (each row's sr-only "Won"/"Lost", a popover anchor) is placed
    // against the page instead of this box, lands at its static position far
    // down the list, and makes the DOCUMENT as tall as the list — a second
    // scrollbar that scrolls past the page.
    <div ref={ref} className={cn("relative h-dvh overflow-y-auto", className)}>
      {children}
    </div>
  );
}
