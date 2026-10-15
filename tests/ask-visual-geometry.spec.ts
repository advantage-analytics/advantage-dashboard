import { expect, test } from "@playwright/test";

import {
  MOMENTUM_BOX,
  TREND_BOX,
  barWidth,
  momentumGeometry,
  serveCourtCells,
  serveCourtSides,
  shareWeights,
  trendGeometry,
} from "@/components/dashboard/ask/visuals/visual-geometry";
import {
  BASELINE_Y,
  CENTER_X,
  SERVICE_Y,
  SINGLES_LEFT,
  SINGLES_RIGHT,
} from "@/lib/data/serve-zones";

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

  test("a second series shares the scale, and is ignored unless it has one value per point", () => {
    const { points, baseline, averageY } = trendGeometry(
      [40, 60, 50],
      TREND_BOX,
      [20, 20, 20],
    );
    // The scale now runs 20–60: the baseline sits on the floor, 40 at the
    // half-way mark, and the mean of the drawn values (50) three quarters up.
    expect(baseline?.points.map((point) => point.y)).toEqual([
      bottom,
      bottom,
      bottom,
    ]);
    expect(baseline?.points.map((point) => point.x)).toEqual(
      points.map((point) => point.x),
    );
    expect(points[0].y).toBe((top + bottom) / 2);
    expect(points[1].y).toBe(top);
    expect(averageY).toBe(top + (bottom - top) / 4);
    expect(baseline?.path).toBe(
      `M${left},${bottom} L${(left + right) / 2},${bottom} L${right},${bottom}`,
    );

    expect(trendGeometry([40, 60, 50], TREND_BOX, [20, 20])).not.toHaveProperty(
      "baseline",
    );
    expect(trendGeometry([40, 60, 50])).not.toHaveProperty("baseline");
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

test.describe("momentumGeometry", () => {
  const top = MOMENTUM_BOX.top;
  const bottom = MOMENTUM_BOX.height - MOMENTUM_BOX.bottom;
  const left = MOMENTUM_BOX.left;
  const right = MOMENTUM_BOX.width - MOMENTUM_BOX.right;
  const zero = (top + bottom) / 2;

  test("the running difference, symmetric about level, from level before the first point", () => {
    const { points, path, zeroY, sets } = momentumGeometry([
      { won: true, set: 1 },
      { won: true, set: 1 },
      { won: false, set: 2 },
      { won: false, set: 2 },
      { won: false, set: 2 },
    ]);
    // +1, +2, +1, 0, −1: the reach is 2, so +2 is the top edge and −1 half
    // way down from level.
    expect(zeroY).toBe(zero);
    expect(points.map((point) => point.y)).toEqual([
      zero - (bottom - top) / 4,
      top,
      zero - (bottom - top) / 4,
      zero,
      zero + (bottom - top) / 4,
    ]);
    expect(points[4].x).toBe(right);
    expect(path.startsWith(`M${left},${zero} L`)).toBe(true);
    expect(path).not.toMatch(/NaN/);
    // Two sets: the first spans from the left edge to its last point, the
    // second from there to the right edge.
    expect(sets).toEqual([
      { set: 1, x1: left, x2: points[1].x },
      { set: 2, x1: points[1].x, x2: right },
    ]);
  });

  test("all won fills the top half; no sets named is no segments; nothing is empty", () => {
    const won = momentumGeometry([{ won: true }, { won: true }]);
    expect(won.points.map((point) => point.y)).toEqual([
      zero - (bottom - top) / 4,
      top,
    ]);
    expect(won.sets).toEqual([]);
    expect(momentumGeometry([])).toEqual({
      points: [],
      path: "",
      zeroY: zero,
      sets: [],
    });
  });
});

test.describe("serveCourtSides", () => {
  test("exactly two courts, one deuce and one ad, in either order and any case", () => {
    expect(serveCourtSides([{ label: "Deuce" }, { label: "Ad" }])).toEqual({
      deuce: 0,
      ad: 1,
    });
    expect(
      serveCourtSides([{ label: "ad court" }, { label: " DEUCE side " }]),
    ).toEqual({ deuce: 1, ad: 0 });
  });

  test("any other labelling is bars, not a court", () => {
    expect(
      serveCourtSides([{ label: "First serves" }, { label: "Second serves" }]),
    ).toBeNull();
    expect(
      serveCourtSides([{ label: "Deuce" }, { label: "Deuce" }]),
    ).toBeNull();
    expect(serveCourtSides([{ label: "Deuce" }])).toBeNull();
    expect(
      serveCourtSides([{ label: "Deuce" }, { label: "Ad" }, { label: "All" }]),
    ).toBeNull();
    expect(
      serveCourtSides([{ label: "Deuce serves won" }, { label: "Ad" }]),
    ).toBeNull();
  });
});

test.describe("serveCourtCells", () => {
  const depth = BASELINE_Y - SERVICE_Y;

  test("each zone stands in its third of its box, rising from the net line by its share", () => {
    const cells = serveCourtCells("deuce", { t: 9, body: 3, wide: 6 });
    expect(cells.map((cell) => cell.zone)).toEqual(["t", "body", "wide"]);
    // The deuce box is the left one: wide at the sideline, T at the centre line.
    const byZone = Object.fromEntries(cells.map((cell) => [cell.zone, cell]));
    expect(byZone.wide.x).toBe(SINGLES_LEFT);
    expect(byZone.t.x + byZone.t.width).toBeCloseTo(CENTER_X, 2);
    // Each edge is rounded on its own, so neighbours meet within a hundredth.
    expect(byZone.body.x).toBeCloseTo(byZone.wide.x + byZone.wide.width, 1);
    expect(byZone.t.x).toBeCloseTo(byZone.body.x + byZone.body.width, 1);
    // Shares of the court's eighteen serves, as heights of the box depth.
    expect(byZone.t.share).toBe(0.5);
    expect(byZone.t.height).toBeCloseTo(depth / 2, 2);
    expect(byZone.body.height).toBeCloseTo(depth / 6, 2);
    expect(byZone.wide.height).toBeCloseTo(depth / 3, 2);
    for (const cell of cells) {
      expect(cell.y + cell.height).toBeCloseTo(BASELINE_Y, 2);
      expect(cell.y).toBeGreaterThanOrEqual(SERVICE_Y);
    }
  });

  test("the ad box is the right one, T at the centre line and wide at the sideline", () => {
    const cells = serveCourtCells("ad", { t: 1, body: 1, wide: 1 });
    const byZone = Object.fromEntries(cells.map((cell) => [cell.zone, cell]));
    expect(byZone.t.x).toBeCloseTo(CENTER_X, 2);
    expect(byZone.wide.x + byZone.wide.width).toBeCloseTo(SINGLES_RIGHT, 2);
    for (const cell of cells) expect(cell.height).toBeCloseTo(depth / 3, 2);
  });

  test("no serves is no column, and never a NaN", () => {
    const cells = serveCourtCells("deuce", { t: 0, body: 0, wide: 0 });
    for (const cell of cells) {
      expect(cell.height).toBe(0);
      expect(cell.share).toBe(0);
      expect(cell.y).toBe(BASELINE_Y);
    }
    const one = serveCourtCells("ad", { t: 0, body: 4, wide: Number.NaN });
    expect(one.map((cell) => cell.share)).toEqual([0, 1, 0]);
    expect(JSON.stringify(one)).not.toMatch(/NaN|Infinity/);
  });
});
