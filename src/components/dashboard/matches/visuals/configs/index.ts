import type { FilterConfig, VisualizationType } from "../types/filters.types";
import { customFiltersConfig } from "./custom-filters.config";
import { returnFiltersConfig } from "./return-filters.config";
import { serveFiltersConfig } from "./serve-filters.config";

export { customFiltersConfig } from "./custom-filters.config";
export { returnFiltersConfig } from "./return-filters.config";
export { serveFiltersConfig } from "./serve-filters.config";

const FILTER_CONFIGS: Record<VisualizationType, FilterConfig> = {
  serve: serveFiltersConfig,
  return: returnFiltersConfig,
  custom: customFiltersConfig,
};

export function getFilterConfig(type: VisualizationType): FilterConfig {
  return FILTER_CONFIGS[type];
}
