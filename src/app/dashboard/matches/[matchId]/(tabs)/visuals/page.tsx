"use client";

import { useCallback } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { Settings } from "lucide-react";

import dynamic from "next/dynamic";
import { FiltersPanel } from "@/components/dashboard/matches/visuals/filters-panel";
import {
  VisualizationType,
  FilterState,
} from "@/components/dashboard/matches/visuals/types/filters.types";
import { useVisualFilters } from "@/hooks/use-visual-filters";
import { useMatchData } from "@/components/dashboard/matches/match-data-provider";
import { shortName } from "@/lib/data/match-utils";
import type { Match } from "@/lib/data/types";

const CourtVisualization = dynamic(
  () =>
    import(
      "@/components/dashboard/matches/visuals/court-visualization"
    ).then((mod) => mod.CourtVisualization),
  { ssr: false }
);

const VISUALIZATION_TABS: { value: VisualizationType; label: string }[] = [
  { value: "serve", label: "Serve" },
  { value: "return", label: "Return" },
  { value: "custom", label: "Custom" },
];

function buildSubtitle(
  type: VisualizationType,
  filters: FilterState,
  match: Match
): string {
  const parts: string[] = [];

  const playerId = filters.player?.[0];
  if (playerId) {
    const playerName =
      playerId === "player1"
        ? shortName(match.player1.name)
        : shortName(match.player2.name);
    parts.push(playerName);
  }

  const serveType = filters.type?.[0];
  if (serveType) {
    parts.push(serveType === "first" ? "First Serve" : "Second Serve");
  } else if (type !== "custom") {
    parts.push(type === "serve" ? "Serve" : "Return");
  }

  const side = filters.side?.[0];
  if (side) {
    parts.push(side === "deuce" ? "Deuce" : "Ad");
  }

  if (parts.length === 0) {
    const label = type === "serve" ? "Serve" : type === "return" ? "Return" : "Custom";
    return `Now showing ${label} Placement Statistics...`;
  }

  return `Now showing ${parts.join(" ")} Placement Statistics...`;
}

export default function VisualsPage(): React.JSX.Element {
  const { match, points } = useMatchData();
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

  const courtLabel = courtType === "half" ? "Half-Court" : "Full-Court";

  const titleMap: Record<VisualizationType, string> = {
    serve: "Serve Placement Visualization",
    return: "Return Placement & Contact Visualization",
    custom: "Custom Visualization",
  };

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center justify-between mb-6">
          {/* Left side — title + subtitle */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <h3 className="text-base font-medium text-[#0D0D0D]">
                {titleMap[visualizationType]}
              </h3>
              <span
                className={`text-white text-[10px] font-medium px-2 py-1 rounded-[16px] ${
                  visualizationType === "return"
                    ? "bg-[#F38439]"
                    : "bg-[rgba(106,171,255,0.9)]"
                }`}
              >
                {courtLabel}
              </span>
            </div>
            <p className="text-xs font-normal italic text-[#999999]">
              {buildSubtitle(visualizationType, filters, match)}
            </p>
          </div>

          {/* Right side — segmented control + gear */}
          <div className="flex items-center gap-2">
            <div className="bg-[#F1F1F1]/60 rounded-[16px] p-1 flex items-center gap-1">
              {VISUALIZATION_TABS.slice(0, 2).map((tab) => (
                <button
                  key={tab.value}
                  onClick={() => handleTabClick(tab.value)}
                  className="relative px-2 py-1 text-[10px] font-medium"
                >
                  {visualizationType === tab.value && (
                    <motion.div
                      layoutId="visualsTabHighlight"
                      className="absolute inset-0 bg-white rounded-[16px]"
                      transition={{
                        type: "spring",
                        stiffness: 500,
                        damping: 35,
                      }}
                    />
                  )}
                  <span
                    className={`relative z-10 ${
                      visualizationType === tab.value
                        ? "text-black"
                        : "text-[#525252]"
                    }`}
                  >
                    {tab.label}
                  </span>
                </button>
              ))}
            </div>
            <Settings
              size={16}
              className="text-[#999999] cursor-pointer hover:text-[#666666]"
            />
          </div>
        </div>

        {/* Court Visualization */}
        <CourtVisualization
          points={points}
          filters={filters}
          visualizationType={visualizationType}
        />
      </div>

      <FiltersPanel
        key={visualizationType}
        config={config}
        filters={filters}
        onChange={setFilters}
        onApply={applyFilters}
        contextData={{ player1Name: match.player1.name, player2Name: match.player2.name }}
      />
    </div>
  );
}
