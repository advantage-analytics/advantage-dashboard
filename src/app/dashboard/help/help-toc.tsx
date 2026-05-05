"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { Kbd } from "@/components/ui/kbd";

type TocItem = { id: string; label: string };

const ITEMS: TocItem[] = [
  { id: "shortcuts", label: "Keyboard shortcuts" },
  { id: "upload", label: "Upload SwingVision data" },
  { id: "glossary", label: "Glossary" },
];

// Hoisted to module scope so the IntersectionObserver effect isn't recreated each render.
const ITEM_IDS = ITEMS.map((i) => i.id);

function getInitialActive(): string {
  if (typeof window !== "undefined") {
    const hash = window.location.hash.slice(1);
    if (hash && ITEM_IDS.includes(hash)) return hash;
  }
  return ITEM_IDS[0];
}

function useActiveSection(): string {
  const [active, setActive] = useState<string>(getInitialActive);

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
  // (TOC pills, glossary jump-row, back-to-top, footer mailto's are all caught here).
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
          -ml-12 -mr-8 pl-12 pr-8
          bg-[var(--color-surface-card)]
          border-b border-[var(--color-ink-100)]
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
                "inline-flex items-center h-11 px-4 rounded-full",
                "text-[13px] font-medium transition-colors",
                "border",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-blue-ring-40)]",
                isActive
                  ? "bg-[var(--color-surface-raised)] border-[var(--color-blue)] text-[var(--color-ink-900)]"
                  : "bg-[var(--color-surface-muted)] border-[var(--color-ink-100)] text-[var(--color-ink-700)] hover:bg-[var(--color-surface-raised)] hover:border-[var(--color-ink-200)] hover:text-[var(--color-ink-900)]",
              )}
            >
              {item.label}
            </a>
          );
        })}
      </nav>

      {/* Desktop — sticky right-rail TOC */}
      <nav
        aria-label="Help topics"
        className="
          hidden lg:block
          sticky top-14
          self-start
          flex-shrink-0
          w-[208px]
        "
      >
        <div className="flex items-baseline justify-between mb-4">
          <p className="text-[10px] font-medium text-[var(--color-ink-500)] uppercase tracking-[2.5px]">
            On this page
          </p>
          <span
            className="inline-flex items-baseline gap-1 text-[10px] text-[var(--color-ink-500)] tracking-[0.2px]"
            title="Press ? from anywhere on this page"
          >
            press <Kbd size="sm">?</Kbd>
          </span>
        </div>
        <ul className="flex flex-col">
          {ITEMS.map((item, idx) => {
            const isActive = active === item.id;
            return (
              <li key={item.id} className="relative">
                <a
                  ref={idx === 0 ? desktopFirstLinkRef : undefined}
                  href={`#${item.id}`}
                  aria-current={isActive ? "page" : undefined}
                  className={cn(
                    "block py-2 pl-4 pr-2",
                    "text-[12.5px] leading-[1.5] transition-colors",
                    "border-l",
                    "focus-visible:outline-none focus-visible:bg-[var(--color-blue-tint-08)]",
                    isActive
                      ? "text-[var(--color-ink-900)] font-medium border-[var(--color-blue)]"
                      : "text-[var(--color-ink-700)] border-[var(--color-ink-100)] hover:text-[var(--color-ink-900)] hover:border-[var(--color-ink-300)]",
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
