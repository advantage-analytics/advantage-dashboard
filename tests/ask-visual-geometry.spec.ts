import { expect, test } from "@playwright/test";

import {
  TREND_BOX,
  barWidth,
  shareWeights,
  trendGeometry,
} from "@/components/dashboard/ask/visuals/visual-geometry";

/**
 * `visual-geometry.ts` — the arithmetic under the Ask visual blocks. Offline
 * and pure.
 *
 * The blocks draw whatever the query returned, and a query can return a
 * scope with nothing in it or the same number every time. What these guard
 * is the picture surviving that: no bar outside its track, no division by a
 * zero total, no `NaN` in an SVG path (which draws nothing and says nothing).
 */

test.describe("barWidth", () => {
  test("a percentage is its own width", () => {
    expect(barWidth(37.5)).toBe(37.5);
    expect(barWidth(0)).toBe(0);
    expect(barWidth(100)).toBe(100);
  });

  test("never leaves the track", () => {
    expect(barWidth(-4)).toBe(0);
    expect(barWidth(140)).toBe(100);
    expect(barWidth(Number.NaN)).toBe(0);
    expect(barWidth(Number.POSITIVE_INFINITY)).toBe(0);
  });
});

test.describe("shareWeights", () => {
  test("each count is its own weight", () => {
    expect(shareWeights([8, 11, 15])).toEqual([8, 11, 15]);
    // A part with nothing in it keeps its place, at no width.
    expect(shareWeights([9, 0, 6])).toEqual([9, 0, 6]);
  });

  test("no whole to divide is null, not a row of zero widths", () => {
    expect(shareWeights([0, 0, 0])).toBeNull();
    expect(shareWeights([])).toBeNull();
    expect(shareWeights([-3, Number.NaN])).toBeNull();
  });
});

test.describe("trendGeometry", () => {
  const top = TREND_BOX.top;
  const bottom = TREND_BOX.height - TREND_BOX.bottom;
  const left = TREND_BOX.left;
  const right = TREND_BOX.width - TREND_BOX.right;

  test("spreads the points edge to edge, highest at the top", () => {
    const { points, path, averageY } = trendGeometry([40, 60, 50]);

    expect(points.map((point) => point.x)).toEqual([
      left,
      (left + right) / 2,
      right,
    ]);
    expect(points.map((point) => point.y)).toEqual([
      bottom,
      top,
      (top + bottom) / 2,
    ]);
    // The mean (50) sits where the value 50 does.
    expect(averageY).toBe((top + bottom) / 2);
    expect(path).toBe(
      `M${left},${bottom} L${(left + right) / 2},${top} L${right},${(top + bottom) / 2}`,
    );
  });

  test("equal values are a flat line through the middle", () => {
    const { points, path, averageY } = trendGeometry([50, 50, 50]);
    const middle = (top + bottom) / 2;

    expect(points.every((point) => point.y === middle)).toBe(true);
    expect(averageY).toBe(middle);
    expect(path).not.toMatch(/NaN|Infinity/);
  });

  test("negative and mixed values stay inside the box", () => {
    const { points, averageY } = trendGeometry([-20.7, 2.6, 0, 25.5]);
    for (const point of points) {
      expect(point.y).toBeGreaterThanOrEqual(top);
      expect(point.y).toBeLessThanOrEqual(bottom);
      expect(point.x).toBeGreaterThanOrEqual(left);
      expect(point.x).toBeLessThanOrEqual(right);
    }
    expect(averageY).toBeGreaterThan(top);
    expect(averageY).toBeLessThan(bottom);
  });

  test("thirty points are thirty coordinates, in order", () => {
    const values = Array.from({ length: 30 }, (_, index) => index % 7);
    const { points } = trendGeometry(values);
    expect(points).toHaveLength(30);
    for (let index = 1; index < points.length; index += 1) {
      expect(points[index].x).toBeGreaterThan(points[index - 1].x);
    }
  });

  test("one point or none never divides by zero", () => {
    const one = trendGeometry([42]);
    expect(one.points).toEqual([
      { x: (left + right) / 2, y: (top + bottom) / 2 },
    ]);
    expect(one.path).not.toMatch(/NaN/);
    expect(trendGeometry([])).toEqual({
      points: [],
      path: "",
      averageY: (top + bottom) / 2,
    });
  });
});
