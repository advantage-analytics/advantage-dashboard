import { cache } from "react";
import { matchOutcome, shortName } from "@/lib/data/match-utils";
import { getPersonalMatchData } from "@/lib/data/personal-matches-server";
import { statKey } from "@/lib/data/aggregate";
import { getMyPlayerIds, playerSide } from "@/lib/data/player-identity-server";
import {
  seasonKpis,
  toStatRow,

  type DbStatRow,
  type ProfileKpi,
  type ProfileResult,
  type ProfileStatRow,
} from "@/lib/data/player-profile";

/**
 * The personal Home's season strip — the same five tiles a team player's
 * profile draws, over the viewer's own personal matches.
 *
 * Scope is the personal workspace's: `created_by = me AND program_id IS
 * NULL`, the predicate the Matches list and `getOverallPerformance` share.
 * Which side of each row is the viewer comes from `playerSide`, never from
 * assuming player one — a legacy upload can put the viewer on either side.
 *
 * No duals and no team here, so the Record tile carries no "in duals" line
 * and no tile mentions a team average: a personal workspace has neither, and
 * the strip is built so it never has to pretend otherwise.
 */
export interface PersonalSeasonKpis {
  kpis: ProfileKpi[];
  /** Any stats row on the viewer's side — what turns the empty strip real. */
  hasStats: boolean;
  matchesPlayed: number;
}

const EMPTY: PersonalSeasonKpis = { kpis: [], hasStats: false, matchesPlayed: 0 };

export const getPersonalSeasonKpis = cache(async function getPersonalSeasonKpis(
  userId: string
): Promise<PersonalSeasonKpis> {
  // Both reads are the shared personal pair — the performance model on the
  // same page asks for them too, and `cache()` means only one of us pays.
  const [{ matches, stats: statRows }, myPlayerIds] = await Promise.all([
    getPersonalMatchData(userId),
    getMyPlayerIds(),
  ]);

  const own = matches.flatMap((match) => {
    const side = playerSide(match, myPlayerIds, userId);
    return side === null ? [] : [{ match, isPlayer1: side === "player1" }];
  });
  if (own.length === 0) return EMPTY;

  const statsByKey = new Map<string, ProfileStatRow>();
  for (const stat of statRows as unknown as DbStatRow[]) {
    statsByKey.set(statKey(stat.match_id, stat.is_player1), toStatRow(stat));
  }

  const results: ProfileResult[] = own.map(({ match, isPlayer1 }) => ({
    id: match.id,
    date: match.date,
    isPlayer1,
    won: matchOutcome(match.score, isPlayer1),
    entryId: null,
    // Whoever is on the other side — the name the hover chart's tooltip puts
    // over each point, so it reads as a match rather than a coordinate.
    opponentName: shortName(
      (isPlayer1 ? match.player2_name : match.player1_name) ?? "Unknown"
    ),
    score: match.score,
    tournamentName: null,
    stats: statsByKey.get(statKey(match.id, isPlayer1)) ?? null,
  }));

  let wins = 0;
  let losses = 0;
  for (const result of results) {
    if (result.won === true) wins++;
    else if (result.won === false) losses++;
  }

  return {
    kpis: seasonKpis(results, { wins, losses, duals: { wins: 0, losses: 0 } }),
    hasStats: results.some((r) => r.stats !== null),
    matchesPlayed: results.length,
  };
});
