"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";

/**
 * The match report's tab strip — Statistics · Shots & placement · Film room
 * (artboard 46a–46d). Sticky at the top of the content pane; the pane scrolls
 * under it.
 *
 * Tab state lives in the URL as `?tab=`, absent for the default Statistics
 * view. Changes go through `router.push` deliberately — each selection is a
 * history entry, so the back button restores the prior tab. No new route
 * directory: the match page stays a single page (CLAUDE.md contract).
 */

export const MATCH_TABS = [
  { value: "statistics", label: "Statistics" },
  { value: "shots", label: "Shots & placement" },
  { value: "film", label: "Film room" },
] as const;

export type MatchTab = (typeof MATCH_TABS)[number]["value"];

export function parseMatchTab(value: string | null | undefined): MatchTab {
  return value === "shots" || value === "film" ? value : "statistics";
}

export function MatchTabs({ active }: { active: MatchTab }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const select = (tab: MatchTab) => {
    if (tab === active) return;
    const params = new URLSearchParams(searchParams);
    if (tab === "statistics") {
      params.delete("tab");
    } else {
      params.set("tab", tab);
    }
    const query = params.toString();
    router.push(query ? `${pathname}?${query}` : pathname, { scroll: false });
  };

  return (
    <div
      role="tablist"
      aria-label="Match report sections"
      className="sticky top-0 z-[2] flex items-center gap-5 border-b border-[var(--border-hairline)] bg-[var(--surface-page)]"
    >
      {MATCH_TABS.map((tab) => {
        const isActive = tab.value === active;
        return (
          <button
            key={tab.value}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => select(tab.value)}
            className={cn(
              "cursor-pointer pb-3 pt-4 text-[11px] font-medium",
              isActive
                ? "text-[var(--ink-900)] shadow-[inset_0_-2px_0_var(--blue)]"
                : "text-[var(--ink-500)] hover:text-[var(--ink-700)]",
            )}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
