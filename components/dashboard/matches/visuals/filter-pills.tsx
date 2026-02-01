"use client";

import { motion } from "framer-motion";

interface FilterOption {
  value: string;
  label: string;
}

interface FilterPillsProps {
  label: string;
  options: FilterOption[];
  selected: string[];
  onChange: (selected: string[]) => void;
  multiSelect?: boolean;
}

export function FilterPills({
  label,
  options,
  selected,
  onChange,
  multiSelect = true,
}: FilterPillsProps): React.JSX.Element {
  function handleClick(value: string): void {
    const isCurrentlySelected = selected.includes(value);

    if (multiSelect) {
      const newSelection = isCurrentlySelected
        ? selected.filter((v) => v !== value)
        : [...selected, value];
      onChange(newSelection);
    } else {
      onChange(isCurrentlySelected ? [] : [value]);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs font-medium text-[#999999]">{label}</span>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => {
          const isSelected = selected.includes(option.value);
          return (
            <motion.button
              key={option.value}
              onClick={() => handleClick(option.value)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                isSelected
                  ? "bg-[#0D0D0D] text-white"
                  : "bg-white text-[#666666] border border-[#D9D9D9] hover:border-[#999999]"
              }`}
            >
              {option.label}
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}
