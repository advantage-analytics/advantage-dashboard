/**
 * The momentum plot's frame and paths — the mirrored area the match report's
 * Performance tracker draws a match's won-point differential on
 * (`performance-tracker-chart.tsx`). One viewBox, one plot height, one
 * midline and one way to turn a run of samples into the line and the area
 * under it. Pure: no React, no DOM.
 */

/** The viewBox's width; the SVG is stretched to the card. */
export const CHART_W = 1000;
export const CHART_H = 96;
/** Rendered plot height in px; the viewBox is stretched to it. */
export const PLOT_H = 104;
export const MID = CHART_H / 2;
/** Keeps the extreme of the series off the viewBox edge. */
export const Y_PAD = 6;

/** One sample's place on the plot: `[x, y]` in viewBox units. */
export type PlotCoord = readonly [number, number];

/**
 * A differential's y, scaled so the series' extreme (`maxAbs`, at least 1)
 * sits `Y_PAD` inside the edge: positive above the midline, negative below.
 */
export function momentumY(diff: number, maxAbs: number): number {
  return MID - (diff / maxAbs) * (MID - Y_PAD);
}

/** The line through one run of samples. */
export function runLinePath(run: readonly PlotCoord[]): string {
  return run.map(([cx, cy], k) => `${k ? "L" : "M"}${cx},${cy}`).join(" ");
}

/**
 * The run closed straight down to the midline, so the fill sits between the
 * series and the line the clip paths split on.
 */
export function runAreaPath(run: readonly PlotCoord[]): string {
  const [x0] = run[0];
  const [x1] = run[run.length - 1];
  return [
    `M${x0},${MID}`,
    ...run.map(([cx, cy]) => `L${cx},${cy}`),
    `L${x1},${MID}`,
    "Z",
  ].join(" ");
}
