"use client";

import { useCallback } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";

import { FiltersPanel } from "@/components/dashboard/matches/visuals/filters-panel";
import { VisualizationType } from "@/components/dashboard/matches/visuals/types/filters.types";
import { useVisualFilters } from "@/hooks/use-visual-filters";

const VISUALIZATION_TABS: { value: VisualizationType; label: string }[] = [
  { value: "serve", label: "Serves" },
  { value: "return", label: "Returns" },
  { value: "custom", label: "Custom" },
];

// TODO: Get player names from match context
const CONTEXT_DATA = {
  player1Name: "Rudy Quan",
  player2Name: "Federico Gomez",
};

export default function VisualsPage(): React.JSX.Element {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const vizParam = searchParams.get("viz") as VisualizationType | null;

  const {
    visualizationType,
    setVisualizationType,
    courtType,
    config,
    filters,
    setFilters,
    applyFilters,
  } = useVisualFilters({ initialType: vizParam ?? "serve" });

  const handleTabClick = useCallback(
    (type: VisualizationType) => {
      setVisualizationType(type);
      router.replace(pathname + "?viz=" + type, { scroll: false });
    },
    [setVisualizationType, router, pathname]
  );

  const courtLabel = courtType === "half" ? "Half Court" : "Full Court";

  return (
    <div className="space-y-6 mb-64">
      <div className="bg-white rounded-2xl p-6">
        <div className="flex items-center gap-2 mb-4">
          <h3 className="text-xl font-medium text-[#0D0D0D]">Visualization</h3>
          <span className="text-xs text-[#999999] px-2 py-0.5 rounded-full bg-[#F5F5F5]">
            {courtLabel}
          </span>
        </div>

        <div className="flex gap-2 mb-6">
          {VISUALIZATION_TABS.map((tab) => (
            <motion.button
              key={tab.value}
              onClick={() => handleTabClick(tab.value)}
              className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                visualizationType === tab.value
                  ? "bg-[#0D0D0D] text-white"
                  : "bg-white text-[#666666] border border-[#D9D9D9] hover:border-[#999999]"
              }`}
              whileTap={{ scale: 0.95 }}
            >
              {tab.label}
            </motion.button>
          ))}
        </div>

        {/* Court Visualization Placeholder */}
        <div className="w-full h-[500px] bg-[#F5F5F5] rounded-xl border-2 border-dashed border-[#D9D9D9] flex items-center justify-center">
          <div className="text-center">
            <p className="text-[#999999] text-lg font-medium">
              {courtLabel} Visualization
            </p>
            <p className="text-[#CCCCCC] text-sm mt-1">
              Court visualization will appear here
            </p>
          </div>
        </div>
      </div>

      <FiltersPanel
        key={visualizationType}
        config={config}
        filters={filters}
        onChange={setFilters}
        onApply={applyFilters}
        contextData={CONTEXT_DATA}
      />
    </div>
  );
}
