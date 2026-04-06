"use client";

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

export default function NavigationTabs({
  activeTab,
  onTabChange,
}: NavigationTabsProps) {
  return (
    <div className="flex flex-row items-center gap-3 px-4">
      {/* Tab Container */}
      <div className="flex flex-row items-center gap-1 p-1 bg-white/95 backdrop-blur-sm rounded-full shadow-[0_1px_4px_rgba(0,0,0,0.08)]">
        {TABS.map(({ name, id }) => {
          const isActive = activeTab === id;

          return (
            <button
              key={id}
              onClick={() => onTabChange(id)}
              className={cn(
                "relative flex items-center justify-center rounded-full px-5 h-7 text-xs font-medium transition-colors duration-200",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3B82F6] focus-visible:ring-offset-1"
              )}
            >
              {isActive && (
                <motion.div
                  layoutId="activeTab"
                  className="absolute inset-0 bg-[#0D0D0D] rounded-full"
                  transition={{
                    duration: 0.25,
                    ease: [0.25, 0.46, 0.45, 0.94],
                  }}
                />
              )}
              <span
                className={cn(
                  "relative z-10 transition-colors duration-200",
                  isActive
                    ? "text-white"
                    : "text-[#888888] hover:text-[#525252]"
                )}
              >
                {name}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
