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

  return (
    <motion.div
      className="bg-white rounded-2xl p-6"
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
          onClick={onApply}
          className="px-4 py-1.5 rounded-full text-xs font-medium border border-[#D9D9D9] text-[#666666] hover:bg-[#F5F5F5] transition-colors"
          whileTap={{ scale: 0.95 }}
        >
          Apply
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
