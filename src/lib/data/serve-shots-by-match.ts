import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAllPages } from "@/lib/data/paged-query";

/** The `points` side of a serve row — what both serve maps read. */
export type ServeShotPoint = {
  id: string;
  match_id: string;
  server_is_player1: boolean;
  set_number: number | null;
  result_type: string | null;
  point_score: string | null;
  game_score: string | null;
  won_by_player1: boolean | null;
};

/** One serve row joined to its point. */
export type ServeShotRow = {
  id: string;
  shot_number: number | null;
  shot_type: string | null;
  landing_x: number | null;
  landing_y: number | null;
  contact_y: number | null;
  spin_type: string | null;
  zone: string | null;
  result: string | null;
  point_id: string;
  points: ServeShotPoint | null;
};

type PointWithServes = ServeShotPoint & {
  shots: Omit<ServeShotRow, "point_id" | "points">[] | null;
};

/**
 * Every serve row (`First Serve` / `Second Serve`) of the given matches, each
 * joined to its point, ordered by point then shot number then id.
 *
 * Read from `points` down, never from `shots` up. The shots-side query
 * (`shots … points!inner(...)` filtered on `points.match_id`) cannot use an
 * index on the match: Postgres walks the WHOLE shots table and probes each
 * row's point, so it slowed with every match anyone uploaded — ~400ms mean
 * and up to 4s in `pg_stat_statements` for four matches. Starting at
 * `points.match_id` (indexed) and embedding each point's serves (indexed on
 * `point_id`) reads only these matches' rows: ~93ms → ~12ms under RLS.
 *
 * Paged over points through the fail-closed `fetchAllPages`: ten matches'
 * points pass PostgREST's 1000-row cap, and a truncated read would plot a
 * partial map that looks complete. `id` is unique, so the order is total and
 * pages never overlap or skip. `null` means a page failed — "no answer", never
 * the rows before it; `onError` gets the message once.
 */
export async function fetchServeShotsForMatches(
  supabase: SupabaseClient,
  matchIds: readonly string[],
  onError?: (message: string) => void,
): Promise<ServeShotRow[] | null> {
  const points = await fetchAllPages<PointWithServes>(async (from, to) => {
    const { data, error } = await supabase
      .from("points")
      .select(
        "id, match_id, server_is_player1, set_number, result_type, point_score, game_score, won_by_player1, shots(id, shot_number, shot_type, landing_x, landing_y, contact_y, spin_type, zone, result)",
      )
      .in("match_id", matchIds)
      .in("shots.shot_type", ["First Serve", "Second Serve"])
      .order("id", { ascending: true })
      .order("shot_number", { ascending: true, referencedTable: "shots" })
      .order("id", { ascending: true, referencedTable: "shots" })
      .range(from, to);
    // The helper stops at the first error, so this fires exactly once.
    if (error) onError?.(error.message);
    return { data: data as PointWithServes[] | null, error };
  });
  if (!points) return null;

  // Back to one row per serve, as the shots-side read returned them. A point
  // with no serve row contributes nothing — the old inner join dropped it too.
  const rows: ServeShotRow[] = [];
  for (const { shots, ...point } of points) {
    for (const shot of shots ?? []) {
      rows.push({ ...shot, point_id: point.id, points: point });
    }
  }
  return rows;
}
