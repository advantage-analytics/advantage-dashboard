export type VisualizationType = "serve" | "return" | "custom";
export type CourtType = "half" | "full";

export interface FilterOption {
  value: string;
  label: string;
}

export interface DynamicFilterOption {
  value: string;
  labelKey: "player1Name" | "player2Name";
}

export interface FilterGroupConfig {
  key: string;
  label: string;
  options: (FilterOption | DynamicFilterOption)[];
  multiSelect?: boolean;
}

export type FilterRowConfig = (FilterGroupConfig | null)[];

export interface FilterConfig {
  type: VisualizationType;
  courtType: CourtType;
  rows: FilterRowConfig[];
}

export type FilterState = Record<string, string[]>;

export interface FilterContextData {
  player1Name: string;
  player2Name: string;
}

export function isDynamicOption(
  option: FilterOption | DynamicFilterOption
): option is DynamicFilterOption {
  return "labelKey" in option;
}

export function getDefaultFilterState(config: FilterConfig): FilterState {
  const state: FilterState = {};

  for (const row of config.rows) {
    for (const group of row) {
      if (group) {
        state[group.key] = [];
      }
    }
  }

  return state;
}
