"use client";

import { useState, useMemo, useCallback } from "react";

import {
  VisualizationType,
  CourtType,
  FilterState,
  FilterConfig,
  getDefaultFilterState,
} from "@/components/dashboard/matches/visuals/types/filters.types";
import { getFilterConfig } from "@/components/dashboard/matches/visuals/configs";

const DEFAULT_PLAYER = "player1";

interface UseVisualFiltersOptions {
  initialType?: VisualizationType;
  initialPlayer?: string;
}

interface UseVisualFiltersReturn {
  visualizationType: VisualizationType;
  setVisualizationType: (type: VisualizationType) => void;
  courtType: CourtType;
  config: FilterConfig;
  filters: FilterState;
  setFilters: (filters: FilterState) => void;
  updateFilter: (key: string, value: string[]) => void;
  resetFilters: () => void;
  applyFilters: () => void;
  activeFilterCount: number;
}

function createDefaultState(config: FilterConfig, player: string): FilterState {
  const state = getDefaultFilterState(config);
  state.player = [player];
  return state;
}

export function useVisualFilters(
  options: UseVisualFiltersOptions = {}
): UseVisualFiltersReturn {
  const { initialType = "serve", initialPlayer = DEFAULT_PLAYER } = options;

  const [visualizationType, setVisualizationType] =
    useState<VisualizationType>(initialType);

  const config = useMemo(
    () => getFilterConfig(visualizationType),
    [visualizationType]
  );

  const [filters, setFilters] = useState<FilterState>(() =>
    createDefaultState(config, initialPlayer)
  );

  const handleSetVisualizationType = useCallback(
    (type: VisualizationType) => {
      setVisualizationType(type);
      const newConfig = getFilterConfig(type);
      const currentPlayer = filters.player?.[0] ?? DEFAULT_PLAYER;
      setFilters(createDefaultState(newConfig, currentPlayer));
    },
    [filters.player]
  );

  const updateFilter = useCallback((key: string, value: string[]) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  }, []);

  const resetFilters = useCallback(() => {
    setFilters(createDefaultState(config, DEFAULT_PLAYER));
  }, [config]);

  const applyFilters = useCallback(() => {
    // Placeholder for triggering filter application (analytics, API calls, etc.)
  }, []);

  const activeFilterCount = useMemo(
    () => Object.values(filters).reduce((count, values) => count + values.length, 0),
    [filters]
  );

  return {
    visualizationType,
    setVisualizationType: handleSetVisualizationType,
    courtType: config.courtType,
    config,
    filters,
    setFilters,
    updateFilter,
    resetFilters,
    applyFilters,
    activeFilterCount,
  };
}
