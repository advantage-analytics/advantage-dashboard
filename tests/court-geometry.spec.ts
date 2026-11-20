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
  viewerApproachLabelScale,
  viewerFullCourtTransform,
  viewerLandingHalf,
  VIEWER_LANDING_FRAME,
  lateralToViewBoxX,
  viewerBandY,
  viewerBandEdges,
  viewerBandFtFromY,
  viewerBandLayerY,
  viewerScreenPxToFt,
  viewerBandCaps,
  viewerBandDrawableFt,
  SERVE_DEPTH_UNITS_PER_METER,
  viewerArtPoint,
  FULL_COURT_VERTICAL,
  fullVerticalToScreen,
  projectApproachPair,
} from "@/components/dashboard/matches/match-detail/shots/court-geometry";
import { laneOf } from "@/components/dashboard/matches/match-detail/match-filters/approach";
import { COURT_HALF_FT, resolveDepthDividersFt } from "@/lib/data/viz-bands";
import {
  ZOOM_MIN,
  ZOOM_MAX,
  clampPan,
  minZoomFor,
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
  test("lateral 0 lands on the center line", () => {
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

  // Fix round 1, RULING: the fullscreen viewer's frame is drawn upright with
  // NO group rotation at all, so the only kind whose apex is already screen-up
  // there is "serve" — `viz-fullscreen-court.tsx` uses that kind for every
  // cut, unlike the in-shell return frames. Asserted as "the apex is the
  // minimum y of the three vertices", which is the property the viewer needs,
  // for every cut's mark size.
  for (const size of [VIEWER_COURT.markRadius, 2.4, 3.2]) {
    test(`viewer frame: the "serve" triangle's apex is the minimum y (size ${size})`, () => {
      const pts = parseTrianglePoints(
        trianglePointsFor("serve", VIEWER_COURT.centreX, 300, size),
      );
      const [apex] = pts;
      expect(apex.y).toBe(Math.min(...pts.map((p) => p.y)));
      // …and it is strictly above both base corners, not merely tied.
      expect(apex.y).toBeLessThan(pts[1].y);
      expect(apex.y).toBeLessThan(pts[2].y);
    });
  }

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

  test("ace star stays comparable to an ordinary dot at preview size", () => {
    // Regular 10-point star (outer R, inner R/2): area = 5 * R * (R/2) *
    // sin(36°) = 2.5 * sin(36°) * R² ≈ 1.4695 * R². Circle area = π * 2.54²
    // ≈ 20.268. The court uses a 2.54 * 1.4-unit outer radius.
    const outerR = 2.54 * 1.4;
    const starArea = 2.5 * Math.sin((36 * Math.PI) / 180) * outerR * outerR;
    const dotArea = Math.PI * 2.54 * 2.54;
    expect(starArea).toBeGreaterThan(dotArea * 0.9);
    expect(starArea).toBeLessThan(dotArea);
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
  test("RETURN_HEAT_DOT_RADIUS is 0.55 real meters on the return frame's own depth scale", () => {
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

  test("each channel's table has one 0..1 value per ramp color", () => {
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

  test("xMin clears the net (the viewBox was extended so the net line is visible, not clipped)", () => {
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

  test("a net-gutter mark's full radius (RETURN_DOT_R, the one source court-art.tsx also reads) lies inside RETURN_HEAT_BOUNDS, not just its center", () => {
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

    test(`${cut}: lateral -5.485 (the doubles sideline) lands left of center, matching projectServeMetricDot`, () => {
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

    test(`${cut}: lateral +4.115 (the returner's right) lands right of center, matching projectReturnDot's final on-screen sense for both "contact" and "placement"`, () => {
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
 * The widened apron (2026-09-21): real contact points reach 6.33 m behind
 * the baseline and ±7.18 m laterally — the old 44-unit apron clamped ~9% of
 * them onto the bottom edge, drawing them at the same y as much shallower
 * contacts. `VIEWER_COURT.viewBox` now has 7 m of apron behind each
 * baseline and 8 m each side, so these no longer collide.
 */
test.describe("projectViewerDot — the widened apron draws far-back/far-wide contacts distinctly", () => {
  test("returnContact: a contact 6.3 m behind the baseline lands strictly inside the viewBox, and strictly deeper (larger y) than one 2.4 m behind it", () => {
    const vb = VIEWER_COURT.viewBox;
    const near = projectViewerDot("returnContact", {
      lateralM: 0,
      depthM: 2.4,
      atNet: false,
    });
    const far = projectViewerDot("returnContact", {
      lateralM: 0,
      depthM: 6.3,
      atNet: false,
    });
    expect(far.y).toBeGreaterThan(vb.minY);
    expect(far.y).toBeLessThan(vb.minY + vb.h);
    expect(far.y).toBeGreaterThan(near.y);
  });

  test("returnContact: laterals ±7.18 m are inside the viewBox horizontally, and land at distinct x from ±7.0 m", () => {
    const vb = VIEWER_COURT.viewBox;
    const seven = projectViewerDot("returnContact", {
      lateralM: 7.0,
      depthM: 0,
      atNet: false,
    });
    const sevenEighteen = projectViewerDot("returnContact", {
      lateralM: 7.18,
      depthM: 0,
      atNet: false,
    });
    for (const { x } of [seven, sevenEighteen]) {
      expect(x).toBeGreaterThan(vb.minX);
      expect(x).toBeLessThan(vb.minX + vb.w);
    }
    expect(sevenEighteen.x).not.toBe(seven.x);
  });
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
      test(`${cut}: lateralM=${lateralM} — the FULLY COMPOSED in-shell screen-x agrees with projectViewerDot's side of center`, () => {
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
 * per cut. `art` below is `VIEWER_COURT.artPx` (652×1258).
 *
 * 2026-09-21: the drawable field (`viewBox`) widened to give far-back
 * contacts room to draw, but the court frame the viewer fits is still
 * `VIEWER_COURT.courtFrame` — the old, narrower handoff view — not the whole
 * widened art. `fitZ` below is the frame's own fit scale, computed the same
 * way `viewerInitialTransform` computes it (frame units × px-per-unit).
 *
 * 2026-11-09: a landing cut's 100% is the half its shots land in
 * (`VIEWER_LANDING_FRAME`, the far half to just past the net), net along the
 * stage's bottom edge; the whole court frame is `viewerFullCourtTransform`.
 * Contact cuts are unchanged.
 */
test.describe("viewerInitialTransform", () => {
  const stage = { w: 700, h: 900 };
  const art = VIEWER_COURT.artPx;
  const frame = VIEWER_COURT.courtFrame;
  const pxPerUnit = art.w / VIEWER_COURT.viewBox.w;
  const frameWpx = frame.w * pxPerUnit;
  const frameHpx = frame.h * pxPerUnit;
  const fitZ = Math.min(stage.w / frameWpx, stage.h / frameHpx);

  test("landing cuts open on the FAR half: the half frame fitted, net (+ gutter) on the stage's bottom edge, centered across", () => {
    for (const s of [stage, { w: 1100, h: 640 }, { w: 820, h: 560 }]) {
      for (const cut of [
        "serve",
        "returnPlacement",
        "rallyPlacement",
        "errors",
      ] as const) {
        expect(viewerLandingHalf(cut)).toBe("far");
        const half = VIEWER_LANDING_FRAME;
        const halfZ = Math.min(
          s.w / (half.w * pxPerUnit),
          s.h / (half.h * pxPerUnit),
        );
        const t = viewerInitialTransform(cut, s);
        expect(t.z).toBeCloseTo(halfZ, 6);
        // Every landing cut, the serve too, puts the frame's bottom on the stage's.
        const bottom = viewerArtPoint(0, half.minY + half.h);
        expect(t.py + bottom.y * t.z).toBeCloseTo(s.h, 4);
        const net = viewerArtPoint(VIEWER_COURT.centreX, VIEWER_COURT.netY);
        // The net is inside the stage, within the gutter (net line + zone labels) of its bottom edge.
        const netStageY = t.py + net.y * t.z;
        expect(netStageY).toBeLessThan(s.h);
        expect(s.h - netStageY).toBeLessThan(80);
        // The far side's DEUCE COURT / AD COURT labels stay on stage.
        const sideLabel = viewerArtPoint(0, VIEWER_COURT.farBaselineY - 15);
        expect(t.py + sideLabel.y * t.z).toBeGreaterThanOrEqual(0);
        expect(t.px + net.x * t.z).toBeCloseTo(s.w / 2, 4);
        // The far baseline is on stage too: the whole landing half shows.
        const farBaseline = viewerArtPoint(0, VIEWER_COURT.farBaselineY);
        expect(t.py + farBaseline.y * t.z).toBeGreaterThanOrEqual(0);
      }
    }
  });

  test("Full court fits the whole court FRAME (not the widened art), centered on both axes, and reads below a landing cut's 100%", () => {
    const t = viewerFullCourtTransform(stage);
    expect(t.z).toBeCloseTo(fitZ, 6);
    const frameCentre = viewerArtPoint(
      frame.minX + frame.w / 2,
      frame.minY + frame.h / 2,
    );
    expect(t.px + frameCentre.x * t.z).toBeCloseTo(stage.w / 2, 5);
    expect(t.py + frameCentre.y * t.z).toBeCloseTo(stage.h / 2, 5);
    for (const s of [
      { w: 1100, h: 640 },
      { w: 820, h: 560 },
    ]) {
      expect(viewerFullCourtTransform(s).z).toBeLessThan(
        viewerInitialTransform("serve", s).z,
      );
    }
  });

  test("Full court is inside the zoom range a small stage allows", () => {
    for (const s of [
      { w: 420, h: 380 },
      { w: 600, h: 420 },
    ]) {
      const t = viewerFullCourtTransform(s);
      expect(t.z).toBeGreaterThanOrEqual(minZoomFor(art, s));
      const fz = Math.min(s.w / frameWpx, s.h / frameHpx);
      expect(t.z).toBeCloseTo(fz, 6);
    }
  });

  test("contact cuts keep their own framing: no landing half", () => {
    expect(viewerLandingHalf("returnContact")).toBeNull();
    expect(viewerLandingHalf("rallyPosition")).toBeNull();
  });

  test("returnContact/rallyPosition (contact cuts): zooms to 1.6x the FRAME's fit, near baseline at 500/950 of stage height, horizontally centered", () => {
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

/**
 * T16: the Approaches cut draws a pair per point — a contact in the near half,
 * a placement in the far half — so its 100% is the whole length, not the far
 * landing half `isLandingCut` would otherwise send it to (which opened with
 * every contact below the stage). Same stage sizes as the landing-cut test.
 */
test.describe("viewerInitialTransform — approaches", () => {
  const stages = [
    { w: 700, h: 900 },
    { w: 1100, h: 640 },
    { w: 820, h: 560 },
  ];

  test("both baselines are inside the stage, with apron beyond each, and the court is centered across", () => {
    for (const s of stages) {
      const t = viewerInitialTransform("approaches", s);
      const toStageY = (y: number) => t.py + viewerArtPoint(0, y).y * t.z;
      const far = toStageY(VIEWER_COURT.farBaselineY);
      const near = toStageY(VIEWER_COURT.nearBaselineY);
      expect(far).toBeGreaterThan(0);
      expect(near).toBeLessThan(s.h);
      // Room on the apron past each baseline for labels drawn there.
      expect(far).toBeGreaterThan(20);
      expect(s.h - near).toBeGreaterThan(20);
      // Centred across, and the full length centred down the stage.
      const centre = viewerArtPoint(VIEWER_COURT.centreX, 0);
      expect(t.px + centre.x * t.z).toBeCloseTo(s.w / 2, 4);
      expect((far + near) / 2).toBeCloseTo(s.h / 2, 4);
      // Both sidelines (doubles) are on stage too.
      const left = viewerArtPoint(VIEWER_COURT.doubles.x, 0);
      const right = viewerArtPoint(
        VIEWER_COURT.doubles.x + VIEWER_COURT.doubles.w,
        0,
      );
      expect(t.px + left.x * t.z).toBeGreaterThan(0);
      expect(t.px + right.x * t.z).toBeLessThan(s.w);
      // "Full court" is still a step out from here, not the same view.
      expect(viewerFullCourtTransform(s).z).toBeLessThan(t.z);
      // A fixed point of clampPan: the seeded transform is already valid.
      expect(clampPan(t, VIEWER_COURT.artPx, s)).toEqual(t);
    }
  });

  test("the other cuts open where they did: landing cuts on the far half, contact cuts on the near baseline", () => {
    for (const s of stages) {
      const approach = viewerInitialTransform("approaches", s);
      for (const cut of [
        "serve",
        "returnPlacement",
        "rallyPlacement",
        "errors",
      ] as const) {
        const t = viewerInitialTransform(cut, s);
        const bottom = viewerArtPoint(
          0,
          VIEWER_LANDING_FRAME.minY + VIEWER_LANDING_FRAME.h,
        );
        expect(t.py + bottom.y * t.z).toBeCloseTo(s.h, 4);
        // The landing half is closer in than the whole length.
        expect(t.z).toBeGreaterThan(approach.z);
      }
      for (const cut of ["returnContact", "rallyPosition"] as const) {
        const t = viewerInitialTransform(cut, s);
        const nearBaseline = viewerArtPoint(0, VIEWER_COURT.nearBaselineY);
        expect(t.py + nearBaseline.y * t.z).toBeCloseTo(s.h * (500 / 950), 3);
      }
    }
  });
});

/**
 * T23: the Approaches court's words are drawn larger by
 * `viewerApproachLabelScale`, so at the two cuts' opening zooms a word of the
 * same size reads the same on screen: scale × the Approaches zoom is the
 * landing cuts' zoom, on every stage shape.
 */
test.describe("viewerApproachLabelScale", () => {
  test("brings the Approaches opening zoom up to a landing cut's, and is 1 where both frames are width-bound", () => {
    for (const s of [
      { w: 700, h: 900 },
      { w: 1100, h: 640 },
      { w: 820, h: 560 },
      { w: 360, h: 1400 },
    ]) {
      const scale = viewerApproachLabelScale(s);
      expect(scale).toBeGreaterThanOrEqual(1);
      expect(scale * viewerInitialTransform("approaches", s).z).toBeCloseTo(
        viewerInitialTransform("returnPlacement", s).z,
        6,
      );
    }
    // Tall and narrow: the width decides both fits.
    expect(viewerApproachLabelScale({ w: 360, h: 1400 })).toBeCloseTo(1, 6);
  });
});

/* ── Phase 2B: depth/contact band geometry ───────────────────────────────── */

/**
 * `viewerBandY` maps a band divider — always expressed in FEET FROM THE
 * BASELINE, the one space `viz-bands.ts` stores and the UI reads — onto the
 * fullscreen viewer's own `VIEWER_COURT` frame. Two halves, two origins:
 * `"depth"` measures the FAR half (return landings) from `farBaselineY`
 * toward the net, `"contact"` measures the NEAR half (contact/rally) from
 * `nearBaselineY`, with positive = BEHIND the baseline (larger y) and
 * negative = inside the court (smaller y).
 *
 * The scale is `SERVE_DEPTH_UNITS_PER_METER` — the SAME one
 * `projectViewerDot` uses for the dots it must line up with, never a second
 * derivation. The cases below pin the two anchors (0 ft = each half's own
 * baseline, 39 ft ≈ the net line) and both directions.
 */
test.describe("viewerBandY", () => {
  test("depth: 0 ft is the far baseline", () => {
    expect(viewerBandY("depth", 0)).toBeCloseTo(VIEWER_COURT.farBaselineY, 6);
  });

  test("depth: COURT_HALF_FT (baseline → net) lands on the net line", () => {
    // Within a tenth of a viewBox unit — `COURT_HALF_FT` is 11.885 m
    // converted through `FT_PER_M` and back through 0.3048, which lands a
    // hundredth of a foot short of the true half-court; on a 334-unit frame
    // that is well under a rendered pixel.
    expect(viewerBandY("depth", COURT_HALF_FT)).toBeCloseTo(
      VIEWER_COURT.netY,
      0,
    );
    expect(
      Math.abs(viewerBandY("depth", COURT_HALF_FT) - VIEWER_COURT.netY),
    ).toBeLessThan(0.1);
  });

  test("depth: the round 39 ft the UI prints also reads as the net line", () => {
    expect(viewerBandY("depth", 39)).toBeCloseTo(VIEWER_COURT.netY, 0);
  });

  test("depth: more feet from the baseline moves DOWN the frame, toward the net", () => {
    expect(viewerBandY("depth", 26)).toBeGreaterThan(viewerBandY("depth", 13));
    expect(viewerBandY("depth", 13)).toBeGreaterThan(VIEWER_COURT.farBaselineY);
    expect(viewerBandY("depth", 26)).toBeLessThan(VIEWER_COURT.netY);
  });

  test("contact: 0 ft is the near baseline", () => {
    expect(viewerBandY("contact", 0)).toBeCloseTo(
      VIEWER_COURT.nearBaselineY,
      6,
    );
  });

  test("contact: behind the baseline (positive ft) is a LARGER y", () => {
    expect(viewerBandY("contact", 5)).toBeGreaterThan(
      VIEWER_COURT.nearBaselineY,
    );
  });

  test("contact: inside the court (negative ft) is a SMALLER y", () => {
    expect(viewerBandY("contact", -6)).toBeLessThan(VIEWER_COURT.nearBaselineY);
  });

  test("the two halves are mirrored: the same |ft| is the same distance from each baseline", () => {
    // 5 ft: far enough to be a real distance, close enough that the CONTACT
    // side (which only has ~44 units of apron below the near baseline before
    // the viewBox ends) is not clamped.
    const depth = viewerBandY("depth", 5) - VIEWER_COURT.farBaselineY;
    const contact = viewerBandY("contact", 5) - VIEWER_COURT.nearBaselineY;
    expect(contact).toBeCloseTo(depth, 6);
  });

  test("every result is clamped inside VIEWER_COURT.viewBox", () => {
    const top = VIEWER_COURT.viewBox.minY;
    const bottom = VIEWER_COURT.viewBox.minY + VIEWER_COURT.viewBox.h;
    for (const ft of [-500, -39, 0, 39, 120, 5000]) {
      for (const kind of ["depth", "contact"] as const) {
        const y = viewerBandY(kind, ft);
        expect(y).toBeGreaterThanOrEqual(top);
        expect(y).toBeLessThanOrEqual(bottom);
      }
    }
  });
});

/**
 * `viewerBandEdges` turns a band scheme's dividers into the n+1 horizontal
 * edges the overlay's n rects sit between — the outer two being the edge of
 * the half the overlay is allowed to cover, not a divider.
 *
 * Depth: the first band starts at the FAR BASELINE (P2k: "DEEP starts at the
 * FAR baseline") and the last ends on the net line; a divider outside that
 * span is clamped to it.
 *
 * Contact: the "inside" band is capped at the NEAR SERVICE LINE rather than
 * running up to the net (it would otherwise flood the whole half), and the
 * "behind" band runs to the bottom of the viewBox.
 */
test.describe("viewerBandEdges", () => {
  test("thirds: three bands from the far baseline to the net", () => {
    const edges = viewerBandEdges(
      "depth",
      resolveDepthDividersFt({
        depthScheme: "thirds",
        depthDividersFt: null,
        contactDividersFt: [0, 5],
      }),
    );
    expect(edges).toHaveLength(4);
    expect(edges[0]).toBeCloseTo(VIEWER_COURT.farBaselineY, 6);
    expect(edges[3]).toBeCloseTo(VIEWER_COURT.netY, 6);
    expect(edges[1]).toBeGreaterThan(edges[0]);
    expect(edges[2]).toBeGreaterThan(edges[1]);
    expect(edges[3]).toBeGreaterThan(edges[2]);
  });

  test("deepMidShort: the coach default's own 10 / 24 ft dividers", () => {
    const edges = viewerBandEdges("depth", [10, 24]);
    expect(edges[1]).toBeCloseTo(viewerBandY("depth", 10), 6);
    expect(edges[2]).toBeCloseTo(viewerBandY("depth", 24), 6);
  });

  test("contact: capped at the near service line, open to the bottom of the frame", () => {
    const edges = viewerBandEdges("contact", [0, 5]);
    expect(edges).toHaveLength(4);
    expect(edges[0]).toBeCloseTo(VIEWER_COURT.nearServiceY, 6);
    expect(edges[1]).toBeCloseTo(VIEWER_COURT.nearBaselineY, 6);
    expect(edges[2]).toBeCloseTo(viewerBandY("contact", 5), 6);
    expect(edges[3]).toBeCloseTo(
      VIEWER_COURT.viewBox.minY + VIEWER_COURT.viewBox.h,
      6,
    );
  });

  test("contact: a divider deep inside the court is capped, never drawn above the service line", () => {
    const edges = viewerBandEdges("contact", [-39, 5]);
    expect(edges[1]).toBeCloseTo(VIEWER_COURT.nearServiceY, 6);
    expect(edges[1]).toBeGreaterThanOrEqual(edges[0]);
  });

  test("edges are always non-decreasing, so no band ever draws inside-out", () => {
    const cases: ["depth" | "contact", number[]][] = [
      ["depth", []],
      ["depth", [13, 26]],
      ["depth", [38.9, 38.95]],
      ["contact", [0, 5]],
      ["contact", [-39, 30]],
      ["contact", [29, 30]],
    ];
    for (const [kind, dividers] of cases) {
      const edges = viewerBandEdges(kind, dividers);
      expect(edges).toHaveLength(dividers.length + 2);
      for (let i = 1; i < edges.length; i++) {
        expect(edges[i]).toBeGreaterThanOrEqual(edges[i - 1]);
      }
    }
  });
});

/**
 * Phase 2B, Task 4: the band editor's two conversions. `viewerBandFtFromY`
 * is `viewerBandY`'s inverse (unclamped — the editor clamps in feet, in the
 * reducer), and `viewerScreenPxToFt` turns the editor's screen-pixel rules
 * (2 px / 10 px nudges, the 26 px minimum gap) into feet AT THE CURRENT
 * ZOOM: one viewBox unit is `(artPx.h * z) / viewBox.h` screen px
 * vertically, and one foot is `0.3048 * SERVE_DEPTH_UNITS_PER_METER` units.
 */
test.describe("viewerBandFtFromY", () => {
  test("round-trips viewerBandY for both kinds inside the viewBox", () => {
    for (const ft of [-3.5, 0, 0.5, 5, 12.998, 26, 38.5]) {
      expect(viewerBandFtFromY("depth", viewerBandY("depth", ft))).toBeCloseTo(
        ft,
        9,
      );
    }
    for (const ft of [-39, -20, -1.5, 0, 2, 5, 7.5]) {
      expect(
        viewerBandFtFromY("contact", viewerBandY("contact", ft)),
      ).toBeCloseTo(ft, 9);
    }
  });

  test("anchors: each half's own baseline is 0 ft", () => {
    expect(viewerBandFtFromY("depth", VIEWER_COURT.farBaselineY)).toBe(0);
    expect(viewerBandFtFromY("contact", VIEWER_COURT.nearBaselineY)).toBe(0);
  });

  test("feet grow DOWN the frame in both halves", () => {
    expect(viewerBandFtFromY("depth", 100)).toBeGreaterThan(
      viewerBandFtFromY("depth", 50),
    );
    expect(viewerBandFtFromY("contact", 480)).toBeGreaterThan(0);
    expect(viewerBandFtFromY("contact", 400)).toBeLessThan(0);
  });

  test("is unclamped (the reducer owns the clamp)", () => {
    expect(viewerBandFtFromY("depth", -500)).toBeLessThan(-80);
  });
});

test.describe("viewerScreenPxToFt", () => {
  const unitsPerFt = 0.3048 * SERVE_DEPTH_UNITS_PER_METER;

  test("z = 1: px → units → feet", () => {
    const pxPerUnit = VIEWER_COURT.artPx.h / VIEWER_COURT.viewBox.h;
    expect(viewerScreenPxToFt(26, 1)).toBeCloseTo(
      26 / pxPerUnit / unitsPerFt,
      9,
    );
  });

  test("the same pixels are fewer feet when zoomed in", () => {
    expect(viewerScreenPxToFt(26, 2)).toBeCloseTo(
      viewerScreenPxToFt(26, 1) / 2,
      9,
    );
    expect(viewerScreenPxToFt(2, 3.2)).toBeLessThan(
      viewerScreenPxToFt(2, 0.55),
    );
  });

  test("sign is preserved (a negative delta is toward the baseline/net)", () => {
    expect(viewerScreenPxToFt(-10, 1)).toBeCloseTo(
      -viewerScreenPxToFt(10, 1),
      12,
    );
  });

  test("agrees with viewerBandLayerY: N px apart on screen is N px → ft apart", () => {
    const z = 1.37;
    const a = viewerBandLayerY("depth", 10, z);
    const b = viewerBandLayerY("depth", 10 + viewerScreenPxToFt(40, z), z);
    expect(b - a).toBeCloseTo(40, 6);
  });
});

test.describe("viewerBandLayerY", () => {
  test("is viewerArtPoint's y for the divider, times z", () => {
    expect(viewerBandLayerY("depth", 0, 1)).toBeCloseTo(
      ((VIEWER_COURT.farBaselineY - VIEWER_COURT.viewBox.minY) /
        VIEWER_COURT.viewBox.h) *
        VIEWER_COURT.artPx.h,
      9,
    );
    expect(viewerBandLayerY("contact", 0, 2)).toBeCloseTo(
      2 *
        ((VIEWER_COURT.nearBaselineY - VIEWER_COURT.viewBox.minY) /
          VIEWER_COURT.viewBox.h) *
        VIEWER_COURT.artPx.h,
      9,
    );
  });
});

test.describe("viewerBandDrawableFt / capped viewerBandLayerY (fix round 1)", () => {
  test("contact: the near service line to the bottom of the widened viewBox", () => {
    const [lo, hi] = viewerBandDrawableFt("contact");
    expect(lo).toBeCloseTo(-18.01, 1);
    // 2026-09-21: the apron widened from ≈44 units (≈7.7 ft) to reach the
    // bottom of the new viewBox — the bound must land between 22 and 23.5 ft
    // and sit on the half-foot grid once the editor rounds it inward
    // (`bandEditorBounds`, pinned separately in band-editor-state.spec.ts).
    expect(hi).toBeGreaterThan(22);
    expect(hi).toBeLessThan(23.5);
    expect(hi).toBeCloseTo(23.02, 1);
    expect(viewerBandY("contact", lo)).toBeCloseTo(
      VIEWER_COURT.nearServiceY,
      9,
    );
  });

  test("depth: the far baseline to the net", () => {
    const [lo, hi] = viewerBandDrawableFt("depth");
    expect(lo).toBe(0);
    expect(hi).toBeCloseTo(39, 1);
  });

  test("the handle y is capped exactly where the overlay's edges are", () => {
    const [innerCap, outerCap] = viewerBandCaps("contact");
    const top =
      ((innerCap - VIEWER_COURT.viewBox.minY) / VIEWER_COURT.viewBox.h) *
      VIEWER_COURT.artPx.h;
    const bottom =
      ((outerCap - VIEWER_COURT.viewBox.minY) / VIEWER_COURT.viewBox.h) *
      VIEWER_COURT.artPx.h;
    expect(viewerBandLayerY("contact", -30, 1)).toBeCloseTo(top, 9);
    // 2026-09-21: 20 ft used to be past the (≈7.7 ft) outer bound; the
    // widened apron pushed that bound out to ≈23 ft, so the capping value
    // has to move past it too — 30 ft is still well past the new bound.
    expect(viewerBandLayerY("contact", 30, 1)).toBeCloseTo(bottom, 9);
    // …and agrees with the overlay's own edge for an in-range divider.
    const edges = viewerBandEdges("contact", [-5, 3]);
    expect(viewerBandLayerY("contact", -5, 1)).toBeCloseTo(
      ((edges[1] - VIEWER_COURT.viewBox.minY) / VIEWER_COURT.viewBox.h) *
        VIEWER_COURT.artPx.h,
      9,
    );
  });
});

test.describe("FULL_COURT_VERTICAL — the Approaches frame", () => {
  // An independent re-implementation of SVG's rotate(-90 cx cy): matrix
  // [cos −sin; sin cos] with cos = 0, sin = −1, about (cx, cy).
  function svgRotateMinus90(x: number, y: number, cx: number, cy: number) {
    const dx = x - cx;
    const dy = y - cy;
    return { x: cx + dy, y: cy - dx };
  }

  test("is RETURN_COURT rotated -90° about its net center", () => {
    expect(FULL_COURT_VERTICAL.groupTransform).toBe(
      `rotate(-90 ${RETURN_COURT.netX} ${RETURN_COURT.centerY})`,
    );
    for (const [x, y] of [
      [RETURN_COURT.farBaselineX, RETURN_COURT.doublesTop],
      [RETURN_COURT.nearBaselineX, RETURN_COURT.singlesBottom],
      [RETURN_COURT.serviceLineFarX, RETURN_COURT.centerY],
      [RETURN_COURT.netX, RETURN_COURT.netTopY],
    ]) {
      const want = svgRotateMinus90(
        x,
        y,
        RETURN_COURT.netX,
        RETURN_COURT.centerY,
      );
      const got = fullVerticalToScreen(x, y);
      expect(got.x).toBeCloseTo(want.x, 9);
      expect(got.y).toBeCloseTo(want.y, 9);
    }
  });

  test("full length, the subject's baseline at the bottom, net between", () => {
    const f = FULL_COURT_VERTICAL;
    expect(f.subjectBaselineX).toBe(RETURN_COURT.farBaselineX);
    expect(f.opponentBaselineX).toBe(RETURN_COURT.nearBaselineX);
    expect(fullVerticalToScreen(f.subjectBaselineX, 0).y).toBe(
      f.subjectBaselineY,
    );
    expect(fullVerticalToScreen(f.opponentBaselineX, 0).y).toBe(f.farBaselineY);
    // Screen y grows downward: far baseline < net < subject's baseline.
    expect(f.farBaselineY).toBeLessThan(f.netY);
    expect(f.netY).toBeLessThan(f.subjectBaselineY);
    // Baseline to baseline is the whole 400-unit (23.77 m) court.
    expect(f.subjectBaselineY - f.farBaselineY).toBe(
      RETURN_COURT.nearBaselineX - RETURN_COURT.farBaselineX,
    );
    expect(f.netY - f.farBaselineY).toBe(f.subjectBaselineY - f.netY);
  });

  test("matches the approved look's viewBoxes", () => {
    expect(FULL_COURT_VERTICAL.viewBox).toEqual({
      minX: 118,
      minY: -142,
      w: 244,
      h: 482,
    });
    expect(FULL_COURT_VERTICAL.cardViewBox).toEqual({
      minX: 130,
      minY: -104,
      w: 220,
      h: 418,
    });
  });

  test("both viewBoxes leave apron beyond both baselines and both doubles sidelines", () => {
    const f = FULL_COURT_VERTICAL;
    const left = fullVerticalToScreen(0, RETURN_COURT.doublesTop).x;
    const right = fullVerticalToScreen(0, RETURN_COURT.doublesBottom).x;
    for (const vb of [f.viewBox, f.cardViewBox]) {
      expect(vb.minY).toBeLessThan(f.farBaselineY);
      expect(vb.minY + vb.h).toBeGreaterThan(f.subjectBaselineY);
      expect(vb.minX).toBeLessThan(left);
      expect(vb.minX + vb.w).toBeGreaterThan(right);
      // Centred on the court.
      expect(vb.minX + vb.w / 2).toBe(f.centreX);
    }
  });

  test("every label sits on the apron, outside the court", () => {
    const f = FULL_COURT_VERTICAL;
    const vb = f.viewBox;
    expect(f.labels.placement.y).toBeLessThan(f.farBaselineY);
    expect(f.labels.contact.y).toBeGreaterThan(f.subjectBaselineY);
    for (const lane of ["left", "middle", "right"] as const) {
      const l = f.labels.lanes[lane];
      expect(l.y).toBeLessThan(f.farBaselineY);
      expect(l.y).toBeGreaterThan(f.labels.placement.y);
    }
    for (const l of [
      f.labels.placement,
      f.labels.contact,
      ...Object.values(f.labels.lanes),
    ]) {
      expect(l.y).toBeGreaterThan(vb.minY);
      expect(l.y).toBeLessThan(vb.minY + vb.h);
    }
  });
});

test.describe("projectApproachPair", () => {
  const f = FULL_COURT_VERTICAL;

  test("puts the contact in the near (bottom) half and the placement in the far (top) half", () => {
    for (const dot of [
      // A typical approach: struck inside the baseline, landed deep.
      { lateralM: 2, depthM: 9, pair: { lateralM: 1, depthM: -4 } },
      // Serve and volley: struck behind the baseline, landed in the box.
      { lateralM: -1.5, depthM: 5, pair: { lateralM: 0.3, depthM: 0.5 } },
      // Drawn in: struck near the service line, landed short.
      { lateralM: 0, depthM: 2, pair: { lateralM: -2, depthM: -7 } },
    ]) {
      const { placement, contact } = projectApproachPair(dot);
      expect(contact).not.toBeNull();
      expect(contact!.y).toBeGreaterThan(f.netY);
      expect(contact!.y).toBeLessThan(f.viewBox.minY + f.viewBox.h);
      expect(placement.y).toBeLessThan(f.netY);
      expect(placement.y).toBeGreaterThan(f.viewBox.minY);
    }
  });

  test("depth: placement on the far baseline, contact on the subject's own", () => {
    const { placement, contact } = projectApproachPair({
      lateralM: 0,
      depthM: 11.885,
      pair: { lateralM: 0, depthM: 0 },
    });
    expect(placement.y).toBeCloseTo(f.farBaselineY, 1);
    expect(contact!.y).toBeCloseTo(f.subjectBaselineY, 9);
    // A contact behind the baseline sits lower still; inside it, higher.
    const behind = projectApproachPair({
      lateralM: 0,
      depthM: 6,
      pair: { lateralM: 0, depthM: 1 },
    }).contact!;
    const inside = projectApproachPair({
      lateralM: 0,
      depthM: 6,
      pair: { lateralM: 0, depthM: -1 },
    }).contact!;
    expect(behind.y).toBeCloseTo(f.subjectBaselineY + UNITS_PER_METER, 9);
    expect(inside.y).toBeCloseTo(f.subjectBaselineY - UNITS_PER_METER, 9);
  });

  test("the hitter's right is screen right on both halves", () => {
    const { placement, contact } = projectApproachPair({
      lateralM: 4.115,
      depthM: 6,
      pair: { lateralM: 4.115, depthM: -2 },
    });
    const singlesRight = fullVerticalToScreen(0, RETURN_COURT.singlesBottom).x;
    expect(placement.x).toBeCloseTo(singlesRight, 9);
    expect(contact!.x).toBeCloseTo(singlesRight, 9);
    expect(singlesRight).toBeGreaterThan(f.centreX);
  });

  test("no pair, no contact", () => {
    expect(projectApproachPair({ lateralM: 0, depthM: 6 }).contact).toBeNull();
  });

  test("a wild out or a deep contact is pinned inside the opened view", () => {
    const { placement, contact } = projectApproachPair({
      lateralM: -20,
      depthM: 30,
      pair: { lateralM: 20, depthM: 15 },
    });
    const vb = f.viewBox;
    for (const p of [placement, contact!]) {
      expect(p.x).toBeGreaterThanOrEqual(vb.minX + RETURN_DOT_R);
      expect(p.x).toBeLessThanOrEqual(vb.minX + vb.w - RETURN_DOT_R);
      expect(p.y).toBeGreaterThanOrEqual(vb.minY + RETURN_DOT_R);
      expect(p.y).toBeLessThanOrEqual(vb.minY + vb.h - RETURN_DOT_R);
    }
  });

  test("lane thirds map to the three wing label positions", () => {
    const lanes = ["left", "middle", "right"] as const;
    // Sweep the singles court: each placement lands inside its own third's
    // screen span, under that third's label, and agrees with `laneOf`.
    for (let lateralM = -4.0; lateralM <= 4.0; lateralM += 0.25) {
      const lane = laneOf(lateralM);
      const { placement } = projectApproachPair({ lateralM, depthM: 8 });
      const span = f.lanes[lane];
      expect(placement.x).toBeGreaterThanOrEqual(span.x1);
      expect(placement.x).toBeLessThanOrEqual(span.x2);
      const nearest = lanes.reduce((best, l) =>
        Math.abs(f.labels.lanes[l].x - placement.x) <
        Math.abs(f.labels.lanes[best].x - placement.x)
          ? l
          : best,
      );
      expect(nearest).toBe(lane);
      expect(placement.y).toBeGreaterThan(f.labels.lanes[lane].y);
    }
  });

  test("a placement in the hitter's left third projects under the left label", () => {
    const { placement } = projectApproachPair({ lateralM: -2.7, depthM: 9 });
    const { left, middle, right } = f.labels.lanes;
    expect(left.x).toBeLessThan(middle.x);
    expect(middle.x).toBeLessThan(right.x);
    expect(placement.x).toBeGreaterThan(f.lanes.left.x1);
    expect(placement.x).toBeLessThan(f.lanes.left.x2);
    expect(Math.abs(placement.x - left.x)).toBeLessThan(
      (f.lanes.left.x2 - f.lanes.left.x1) / 2,
    );
    expect(placement.y).toBeGreaterThan(left.y);
  });

  test("the lane label positions are the three lane centers (approved look: 194, 240, 286)", () => {
    expect(f.labels.lanes.left.x).toBeCloseTo(193.73, 1);
    expect(f.labels.lanes.middle.x).toBe(240);
    expect(f.labels.lanes.right.x).toBeCloseTo(286.27, 1);
    expect(f.labels.lanes.middle.y).toBe(-105);
    expect(f.labels.placement).toEqual({ x: 240, y: -124 });
    expect(f.labels.contact).toEqual({ x: 240, y: 328 });
  });

  test("a backhand triangle on this frame has its apex as the topmost point", () => {
    const { placement, contact } = projectApproachPair({
      lateralM: -1,
      depthM: 7,
      pair: { lateralM: 1, depthM: -3 },
    });
    for (const p of [placement, contact!]) {
      // Marks are drawn in screen space, outside the rotated court group, so
      // the unrotated "serve" orientation is the right one here.
      const [apex, baseLeft, baseRight] = parseTrianglePoints(
        trianglePointsFor("serve", p.x, p.y, RETURN_DOT_R),
      );
      expect(apex.y).toBeLessThan(baseLeft.y);
      expect(apex.y).toBeLessThan(baseRight.y);
    }
  });
});
