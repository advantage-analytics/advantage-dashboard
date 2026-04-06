"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";

const tabs = [
  { label: "Analysis", slug: "analysis" },
  { label: "Statistics", slug: "overall" },
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
    <div className="flex gap-2 border-b border-[#F0F0F0]">
      {tabs.map((tab) => {
        const href = `/dashboard/matches/${matchId}/${tab.slug}`;
        const isActive = pathname === href;

        return (
          <Link
            key={tab.slug}
            href={href}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "relative py-2.5 px-4 text-[11px] font-medium uppercase tracking-[1.5px] flex items-center justify-center",
              "transition-colors duration-200 hover:bg-[#FAFAFA] rounded-t-lg",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3B82F6]/50 focus-visible:ring-offset-1",
              isActive ? "text-[#3B82F6]" : "text-[#AAAAAA] hover:text-[#525252]"
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
    </div>
  );
}
