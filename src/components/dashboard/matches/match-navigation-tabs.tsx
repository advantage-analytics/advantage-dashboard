"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

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

  return (
    <div className="flex gap-2 shadow-[inset_0_-1px_0_0_#D9D9D9]">
      {tabs.map((tab) => {
        const href = `/dashboard/matches/${matchId}/${tab.slug}`;
        const isActive = pathname === href;

        return (
          <Link
            key={tab.slug}
            href={href}
            aria-current={isActive ? "page" : undefined}
            className={`py-2 px-4 text-xs font-medium transition-colors flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3B82F6] focus-visible:ring-offset-1 ${
              isActive
                ? "text-[#3B82F6] border-b-2 border-[#3B82F6]"
                : "text-[#888888] border-b-2 border-transparent hover:text-[#666666]"
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
