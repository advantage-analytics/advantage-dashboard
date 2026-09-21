import { expect, test } from "@playwright/test";
import {
  SERVE_COURT,
  RETURN_COURT,
  SERVE_HEAT_BOUNDS,
  RETURN_HEAT_BOUNDS,
  UNITS_PER_METER,
  heatBoundsFor,
  projectServeDot,
  projectReturnDot,
  zoneCellX,
  zoneOpacity,
  ZONE_OPACITY_MIN,
  ZONE_OPACITY_MAX,
  trianglePointsFor,
  starPoints,
  RETURN_HEAT_DOT_RADIUS,
  SERVE_HEAT_DOT_RADIUS,
  heatDotRadiusFor,
  heatRampChannelTable,
  HEAT_RAMP_R_TABLE,
  HEAT_RAMP_G_TABLE,
  HEAT_RAMP_B_TABLE,
  HEAT_ALPHA_TABLE,
  HEAT_WASH_ALPHA,
  heatFilterRegionFor,
  heatFloorTintRgba,
  projectServeMetricDot,
  netGutterFor,
  depthToViewBoxY,
  RETURN_DOT_R,
  RETURN_VIEWBOX_MIN_Y_CLEARANCE,
  VIEWER_COURT,
  projectViewerDot,
  viewerInitialTransform,
  lateralToViewBoxX,
} from "@/components/dashboard/matches/match-detail/shots/court-geometry";
import {
  ZOOM_MIN,
  ZOOM_MAX,
  clampPan,
} from "@/components/dashboard/matches/match-detail/shots/pan-zoom";

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
 * Fix round 1, F1: `serve-zones.ts`'s `computeZoneStats` divides `pct` by
 * `dots.length`, which is 0 (every `pct` becomes `NaN`) whenever every serve
 * reaching the zones chart is out/net — reachable since Task 2 made `count`
 * include out/net serves while `serveDots` (the zones population) can still
 * be empty. `maxPct <= 0` doesn't catch `NaN` (`NaN <= 0` is `false`), so a
 * `NaN` used to slip through into `fillOpacity`.
 */
test("zoneOpacity: a NaN maxPct (every zone's pct is NaN, e.g. computeZoneStats over zero dots) reads at the minimum shade, not NaN", () => {
  expect(zoneOpacity(NaN, NaN)).toBe(ZONE_OPACITY_MIN);
  expect(Number.isNaN(zoneOpacity(NaN, NaN))).toBe(false);
});

test("zoneOpacity: a negative maxPct also reads at the minimum shade", () => {
  expect(zoneOpacity(0, -5)).toBe(ZONE_OPACITY_MIN);
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
 * Density heatmap (blur+colourize) — replaces the old P2i/P2j cell grid.
 * `heatDotRadiusFor`/`heatRampChannelTable`/`heatFilterRegionFor`/
 * `heatFloorTintRgba` are the pure, testable numbers `court-art.tsx`'s
 * blur→colourize→ramp filter and the letterbox-strip composite fix both
 * read straight off.
 */
test.describe("heatDotRadiusFor", () => {
  test("RETURN_HEAT_DOT_RADIUS is 0.55 real metres on the return frame's own depth scale", () => {
    expect(RETURN_HEAT_DOT_RADIUS).toBeCloseTo(0.55 * UNITS_PER_METER, 6);
  });

  test("serve and return radii read as the SAME apparent screen size", () => {
    // Independent re-derivation of the equivalence court-geometry.ts's own
    // doc comment claims: a dot's on-screen radius is (radius) × (that
    // frame's own group-transform scale) ÷ (that frame's own viewBox
    // width) — for the SAME box width, so cancelling the (unknown) box
    // width leaves this ratio, which must be equal for both frames.
    const serveScreenRatio =
      (SERVE_HEAT_DOT_RADIUS * 0.85) / SERVE_COURT.viewBox.w;
    const returnScreenRatio =
      (RETURN_HEAT_DOT_RADIUS * 1.02) / RETURN_COURT.viewBox.w;
    expect(serveScreenRatio).toBeCloseTo(returnScreenRatio, 6);
  });

  test("heatDotRadiusFor resolves serve vs. every return-frame cut", () => {
    expect(heatDotRadiusFor("serve")).toBe(SERVE_HEAT_DOT_RADIUS);
    for (const cut of [
      "returnPlacement",
      "returnContact",
      "rallyPosition",
    ] as const) {
      expect(heatDotRadiusFor(cut)).toBe(RETURN_HEAT_DOT_RADIUS);
    }
  });
});

/**
 * `heatRampChannelTable` — each `feFuncR`/`feFuncG`/`feFuncB` `tableValues`
 * string, round-tripped back against the ramp hex colours
 * (`--viz-heatmap-0..3`) it's derived from.
 */
test.describe("heatRampChannelTable", () => {
  const RAMP_HEX = ["#F2F2F2", "#B8D4F9", "#6AABFF", "#3B82F6"];

  test("each channel's table has one 0..1 value per ramp colour", () => {
    for (const channel of ["r", "g", "b"] as const) {
      const values = heatRampChannelTable(channel).split(" ").map(Number);
      expect(values).toHaveLength(RAMP_HEX.length);
      for (const v of values) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
      }
    }
  });

  test("round-trips back to the ramp's own hex bytes (±1 of 255, for toFixed(3) rounding)", () => {
    const offsets = { r: 1, g: 3, b: 5 } as const;
    for (const channel of ["r", "g", "b"] as const) {
      const values = heatRampChannelTable(channel).split(" ").map(Number);
      RAMP_HEX.forEach((hex, i) => {
        const start = offsets[channel];
        const byte = parseInt(hex.slice(start, start + 2), 16);
        expect(Math.round(values[i] * 255)).toBeCloseTo(byte, 0);
      });
    }
  });

  test("matches the exported HEAT_RAMP_*_TABLE constants exactly", () => {
    expect(heatRampChannelTable("r")).toBe(HEAT_RAMP_R_TABLE);
    expect(heatRampChannelTable("g")).toBe(HEAT_RAMP_G_TABLE);
    expect(heatRampChannelTable("b")).toBe(HEAT_RAMP_B_TABLE);
  });
});

/**
 * `HEAT_ALPHA_TABLE` — the "more sensitive" feedback: a steep 0-to-ceiling
 * climb so a single dot's blob already reads, not a flat minimum. Starts at
 * 0 (NOT a floor — see `heatFloorTintRgba`'s own doc comment for why the
 * floor moved out of the filter entirely, onto a separate wash element).
 */
test("HEAT_ALPHA_TABLE starts at 0 and climbs monotonically to the P2i ceiling", () => {
  const values = HEAT_ALPHA_TABLE.split(" ").map(Number);
  expect(values[0]).toBe(0);
  expect(values[values.length - 1]).toBeCloseTo(0.82, 10);
  for (let i = 1; i < values.length; i++) {
    expect(values[i]).toBeGreaterThan(values[i - 1]);
  }
});

/**
 * `heatFilterRegionFor` — `heatBoundsFor(cut)` padded by
 * `HEAT_FILTER_MARGIN_RATIO` blob radii on every side, so the blur's own
 * kernel settles before the filter region's edge.
 */
test.describe("heatFilterRegionFor", () => {
  test("pads SERVE_HEAT_BOUNDS by 2x the serve radius on every side", () => {
    const region = heatFilterRegionFor("serve");
    const margin = SERVE_HEAT_DOT_RADIUS * 2;
    expect(region.x).toBeCloseTo(SERVE_HEAT_BOUNDS.xMin - margin, 6);
    expect(region.y).toBeCloseTo(SERVE_HEAT_BOUNDS.yMin - margin, 6);
    expect(region.width).toBeCloseTo(
      SERVE_HEAT_BOUNDS.xMax - SERVE_HEAT_BOUNDS.xMin + margin * 2,
      6,
    );
    expect(region.height).toBeCloseTo(
      SERVE_HEAT_BOUNDS.yMax - SERVE_HEAT_BOUNDS.yMin + margin * 2,
      6,
    );
  });

  test("every return-frame cut shares the same padded region", () => {
    const placement = heatFilterRegionFor("returnPlacement");
    const contact = heatFilterRegionFor("returnContact");
    const rally = heatFilterRegionFor("rallyPosition");
    expect(placement).toEqual(contact);
    expect(placement).toEqual(rally);
    const margin = RETURN_HEAT_DOT_RADIUS * 2;
    expect(placement.x).toBeCloseTo(RETURN_HEAT_BOUNDS.xMin - margin, 6);
    expect(placement.y).toBeCloseTo(RETURN_HEAT_BOUNDS.yMin - margin, 6);
  });
});

/**
 * `heatFloorTintRgba` — the "tint is not consistent on the view" fix (I3):
 * the floor tint moved OUT of the SVG filter (whose `HEAT_ALPHA_TABLE` now
 * starts at 0) and onto one uniform wash div covering the whole art box, so
 * there's a single colour to be consistent instead of two that could drift.
 * This is that colour, derived from the SAME ramp constant the filter's own
 * colour tables use rather than a second hand-picked literal.
 */
test("heatFloorTintRgba derives from HEAT_RAMP_HEX[0] and HEAT_WASH_ALPHA", () => {
  expect(heatFloorTintRgba()).toBe(`rgba(242, 242, 242, ${HEAT_WASH_ALPHA})`);
});

/**
 * P2j — `RETURN_HEAT_BOUNDS` is now the return frame's WHOLE visible view
 * (its own `viewBox`), mapped back through both `<g>` transforms into the
 * pre-transform coordinates `projectReturnDot` outputs — not a per-cut span.
 * Verified here against an INDEPENDENT re-implementation of the same two
 * transform strings (`RETURN_COURT.innerGroupTransform`/
 * `outerGroupTransform`), rather than importing `court-geometry.ts`'s own
 * derivation — a real cross-check, not a self-confirming one.
 */
test.describe("RETURN_HEAT_BOUNDS — full visible view", () => {
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

  const viewBoxNearY = RETURN_COURT.viewBox.minY;
  const viewBoxFarY = RETURN_COURT.viewBox.minY + RETURN_COURT.viewBox.h;
  const viewBoxLeftX = RETURN_COURT.viewBox.minX;
  const viewBoxRightX = RETURN_COURT.viewBox.minX + RETURN_COURT.viewBox.w;

  test("xMax (depth) lands right at the viewBox's own far y-edge", () => {
    const { y } = applyReturnFrameTransforms(
      RETURN_HEAT_BOUNDS.xMax,
      RETURN_COURT.centerY,
    );
    expect(y).toBeCloseTo(viewBoxFarY, 6);
  });

  test("xMin (depth) lands right at the viewBox's own near y-edge", () => {
    const { y } = applyReturnFrameTransforms(
      RETURN_HEAT_BOUNDS.xMin,
      RETURN_COURT.centerY,
    );
    expect(y).toBeCloseTo(viewBoxNearY, 6);
  });

  test("a depth value past xMax would fall outside the viewBox", () => {
    const { y } = applyReturnFrameTransforms(
      RETURN_HEAT_BOUNDS.xMax + 10,
      RETURN_COURT.centerY,
    );
    expect(y).toBeGreaterThan(viewBoxFarY);
  });

  test("fix round 4B: xMin now clears the net (the viewBox was extended so the net line is visible, not clipped)", () => {
    expect(RETURN_HEAT_BOUNDS.xMin).not.toBe(RETURN_COURT.netX);
    expect(RETURN_HEAT_BOUNDS.xMin).toBeLessThan(RETURN_COURT.netX);
  });

  test("xMax is well past nearBaselineX — real run-off, not a placeholder", () => {
    expect(RETURN_HEAT_BOUNDS.xMax).toBeGreaterThan(RETURN_COURT.nearBaselineX);
    expect(RETURN_HEAT_BOUNDS.xMax).toBeGreaterThan(510);
    expect(RETURN_HEAT_BOUNDS.xMax).toBeLessThan(530);
  });

  test("yMax (lateral) lands right at the viewBox's own left x-edge", () => {
    const { x } = applyReturnFrameTransforms(
      RETURN_COURT.netX,
      RETURN_HEAT_BOUNDS.yMax,
    );
    expect(x).toBeCloseTo(viewBoxLeftX, 6);
  });

  test("yMin (lateral) lands right at the viewBox's own right x-edge", () => {
    const { x } = applyReturnFrameTransforms(
      RETURN_COURT.netX,
      RETURN_HEAT_BOUNDS.yMin,
    );
    expect(x).toBeCloseTo(viewBoxRightX, 6);
  });

  test("lateral bounds reach well past the doubles sidelines — the whole view, not the court alone", () => {
    expect(RETURN_HEAT_BOUNDS.yMin).toBeLessThan(RETURN_COURT.doublesTop);
    expect(RETURN_HEAT_BOUNDS.yMax).toBeGreaterThan(RETURN_COURT.doublesBottom);
  });
});

/**
 * P2j — `SERVE_HEAT_BOUNDS` is the serve frame's WHOLE visible view (its own
 * `viewBox`), mapped back through `SERVE_COURT.groupTransform` into the
 * pre-transform coordinates `projectServeDot` outputs. Verified against an
 * INDEPENDENT re-implementation of that transform string.
 */
test.describe("SERVE_HEAT_BOUNDS — full visible view", () => {
  function applyServeFrameTransform(
    x: number,
    y: number,
  ): { x: number; y: number } {
    // groupTransform: translate(260,117) scale(0.85) translate(-260,-125)
    const px = (x - 260) * 0.85 + 260;
    const py = (y - 125) * 0.85 + 117;
    return { x: px, y: py };
  }

  test("every corner of SERVE_HEAT_BOUNDS projects onto the corresponding SERVE_COURT.viewBox corner", () => {
    const { x: left, y: top } = applyServeFrameTransform(
      SERVE_HEAT_BOUNDS.xMin,
      SERVE_HEAT_BOUNDS.yMin,
    );
    expect(left).toBeCloseTo(SERVE_COURT.viewBox.minX, 6);
    expect(top).toBeCloseTo(SERVE_COURT.viewBox.minY, 6);

    const { x: right, y: bottom } = applyServeFrameTransform(
      SERVE_HEAT_BOUNDS.xMax,
      SERVE_HEAT_BOUNDS.yMax,
    );
    expect(right).toBeCloseTo(
      SERVE_COURT.viewBox.minX + SERVE_COURT.viewBox.w,
      6,
    );
    expect(bottom).toBeCloseTo(
      SERVE_COURT.viewBox.minY + SERVE_COURT.viewBox.h,
      6,
    );
  });

  test("bounds reach past the singles box — the whole view, not the service boxes alone", () => {
    expect(SERVE_HEAT_BOUNDS.xMin).toBeLessThan(SERVE_COURT.singlesLeft);
    expect(SERVE_HEAT_BOUNDS.xMax).toBeGreaterThan(SERVE_COURT.singlesRight);
    expect(SERVE_HEAT_BOUNDS.yMin).toBeLessThan(SERVE_COURT.serviceLineY);
    expect(SERVE_HEAT_BOUNDS.yMax).toBeGreaterThan(SERVE_COURT.netY);
  });
});

/**
 * P2j — `heatBoundsFor` now gives every cut its FRAME's whole visible view,
 * not a per-cut span: `returnPlacement`, `returnContact` and `rallyPosition`
 * all share one frame, so they all resolve to the identical
 * `RETURN_HEAT_BOUNDS` object. Only `serve` differs, on its own frame.
 */
test.describe("heatBoundsFor per cut", () => {
  test("serve delegates to SERVE_HEAT_BOUNDS", () => {
    expect(heatBoundsFor("serve")).toEqual(SERVE_HEAT_BOUNDS);
  });

  test("returnPlacement, returnContact and rallyPosition all share the same RETURN_HEAT_BOUNDS", () => {
    const placement = heatBoundsFor("returnPlacement");
    const contact = heatBoundsFor("returnContact");
    const rally = heatBoundsFor("rallyPosition");
    expect(placement).toEqual(RETURN_HEAT_BOUNDS);
    expect(contact).toEqual(RETURN_HEAT_BOUNDS);
    expect(rally).toEqual(RETURN_HEAT_BOUNDS);
  });
});

/**
 * Task 2b: `projectServeMetricDot` projects a serve's real-world measurement
 * (`servePlacementMetrics`) straight onto the serve frame, independent of
 * the legacy 0..1 fraction `projectServeDot` reads. Sanity points from the
 * task brief, each checked against `SERVE_COURT`'s own constants.
 */
test.describe("projectServeMetricDot", () => {
  test("depth 0 (at the net) lands on SERVE_COURT.netY", () => {
    const { cy } = projectServeMetricDot({ lateralM: 0, depthPastNetM: 0 });
    expect(cy).toBeCloseTo(SERVE_COURT.netY, 5);
    expect(cy).toBeCloseTo(236, 5);
  });

  test("depth 6.4 (the service line) lands on SERVE_COURT.serviceLineY", () => {
    const { cy } = projectServeMetricDot({ lateralM: 0, depthPastNetM: 6.4 });
    expect(cy).toBeCloseTo(SERVE_COURT.serviceLineY, 1);
    expect(cy).toBeCloseTo(116.5, 1);
  });

  test("depth 11.885 (a full-court depth) lands close to SERVE_COURT.baselineY", () => {
    const { cy } = projectServeMetricDot({
      lateralM: 0,
      depthPastNetM: 11.885,
    });
    expect(cy).toBeCloseTo(SERVE_COURT.baselineY, 0);
    expect(cy).toBeCloseTo(14.1, 0);
  });

  test("lateral 5.485 (the doubles sideline) lands on SERVE_COURT.doublesLeft when negative", () => {
    const { cx } = projectServeMetricDot({
      lateralM: -5.485,
      depthPastNetM: 6.4,
    });
    expect(cx).toBeCloseTo(SERVE_COURT.doublesLeft, 1);
    expect(cx).toBeCloseTo(135, 1);
  });

  test("an extreme out serve clamps inside SERVE_HEAT_BOUNDS instead of vanishing off-canvas", () => {
    const { cx, cy } = projectServeMetricDot({
      lateralM: 50,
      depthPastNetM: 50,
    });
    expect(cx).toBeLessThanOrEqual(SERVE_HEAT_BOUNDS.xMax);
    expect(cx).toBeGreaterThanOrEqual(SERVE_HEAT_BOUNDS.xMin);
    expect(cy).toBeLessThanOrEqual(SERVE_HEAT_BOUNDS.yMax);
    expect(cy).toBeGreaterThanOrEqual(SERVE_HEAT_BOUNDS.yMin);
  });
});

/**
 * Task 2b: `netGutterFor` gives the fixed DEPTH-axis coordinate a net mark
 * takes for a cut — always inside that frame's own visible viewBox, so the
 * glyph never draws outside what the user can actually see.
 */
test.describe("netGutterFor", () => {
  test("serve: cy is set, cx is not, and cy sits strictly inside the serve frame's visible bounds", () => {
    const gutter = netGutterFor("serve");
    expect(gutter.cx).toBeNull();
    expect(gutter.cy).not.toBeNull();
    expect(gutter.cy!).toBeGreaterThan(SERVE_COURT.netY);
    expect(gutter.cy!).toBeLessThan(SERVE_HEAT_BOUNDS.yMax);
  });

  test("return (placement/contact/rally all share one frame): cx is set, cy is not, sits on the HITTER's side of the net, and inside the return frame's visible bounds", () => {
    for (const cut of [
      "returnPlacement",
      "returnContact",
      "rallyPosition",
    ] as const) {
      const gutter = netGutterFor(cut);
      expect(gutter.cy).toBeNull();
      expect(gutter.cx).not.toBeNull();
      // Fix round 4B: the hitter's side is depth-x < netX (the ball never
      // crossed) — NOT an arbitrary inset from the frame's old visible edge.
      expect(gutter.cx!).toBeLessThan(RETURN_COURT.netX);
      expect(gutter.cx!).toBeGreaterThan(RETURN_HEAT_BOUNDS.xMin);
      expect(gutter.cx!).toBeLessThan(RETURN_HEAT_BOUNDS.xMax);
    }
  });
});

/**
 * Fix round 4B: the return frame's viewBox was extended (minY decreased,
 * h grown by the same amount) so the net line — invisible in the design
 * handoff's own viewBox — is fully drawn, with room for a net-gutter mark
 * beside it without clipping.
 */
test.describe("RETURN_COURT viewBox extension (fix round 4B)", () => {
  test("the net line's drawn depth-x (RETURN_COURT.netX) lies inside RETURN_HEAT_BOUNDS with margin", () => {
    expect(RETURN_COURT.netX).toBeGreaterThan(RETURN_HEAT_BOUNDS.xMin);
    expect(RETURN_COURT.netX).toBeLessThan(RETURN_HEAT_BOUNDS.xMax);
    // "With margin" — not just barely inside.
    expect(RETURN_COURT.netX - RETURN_HEAT_BOUNDS.xMin).toBeGreaterThan(1);
  });

  test("a net-gutter mark's full radius (RETURN_DOT_R, the one source court-art.tsx also reads) lies inside RETURN_HEAT_BOUNDS, not just its centre", () => {
    const gutter = netGutterFor("returnPlacement");
    expect(gutter.cx! - RETURN_DOT_R).toBeGreaterThan(RETURN_HEAT_BOUNDS.xMin);
    expect(gutter.cx! + RETURN_DOT_R).toBeLessThan(RETURN_HEAT_BOUNDS.xMax);
  });

  test("the far edge (minY + h) is unchanged from the design handoff — only the near edge moved", () => {
    expect(RETURN_COURT.viewBox.minY + RETURN_COURT.viewBox.h).toBeCloseTo(
      -11.5 + 279,
      6,
    );
  });

  test("minX and w are unchanged from the design handoff — only the minY/h edge deviates", () => {
    expect(RETURN_COURT.viewBox.minX).toBe(-43.6);
    expect(RETURN_COURT.viewBox.w).toBe(431);
  });

  /**
   * Fix round 5 (robustness): `RETURN_COURT.viewBox.minY` hard-codes
   * `depthToViewBoxY(RETURN_COURT.netX)`'s own result (`-20.5`) minus the
   * clearance, because the source module genuinely can't call that function
   * at the point it needs the number (the circular dependency through
   * `RETURN_COURT` itself is real). Pin the identity here instead, with a
   * LIVE call now that the module is fully loaded — a drift in `netX`,
   * `centerY`, `RETURN_INNER_SCALE` or `RETURN_OUTER_TRANSLATE_Y` would
   * silently clip the net line out of the frame again with every other
   * assertion above still green (their margins are generous enough not to
   * notice a few units of drift); this one specifically would not be.
   */
  test("RETURN_COURT.viewBox.minY is pinned to depthToViewBoxY(netX) minus the clearance — not just close, exact", () => {
    const netCenterlineY = depthToViewBoxY(RETURN_COURT.netX);
    expect(RETURN_COURT.viewBox.minY).toBeCloseTo(
      netCenterlineY - RETURN_VIEWBOX_MIN_Y_CLEARANCE,
      10,
    );
  });
});

/**
 * Task 2 (Phase 2A): the fullscreen viewer's own shared court frame. The FAR
 * half is `SERVE_COURT`'s own box, unchanged; the NEAR half is that box
 * reflected across the net line.
 */
test.describe("VIEWER_COURT", () => {
  test("far half matches SERVE_COURT exactly", () => {
    expect(VIEWER_COURT.farBaselineY).toBe(SERVE_COURT.baselineY);
    expect(VIEWER_COURT.netY).toBe(SERVE_COURT.netY);
    expect(VIEWER_COURT.farServiceY).toBe(SERVE_COURT.serviceLineY);
    expect(VIEWER_COURT.centreX).toBe(SERVE_COURT.centerX);
    expect(VIEWER_COURT.netX1).toBe(SERVE_COURT.netLineLeft);
    expect(VIEWER_COURT.netX2).toBe(SERVE_COURT.netLineRight);
  });

  test("near half is the far half reflected across the net line", () => {
    expect(VIEWER_COURT.nearBaselineY).toBe(
      VIEWER_COURT.netY + (VIEWER_COURT.netY - VIEWER_COURT.farBaselineY),
    );
    expect(VIEWER_COURT.nearBaselineY).toBe(458);
    expect(VIEWER_COURT.nearServiceY).toBe(
      VIEWER_COURT.netY + (VIEWER_COURT.netY - VIEWER_COURT.farServiceY),
    );
    expect(VIEWER_COURT.nearServiceY).toBe(355.5);
  });
});

/**
 * Task 2: `projectViewerDot` — the viewer's shared projection for all four
 * cuts. Depth fixtures below reuse the exact metre values
 * `projectServeMetricDot`'s/`projectReturnDot`'s own tests already use, so a
 * drift between the two projections' scales fails here too.
 */
test.describe("projectViewerDot — serve / returnPlacement (landing, far half)", () => {
  for (const cut of ["serve", "returnPlacement"] as const) {
    test(`${cut}: depth 0 (at the net) lands on VIEWER_COURT.netY`, () => {
      const { y } = projectViewerDot(cut, {
        lateralM: 0,
        depthM: 0,
        atNet: false,
      });
      expect(y).toBeCloseTo(VIEWER_COURT.netY, 5);
    });

    test(`${cut}: depth 6.4 (the service line) lands on VIEWER_COURT.farServiceY`, () => {
      const { y } = projectViewerDot(cut, {
        lateralM: 0,
        depthM: 6.4,
        atNet: false,
      });
      expect(y).toBeCloseTo(VIEWER_COURT.farServiceY, 1);
    });

    test(`${cut}: depth 11.885 (a full-court depth) lands close to VIEWER_COURT.farBaselineY`, () => {
      const { y } = projectViewerDot(cut, {
        lateralM: 0,
        depthM: 11.885,
        atNet: false,
      });
      expect(y).toBeCloseTo(VIEWER_COURT.farBaselineY, 0);
    });

    test(`${cut}: lateral -5.485 (the doubles sideline) lands left of centre, matching projectServeMetricDot`, () => {
      const { x } = projectViewerDot(cut, {
        lateralM: -5.485,
        depthM: 6.4,
        atNet: false,
      });
      const shell = projectServeMetricDot({
        lateralM: -5.485,
        depthPastNetM: 6.4,
      });
      expect(x).toBeLessThan(VIEWER_COURT.centreX);
      expect(shell.cx).toBeLessThan(SERVE_COURT.centerX);
    });

    test(`${cut}: atNet draws exactly on the net line regardless of depthM`, () => {
      const { y } = projectViewerDot(cut, {
        lateralM: 1,
        depthM: -3,
        atNet: true,
      });
      expect(y).toBe(VIEWER_COURT.netY);
    });
  }
});

test.describe("projectViewerDot — returnContact / rallyPosition (contact, near half)", () => {
  for (const cut of ["returnContact", "rallyPosition"] as const) {
    test(`${cut}: contact at the baseline (depthM=0) lands on VIEWER_COURT.nearBaselineY`, () => {
      const { y } = projectViewerDot(cut, {
        lateralM: 0,
        depthM: 0,
        atNet: false,
      });
      expect(y).toBeCloseTo(VIEWER_COURT.nearBaselineY, 5);
    });

    test(`${cut}: contact 1.524 m behind the baseline lands deeper into the apron (larger y)`, () => {
      const { y } = projectViewerDot(cut, {
        lateralM: 0,
        depthM: 1.524,
        atNet: false,
      });
      expect(y).toBeGreaterThan(VIEWER_COURT.nearBaselineY);
    });

    test(`${cut}: contact 1 m inside the baseline lands toward the net (smaller y)`, () => {
      const { y } = projectViewerDot(cut, {
        lateralM: 0,
        depthM: -1,
        atNet: false,
      });
      expect(y).toBeLessThan(VIEWER_COURT.nearBaselineY);
    });

    test(`${cut}: lateral +4.115 (the returner's right) lands right of centre, matching projectReturnDot's final on-screen sense for both "contact" and "placement"`, () => {
      const { x } = projectViewerDot(cut, {
        lateralM: 4.115,
        depthM: 0,
        atNet: false,
      });
      expect(x).toBeGreaterThan(VIEWER_COURT.centreX);
    });
  }
});

/**
 * Mirror invariant (task brief): a dot the in-shell frame draws left/right
 * of its own centre must draw on the SAME side in the viewer. `"contact"`
 * and `"placement"` reach that on-screen sense through DIFFERENT
 * intermediate `cy` signs (`projectReturnDot`'s own doc comment — the extra
 * CSS `rotate(180deg)` on `"placement"` alone), but both converge on
 * "lateralM > 0 ends up screen-right" — so the viewer's ONE formula agrees
 * with both without needing a per-cut flip of its own.
 */
test.describe("projectViewerDot mirror invariant vs the in-shell frames", () => {
  test("returnContact and returnPlacement agree on which side +lateralM draws, despite projectReturnDot's opposite-signed cy branches", () => {
    const contactShell = projectReturnDot("contact", {
      lateralM: 4.115,
      depthM: 0,
    });
    const placementShell = projectReturnDot("placement", {
      lateralM: 4.115,
      depthM: 0,
    });
    // The in-shell frames disagree on the SIGN of cy relative to centerY —
    // that's the documented, intentional opposite-branch behaviour.
    expect(contactShell.cy).toBeLessThan(RETURN_COURT.centerY);
    expect(placementShell.cy).toBeGreaterThan(RETURN_COURT.centerY);

    // The viewer's own projection, which has no such split, agrees with
    // both on the FINAL on-screen sense (screen-right for +lateralM).
    const viewerContact = projectViewerDot("returnContact", {
      lateralM: 4.115,
      depthM: 0,
      atNet: false,
    });
    const viewerPlacement = projectViewerDot("returnPlacement", {
      lateralM: 4.115,
      depthM: 6.4,
      atNet: false,
    });
    expect(viewerContact.x).toBeGreaterThan(VIEWER_COURT.centreX);
    expect(viewerPlacement.x).toBeGreaterThan(VIEWER_COURT.centreX);
  });

  test("serve's own sign (no rotation at all in-shell) matches the viewer directly", () => {
    const shell = projectServeMetricDot({
      lateralM: 5.485,
      depthPastNetM: 6.4,
    });
    const viewer = projectViewerDot("serve", {
      lateralM: 5.485,
      depthM: 6.4,
      atNet: false,
    });
    expect(shell.cx).toBeGreaterThan(SERVE_COURT.centerX);
    expect(viewer.x).toBeGreaterThan(VIEWER_COURT.centreX);
  });
});

/**
 * Fix round 1: the invariant above only compares `cy` SIGNS in the return
 * frame's pre-transform (logical) space — it never actually composes the
 * real transform chain, so it can't catch a mistake in exactly which
 * transform cancels which. This block composes it for real:
 * `lateralToViewBoxX` applies the frame's own `<g rotate(90 240 104.5)>` +
 * translate chain (the same one `court-art.tsx` renders with) to
 * `projectReturnDot`'s `cy`, landing on the return frame's OWN viewBox x —
 * `"placement"`'s extra CSS `rotate(180deg)` (applied to the WHOLE `<svg>`,
 * so it mirrors around the viewBox's own centre, not the rotate(90)'s
 * centre) is then composed on top ONLY for that kind, by mirroring about
 * `RETURN_COURT.viewBox.minX + RETURN_COURT.viewBox.w / 2`. The final
 * composed x's side of that centre must agree with `projectViewerDot`'s own
 * side of `VIEWER_COURT.centreX`, for both cuts and both lateral signs.
 */
function composedReturnScreenX(
  kind: "contact" | "placement",
  cy: number,
): number {
  const rotated = lateralToViewBoxX(cy);
  if (kind !== "placement") return rotated;
  const svgCentreX = RETURN_COURT.viewBox.minX + RETURN_COURT.viewBox.w / 2;
  return 2 * svgCentreX - rotated;
}

test.describe("projectViewerDot composed mirror invariant (full transform chain, fix round 1)", () => {
  const cases = [
    { kind: "contact" as const, cut: "returnContact" as const },
    { kind: "placement" as const, cut: "returnPlacement" as const },
  ];

  for (const { kind, cut } of cases) {
    for (const lateralM of [4.115, -4.115]) {
      test(`${cut}: lateralM=${lateralM} — the FULLY COMPOSED in-shell screen-x agrees with projectViewerDot's side of centre`, () => {
        const shell = projectReturnDot(kind, { lateralM, depthM: 0 });
        const composedX = composedReturnScreenX(kind, shell.cy);
        const svgCentreX =
          RETURN_COURT.viewBox.minX + RETURN_COURT.viewBox.w / 2;

        const viewer = projectViewerDot(cut, {
          lateralM,
          depthM: cut === "returnPlacement" ? 6.4 : 0,
          atNet: false,
        });

        const shellIsRight = composedX > svgCentreX;
        const viewerIsRight = viewer.x > VIEWER_COURT.centreX;
        expect(shellIsRight).toBe(viewerIsRight);
      });
    }
  }
});

test.describe("projectViewerDot clamping", () => {
  test("an extreme far-half landing clamps inside the viewBox, inset by markRadius", () => {
    const { x, y } = projectViewerDot("serve", {
      lateralM: 50,
      depthM: 50,
      atNet: false,
    });
    const r = VIEWER_COURT.markRadius;
    expect(x).toBeGreaterThanOrEqual(VIEWER_COURT.viewBox.minX + r);
    expect(x).toBeLessThanOrEqual(
      VIEWER_COURT.viewBox.minX + VIEWER_COURT.viewBox.w - r,
    );
    expect(y).toBeGreaterThanOrEqual(VIEWER_COURT.viewBox.minY + r);
    expect(y).toBeLessThanOrEqual(
      VIEWER_COURT.viewBox.minY + VIEWER_COURT.viewBox.h - r,
    );
  });

  test("an extreme near-half contact clamps inside the viewBox, inset by markRadius", () => {
    const { x, y } = projectViewerDot("returnContact", {
      lateralM: -50,
      depthM: 50,
      atNet: false,
    });
    const r = VIEWER_COURT.markRadius;
    expect(x).toBeGreaterThanOrEqual(VIEWER_COURT.viewBox.minX + r);
    expect(x).toBeLessThanOrEqual(
      VIEWER_COURT.viewBox.minX + VIEWER_COURT.viewBox.w - r,
    );
    expect(y).toBeGreaterThanOrEqual(VIEWER_COURT.viewBox.minY + r);
    expect(y).toBeLessThanOrEqual(
      VIEWER_COURT.viewBox.minY + VIEWER_COURT.viewBox.h - r,
    );
  });
});

/**
 * Task 2: `viewerInitialTransform` — the fullscreen viewer's seeded pan/zoom
 * per cut. `art` below is `VIEWER_COURT.artPx` (595×948).
 */
test.describe("viewerInitialTransform", () => {
  const stage = { w: 700, h: 900 };
  const art = VIEWER_COURT.artPx;
  const fitZ = Math.min(stage.w / art.w, stage.h / art.h);

  test("serve/returnPlacement (landing cuts): fits the whole art, centred on both axes", () => {
    for (const cut of ["serve", "returnPlacement"] as const) {
      const t = viewerInitialTransform(cut, stage);
      expect(t.z).toBeCloseTo(fitZ, 6);
      // The art's own centre point lands on the stage's own centre.
      expect(t.px + (art.w / 2) * t.z).toBeCloseTo(stage.w / 2, 5);
      expect(t.py + (art.h / 2) * t.z).toBeCloseTo(stage.h / 2, 5);
    }
  });

  test("returnContact/rallyPosition (contact cuts): zooms to 1.6x fit, near baseline at 500/950 of stage height, horizontally centred", () => {
    for (const cut of ["returnContact", "rallyPosition"] as const) {
      const t = viewerInitialTransform(cut, stage);
      expect(t.z).toBeCloseTo(fitZ * 1.6, 6);

      const centreArtX =
        ((VIEWER_COURT.centreX - VIEWER_COURT.viewBox.minX) /
          VIEWER_COURT.viewBox.w) *
        art.w;
      const nearBaselineArtY =
        ((VIEWER_COURT.nearBaselineY - VIEWER_COURT.viewBox.minY) /
          VIEWER_COURT.viewBox.h) *
        art.h;

      expect(t.px + centreArtX * t.z).toBeCloseTo(stage.w / 2, 4);
      expect(t.py + nearBaselineArtY * t.z).toBeCloseTo(
        stage.h * (500 / 950),
        3,
      );
    }
  });

  test("z is always clamped inside [ZOOM_MIN, ZOOM_MAX], even for a degenerate stage", () => {
    for (const s of [
      { w: 20, h: 20 },
      { w: 20000, h: 20000 },
    ]) {
      for (const cut of [
        "serve",
        "returnPlacement",
        "returnContact",
        "rallyPosition",
      ] as const) {
        const t = viewerInitialTransform(cut, s);
        expect(t.z).toBeGreaterThanOrEqual(ZOOM_MIN);
        expect(t.z).toBeLessThanOrEqual(ZOOM_MAX);
      }
    }
  });

  test("a tiny stage clamps z to ZOOM_MIN", () => {
    const t = viewerInitialTransform("serve", { w: 20, h: 20 });
    expect(t.z).toBe(ZOOM_MIN);
  });

  test("a huge stage clamps z to ZOOM_MAX", () => {
    const t = viewerInitialTransform("rallyPosition", {
      w: 20000,
      h: 20000,
    });
    expect(t.z).toBe(ZOOM_MAX);
  });

  /**
   * Fix round 1: every case above uses a stage close to the art's own
   * aspect, so both axes land in the SAME `clampPan` regime (scaled art
   * fits, or overflows, on both x and y together) — `clampPan`'s "half" that
   * only fires when the two axes DISAGREE was never actually exercised. A
   * wide-short stage forces exactly that split for a contact cut (height-
   * constrained fit scale, then zoomed 1.6x): the result fits horizontally
   * (stage.w is huge) but overflows vertically. `viewerInitialTransform`
   * already runs its own result through `clampPan` — re-applying it here
   * must be a no-op (a fixed point), or the seeded transform wasn't
   * actually valid per `clampPan`'s own rule.
   */
  test("returnContact: a wide-short stage splits the two clampPan regimes (x fits, y overflows) — the seeded transform is a fixed point of clampPan", () => {
    const wideShortStage = { w: 2000, h: 600 };
    const t = viewerInitialTransform("returnContact", wideShortStage);

    // Confirm the split actually happened before trusting the fixed-point
    // assertion below to mean anything.
    expect(art.w * t.z).toBeLessThanOrEqual(wideShortStage.w);
    expect(art.h * t.z).toBeGreaterThan(wideShortStage.h);

    expect(clampPan(t, art, wideShortStage)).toEqual(t);
  });
});
