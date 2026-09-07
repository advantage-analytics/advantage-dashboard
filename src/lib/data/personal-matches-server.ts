import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { STAT_COLUMNS } from "@/lib/data/player-profile";
import type { MatchScore } from "@/lib/data/match-utils";

/**
 * The personal workspace's matches, and one side's statistics for each — read
 * once per request, however many surfaces on the page want them.
 *
 * Home draws two things from exactly these rows: the performance model
 * (`getOverallPerformance`) behind the Focus card and the activity figures,
 * and the season strip (`getPersonalSeasonKpis`). Both used to issue this
 * pair of queries themselves, so a single Home render ran four round trips
 * for two answers — the second pair fetching rows the first already had.
 *
 * `cache()`d on the viewer's id, which is what makes the sharing work: the
 * two callers ask independently, in the same `Promise.all`, and the second
 * gets the first's promise rather than a second query.
 *
 * ── The scope ───────────────────────────────────────────────────────────────
 * `created_by = me AND program_id IS NULL`. The second half is load-bearing
 * and is the same predicate the Matches list uses: `matches.program_id` is
 * nullable precisely so "no program" means the personal workspace, and a
 * coach's program upload belongs to the program, not here.
 *
 * ── The column list ─────────────────────────────────────────────────────────
 * The union of what the two callers need, which is why it lives here rather
 * than in either of them. Extra columns cost one projection; a second query
 * costs a round trip.
 */

export interface DbPersonalMatch {
  id: string;
  date: string;
  player1_id: string | null;
  player2_id: string | null;
  player1_name: string | null;
  player2_name: string | null;
  created_by: string | null;
  score: MatchScore | null;
}

const MATCH_COLUMNS =
  "id, date, player1_id, player2_id, player1_name, player2_name, created_by, score";

/**
 * `STAT_COLUMNS` is the season strip's list — every `PLAYER_MEASURES` rate
 * plus the raw counts a ratio is printed from. The rest are the performance
 * model's own: the ratings and tallies its fourteen KPI specs read, which the
 * strip has no use for.
 */
const EXTRA_STAT_COLUMNS = [
  "serve_rating",
  "aces",
  "double_faults",
  "avg_rally_length",
];

const PERSONAL_STAT_COLUMNS = [STAT_COLUMNS, ...EXTRA_STAT_COLUMNS].join(", ");

export interface PersonalMatchData {
  /** Newest first. Empty when the account has no personal match. */
  matches: DbPersonalMatch[];
  /** One row per side of each match above; the caller picks its own side. */
  stats: Record<string, unknown>[];
}

export const getPersonalMatchData = cache(async function getPersonalMatchData(
  userId: string
): Promise<PersonalMatchData> {
  const supabase = await createClient();

  const { data: matchRows } = await supabase
    .from("matches")
    .select(MATCH_COLUMNS)
    .eq("created_by", userId)
    .is("program_id", null)
    // NULLs last, or an undated row would head the list and be read as the
    // most recent thing this account did.
    .order("date", { ascending: false, nullsFirst: false });

  const matches = (matchRows ?? []) as unknown as DbPersonalMatch[];
  if (matches.length === 0) return { matches, stats: [] };

  const { data: statRows } = await supabase
    .from("match_stats_with_percentages")
    .select(PERSONAL_STAT_COLUMNS)
    .in(
      "match_id",
      matches.map((m) => m.id)
    );

  return { matches, stats: (statRows ?? []) as unknown as Record<string, unknown>[] };
});
