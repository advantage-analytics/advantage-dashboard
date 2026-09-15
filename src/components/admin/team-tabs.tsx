"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";

/**
 * The Admin › Teams detail page's tab bar.
 *
 * The 2px blue underline (`layoutId="activeTab"`) is the "a tab is a choice"
 * grammar `chrome.md` reserves for tabs — distinct from a nav row's plain
 * surface-wash active state (`SettingsNavigation`, the icon rail), which
 * marks a *location* rather than a choice made among siblings on one page.
 * The pathname-driven active check and `aria-current` mirror
 * `settings-navigation.tsx`'s mechanics exactly; only the active-state paint
 * differs, per that same rule.
 *
 * Two tabs — Overview and Usage — link to routes this task does not create a
 * `page.tsx` for (T21 and a later usage task, respectively). That is
 * deliberate: the tab bar is the navigation, not the destination, and a tab
 * pointing at a route that 404s today is the same situation `SettingsNavigation`
 * already lives with for a workspace that has no team yet.
 */
const TABS = [
  { slug: "", label: "Overview" },
  { slug: "people", label: "People" },
  { slug: "roster", label: "Roster" },
  { slug: "schedule", label: "Schedule & results" },
  { slug: "usage", label: "Usage" },
  { slug: "activity", label: "Activity log" },
] as const;

export function TeamTabs({ programId }: { programId: string }) {
  const pathname = usePathname();
  const skip = useReducedMotion();
  const base = `/admin/teams/${programId}`;

  return (
    <nav
      className="flex gap-6 border-b border-[var(--border-hairline)]"
      aria-label="Team"
    >
      {TABS.map(({ slug, label }) => {
        const href = slug ? `${base}/${slug}` : base;
        const isActive = pathname === href;

        return (
          <Link
            key={label}
            href={href}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "relative pb-3 text-[13px] whitespace-nowrap transition-colors duration-150",
              "focus-visible:outline-none",
              isActive
                ? "font-medium text-[var(--ink-900)]"
                : "text-[var(--ink-600)] hover:text-[var(--ink-900)]",
            )}
          >
            {label}
            {isActive && (
              <motion.span
                layoutId="activeTab"
                className="absolute inset-x-0 -bottom-px h-[2px] rounded-full bg-[var(--blue)]"
                transition={
                  skip
                    ? { duration: 0 }
                    : { type: "spring", stiffness: 500, damping: 40 }
                }
              />
            )}
          </Link>
        );
      })}
    </nav>
  );
}
