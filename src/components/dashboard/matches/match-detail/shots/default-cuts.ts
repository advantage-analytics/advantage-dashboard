/**
 * Default cuts for the Visualizations tab redesign.
 * Five quick-start views that pre-populate the visualization with
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

/**
 * The default cuts as a JUDGED match shows them (`errorSplitJudged`) —
 * byte-identical to before forced errors existed. Read through
 * `defaultCutsFor`, never directly, so an unjudged match gets its Errors cut.
 */
export const DEFAULT_CUTS: DefaultCut[] = [
  {
    cut: "serve",
    chart: "scatter",
    name: "First serves, every zone",
    filters: { ball: ["first"] },
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
    filters: { ball: ["first"] },
    pills: ["1st serve", "Deuce + Ad"],
  },
  {
    cut: "rallyPlacement",
    chart: "scatter",
    name: "Rally placement",
    filters: {},
    pills: ["All rally shots"],
  },
  {
    cut: "errors",
    chart: "scatter",
    name: "Unforced errors",
    filters: { error: ["unforced"] },
    pills: ["Unforced", "All strokes"],
  },
];

/**
 * The errors cut on a match whose errors are not judged yet
 * (`MatchFilterContext.errorSplitJudged` false or absent): nobody has called
 * any error forced or unforced, so the cut is named "Errors" and opens on
 * every one of them — both kinds, double faults still out, as on the judged
 * cut. Error type's collapsed "Errors" option stores the same pair
 * (`collapseErrorFilter`).
 */
const UNJUDGED_ERRORS_CUT: DefaultCut = {
  cut: "errors",
  chart: "scatter",
  name: "Errors",
  filters: { error: ["unforced", "forced"] },
  pills: ["Errors", "All strokes"],
};

const UNJUDGED_DEFAULT_CUTS: DefaultCut[] = DEFAULT_CUTS.map((c) =>
  c.cut === "errors" ? UNJUDGED_ERRORS_CUT : c,
);

/** The default cuts for a match, by whether its errors are judged. */
export function defaultCutsFor(errorSplitJudged: boolean): DefaultCut[] {
  return errorSplitJudged ? DEFAULT_CUTS : UNJUDGED_DEFAULT_CUTS;
}
