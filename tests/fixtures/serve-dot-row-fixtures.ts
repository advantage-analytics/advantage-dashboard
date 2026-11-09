/**
 * Building blocks for a fake `shots` row joined to its point, shaped as
 * `loadHomeServes` (`lib/data/home-serve-data.ts`) reads one — the rows
 * `home-serve-data.spec.ts` builds. The profile's serve map, which read the
 * same shape, was retired with the profile redesign (T12, 2026-11), so this
 * has one consumer now; it stays a fixture so a second reader of the join
 * builds its rows here rather than by hand.
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

/**
 * Joined shot rows regrouped as `fetchServeShotsForMatches` reads them: one
 * `points` row per point, its shots embedded, ordered by point id.
 */
export function asPointRows(
  rows: readonly {
    id: string;
    point_id: string;
    shot_number: number;
    points: ReturnType<typeof pointMeta>;
  }[],
) {
  const byPoint = new Map<
    string,
    ReturnType<typeof pointMeta> & { shots: Record<string, unknown>[] }
  >();
  for (const { points, point_id, ...shot } of rows) {
    let point = byPoint.get(point_id);
    if (!point) {
      point = { ...points, shots: [] };
      byPoint.set(point_id, point);
    }
    point.shots.push(shot);
  }
  return [...byPoint.values()].sort((a, b) => (a.id < b.id ? -1 : 1));
}
