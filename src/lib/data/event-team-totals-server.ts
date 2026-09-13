import { createClient } from "@/lib/supabase/server";

import {
  sumTeamTotals,
  type EventTeamTotals,
  type SideTotals,
  type TeamTotalRow,
} from "./event-team-totals";

/**
 * The read behind one event's team totals.
 *
 * The arithmetic — and the two decisions worth arguing about, why this SUMS raw
 * counts rather than averaging per-match percentages the way `meanOfPresent`
 * does, and why `is_player1` is our side on an event match — live in
 * `event-team-totals.ts`, which imports no Supabase client so the rules can be
 * tested against hand figures. Re-exported here so a caller needs one import.
 */
export {
  sumTeamTotals,
  type EventTeamTotals,
  type SideTotals,
  type TeamTotalRow,
};

/** Exactly the columns the sums consume, and no others. */
const COLUMNS =
  "match_id, is_player1, first_serves, first_serves_in, first_serve_points_won, break_point_opportunities, break_points_converted, total_points, total_points_won";

/** What an empty read returns: no rows, so every figure is "not measured". */
const EMPTY: EventTeamTotals = sumTeamTotals([]);

/**
 * Both sides' totals across one event's matches.
 *
 * `matchIds` is the CALLER's responsibility to restrict to matches
 * `isAnalysisReady` accepts (`src/lib/data/match-analysis.ts`). This loader does
 * not re-check status: a match still analysing has no stat rows to sum, but one
 * that failed mid-way can have partial ones, and a total quietly built from half
 * a match is a wrong number that looks entirely plausible. The caller already
 * holds the analysis map the rest of its page is drawn from; asking again here
 * would be a second answer to a question that already has one.
 *
 * An empty id list returns the empty totals without querying — `.in()` on an
 * empty array is a round trip to be told nothing, and every figure would be null
 * regardless.
 *
 * A failed read is indistinguishable from an event nothing has measured: both
 * yield null figures and `matchesCounted: 0`. That is the safe direction — a
 * card with no numbers, rather than numbers built from a partial read.
 */
export async function getEventTeamTotals(
  matchIds: string[],
): Promise<EventTeamTotals> {
  const ids = [...new Set(matchIds)];
  if (ids.length === 0) return EMPTY;

  const supabase = await createClient();

  const { data } = await supabase
    .from("match_stats_with_percentages")
    .select(COLUMNS)
    .in("match_id", ids);

  return sumTeamTotals((data ?? []) as unknown as TeamTotalRow[]);
}
