"use client";

import { useState, useEffect, useCallback } from "react";
import { cn } from "@/lib/utils";

const TOC_SECTIONS = [
  { id: "overview", label: "Overview" },
  { id: "performance", label: "Performance" },
  { id: "court", label: "Court" },
  { id: "video", label: "Video" },
] as const;

function findScrollRoot(el: HTMLElement | null): HTMLElement | null {
  let cur: HTMLElement | null = el?.parentElement ?? null;
  while (cur && cur !== document.body) {
    const style = getComputedStyle(cur);
    if (/(auto|scroll|overlay)/.test(style.overflowY)) return cur;
    cur = cur.parentElement;
  }
  return null;
}

function useActiveSection(): string {
  const [active, setActive] = useState("overview");

  useEffect(() => {
    const first = document.getElementById(TOC_SECTIONS[0].id);
    const root = findScrollRoot(first);
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting);
        if (visible.length === 0) return;
        visible.sort(
          (a, b) => a.boundingClientRect.top - b.boundingClientRect.top,
        );
        setActive(visible[0].target.id);
      },
      { root, rootMargin: "-20% 0px -60% 0px", threshold: 0 },
    );

    for (const { id } of TOC_SECTIONS) {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    }

    return () => observer.disconnect();
  }, []);

  return active;
}

export function MatchDetailTOC() {
  const activeSection = useActiveSection();

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLAnchorElement>, id: string) => {
      e.preventDefault();
      document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
    },
    [],
  );

  return (
    <nav aria-label="Page sections">
      <p className="text-[10px] font-medium text-[#AAAAAA] uppercase tracking-[2.5px] mb-4 pl-3">
        On this page
      </p>
      <div className="relative">
        <div
          className="absolute left-0 top-0 bottom-0 w-px bg-[#EBEBEB]"
          aria-hidden="true"
        />
        <ul className="flex flex-col">
          {TOC_SECTIONS.map((section) => {
            const isActive = activeSection === section.id;
            return (
              <li key={section.id} className="relative">
                {isActive && (
                  <div className="absolute left-0 top-1 bottom-1 w-[2px] rounded-full bg-[#3B82F6] transition-all duration-200" />
                )}
                <a
                  href={`#${section.id}`}
                  onClick={(e) => handleClick(e, section.id)}
                  className={cn(
                    "text-[11px] block py-[6px] pl-3 transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3B82F6]/40 rounded-[2px]",
                    isActive
                      ? "text-[#0D0D0D] font-medium"
                      : "text-[#71717A] hover:text-[#525252]",
                  )}
                >
                  {section.label}
                </a>
              </li>
            );
          })}
        </ul>
      </div>
    </nav>
  );
}
