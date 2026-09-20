import { expect, test } from "@playwright/test";
import {
  SERVE_COURT,
  RETURN_COURT,
  SERVE_HEAT_BOUNDS,
  RETURN_HEAT_BOUNDS,
  projectServeDot,
  projectReturnDot,
  zoneCellX,
  zoneOpacity,
  ZONE_OPACITY_MIN,
  ZONE_OPACITY_MAX,
  trianglePointsFor,
  starPoints,
  heatCellRect,
  heatCellStyle,
  type HeatBounds,
} from "@/components/dashboard/matches/match-detail/shots/court-geometry";

/**
 * Pure and offline — no browser needed. Coverage for the design's own two
 * frames (F4, frame P1a — see `design-court-frames.md`), copied verbatim
 * into `court-geometry.ts`'s constants: the serve half court's baseline/net
 * span and the return full court's depth/lateral projections, including the
 * sign the lateral axis needs for each return kind.
 */

test.describe("serve frame", () => {
  test("a dot at fraction y=0 lands on the service line", () => {
    const { cy } = projectServeDot({ x: 0.5, y: 0 });
    expect(cy).toBe(SERVE_COURT.serviceLineY);
    expect(cy).toBe(116.5);
  });

  test("a dot at fraction y=1 lands on the net", () => {
    const { cy } = projectServeDot({ x: 0.5, y: 1 });
    expect(cy).toBe(SERVE_COURT.netY);
    expect(cy).toBe(236);
  });

  test("a dot at fraction x=0 lands on the singles left sideline", () => {
    const { cx } = projectServeDot({ x: 0, y: 0.5 });
    expect(cx).toBe(SERVE_COURT.singlesLeft);
    expect(cx).toBe(166.25);
  });

  test("a dot at fraction x=1 lands on the singles right sideline", () => {
    const { cx } = projectServeDot({ x: 1, y: 0.5 });
    expect(cx).toBe(SERVE_COURT.singlesRight);
    expect(cx).toBe(353.75);
  });

  test("zone band spans the service-line-to-net span", () => {
    expect(SERVE_COURT.zoneTop).toBe(116.5);
    expect(SERVE_COURT.zoneBottom).toBe(236);
  });

  test("six equal 31.25-wide zone cells span the singles box", () => {
    const cells = Array.from({ length: 6 }, (_, i) => zoneCellX(i));
    expect(cells[0].x1).toBe(SERVE_COURT.singlesLeft);
    expect(cells[5].x2).toBe(SERVE_COURT.singlesRight);
    for (const cell of cells) {
      expect(cell.x2 - cell.x1).toBeCloseTo(31.25, 5);
    }
    // Contiguous, left to right, no gaps or overlaps.
    for (let i = 1; i < cells.length; i++) {
      expect(cells[i].x1).toBeCloseTo(cells[i - 1].x2, 5);
    }
  });

  test("orientation: net below service line below baseline", () => {
    expect(SERVE_COURT.netY).toBeGreaterThan(SERVE_COURT.serviceLineY);
    expect(SERVE_COURT.serviceLineY).toBeGreaterThan(SERVE_COURT.baselineY);
  });
});

test.describe("return frame — contact", () => {
  test("contact at the baseline (depthM=0) lands at x=440", () => {
    const { cx } = projectReturnDot("contact", { lateralM: 0, depthM: 0 });
    expect(cx).toBe(RETURN_COURT.nearBaselineX);
    expect(cx).toBe(440);
  });

  test("contact 5 ft (1.524 m) behind the baseline lands at x≈465.6", () => {
    const { cx } = projectReturnDot("contact", {
      lateralM: 0,
      depthM: 1.524,
    });
    expect(cx).toBeCloseTo(465.6, 1);
  });

  test("contact 1 m inside the baseline lands at x≈423.17", () => {
    const { cx } = projectReturnDot("contact", {
      lateralM: 0,
      depthM: -1,
    });
    expect(cx).toBeCloseTo(423.17, 1);
  });

  // Lateral sign for "contact" (no extra CSS rotation on the svg): positive
  // lateralM is the returner's RIGHT, which this frame's own `<g rotate(90)>`
  // + translate chain puts on-screen-right when y DECREASES toward
  // `singlesTop` — see `projectReturnDot`'s doc comment for the full
  // derivation. So positive lateralM must map to the SMALLER y.
  test("lateral 0 lands on the centre line", () => {
    const { cy } = projectReturnDot("contact", { lateralM: 0, depthM: 0 });
    expect(cy).toBe(RETURN_COURT.centerY);
    expect(cy).toBe(104.5);
  });

  test("+4.115 m (singles half-width, returner's right) lands on singlesTop", () => {
    const { cy } = projectReturnDot("contact", {
      lateralM: 4.115,
      depthM: 0,
    });
    expect(cy).toBeCloseTo(RETURN_COURT.singlesTop, 1);
    expect(cy).toBeCloseTo(35.1, 1);
  });

  test("-4.115 m (returner's left) lands on singlesBottom", () => {
    const { cy } = projectReturnDot("contact", {
      lateralM: -4.115,
      depthM: 0,
    });
    expect(cy).toBeCloseTo(RETURN_COURT.singlesBottom, 1);
    expect(cy).toBeCloseTo(173.9, 1);
  });
});

test.describe("return frame — placement", () => {
  test("at the net (depthM=0) lands at x=240", () => {
    const { cx } = projectReturnDot("placement", { lateralM: 0, depthM: 0 });
    expect(cx).toBe(RETURN_COURT.netX);
    expect(cx).toBe(240);
  });

  test("on that half's baseline (depthM≈11.885) lands at x≈440", () => {
    const { cx } = projectReturnDot("placement", {
      lateralM: 0,
      depthM: 11.885,
    });
    expect(cx).toBeCloseTo(440, 0);
  });

  // Placement's svg additionally sets `style="transform: rotate(180deg)"`
  // (copied from the design), which mirrors the whole rendered image both
  // left/right AND up/down. To still land a returner's-right dot on the
  // viewer's right after that extra flip, the lateral sign here must be the
  // OPPOSITE of "contact"'s: positive lateralM maps to the LARGER y.
  test("+4.115 m (returner's right) lands on singlesBottom, opposite of contact", () => {
    const { cy } = projectReturnDot("placement", {
      lateralM: 4.115,
      depthM: 0,
    });
    expect(cy).toBeCloseTo(RETURN_COURT.singlesBottom, 1);
    expect(cy).toBeCloseTo(173.9, 1);
  });

  test("-4.115 m (returner's left) lands on singlesTop, opposite of contact", () => {
    const { cy } = projectReturnDot("placement", {
      lateralM: -4.115,
      depthM: 0,
    });
    expect(cy).toBeCloseTo(RETURN_COURT.singlesTop, 1);
    expect(cy).toBeCloseTo(35.1, 1);
  });
});

/**
 * Zone cell opacity (visual-fix round 2, Defect B): cells shade relative to
 * the busiest zone actually drawn (`maxPct`), not a fixed 0–100 scale.
 */
test("zoneOpacity: pct=0 reads at the minimum shade", () => {
  expect(zoneOpacity(0, 40)).toBe(ZONE_OPACITY_MIN);
});

test("zoneOpacity: pct=maxPct reads at the maximum shade", () => {
  expect(zoneOpacity(40, 40)).toBe(ZONE_OPACITY_MAX);
});

test("zoneOpacity is monotonically increasing in pct", () => {
  const steps = [0, 5, 10, 20, 30, 40].map((pct) => zoneOpacity(pct, 40));
  for (let i = 1; i < steps.length; i++) {
    expect(steps[i]).toBeGreaterThan(steps[i - 1]);
  }
});

test("zoneOpacity: maxPct=0 reads at the minimum shade (no divide-by-zero)", () => {
  expect(zoneOpacity(0, 0)).toBe(ZONE_OPACITY_MIN);
  expect(zoneOpacity(5, 0)).toBe(ZONE_OPACITY_MIN);
});

/**
 * G2 — the apex must land screen-UP for every kind `trianglePointsFor`
 * draws, not just look plausible in local coordinates. `court-art.tsx`
 * applies these frame transforms on top of whatever this module returns:
 *   - "serve": no rotation at all (the serve `<svg>` has none) — local −y
 *     already IS screen-up, so this is the identity case.
 *   - "contact": the return frame's outer `<g rotate(90 240 104.5)>`, and
 *     nothing else.
 *   - "placement": the SAME outer rotate(90), plus the extra CSS
 *     `transform: rotate(180deg)` `court-art.tsx` sets on that `<svg>`.
 * A rigid rotation's effect on the RELATIVE position of two points doesn't
 * depend on the rotation's center (p1' - p2' = R(p1 - p2) for any center),
 * so these helpers rotate the raw (x, y) pairs `trianglePointsFor` returns
 * around the origin — matching `court-art.tsx`'s own comment that
 * `rotate(90)` maps local `(x, y) -> (-y, x)` — and the topmost-vertex
 * comparison below is exactly as valid as composing the real transform
 * chain (translate/scale steps in between are uniform and don't rotate, so
 * they can't change which vertex ends up on top either).
 */
function parseTrianglePoints(
  pointsAttr: string,
): [
  { x: number; y: number },
  { x: number; y: number },
  { x: number; y: number },
] {
  const pts = pointsAttr
    .trim()
    .split(/\s+/)
    .map((pair) => {
      const [x, y] = pair.split(",").map(Number);
      return { x, y };
    });
  if (pts.length !== 3) throw new Error(`expected 3 points, got ${pts.length}`);
  return pts as [
    { x: number; y: number },
    { x: number; y: number },
    { x: number; y: number },
  ];
}

// SVG rotate(90 …) maps a vector (x, y) -> (-y, x).
function rotate90({ x, y }: { x: number; y: number }) {
  return { x: -y, y: x };
}

// CSS rotate(180deg) negates both axes.
function rotate180({ x, y }: { x: number; y: number }) {
  return { x: -x, y: -y };
}

test.describe("trianglePointsFor — apex points screen-up", () => {
  test("serve: apex is the topmost vertex with no frame rotation applied", () => {
    const [apex, baseLeft, baseRight] = parseTrianglePoints(
      trianglePointsFor("serve", 260, 150, 2.54),
    );
    expect(apex.y).toBeLessThan(baseLeft.y);
    expect(apex.y).toBeLessThan(baseRight.y);
  });

  test("contact: apex is topmost after composing the outer rotate(90)", () => {
    const raw = parseTrianglePoints(trianglePointsFor("contact", 300, 90, 2.4));
    const [apex, baseLeft, baseRight] = raw.map(rotate90);
    expect(apex.y).toBeLessThan(baseLeft.y);
    expect(apex.y).toBeLessThan(baseRight.y);
  });

  test("placement: apex is topmost after composing rotate(90) then the svg's own rotate(180deg)", () => {
    const raw = parseTrianglePoints(
      trianglePointsFor("placement", 300, 90, 2.4),
    );
    const [apex, baseLeft, baseRight] = raw.map((p) => rotate180(rotate90(p)));
    expect(apex.y).toBeLessThan(baseLeft.y);
    expect(apex.y).toBeLessThan(baseRight.y);
  });

  test("area and centroid match the pre-G2 triangle for a given size", () => {
    // Same shoelace/centroid maths the original trianglePoints() produced —
    // orientation changed, size/shape did not.
    function area(pts: { x: number; y: number }[]): number {
      let a = 0;
      for (let i = 0; i < pts.length; i++) {
        const p1 = pts[i];
        const p2 = pts[(i + 1) % pts.length];
        a += p1.x * p2.y - p2.x * p1.y;
      }
      return Math.abs(a) / 2;
    }
    function centroid(pts: { x: number; y: number }[]): {
      x: number;
      y: number;
    } {
      return {
        x: pts.reduce((s, p) => s + p.x, 0) / pts.length,
        y: pts.reduce((s, p) => s + p.y, 0) / pts.length,
      };
    }
    const servePts = parseTrianglePoints(
      trianglePointsFor("serve", 50, 50, 2.54),
    );
    const contactPts = parseTrianglePoints(
      trianglePointsFor("contact", 50, 50, 2.54),
    );
    const placementPts = parseTrianglePoints(
      trianglePointsFor("placement", 50, 50, 2.54),
    );
    const serveArea = area(servePts);
    expect(area(contactPts)).toBeCloseTo(serveArea, 5);
    expect(area(placementPts)).toBeCloseTo(serveArea, 5);
    // The 1.1883 / 0.5942 apex/base constants (carried over from the
    // pre-G2 `trianglePoints`) aren't exactly 2:1, so the centroid sits a
    // hair off center — precision 2 tolerates that rounding, not a real
    // orientation bug.
    for (const pts of [servePts, contactPts, placementPts]) {
      const c = centroid(pts);
      expect(c.x).toBeCloseTo(50, 2);
      expect(c.y).toBeCloseTo(50, 2);
    }
  });
});

/**
 * G2b — the ace star: 10 vertices alternating outer/inner radius, first
 * vertex straight up on screen (y decreases upward, so the first vertex is
 * (cx, cy - outerR)).
 */
test.describe("starPoints", () => {
  test("returns 10 vertices", () => {
    const pts = parseTrianglePointsLoose(starPoints(0, 0, 10));
    expect(pts).toHaveLength(10);
  });

  test("first vertex is straight up (cx, cy - outerR)", () => {
    const pts = parseTrianglePointsLoose(starPoints(4, 4, 3.7));
    expect(pts[0].x).toBeCloseTo(4, 5);
    expect(pts[0].y).toBeCloseTo(4 - 3.7, 5);
  });

  test("vertices alternate outer radius R and inner radius R/2 from the center", () => {
    const cx = 4;
    const cy = 4;
    const outerR = 3.7;
    const pts = parseTrianglePointsLoose(starPoints(cx, cy, outerR));
    pts.forEach((p, i) => {
      const dist = Math.hypot(p.x - cx, p.y - cy);
      const expected = i % 2 === 0 ? outerR : outerR / 2;
      expect(dist).toBeCloseTo(expected, 5);
    });
  });

  test("outer radius ≈3.7 gives a star area comparable to the r=2.54 dot's circle area", () => {
    // Regular 10-point star (outer R, inner R/2): area = 5 * R * (R/2) *
    // sin(36°) = 2.5 * sin(36°) * R² ≈ 1.4695 * R². Circle area = π * 2.54²
    // ≈ 20.268. Solving for R gives ≈3.714 — 3.7 is the value court-art.tsx
    // actually draws with, within ~0.7% of an exact area match.
    const outerR = 3.7;
    const starArea = 2.5 * Math.sin((36 * Math.PI) / 180) * outerR * outerR;
    const dotArea = Math.PI * 2.54 * 2.54;
    expect(starArea).toBeGreaterThan(dotArea * 0.9);
    expect(starArea).toBeLessThan(dotArea * 1.1);
  });
});

function parseTrianglePointsLoose(
  pointsAttr: string,
): { x: number; y: number }[] {
  return pointsAttr
    .trim()
    .split(/\s+/)
    .map((pair) => {
      const [x, y] = pair.split(",").map(Number);
      return { x, y };
    });
}

/**
 * G3b — heatCellRect: pure cell geometry, in the same projected coordinate
 * space `bounds` is already expressed in (`SERVE_HEAT_BOUNDS`/
 * `RETURN_HEAT_BOUNDS`). No court/cut knowledge — just a rect-per-index
 * calculation `binDots`' own row/col indexing must line up with.
 */
test.describe("heatCellRect", () => {
  const bounds: HeatBounds = { xMin: 0, xMax: 100, yMin: 0, yMax: 50 };

  test("cell (0,0) starts at the bounds' own top-left", () => {
    const r = heatCellRect(bounds, 10, 5, 0, 0);
    expect(r.x).toBe(0);
    expect(r.y).toBe(0);
    expect(r.width).toBeCloseTo(10, 10);
    expect(r.height).toBeCloseTo(10, 10);
  });

  test("the last column/row's cell ends exactly at xMax/yMax", () => {
    const cols = 10;
    const rows = 5;
    const r = heatCellRect(bounds, cols, rows, cols - 1, rows - 1);
    expect(r.x + r.width).toBeCloseTo(bounds.xMax, 10);
    expect(r.y + r.height).toBeCloseTo(bounds.yMax, 10);
  });

  test("cells tile the bounds with no gaps or overlaps (adjacent cells share an edge)", () => {
    const cols = 6;
    const rows = 7;
    for (let col = 0; col < cols - 1; col++) {
      const a = heatCellRect(bounds, cols, rows, col, 0);
      const b = heatCellRect(bounds, cols, rows, col + 1, 0);
      expect(a.x + a.width).toBeCloseTo(b.x, 10);
    }
    for (let row = 0; row < rows - 1; row++) {
      const a = heatCellRect(bounds, cols, rows, 0, row);
      const b = heatCellRect(bounds, cols, rows, 0, row + 1);
      expect(a.y + a.height).toBeCloseTo(b.y, 10);
    }
  });

  test("real SERVE_HEAT_BOUNDS/6x7 grid: cell(0,0) starts at the singles-left/service-line corner", () => {
    const r = heatCellRect(SERVE_HEAT_BOUNDS, 6, 7, 0, 0);
    expect(r.x).toBe(SERVE_COURT.singlesLeft);
    expect(r.y).toBe(SERVE_COURT.serviceLineY);
  });
});

/**
 * G3b — heatCellStyle: the P2i ramp rule — colour index by quartile of
 * count/max, opacity linear 0.1→0.82 across the same ratio.
 */
test.describe("heatCellStyle", () => {
  test("the busiest cell (count === max) is colour index 3 at the max opacity", () => {
    const { colorIndex, opacity } = heatCellStyle(10, 10);
    expect(colorIndex).toBe(3);
    expect(opacity).toBeCloseTo(0.82, 10);
  });

  test("a cell at 1/max is colour index 0, above the minimum opacity", () => {
    const { colorIndex, opacity } = heatCellStyle(1, 100);
    expect(colorIndex).toBe(0);
    expect(opacity).toBeGreaterThan(0.1);
    expect(opacity).toBeCloseTo(0.1 + 0.01 * 0.72, 10);
  });

  test("quartile boundaries: ratios just under 0.25/0.5/0.75 stay in the lower bucket", () => {
    expect(heatCellStyle(24, 100).colorIndex).toBe(0);
    expect(heatCellStyle(25, 100).colorIndex).toBe(1);
    expect(heatCellStyle(49, 100).colorIndex).toBe(1);
    expect(heatCellStyle(50, 100).colorIndex).toBe(2);
    expect(heatCellStyle(74, 100).colorIndex).toBe(2);
    expect(heatCellStyle(75, 100).colorIndex).toBe(3);
  });

  test("opacity is linear across the ratio", () => {
    expect(heatCellStyle(50, 100).opacity).toBeCloseTo(0.1 + 0.5 * 0.72, 10);
  });

  test("max <= 0 never divides by zero — reads as the minimum", () => {
    const { colorIndex, opacity } = heatCellStyle(0, 0);
    expect(colorIndex).toBe(0);
    expect(opacity).toBeCloseTo(0.1, 10);
  });
});

/**
 * G3b — `RETURN_HEAT_BOUNDS.xMax` settles G3a's placeholder run-off with the
 * depth value actually visible inside the return frame's own viewBox before
 * its clipPath (`RETURN_BACKGROUND_PATH`, drawn exactly at the viewBox rect)
 * hides it. Verified here against an INDEPENDENT re-implementation of the
 * same two transform strings (`RETURN_COURT.innerGroupTransform`/
 * `outerGroupTransform`), rather than importing `court-geometry.ts`'s own
 * derivation — a real cross-check, not a self-confirming one.
 */
test.describe("RETURN_HEAT_BOUNDS depth run-off", () => {
  function applyReturnFrameTransforms(
    x: number,
    y: number,
  ): { x: number; y: number } {
    // innerGroupTransform: translate(240,112) scale(1.02) translate(-240,-104.5)
    let px = (x - 240) * 1.02 + 240;
    let py = (y - 104.5) * 1.02 + 112;
    // outerGroupTransform: translate(-60.6,-125) rotate(90 240 104.5)
    // rotate(90 cx cy): (x,y) -> (cx - (y-cy), cy + (x-cx))
    const rx = 240 - (py - 104.5);
    const ry = 104.5 + (px - 240);
    px = rx - 60.6;
    py = ry - 125;
    return { x: px, y: py };
  }

  test("xMax lands right at the viewBox's own far edge (within rounding)", () => {
    const { y } = applyReturnFrameTransforms(
      RETURN_HEAT_BOUNDS.xMax,
      RETURN_COURT.centerY,
    );
    const viewBoxFarEdge = RETURN_COURT.viewBox.minY + RETURN_COURT.viewBox.h;
    expect(y).toBeCloseTo(viewBoxFarEdge, 6);
  });

  test("a depth value past xMax would fall outside the viewBox", () => {
    const { y } = applyReturnFrameTransforms(
      RETURN_HEAT_BOUNDS.xMax + 10,
      RETURN_COURT.centerY,
    );
    const viewBoxFarEdge = RETURN_COURT.viewBox.minY + RETURN_COURT.viewBox.h;
    expect(y).toBeGreaterThan(viewBoxFarEdge);
  });

  test("xMax is well past nearBaselineX — real run-off, not the old 30% placeholder", () => {
    expect(RETURN_HEAT_BOUNDS.xMax).toBeGreaterThan(RETURN_COURT.nearBaselineX);
    // The old placeholder (`(nearBaselineX - netX) * 0.3`) landed at 500;
    // the geometry-derived value is noticeably further out (~522.35).
    expect(RETURN_HEAT_BOUNDS.xMax).toBeGreaterThan(510);
    expect(RETURN_HEAT_BOUNDS.xMax).toBeLessThan(530);
  });

  test("xMin is still the net (unchanged — only the run-off needed settling)", () => {
    expect(RETURN_HEAT_BOUNDS.xMin).toBe(RETURN_COURT.netX);
  });
});
