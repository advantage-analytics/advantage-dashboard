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

  test("xMin is no longer the net — the net sits just outside the visible view on that edge", () => {
    expect(RETURN_HEAT_BOUNDS.xMin).not.toBe(RETURN_COURT.netX);
    expect(RETURN_HEAT_BOUNDS.xMin).toBeGreaterThan(RETURN_COURT.netX);
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
