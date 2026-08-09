/**
 * Court coordinate conversion — the single place meters become our units.
 *
 * SplitStep's frame: meters, origin at the net centre, +y toward the top of
 * frame / far baseline, +x toward the right sideline.
 *
 * Ours: `shots.contact_x/y` and `shots.landing_x/y`, normalized 0–1 over the
 * doubles court, origin at the near-left corner.
 *
 * Every consumer goes through this module. Spec §4.2.
 */

/** Singles sideline, meters from the centre line. */
export const SINGLES_HALF_WIDTH_M = 4.115;
/** Doubles sideline, meters from the centre line. */
export const DOUBLES_HALF_WIDTH_M = 5.485;
/** Service line, meters from the net. */
export const SERVICE_LINE_M = 6.4;
/** Baseline, meters from the net. */
export const BASELINE_M = 11.885;

/**
 * How far outside the court a coordinate may sit before we call it corrupt
 * rather than merely long.
 *
 * A ball genuinely lands a metre or two past the baseline; the vendor also
 * emits values like `bounce_y_m: 371.7`, which is a tracking failure, not a
 * shot. The gap between those two is wide, so the threshold does not need to
 * be precise — it needs to exist. Without it, one sample match leaks 22% of
 * its bounces into every placement chart.
 *
 * Chosen to sit above any real shot (a lob landing long clears the baseline by
 * well under a metre) and far below the failure mode.
 */
export const MAX_PLAUSIBLE_Y_M = 13.0;
export const MAX_PLAUSIBLE_X_M = 7.0;

/** True when a bounce coordinate pair is physically possible on a court. */
export function isPlausibleCourtPosition(x: number, y: number): boolean {
  return Math.abs(x) <= MAX_PLAUSIBLE_X_M && Math.abs(y) <= MAX_PLAUSIBLE_Y_M;
}

export interface NormalizedPosition {
  x: number;
  y: number;
}

/**
 * Meters (net-centred) → normalized 0–1 over the doubles court.
 *
 * x: −5.485 → 0, 0 → 0.5, +5.485 → 1
 * y: −11.885 → 0, 0 → 0.5, +11.885 → 1
 *
 * Values outside the court normalize outside 0–1 rather than clamping. A
 * clamp would silently move an out ball onto the line, and "how far out" is
 * exactly what a placement chart is for.
 */
export function metersToNormalized(
  xMeters: number,
  yMeters: number
): NormalizedPosition {
  return {
    x: (xMeters + DOUBLES_HALF_WIDTH_M) / (2 * DOUBLES_HALF_WIDTH_M),
    y: (yMeters + BASELINE_M) / (2 * BASELINE_M),
  };
}

/** Serve speeds arrive in km/h; `shots.speed_mph` wants miles. */
export function kmhToMph(kmh: number): number {
  return kmh * 0.621371;
}

/**
 * Which service box a serve was aimed at, from the server's position.
 *
 * The vendor does not label deuce/ad. The server stands right of the centre
 * mark for a deuce point and left for an ad point, so the sign of their x at
 * contact answers it — but "right" flips with which end they are on, hence
 * the multiply by the direction they are hitting.
 *
 * Returns null when the server's position is missing.
 */
export function serveCourtSide(
  playerX: number | null,
  playerY: number | null
): 'deuce' | 'ad' | null {
  if (playerX === null || playerY === null) return null;
  // Serving from the negative-y end means hitting toward +y, and vice versa.
  const hittingToward = playerY < 0 ? 1 : -1;
  return playerX * hittingToward > 0 ? 'deuce' : 'ad';
}

/**
 * True when a bounce landed inside the service box on the receiving side.
 *
 * Used to characterise the vendor's `in` flag, not to replace it — see
 * serves.ts for why neither signal is trusted on its own.
 */
export function isInServiceBox(
  bounceX: number | null,
  bounceY: number | null,
  serverY: number | null
): boolean | null {
  if (bounceX === null || bounceY === null || serverY === null) return null;
  const hittingToward = serverY < 0 ? 1 : -1;
  const depth = bounceY * hittingToward;
  return depth > 0 && depth <= SERVICE_LINE_M && Math.abs(bounceX) <= SINGLES_HALF_WIDTH_M;
}
