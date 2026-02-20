"use client";

import { motion } from "framer-motion";

export type MatchView = "gallery" | "list";

interface ViewToggleProps {
  view: MatchView;
  onViewChange: (view: MatchView) => void;
}

const VIEW_OPTIONS: { value: MatchView; label: string }[] = [
  { value: "gallery", label: "Gallery" },
  { value: "list", label: "List" },
];

export function ViewToggle({ view, onViewChange }: ViewToggleProps): React.JSX.Element {
  return (
    <div className="flex bg-[#F1F1F1]/60 rounded-full p-[3px]">
      {VIEW_OPTIONS.map((option) => {
        const isActive = view === option.value;

        return (
          <button
            key={option.value}
            onClick={() => onViewChange(option.value)}
            className="relative w-12 px-2 py-1 text-[10px] font-medium rounded-full transition-colors"
          >
            {isActive && (
              <motion.div
                layoutId="matchViewToggle"
                className="absolute inset-0 bg-white rounded-full"
                transition={{ type: "spring", stiffness: 500, damping: 35 }}
              />
            )}
            <span
              className={`relative z-10 ${
                isActive ? "text-[#000000]" : "text-[#525252]"
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
