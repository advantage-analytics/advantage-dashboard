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
 * The playing enclosure — the outer bound on where a ball or a player can
 * physically be.
 *
 * Taken from the ITF's recommended run-off: 6.40 m behind each baseline and
 * 3.66 m outside each doubles sideline. Anything beyond that is outside the
 * fence, so it is a tracking failure rather than a wide ball or a deep
 * returner.
 *
 * The bound has to come from somewhere real, because both plausible-looking
 * mistakes are costly. Too loose and the vendor's `bounce_y_m: 371.7` reaches
 * a placement chart. Too tight and it eats legitimate data: an earlier
 * 13.0 m cut nulled 71% of player positions in a sample match, because the
 * median player stands 13.6 m from the net — about two metres behind the
 * baseline, which is simply where people stand.
 */
export const RUN_OFF_BEHIND_BASELINE_M = 6.4;
export const RUN_OFF_BESIDE_SIDELINE_M = 3.66;

export const MAX_PLAUSIBLE_Y_M = BASELINE_M + RUN_OFF_BEHIND_BASELINE_M;
export const MAX_PLAUSIBLE_X_M =
  DOUBLES_HALF_WIDTH_M + RUN_OFF_BESIDE_SIDELINE_M;

/**
 * True when a coordinate pair sits inside the playing enclosure.
 *
 * Applied to bounces and to player positions alike — neither a ball nor a
 * person can be outside the fence.
 */
export function isPlausibleCourtPosition(x: number, y: number): boolean {
  return Math.abs(x) <= MAX_PLAUSIBLE_X_M && Math.abs(y) <= MAX_PLAUSIBLE_Y_M;
}

/**
 * A position in the database's court frame: metres, y measured from one
 * baseline.
 */
export interface CourtPosition {
  x: number;
  y: number;
}

/**
 * Vendor metres -> the frame `shots.contact_x/y` and `landing_x/y` actually use.
 *
 * NOT normalized. The integration spec's §4.2 says these columns are 0-1, and
 * an earlier `metersToNormalized()` here implemented that. Both are wrong, and
 * wrong in the silent direction: `calculate_match_stats` compares
 * `abs(landing_x)` against 2.74 and 1.37 and computes `23.77 - contact_y`, so
 * normalized input puts every serve under 1.37 (100% "T", zero Wide and Body),
 * every return under 1.0 (100% "Middle") and every contact under 11.885 (100%
 * "inside"). Three stat families read zero with nothing erroring.
 *
 * Verified twice against live SwingVision data, which is the only authority on
 * what these columns mean:
 *   - 2,051 in-serves all land within |landing_x| <= 4.115 (max 4.114), the
 *     singles half-width, so x is metres about the centre line.
 *   - in-serve `landing_y` occupies 5.49-11.87 and 11.93-18.29 — the two
 *     service boxes to the centimetre — so y runs 0 at one baseline, 11.885 at
 *     the net, 23.77 at the other.
 *
 * The vendor's frame shares the x convention exactly and differs in y only by
 * having its origin at the net. So the whole transform is one offset.
 *
 * Fixed for the entire match. Do NOT vary it by which end a player is on, and
 * do NOT vary it by `initial_top_player_is_player1` — that flag decides player
 * identity, never geometry. A y-only flip would look harmless because every
 * y-dependent expression in `calculate_match_stats` is symmetric about the net,
 * but `court-visualization.tsx` mirrors far-side landings through
 * `(-x, 23.77 - y)` — a 180° rotation — so the render is invariant only under a
 * simultaneous x and y flip. Flip y alone and every chart mirrors, swapping the
 * deuce and ad service boxes, while match_stats stays numerically identical.
 */
export function metersToCourtFrame(
  xMeters: number,
  yMeters: number
): CourtPosition {
  return { x: xMeters, y: yMeters + BASELINE_M };
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

/**
 * Serve placement bucket from a landing x, in the database's court frame.
 *
 * The thresholds are not arbitrary and must not be re-tuned: they are the
 * singles half-width in thirds (4.115/3 = 1.372, 2*4.115/3 = 2.743), and
 * `calculate_match_stats` hard-codes 1.37 and 2.74 to compute `serve_t`,
 * `serve_body` and `serve_wide` independently from the same column. If
 * `shots.zone` and those three ever disagree, one of them is lying to a coach
 * and nothing says which.
 *
 * Returns a value from the `shots_zone_check` constraint, or null when the
 * landing is unknown.
 */
export function serveZone(landingX: number | null): 'T' | 'Body' | 'Wide' | null {
  if (landingX === null) return null;
  const from = Math.abs(landingX);
  if (from < 1.37) return 'T';
  if (from < 2.74) return 'Body';
  return 'Wide';
}

/**
 * Direction bucket for a non-serve, relative to the serve that opened the point.
 *
 * Mirrors how `calculate_match_stats` classifies returns: a landing within 1.0 m
 * of the centre line is Middle regardless of direction; otherwise the sign of
 * the landing x against the serve's decides crosscourt from down-the-line.
 */
export function directionZone(
  landingX: number | null,
  serveLandingX: number | null
): 'Crosscourt' | 'Middle' | 'Down the Line' | null {
  if (landingX === null) return null;
  if (Math.abs(landingX) <= 1.0) return 'Middle';
  if (serveLandingX === null) return null;
  return Math.sign(serveLandingX) !== Math.sign(landingX)
    ? 'Crosscourt'
    : 'Down the Line';
}
