"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

import { FilterPills } from "./filter-pills";
import {
  FilterConfig,
  FilterState,
  FilterContextData,
  FilterGroupConfig,
  FilterOption,
  isDynamicOption,
} from "./types/filters.types";

interface FiltersPanelProps {
  config: FilterConfig;
  filters: FilterState;
  onChange: (filters: FilterState) => void;
  onApply: () => void;
  contextData: FilterContextData;
}

const EASE_CURVE = [0.25, 0.46, 0.45, 0.94] as const;

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.05,
      delayChildren: 0.1,
    },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 8 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.3,
      ease: EASE_CURVE,
    },
  },
};

function resolveOptions(
  group: FilterGroupConfig,
  contextData: FilterContextData
): FilterOption[] {
  return group.options.map((option) => {
    if (isDynamicOption(option)) {
      return {
        value: option.value,
        label: contextData[option.labelKey],
      };
    }
    return option;
  });
}

export function FiltersPanel({
  config,
  filters,
  onChange,
  onApply,
  contextData,
}: FiltersPanelProps): React.JSX.Element {
  function updateFilter(key: string, value: string[]): void {
    onChange({ ...filters, [key]: value });
  }

  function clearAllFilters(): void {
    const cleared = Object.fromEntries(
      Object.keys(filters).map((key) => [key, []])
    );
    onChange(cleared);
  }

  const hasActiveFilters = Object.values(filters).some(
    (arr) => arr.length > 0
  );

  return (
    <motion.div
      className="bg-white border border-[#F3F3F3] rounded-[14px] shadow-[0px_4px_16px_0px_rgba(0,0,0,0.1)] p-5"
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      <motion.div
        className="flex items-center justify-between mb-5"
        variants={itemVariants}
      >
        <h3 className="text-[10px] font-medium uppercase tracking-[2.5px] text-[#AAAAAA]">Filters</h3>
        <button
          onClick={clearAllFilters}
          disabled={!hasActiveFilters}
          className={cn(
            "text-[9px] font-medium uppercase tracking-[1.5px] transition-colors duration-200",
            hasActiveFilters
              ? "text-[#3B82F6] hover:text-[#2563EB]"
              : "text-[#D9D9D9] pointer-events-none",
          )}
        >
          Clear all
        </button>
      </motion.div>

      <div className="grid grid-cols-3 gap-x-8 gap-y-4">
        {config.rows.map((row, rowIndex) =>
          row.map((group, colIndex) => (
            <motion.div
              key={group ? group.key : `empty-${rowIndex}-${colIndex}`}
              variants={itemVariants}
            >
              {group && (
                <FilterPills
                  label={group.label}
                  options={resolveOptions(group, contextData)}
                  selected={filters[group.key] ?? []}
                  onChange={(v) => updateFilter(group.key, v)}
                  multiSelect={group.multiSelect !== false}
                />
              )}
            </motion.div>
          ))
        )}
      </div>
    </motion.div>
  );
}
