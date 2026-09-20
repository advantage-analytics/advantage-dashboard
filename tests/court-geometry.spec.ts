import { expect, test } from "@playwright/test";
import {
  SERVE_COURT,
  projectServeDot,
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
