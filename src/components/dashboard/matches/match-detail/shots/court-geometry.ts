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
