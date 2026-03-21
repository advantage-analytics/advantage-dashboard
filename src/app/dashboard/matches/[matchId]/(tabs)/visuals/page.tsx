"use client";

import { useCallback } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";

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
      <CourtVisualization
        points={points}
        filters={filters}
        visualizationType={visualizationType}
        title={titleMap[visualizationType]}
        courtLabel={courtLabel}
        subtitle={buildSubtitle(visualizationType, filters, match)}
        onTabChange={handleTabClick}
      />

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
