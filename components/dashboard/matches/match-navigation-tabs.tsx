"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const tabs = [
  { label: "Overall", slug: "overall" },
  { label: "Visuals", slug: "visuals" },
  { label: "Video", slug: "video" },
] as const;

interface MatchNavigationTabsProps {
  matchId: string;
}

export function MatchNavigationTabs({ matchId }: MatchNavigationTabsProps) {
  const pathname = usePathname();

  return (
    <div className="flex shadow-[inset_0_-1px_0_0_#D9D9D9]">
      {tabs.map((tab) => {
        const href = `/dashboard/matches/${matchId}/${tab.slug}`;
        const isActive = pathname === href;

        return (
          <Link
            key={tab.slug}
            href={href}
            className={`w-[88px] h-[32px] text-sm font-medium transition-colors flex items-center justify-center ${
              isActive
                ? "text-[#3986F3] border-b-2 border-[#3986F3]"
                : "text-[#999999] border-b border-transparent hover:text-[#666666]"
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
