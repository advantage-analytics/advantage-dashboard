import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { pct, statKey } from "@/lib/data/aggregate";
import type { MatchScore } from "@/lib/data/match-utils";
import {
  PERSONAL_OPPONENT_MEASURE_KEYS,
  currentSeason,
  groupPersonalOpponents,
  personalOpponentTotals,
  type PersonalOpponent,
  type PersonalOpponentMatchInput,
  type PersonalOpponentTotals,
} from "@/lib/data/personal-opponents";
import { getMyPlayerIds, playerSide } from "@/lib/data/player-identity-server";

/**
 * The personal Opponents page's one read: the viewer's own matches and their
 * side of each stats row, grouped by opponent in `personal-opponents.ts`.
 *
 * Sits BESIDE `opponents-server.ts`, not in it. That file is the team
 * product's — program-keyed, nothing in it takes a user id.
 *
 * ── The scope ───────────────────────────────────────────────────────────────
 * `created_by = me AND program_id IS NULL`, the predicate
 * `personal-matches-server.ts` documents and the Matches list uses. It is
 * spelled out again here rather than reached through `getPersonalMatches`
 * because this page needs `opponent_player_id`, which Home's column list has no
 * use for.
 *
 * ── The client ──────────────────────────────────────────────────────────────
 * The cookie-bound server client only. Every row here is the viewer's own and
 * RLS already says so; there is nothing for a service-role read to add.
 *
 * ── The outcome ─────────────────────────────────────────────────────────────
 * From `score`, through `matchOutcome`. `matches.result` is free text holding
 * a context string and is deliberately not selected.
 */

interface DbOpponentMatch {
  id: string;
  date: string | null;
  player1_id: string | null;
  player2_id: string | null;
  player1_name: string | null;
  player2_name: string | null;
  created_by: string | null;
  tournament_name: string | null;
  score: MatchScore | null;
  opponent_player_id: string | null;
  opponent_hand: string | null;
  opponent_backhand: string | null;
}

const MATCH_COLUMNS =
  "id, date, player1_id, player2_id, player1_name, player2_name, created_by, tournament_name, score, opponent_player_id, opponent_hand, opponent_backhand";

/** One side of one match; a `numeric` column arrives as a string. */
interface DbStatRow {
  match_id: string;
  is_player1: boolean;
  [measure: string]: unknown;
}

const STAT_COLUMNS = [
  "match_id",
  "is_player1",
  ...PERSONAL_OPPONENT_MEASURE_KEYS,
].join(", ");

export interface PersonalOpponentsData {
  /** Sorted by last-match date, newest first. */
  opponents: PersonalOpponent[];
  totals: PersonalOpponentTotals;
  /**
   * The current academic season, `"2026–27"` — the one
   * `PersonalOpponent.playedThisSeason` and `recent[].inSeason` were marked
   * against, so the "This season" chip filters without re-deriving it.
   */
  season: string;
}

export const getPersonalOpponents = cache(async function getPersonalOpponents(
  userId: string,
): Promise<PersonalOpponentsData> {
  const season = currentSeason(new Date());
  const supabase = await createClient();

  const [{ data: matchRows, error: matchError }, myPlayerIds] =
    await Promise.all([
      supabase
        .from("matches")
        .select(MATCH_COLUMNS)
        .eq("created_by", userId)
        .is("program_id", null)
        .order("date", { ascending: false, nullsFirst: false }),
      getMyPlayerIds(),
    ]);
  if (matchError)
    throw new Error("Could not load personal opponents", { cause: matchError });

  const matches = (matchRows ?? []) as unknown as DbOpponentMatch[];
  if (matches.length === 0) {
    return { opponents: [], totals: personalOpponentTotals([]), season };
  }

  const { data: statRows, error: statError } = await supabase
    .from("match_stats_with_percentages")
    .select(STAT_COLUMNS)
    .in(
      "match_id",
      matches.map((m) => m.id),
    );
  if (statError)
    throw new Error("Could not load personal opponent statistics", {
      cause: statError,
    });

  const valuesBySide = new Map<string, Record<string, number | null>>();
  for (const row of (statRows ?? []) as unknown as DbStatRow[]) {
    valuesBySide.set(
      statKey(row.match_id, row.is_player1),
      Object.fromEntries(
        PERSONAL_OPPONENT_MEASURE_KEYS.map((key) => [
          key,
          pct(row[key] as string | number | null | undefined),
        ]),
      ),
    );
  }

  const inputs: PersonalOpponentMatchInput[] = matches.flatMap((match) => {
    // The viewer's seat, by the shared rule — both id spaces `player1_id` can
    // hold resolve through `my_player_ids()`. A match that is not theirs is
    // dropped rather than guessed at.
    const side = playerSide(match, myPlayerIds, userId);
    if (side === null) return [];
    const isUserPlayer1 = side === "player1";
    return [
      {
        id: match.id,
        date: match.date,
        isUserPlayer1,
        player1_name: match.player1_name,
        player2_name: match.player2_name,
        opponent_player_id: match.opponent_player_id,
        opponent_hand: match.opponent_hand,
        opponent_backhand: match.opponent_backhand,
        tournament_name: match.tournament_name,
        score: match.score,
        values: valuesBySide.get(statKey(match.id, isUserPlayer1)) ?? null,
      },
    ];
  });

  const opponents = groupPersonalOpponents(inputs, season);
  return { opponents, totals: personalOpponentTotals(opponents), season };
});
