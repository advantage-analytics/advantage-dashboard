import {
  COURT_W,
  COURT_H,
  DOUBLES_LEFT,
  DOUBLES_RIGHT,
  SINGLES_LEFT,
  SINGLES_RIGHT,
  SERVICE_Y,
  BASELINE_Y,
  CENTER_X,
} from "@/components/dashboard/matches/visuals/half-court-svg";

/**
 * Serve half-court geometry — the 447×350 frame `court-art.tsx`'s serve cut
 * draws, pulled out into a pure module so `tests/court-geometry.spec.ts` can
 * import it without any React/SVG dependency.
 *
 * Ground truth is the legacy court this redesign replaced
 * (`git show b80b6c12:.../shots/serve-zones-court.tsx` and
 * `visuals/half-court-svg.tsx`'s `HalfCourtSVG`):
 * - The far BASELINE is at the TOP, y = 0.
 * - The SERVICE LINE is at y = `SERVICE_Y` (155).
 * - The NET is at the BOTTOM, y = `BASELINE_Y` (331) — that imported
 *   constant is misnamed; legacy draws the net there, not a baseline.
 * - The two service boxes, the centre service line, and the six zone cells
 *   all span `serviceY → netY` (legacy: `y={SERVICE_Y} height={BASELINE_Y -
 *   SERVICE_Y}`), not `0 → serviceY`.
 */
export const SERVE_COURT = {
  baselineY: 0,
  serviceY: SERVICE_Y,
  netY: BASELINE_Y,
  zoneTop: SERVICE_Y,
  zoneBottom: BASELINE_Y,
} as const;

// The net physically extends past the doubles sidelines. Legacy drew it at
// x=14..433 against `DOUBLES_LEFT`/`DOUBLES_RIGHT` of 37.4/410.9 (~23px of
// overhang on each side) — kept as literal constants since the overhang
// isn't derived from any other geometry value.
export const NET_LEFT = 14;
export const NET_RIGHT = 433;

export {
  COURT_W,
  COURT_H,
  DOUBLES_LEFT,
  DOUBLES_RIGHT,
  SINGLES_LEFT,
  SINGLES_RIGHT,
  CENTER_X,
};

export interface ServeDotFraction {
  x: number;
  y: number;
}

/**
 * Projects a 0..1 service-box fraction (a `ServeDot`, from
 * `serve-zones.ts`'s `mapRealCoordsToServeDot`) onto this frame: `x=0..1`
 * maps to `SINGLES_LEFT..SINGLES_RIGHT`, `y=0..1` maps to
 * `serviceY..netY` — y=0 lands on the service line, y=1 on the net, the
 * same box the fraction was measured against.
 */
export function projectServeDot(d: ServeDotFraction): { x: number; y: number } {
  return {
    x: SINGLES_LEFT + d.x * (SINGLES_RIGHT - SINGLES_LEFT),
    y: SERVE_COURT.serviceY + d.y * (SERVE_COURT.netY - SERVE_COURT.serviceY),
  };
}

// Zone cell opacity (visual-fix-round-2, Defect B): the six zone cells sit on
// top of the blue court fill, so a `var(--viz-you)` blue tint (the original
// design) was unreadable — near-invisible blue-on-blue. Cells are now white,
// shaded by each zone's share of serves *relative to the busiest zone drawn*
// (`maxPct`), not an absolute 0–100 scale: an emptiest-drawn zone (pct=0)
// reads at 0.06, the busiest zone actually drawn (pct=maxPct) at 0.42 — a
// spread wide enough to read cell-to-cell against the blue court, without the
// busiest cell going so opaque it fights the white count/winPct labels drawn
// on top of it.
export const ZONE_OPACITY_MIN = 0.06;
export const ZONE_OPACITY_MAX = 0.42;

/**
 * `maxPct` is the largest `pct` among the zones actually being drawn (not a
 * fixed 100) — so the shade spread always uses the full 0.06–0.42 range even
 * when every zone's share is small. `maxPct <= 0` (no zones drawn, or every
 * zone tied at 0%) returns the minimum shade rather than dividing by zero.
 */
export function zoneOpacity(pct: number, maxPct: number): number {
  if (maxPct <= 0) return ZONE_OPACITY_MIN;
  const t = Math.min(1, Math.max(0, pct / maxPct));
  return ZONE_OPACITY_MIN + t * (ZONE_OPACITY_MAX - ZONE_OPACITY_MIN);
}
