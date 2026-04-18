"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";

const tabs = [
  { label: "Analysis", slug: "" },
  { label: "Visuals", slug: "visuals" },
  { label: "Video", slug: "video" },
] as const;

interface MatchNavigationTabsProps {
  matchId: string;
}

export function MatchNavigationTabs({ matchId }: MatchNavigationTabsProps) {
  const pathname = usePathname();
  const prefersReducedMotion = useReducedMotion();

  return (
    <nav aria-label="Match detail tabs" className="flex gap-2 border-b border-[#E5E5EA]">
      {tabs.map((tab) => {
        const href = tab.slug
          ? `/dashboard/matches/${matchId}/${tab.slug}`
          : `/dashboard/matches/${matchId}`;
        const isActive = pathname === href;

        return (
          <Link
            key={tab.slug}
            href={href}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "relative py-2 px-4 text-[12px] rounded-lg flex items-center justify-center",
              "transition-colors duration-200",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3B82F6]/40 focus-visible:ring-offset-1",
              isActive
                ? "font-normal text-[#3B82F6]"
                : "font-normal text-[#71717A] hover:text-[#525252]",
            )}
          >
            {tab.label}
            {isActive &&
              (prefersReducedMotion ? (
                <div className="absolute -bottom-px left-0 right-0 h-[2px] bg-[#3B82F6]" />
              ) : (
                <motion.div
                  layoutId="match-tab-indicator"
                  className="absolute -bottom-px left-0 right-0 h-[2px] bg-[#3B82F6]"
                  transition={{
                    duration: 0.25,
                    ease: [0.25, 0.46, 0.45, 0.94],
                  }}
                />
              ))}
          </Link>
        );
      })}
    </nav>
  );
}
