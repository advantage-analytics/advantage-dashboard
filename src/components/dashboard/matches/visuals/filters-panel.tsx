"use client";

import { motion } from "framer-motion";

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
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      <motion.div
        className="flex items-center justify-between mb-5"
        variants={itemVariants}
      >
        <h3 className="text-xl font-medium text-[#0D0D0D]">Filters</h3>
        <motion.button
          onClick={clearAllFilters}
          disabled={!hasActiveFilters}
          className={`px-4 py-1.5 rounded-full text-xs font-medium transition-colors ${
            hasActiveFilters
              ? "ring-1 ring-inset ring-[#E5E5E5] text-[#525252] hover:bg-[#FEF2F2] hover:ring-[#FECACA] hover:text-[#EF4444]"
              : "text-[#CCCCCC] cursor-not-allowed"
          }`}
          whileTap={hasActiveFilters ? { scale: 0.95 } : undefined}
        >
          Clear all
        </motion.button>
      </motion.div>

      <div className="grid grid-cols-3 gap-x-8 gap-y-5">
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
