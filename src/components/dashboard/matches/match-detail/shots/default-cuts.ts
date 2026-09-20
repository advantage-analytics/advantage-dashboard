/**
 * Default cuts for the Visualizations tab redesign.
 * Three quick-start views that pre-populate the visualization with
 * sensible filters and pill labels.
 *
 * Pure TypeScript; no React, no "use client".
 */

import type { Cut, Chart, VizFilters } from "./viz-model";

export interface DefaultCut {
  cut: Cut;
  chart: Chart;
  name: string;
  filters: Partial<VizFilters>;
  pills: string[];
}

export const DEFAULT_CUTS: DefaultCut[] = [
  {
    cut: "serve",
    chart: "scatter",
    name: "First serves, every zone",
    filters: { ball: "first" },
    pills: ["1st", "All zones", "Deuce + Ad"],
  },
  {
    cut: "returnPlacement",
    chart: "scatter",
    name: "Return placement",
    filters: {},
    pills: ["All strokes", "Deuce + Ad"],
  },
  {
    cut: "returnContact",
    chart: "scatter",
    name: "Return contact",
    filters: { ball: "first" },
    pills: ["1st serve", "Deuce + Ad"],
  },
];
