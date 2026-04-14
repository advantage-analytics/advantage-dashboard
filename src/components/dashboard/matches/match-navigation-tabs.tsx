"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";

const tabs = [
  { label: "Analysis", slug: "" },
  { label: "Statistics", slug: "statistics" },
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
    <nav aria-label="Match detail tabs" className="flex gap-2 border-b border-[#D9D9D9]">
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
              "relative w-[80px] py-2 px-4 text-[12px] font-medium flex items-center justify-center",
              "transition-colors duration-200",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3B82F6]/50 focus-visible:ring-offset-1",
              isActive ? "text-[#3B82F6]" : "text-[#999999] hover:text-[#525252]"
            )}
          >
            {tab.label}
            {isActive &&
              (prefersReducedMotion ? (
                <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-[#3B82F6]" />
              ) : (
                <motion.div
                  layoutId="match-tab-indicator"
                  className="absolute bottom-0 left-0 right-0 h-[2px] bg-[#3B82F6]"
                  transition={{
                    type: "spring",
                    stiffness: 500,
                    damping: 35,
                  }}
                />
              ))}
          </Link>
        );
      })}
    </nav>
  );
}
