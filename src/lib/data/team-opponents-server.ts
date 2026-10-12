import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { pct, statKey } from "@/lib/data/aggregate";
import type { MatchScore } from "@/lib/data/match-utils";
import { getMemberAvatarUrls } from "@/lib/data/member-avatars-server";
import {
  PERSONAL_OPPONENT_MEASURE_KEYS,
  currentSeason,
} from "@/lib/data/personal-opponents";
import { CRESTS_BUCKET } from "@/lib/data/programs-server";
import {
  rosterPlayerOptions,
  type RosterFullRow,
} from "@/lib/data/roster-shared";
import {
  groupTeamOpponents,
  teamOpponentTotals,
  type TeamOpponent,
  type TeamOpponentMatchInput,
  type TeamOpponentRosterPlayer,
  type TeamOpponentTotals,
} from "@/lib/data/team-opponents";

/**
 * The team Opponents page's one read: every match recorded for a program and
 * the team's side of each stats row, grouped by opponent in
 * `team-opponents.ts`.
 *
 * Sits BESIDE `opponents-server.ts`, not in it. That file is the program
 * directory and the pooled public-record views, live elsewhere; this is the
 * program's own match history.
 *
 * ── The scope ───────────────────────────────────────────────────────────────
 * `program_id = programId`, and nothing else. RLS on `matches` admits any
 * member of the program (`user_program_role(program_id) is not null`), and
 * `match_stats_with_percentages` is `security_invoker`, so a player sees the
 * same page a coach does and a non-member sees no rows at all.
 *
 * ── The client ──────────────────────────────────────────────────────────────
 * The cookie-bound server client only. The roster comes from
 * `program_roster_full` rather than `getRosterData`, which is staff-only: that
 * RPC is executable by `authenticated` and answers any member of the program.
 *
 * ── Who played ──────────────────────────────────────────────────────────────
 * The team's side is always player one. Live check 2026-10-11: 19/19 team
 * matches have `player1_id` ∈ `program_players.id`, 0 in `users`. So the
 * stats row read is player one's and the roster player is `player1_id` folded
 * through `canonicalRosterIds` in the pure module — never normalised here.
 *
 * ── The outcome ─────────────────────────────────────────────────────────────
 * From `score`, through `matchOutcome`. `matches.result` is free text holding
 * a context string and is deliberately not selected.
 */

/** `matches.opponent_program_id`'s program, as the embed below selects it. */
interface OpponentProgramEmbed {
  id: string;
  school_name: string;
  school_abbrev: string | null;
  crest_path: string | null;
  conference: string | null;
  division: string | null;
  team: string | null;
}

interface DbTeamOpponentMatch {
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
  opponent_program_id: string | null;
  opponent_school: string | null;
  opponent_program?: OpponentProgramEmbed | OpponentProgramEmbed[] | null;
}

// The personal loader's columns, plus the opponent's team. The embed names its
// FK: `matches` points at `programs` twice (`program_id` too), and PostgREST
// refuses an ambiguous one.
const MATCH_COLUMNS =
  "id, date, player1_id, player2_id, player1_name, player2_name, created_by, tournament_name, score, opponent_player_id, opponent_hand, opponent_backhand, opponent_program_id, opponent_school, opponent_program:programs!matches_opponent_program_id_fkey(id, school_name, school_abbrev, crest_path, conference, division, team)";

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

export interface TeamOpponentsData {
  /** Sorted by last-match date, newest first. */
  opponents: TeamOpponent[];
  totals: TeamOpponentTotals;
  /**
   * The current academic season, `"2026–27"` — the one
   * `TeamOpponent.playedThisSeason` and `recent[].inSeason` were marked
   * against, so the "This season" chip filters without re-deriving it.
   */
  season: string;
}

export const getTeamOpponents = cache(async function getTeamOpponents(
  programId: string,
  viewerId: string,
): Promise<TeamOpponentsData> {
  const season = currentSeason(new Date());
  const supabase = await createClient();

  const [
    { data: matchRows, error: matchError },
    { data: rosterRows, error: rosterError },
    avatarUrls,
  ] = await Promise.all([
    supabase
      .from("matches")
      .select(MATCH_COLUMNS)
      .eq("program_id", programId)
      .order("date", { ascending: false, nullsFirst: false }),
    supabase.rpc("program_roster_full", { p_program_id: programId }),
    getMemberAvatarUrls(supabase, programId),
  ]);
  if (matchError)
    throw new Error("Could not load team opponents", { cause: matchError });
  // Thrown, not swallowed: with an empty roster every match would read as
  // unattributed and the page would draw a confident day zero.
  if (rosterError)
    throw new Error("Could not load the roster for team opponents", {
      cause: rosterError,
    });

  const matches = (matchRows ?? []) as unknown as DbTeamOpponentMatch[];
  if (matches.length === 0) {
    return { opponents: [], totals: teamOpponentTotals([]), season };
  }

  const { data: statRows, error: statError } = await supabase
    .from("match_stats_with_percentages")
    .select(STAT_COLUMNS)
    .in(
      "match_id",
      matches.map((m) => m.id),
    );
  if (statError)
    throw new Error("Could not load team opponent statistics", {
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

  // Players only, named by the shared fallback chain. Photos are keyed by
  // login, so an unclaimed coach-managed profile has none and draws initials.
  const roster: TeamOpponentRosterPlayer[] = rosterPlayerOptions(
    (rosterRows ?? []) as RosterFullRow[],
  ).map((player) => ({
    playerId: player.playerId,
    userId: player.userId,
    name: player.name,
    photoUrl: player.userId ? (avatarUrls.get(player.userId) ?? null) : null,
  }));

  // The bucket is public and the URL is a function of the key — the rule
  // `crestUrl()` in `teams-server.ts` states — so it is built on the client
  // already in hand rather than through one `createClient()` per match.
  const crests = supabase.storage.from(CRESTS_BUCKET);

  const inputs: TeamOpponentMatchInput[] = matches.map((match) => {
    // A to-one embed is an object; tolerate the array an untyped client may
    // hand back.
    const program =
      (Array.isArray(match.opponent_program)
        ? match.opponent_program[0]
        : match.opponent_program) ?? null;
    return {
      id: match.id,
      date: match.date,
      player1_id: match.player1_id,
      player1_name: match.player1_name,
      player2_name: match.player2_name,
      created_by: match.created_by,
      opponent_player_id: match.opponent_player_id,
      opponent_hand: match.opponent_hand,
      opponent_backhand: match.opponent_backhand,
      tournament_name: match.tournament_name,
      score: match.score,
      // The team is player one on every team match — see the header.
      values: valuesBySide.get(statKey(match.id, true)) ?? null,
      opponent_program: program
        ? {
            id: program.id,
            schoolName: program.school_name,
            shortCode: program.school_abbrev,
            crestUrl: program.crest_path
              ? crests.getPublicUrl(program.crest_path).data.publicUrl
              : null,
            conference: program.conference,
            division: program.division,
          }
        : null,
      opponent_school: match.opponent_school,
    };
  });

  return { ...groupTeamOpponents(inputs, roster, season, viewerId), season };
});
