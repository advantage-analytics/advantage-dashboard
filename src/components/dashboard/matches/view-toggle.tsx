"use client";

import { LayoutGrid, List } from "lucide-react";
import { motion } from "framer-motion";

export type MatchView = "gallery" | "list";

interface ViewToggleProps {
  view: MatchView;
  onViewChange: (view: MatchView) => void;
}

const VIEW_OPTIONS: { value: MatchView; icon: typeof LayoutGrid }[] = [
  { value: "gallery", icon: LayoutGrid },
  { value: "list", icon: List },
];

export function ViewToggle({ view, onViewChange }: ViewToggleProps): React.JSX.Element {
  return (
    <div className="flex items-center h-8 rounded-full ring-1 ring-inset ring-[#D9D9D9] bg-white p-[3px]">
      {VIEW_OPTIONS.map((option) => {
        const isActive = view === option.value;
        const Icon = option.icon;

        return (
          <button
            key={option.value}
            onClick={() => onViewChange(option.value)}
            className="relative flex items-center justify-center w-[26px] h-[26px] rounded-full transition-[color] duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3B82F6]/50"
            aria-label={`${option.value} view`}
          >
            {isActive && (
              <motion.div
                layoutId="matchViewToggle"
                className="absolute inset-0 bg-[#F5F5F5] rounded-full"
                transition={{ type: "spring", stiffness: 500, damping: 35 }}
              />
            )}
            <Icon
              className={`relative z-10 w-3.5 h-3.5 transition-[color] duration-200 ${
                isActive ? "text-[#0D0D0D]" : "text-[#CCCCCC]"
              }`}
              strokeWidth={1.5}
            />
          </button>
        );
      })}
    </div>
  );
}
