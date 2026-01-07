"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

export type TabType = "past" | "upcoming" | "about";

const TABS: { name: string; id: TabType }[] = [
  { name: "Past", id: "past" },
  { name: "Upcoming", id: "upcoming" },
  { name: "About", id: "about" },
];

interface NavigationTabsProps {
  activeTab: TabType;
  onTabChange: (tab: TabType) => void;
}

export default function NavigationTabs({ activeTab, onTabChange }: NavigationTabsProps) {
  return (
    <div className="flex flex-row justify-center items-center gap-4">
      {/* Tab Container */}
      <div className="flex flex-row items-center justify-between gap-[15px] p-1 bg-white rounded-full" style={{ width: 400, height: 32 }}>
        {TABS.map(({ name, id }) => {
          const isActive = activeTab === id;

          return (
            <button
              key={id}
              onClick={() => onTabChange(id)}
              className="relative flex items-center justify-center rounded-full text-xs font-medium"
              style={{ width: 96, height: 24 }}
            >
              {isActive && (
                <motion.div
                  layoutId="activeTab"
                  className="absolute inset-0 bg-[#F2F2F2] rounded-full"
                  transition={{
                    type: "spring",
                    stiffness: 500,
                    damping: 35,
                  }}
                />
              )}
              <span
                className={cn(
                  "relative z-10 transition-colors duration-200",
                  isActive ? "text-[#999999]" : "text-[#CCCCCC] hover:text-[#999999]"
                )}
              >
                {name}
              </span>
            </button>
          );
        })}
      </div>

      {/* Create Match Button */}
      <Link
        href="/dashboard/upload"
        className="flex items-center justify-center px-3 py-2.5 bg-[#1D1D1F] text-white text-xs font-medium rounded-2xl hover:bg-[#2D2D2D] transition-colors"
        style={{ width: 102, height: 32 }}
      >
        Create Match
      </Link>
    </div>
  );
}
