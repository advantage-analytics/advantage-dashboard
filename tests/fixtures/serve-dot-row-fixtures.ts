/**
 * Building blocks for a fake `shots` row joined to its point, shared by
 * `home-serve-data.spec.ts` and `player-profile-serve-map.spec.ts` —
 * `loadHomeServes` and `serveMapFor` page through the same shots+points join
 * (the source comments cross-reference each other), so their test rows are
 * built from the same shapes.
 */

/** The `points` side of a joined shots row, shaped as either loader reads it. */
export function pointMeta(
  id: string,
  matchId: string,
  serverIsPlayer1: boolean,
) {
  return {
    id,
    match_id: matchId,
    server_is_player1: serverIsPlayer1,
    set_number: 1,
    result_type: null,
    point_score: "15-0",
    game_score: "1-0",
    won_by_player1: true,
  };
}

/**
 * A landing inside the far service box, struck from the near baseline, called
 * In — any row shaped like this survives `pointToServeDot`.
 */
export const inBox = {
  landing_x: 1,
  landing_y: 15,
  contact_y: 0,
  spin_type: "Flat",
  zone: null,
  result: "In",
};
