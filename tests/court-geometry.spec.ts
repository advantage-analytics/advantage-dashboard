import { expect, test } from "@playwright/test";
import {
  SERVE_COURT,
  RETURN_COURT,
  projectServeDot,
  projectReturnDot,
  zoneCellX,
  zoneOpacity,
  ZONE_OPACITY_MIN,
  ZONE_OPACITY_MAX,
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
