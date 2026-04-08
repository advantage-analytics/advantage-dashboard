"use client";

import { LayoutGrid, List } from "lucide-react";
import { motion } from "framer-motion";

export type MatchView = "gallery" | "list";

interface ViewToggleProps {
  view: MatchView;
  onViewChange: (view: MatchView) => void;
}

const VIEW_OPTIONS: { value: MatchView; icon: typeof LayoutGrid; label: string }[] = [
  { value: "gallery", icon: LayoutGrid, label: "Grid" },
  { value: "list", icon: List, label: "List" },
];

export function ViewToggle({ view, onViewChange }: ViewToggleProps): React.JSX.Element {
  return (
    <div
      role="radiogroup"
      aria-label="Match view"
      className="flex items-center h-8 rounded-full ring-1 ring-inset ring-[#EAECF0] bg-white p-[3px] gap-0.5"
    >
      {VIEW_OPTIONS.map((option) => {
        const isActive = view === option.value;
        const Icon = option.icon;

        return (
          <button
            key={option.value}
            role="radio"
            aria-checked={isActive}
            onClick={() => onViewChange(option.value)}
            className="relative flex items-center justify-center gap-1.5 h-[26px] px-2.5 rounded-full transition-[color] duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3B82F6]/40"
            aria-label={`${option.label} view`}
          >
            {isActive && (
              <motion.div
                layoutId="matchViewToggle"
                className="absolute inset-0 bg-[#F5F5F5] rounded-full"
                transition={{ duration: 0.2, ease: [0.25, 0.46, 0.45, 0.94] }}
              />
            )}
            <Icon
              className={`relative z-10 w-3.5 h-3.5 transition-[color] duration-200 ${
                isActive ? "text-[#0D0D0D]" : "text-[#CCCCCC]"
              }`}
              strokeWidth={1.5}
            />
            <span
              className={`relative z-10 text-[11px] font-medium transition-[color] duration-200 ${
                isActive ? "text-[#0D0D0D]" : "text-[#CCCCCC]"
              }`}
            >
              {option.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
