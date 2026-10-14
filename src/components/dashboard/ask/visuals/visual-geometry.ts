/**
 * The arithmetic behind the Ask visual blocks, kept apart from the markup so
 * `tests/ask-visual-geometry.spec.ts` can hold it with no browser.
 *
 * Geometry only: every function here turns a resolved `value` into a width or
 * a coordinate. None of them produces a number anybody reads — what a block
 * prints is the server's `text`, never something computed here.
 */

/** A bar's width as a percentage of its track, held inside the track. */
export function barWidth(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(Math.max(value, 0), 100);
}

/**
 * Each part's share of a whole as a flex weight, or null when there is no
 * whole to divide (every count is zero): the caller draws an empty track
 * rather than three collapsed segments.
 */
export function shareWeights(counts: readonly number[]): number[] | null {
  const weights = counts.map((count) =>
    Number.isFinite(count) && count > 0 ? count : 0,
  );
  return weights.some((weight) => weight > 0) ? weights : null;
}

/** The trend plot's box, in viewBox units. The right gutter holds the last
 *  point's value, so the label never sits on the line. */
export const TREND_BOX = {
  width: 640,
  height: 120,
  top: 12,
  right: 60,
  bottom: 12,
  left: 6,
} as const;

export interface TrendGeometry {
  /** One coordinate per value, in order. */
  points: { x: number; y: number }[];
  /** The line through them, as an SVG path. */
  path: string;
  /** Where the mean of the values sits — the dashed rule. */
  averageY: number;
}

/**
 * Values in order as a line across the plot box, lowest value on the bottom
 * edge and highest on the top. Equal values have no range to spread over, so
 * they run as a flat line through the middle rather than along the floor.
 */
export function trendGeometry(
  values: readonly number[],
  box: typeof TREND_BOX = TREND_BOX,
): TrendGeometry {
  const innerW = box.width - box.left - box.right;
  const innerH = box.height - box.top - box.bottom;
  const middle = box.top + innerH / 2;
  if (values.length === 0) return { points: [], path: "", averageY: middle };

  const low = Math.min(...values);
  const high = Math.max(...values);
  const span = high - low;
  const round = (n: number) => Math.round(n * 100) / 100;
  const x = (index: number) =>
    round(
      box.left +
        (values.length === 1
          ? innerW / 2
          : (index / (values.length - 1)) * innerW),
    );
  const y = (value: number) =>
    span > 0
      ? round(box.top + innerH - ((value - low) / span) * innerH)
      : middle;

  const points = values.map((value, index) => ({ x: x(index), y: y(value) }));
  const average = values.reduce((sum, value) => sum + value, 0) / values.length;
  return {
    points,
    path: points
      .map((point, index) => `${index === 0 ? "M" : "L"}${point.x},${point.y}`)
      .join(" "),
    averageY: y(average),
  };
}
