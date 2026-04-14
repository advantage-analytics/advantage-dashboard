"use client";

import { cn } from "@/lib/utils";

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
  pillClassName?: string;
  className?: string;
}

export function FilterPills({
  label,
  options,
  selected,
  onChange,
  multiSelect = true,
  pillClassName,
  className,
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
    <div className={cn("flex flex-col gap-2 min-w-0", className)}>
      <span className="text-[12px] font-medium text-[#999999]">{label}</span>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => {
          const isSelected = selected.includes(option.value);
          return (
            <button
              key={option.value}
              onClick={() => handleClick(option.value)}
              className={cn(
                "rounded-[16px] px-4 py-1.5 text-[12px] font-medium whitespace-nowrap cursor-pointer",
                "transition-colors duration-200",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3B82F6]/40 focus-visible:ring-offset-1",
                isSelected
                  ? "bg-[#60A5FA] text-white"
                  : "border border-[#D9D9D9] text-[#525252] bg-white hover:bg-[#F5F5F5]",
                pillClassName,
              )}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
