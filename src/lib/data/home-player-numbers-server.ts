import { cache } from "react";
import {
  STAT_COLUMNS,
  seasonStrip,
  withPlayerStats,
  type DbStatRow,
  type ProfileKpi,
} from "@/lib/data/player-profile";
import {
  getPlayerMatchSides,
  profileResultsFrom,
} from "@/lib/data/player-profile-server";
import { createClient } from "@/lib/supabase/server";

/**
 * A player's own season figures inside a program, for their Team Home.
 *
 * The matches are the profile page's own (`getPlayerMatchSides`, shared
 * through `cache()`), read as the signed-in viewer, so row-level security
 * decides what is counted. Their statistics come from
 * `match_stats_with_percentages`, the view the personal Home and the season
 * page read, and `seasonStrip` does the arithmetic all three share. Empty for
 * an id that names nobody on the roster.
 */
export const getPlayerHomeKpis = cache(async function getPlayerHomeKpis(
  programId: string,
  playerId: string,
): Promise<ProfileKpi[]> {
  const sides = await getPlayerMatchSides(programId, playerId);
  if (!sides) return [];
  const results = profileResultsFrom(sides.own);
  if (results.length === 0) return [];

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("match_stats_with_percentages")
    .select(STAT_COLUMNS)
    .in(
      "match_id",
      results.map((result) => result.id),
    );
  if (error)
    throw new Error("Could not read your match statistics", { cause: error });

  return seasonStrip(
    withPlayerStats(results, (data ?? []) as unknown as DbStatRow[]),
  ).kpis;
});
