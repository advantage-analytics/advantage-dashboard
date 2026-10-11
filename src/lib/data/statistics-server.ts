import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { fetchAllPages } from "@/lib/data/paged-query";
import { getPersonalMatchData } from "@/lib/data/personal-matches-server";
import { getMyPlayerIds } from "@/lib/data/player-identity-server";
import type { DbStatRow } from "@/lib/data/player-profile";
import {
  toStatisticsMatches,
  type StatisticsMatch,
} from "@/lib/data/statistics";

/**
 * The personal Statistics page's reads.
 *
 * `getPersonalStatistics` issues no query of its own: it is the shared
 * personal pair (`getPersonalMatchData` + `getMyPlayerIds`) that Home's season
 * strip and performance model already read, so the scope — and the one
 * `match_stats` round trip — stay theirs. Everything it adds is
 * `toStatisticsMatches`, which is pure and pinned offline.
 */

export interface PersonalStatistics {
  /** Matches with the viewer's own statistics row, oldest → newest. */
  matches: StatisticsMatch[];
  /**
   * Every personal match, measured or not. Above `matches.length` when some
   * have no statistics yet; zero is day zero.
   */
  totalMatches: number;
}

export const getPersonalStatistics = cache(async function getPersonalStatistics(
  userId: string,
): Promise<PersonalStatistics> {
  const [{ matches, stats }, myPlayerIds] = await Promise.all([
    getPersonalMatchData(userId),
    getMyPlayerIds(),
  ]);

  return {
    matches: toStatisticsMatches(
      matches,
      stats as unknown as DbStatRow[],
      myPlayerIds,
      userId,
    ),
    totalMatches: matches.length,
  };
});

/** One point, reduced to what a cross-match tally reads. */
export interface StatisticsPoint {
  matchId: string;
  resultType: string | null;
  wonByPlayer1: boolean;
  serverIsPlayer1: boolean;
  rallyLength: number | null;
}

interface DbStatisticsPoint {
  match_id: string;
  result_type: string | null;
  won_by_player1: boolean;
  server_is_player1: boolean;
  rally_length: number | null;
}

/** Ids per request: an `.in()` list rides in the URL, and a URL has a ceiling. */
const MATCH_ID_CHUNK = 100;

/**
 * The points of the given matches, or `null` when the answer is unknown.
 *
 * `[]` means those matches genuinely have no `points` rows; `null` means a
 * read failed and the caller must say so rather than draw an empty tally —
 * the `match-points-server.ts` contract. Read through the cookie client, so
 * RLS decides which of the ids the viewer may see.
 *
 * Paged, because a season of points passes PostgREST's 1000-row cap many
 * times over, and ordered on `(match_id, point_number, id)` so pages never
 * overlap or skip.
 */
export async function getPersonalStatisticsPoints(
  matchIds: readonly string[],
): Promise<StatisticsPoint[] | null> {
  if (matchIds.length === 0) return [];
  const supabase = await createClient();

  const points: StatisticsPoint[] = [];
  for (let start = 0; start < matchIds.length; start += MATCH_ID_CHUNK) {
    const ids = matchIds.slice(start, start + MATCH_ID_CHUNK);
    const rows = await fetchAllPages<DbStatisticsPoint>(async (from, to) => {
      const { data, error } = await supabase
        .from("points")
        .select(
          "match_id, result_type, won_by_player1, server_is_player1, rally_length",
        )
        .in("match_id", ids)
        .order("match_id", { ascending: true })
        .order("point_number", { ascending: true })
        .order("id", { ascending: true })
        .range(from, to);
      // The helper stops at the first error, so this logs exactly once.
      if (error) {
        console.error("Failed to fetch statistics points:", error.message);
      }
      return { data: data as DbStatisticsPoint[] | null, error };
    });
    if (!rows) return null;

    for (const row of rows) {
      points.push({
        matchId: row.match_id,
        resultType: row.result_type,
        wonByPlayer1: row.won_by_player1,
        serverIsPlayer1: row.server_is_player1,
        rallyLength: row.rally_length,
      });
    }
  }
  return points;
}
