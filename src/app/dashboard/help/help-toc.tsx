"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

type TocItem = { id: string; label: string };

/**
 * The seven topics, in reading order.
 *
 * Getting started leads because the question it answers — "there are two ways
 * in, which one is mine?" — is the one a new account has before it has any
 * others, and it was previously answered nowhere.
 */
const ITEMS: TocItem[] = [
  { id: "getting-started", label: "Getting started — two sources" },
  { id: "advantage-intelligence", label: "Advantage Intelligence" },
  { id: "swingvision", label: "Importing from SwingVision" },
  { id: "teams", label: "Teams" },
  { id: "shortcuts", label: "Keyboard shortcuts" },
  { id: "glossary", label: "Glossary" },
  { id: "support", label: "Contact support" },
];

// Hoisted to module scope so the IntersectionObserver effect isn't recreated each render.
const ITEM_IDS = ITEMS.map((i) => i.id);

function useActiveSection(): string {
  /**
   * Always the first topic on the first render, on both sides.
   *
   * This used to seed from `window.location.hash`, which the server cannot
   * see — so arriving on `/help#teams` rendered `aria-current` on "Getting
   * started" server-side and on "Teams" client-side, and React reported a
   * hydration mismatch it explicitly does not patch up. The observer below
   * fires on its first callback with the sections' initial intersection, so
   * the correct row lights up immediately anyway; the hash needs no special
   * handling.
   */
  const [active, setActive] = useState<string>(ITEM_IDS[0]);

  useEffect(() => {
    const elements = ITEM_IDS.map((id) => document.getElementById(id)).filter(
      (el): el is HTMLElement => el !== null,
    );

    if (elements.length === 0) return;

    // Track which sections are currently considered "in view".
    // rootMargin shrinks the bottom 65% of the viewport so a section
    // becomes active as it crosses the top third — the natural reading point.
    const visibility = new Map<string, number>();

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          visibility.set(entry.target.id, entry.intersectionRatio);
        }
        // Pick the section closest to the top of the viewport that is at least partly visible.
        let topId: string | null = null;
        let topRatio = 0;
        for (const id of ITEM_IDS) {
          const ratio = visibility.get(id) ?? 0;
          if (ratio > topRatio) {
            topRatio = ratio;
            topId = id;
          }
        }
        if (topId) setActive(topId);
      },
      {
        rootMargin: "-72px 0px -65% 0px",
        threshold: [0, 0.25, 0.5, 0.75, 1],
      },
    );

    for (const el of elements) observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return active;
}

function isTextInput(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    target.isContentEditable
  );
}

/**
 * On-page navigation for the help centre.
 *
 * Left rail on desktop, matching the settings rail beside it — the two pages
 * are the same shape and used the same way, and having one rail on the left and
 * one on the right made them feel like different products. Mobile keeps the
 * sticky pill bar, because a 200px column is not a thing a phone has.
 */
export function HelpToc() {
  const active = useActiveSection();
  const desktopFirstLinkRef = useRef<HTMLAnchorElement>(null);
  const mobileFirstLinkRef = useRef<HTMLAnchorElement>(null);

  // ?-key (Shift + /) jumps to the top of the page and focuses the TOC —
  // a small touch of irony for the keyboard-shortcuts page itself.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Accept either the resolved character "?" or Shift+/ explicitly —
      // some keyboard layouts and older browsers don't normalize the former.
      const isQuestion =
        e.key === "?" || (e.shiftKey && (e.key === "/" || e.code === "Slash"));
      if (!isQuestion || e.metaKey || e.ctrlKey || e.altKey) return;
      if (isTextInput(e.target)) return;
      e.preventDefault();
      const top = document.getElementById("top");
      const reduceMotion = window.matchMedia(
        "(prefers-reduced-motion: reduce)",
      ).matches;
      top?.scrollIntoView({
        behavior: reduceMotion ? "auto" : "smooth",
        block: "start",
      });
      const link =
        desktopFirstLinkRef.current ?? mobileFirstLinkRef.current;
      // Defer focus so the smooth scroll isn't interrupted on some browsers.
      requestAnimationFrame(() => link?.focus({ preventScroll: true }));
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  // Smooth-scroll all in-page anchor clicks on the help page.
  // Event-delegated from document so we don't have to wire onClick onto every link
  // (TOC rows, glossary jump-row, back-to-top, footer mailto's are all caught here).
  // Respects prefers-reduced-motion and preserves modifier-key default behavior.
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (
        e.button !== 0 ||
        e.metaKey ||
        e.ctrlKey ||
        e.shiftKey ||
        e.altKey
      ) {
        return;
      }
      const target = e.target;
      if (!(target instanceof Element)) return;
      const link = target.closest('a[href^="#"]');
      if (!(link instanceof HTMLAnchorElement)) return;
      const id = link.getAttribute("href")?.slice(1);
      if (!id) return;
      const dest = document.getElementById(id);
      if (!dest) return;
      e.preventDefault();
      const reduceMotion = window.matchMedia(
        "(prefers-reduced-motion: reduce)",
      ).matches;
      dest.scrollIntoView({
        behavior: reduceMotion ? "auto" : "smooth",
        block: "start",
      });
      history.replaceState(null, "", `#${id}`);
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);

  return (
    <>
      {/* Mobile / tablet — sticky pill bar under the dashboard header */}
      <nav
        aria-label="Help topics"
        className="
          lg:hidden
          sticky top-11 z-20
          -mx-6 px-6 sm:-mx-8 sm:px-8
          bg-[var(--surface-card)]
          border-b border-[var(--border-hairline)]
          flex gap-2 overflow-x-auto whitespace-nowrap
          py-3
        "
      >
        {ITEMS.map((item, idx) => {
          const isActive = active === item.id;
          return (
            <a
              key={item.id}
              ref={idx === 0 ? mobileFirstLinkRef : undefined}
              href={`#${item.id}`}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "inline-flex h-11 items-center rounded-full px-4",
                "border text-[13px] font-medium transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--blue-ring-40)]",
                isActive
                  ? "border-[var(--blue)] bg-[var(--surface-raised)] text-[var(--ink-900)]"
                  : "border-[var(--border-hairline)] bg-[var(--surface-muted)] text-[var(--ink-700)] hover:border-[var(--ink-200)] hover:bg-[var(--surface-raised)] hover:text-[var(--ink-900)]",
              )}
            >
              {item.label}
            </a>
          );
        })}
      </nav>

      {/* Desktop — sticky left rail */}
      <nav
        aria-label="Help topics"
        className="hidden w-[200px] shrink-0 self-start lg:sticky lg:top-6 lg:block"
      >
        <div className="mb-2 flex items-baseline justify-between px-2.5">
          <p className="text-[10px] font-medium uppercase tracking-[1.8px] text-[var(--ink-500)]">
            On this page
          </p>
          <span
            className="text-[10px] tracking-[0.2px] text-[var(--ink-400)]"
            title="Press ? from anywhere on this page"
          >
            ?
          </span>
        </div>
        <ul className="flex flex-col gap-0.5">
          {ITEMS.map((item, idx) => {
            const isActive = active === item.id;
            return (
              <li key={item.id}>
                <a
                  ref={idx === 0 ? desktopFirstLinkRef : undefined}
                  href={`#${item.id}`}
                  aria-current={isActive ? "page" : undefined}
                  className={cn(
                    "block rounded-[8px] px-2.5 py-1.5 text-[12px] leading-[1.5] transition-colors duration-150",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--blue-ring-40)]",
                    isActive
                      ? "bg-[var(--surface-subtle)] font-medium text-[var(--ink-900)]"
                      : "text-[var(--ink-700)] hover:bg-[var(--surface-subtle)]",
                  )}
                >
                  {item.label}
                </a>
              </li>
            );
          })}
        </ul>
      </nav>
    </>
  );
}
