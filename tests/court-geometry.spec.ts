import { expect, test } from "@playwright/test";
import {
  SERVE_COURT,
  projectServeDot,
  zoneOpacity,
  ZONE_OPACITY_MIN,
  ZONE_OPACITY_MAX,
} from "@/components/dashboard/matches/match-detail/shots/court-geometry";

/**
 * Pure and offline — no browser needed. Regression coverage for the serve
 * court orientation bug: the far baseline sits at the TOP of the 447×350
 * frame (y=0), the net at the BOTTOM (y=`BASELINE_Y`, 331), and the service
 * boxes / centre line / zone cells span `serviceY → netY`, not `0 →
 * serviceY`. See `court-geometry.ts`'s doc comment for the legacy source of
 * truth.
 */

test("orientation: net below service line below baseline", () => {
  expect(SERVE_COURT.netY).toBeGreaterThan(SERVE_COURT.serviceY);
  expect(SERVE_COURT.serviceY).toBeGreaterThan(SERVE_COURT.baselineY);
});

test("zone band matches the service-line-to-net span", () => {
  expect(SERVE_COURT.zoneTop).toBe(SERVE_COURT.serviceY);
  expect(SERVE_COURT.zoneBottom).toBe(SERVE_COURT.netY);
});

test("a dot at fraction y=0 lands on the service line", () => {
  const { y } = projectServeDot({ x: 0.5, y: 0 });
  expect(y).toBe(SERVE_COURT.serviceY);
});

test("a dot at fraction y=1 lands on the net", () => {
  const { y } = projectServeDot({ x: 0.5, y: 1 });
  expect(y).toBe(SERVE_COURT.netY);
});

test("a projected dot's cy always lies within [zoneTop, zoneBottom]", () => {
  for (const y of [0, 0.1, 0.25, 0.5, 0.75, 0.9, 1]) {
    const { y: cy } = projectServeDot({ x: 0.5, y });
    expect(cy).toBeGreaterThanOrEqual(SERVE_COURT.zoneTop);
    expect(cy).toBeLessThanOrEqual(SERVE_COURT.zoneBottom);
  }
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
