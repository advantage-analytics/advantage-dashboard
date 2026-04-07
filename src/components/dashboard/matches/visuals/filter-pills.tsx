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
      <span className="text-[10px] font-medium text-[#525252] whitespace-nowrap">{label}</span>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => {
          const isSelected = selected.includes(option.value);
          return (
            <button
              key={option.value}
              onClick={() => handleClick(option.value)}
              className={cn(
                "rounded-full h-8 px-3.5 text-[11px] font-medium whitespace-nowrap",
                "transition-[background-color,color,box-shadow] duration-200",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3B82F6]/40 focus-visible:ring-offset-1",
                "active:scale-[0.97]",
                isSelected
                  ? "bg-[#EBF2FD] text-[#3B82F6] ring-1 ring-inset ring-[#3B82F6]"
                  : "ring-1 ring-inset ring-[#EAECF0] text-[#525252] bg-white hover:bg-[#EFF6FF] hover:ring-[#3B82F6]/30 hover:text-[#3B82F6]",
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
