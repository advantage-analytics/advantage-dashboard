import type { SupabaseClient } from "@supabase/supabase-js";
import { pct, statKey } from "@/lib/data/aggregate";
import type { MatchScore } from "@/lib/data/match-utils";
import {
  PERSONAL_OPPONENT_MEASURE_KEYS,
  countUnnamedMatches,
  currentSeason,
  groupPersonalOpponents,
  personalOpponentTotals,
  type PersonalOpponent,
  type PersonalOpponentMatchInput,
  type PersonalOpponentTotals,
} from "@/lib/data/personal-opponents";
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
import { viewerSide } from "@/lib/data/viewer-side";

/**
 * The two Opponents pages' reads, on a client the caller hands in.
 *
 * `personal-opponents-server.ts` and `team-opponents-server.ts` built their
 * client inside the function (`createClient()`, cookies), which left the
 * reads unreachable from `/api/mcp`, where the only session is a bearer
 * token. The reads are the same — every one of them runs as the user under
 * RLS, the `security_invoker` view and two `authenticated` RPCs — so they
 * live here, taking the client, and the two `-server.ts` files are the
 * cookie wrappers the pages call. Same split as `loadMatchDetail` /
 * `getMatchDetailData`.
 *
 * The two RPCs are called with `get: true`: both are STABLE, so PostgREST
 * serves them on GET in a read-only transaction, which is what lets a
 * connector token through `oauth_client_request_guard()` (migration
 * 20261016050115) without a place on its allowlist. A cookie session does
 * not notice the difference.
 *
 * Imports no client factory and nothing from `next/*`, so the MCP module
 * graph and its offline specs can load it.
 */

/** `my_player_ids()` — the ids that mean "me", as `player-identity-server.ts` reads them. */
export async function readMyPlayerIds(
  supabase: SupabaseClient,
): Promise<string[]> {
  const { data, error } = await supabase.rpc("my_player_ids", undefined, {
    get: true,
  });
  if (error) {
    throw new Error("Could not read the viewer's player ids", {
      cause: error,
    });
  }
  // The RPC returns a set of uuids, which PostgREST hands over either as bare
  // strings or as `{ my_player_ids: uuid }` rows. Accept both.
  return ((data ?? []) as unknown[])
    .map((row) =>
      typeof row === "string"
        ? row
        : ((row as { my_player_ids?: string })?.my_player_ids ?? null),
    )
    .filter((id): id is string => Boolean(id));
}

// ── Personal ────────────────────────────────────────────────────────────────

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

const PERSONAL_MATCH_COLUMNS =
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

/** The viewer's side of every stats row, keyed by `statKey`. */
async function readStatValues(
  supabase: SupabaseClient,
  matchIds: string[],
  failure: string,
): Promise<Map<string, Record<string, number | null>>> {
  const { data, error } = await supabase
    .from("match_stats_with_percentages")
    .select(STAT_COLUMNS)
    .in("match_id", matchIds);
  if (error) throw new Error(failure, { cause: error });
  const valuesBySide = new Map<string, Record<string, number | null>>();
  for (const row of (data ?? []) as unknown as DbStatRow[]) {
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
  return valuesBySide;
}

/**
 * The personal Opponents page's one read: the viewer's own matches
 * (`created_by = me AND program_id IS NULL`, the Matches list's predicate)
 * and their side of each stats row, grouped in `personal-opponents.ts`.
 * `myPlayerIds` is `readMyPlayerIds()`'s answer, read once by the caller.
 */
export async function loadPersonalOpponents(
  supabase: SupabaseClient,
  userId: string,
  myPlayerIds: readonly string[],
  now: Date = new Date(),
): Promise<PersonalOpponentsData> {
  const season = currentSeason(now);
  const { data: matchRows, error: matchError } = await supabase
    .from("matches")
    .select(PERSONAL_MATCH_COLUMNS)
    .eq("created_by", userId)
    .is("program_id", null)
    .order("date", { ascending: false, nullsFirst: false });
  if (matchError)
    throw new Error("Could not load personal opponents", { cause: matchError });

  const matches = (matchRows ?? []) as unknown as DbOpponentMatch[];
  if (matches.length === 0) {
    return { opponents: [], totals: personalOpponentTotals([]), season };
  }

  const valuesBySide = await readStatValues(
    supabase,
    matches.map((m) => m.id),
    "Could not load personal opponent statistics",
  );

  const inputs: PersonalOpponentMatchInput[] = matches.flatMap((match) => {
    // The viewer's seat, by the shared rule (`viewerSide`, the same test
    // `playerSide` in `player-identity-server.ts` makes) — both id spaces
    // `player1_id` can hold resolve through `my_player_ids()`. A match that
    // is not theirs is dropped rather than guessed at.
    const side = viewerSide(match, myPlayerIds, userId, match.created_by);
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
  return {
    opponents,
    totals: personalOpponentTotals(opponents, countUnnamedMatches(inputs)),
    season,
  };
}

// ── Team ────────────────────────────────────────────────────────────────────

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

interface DbTeamOpponentMatch extends DbOpponentMatch {
  opponent_program_id: string | null;
  opponent_school: string | null;
  opponent_unattached: boolean | null;
  opponent_program?: OpponentProgramEmbed | OpponentProgramEmbed[] | null;
}

// The personal columns, plus the opponent's team. The embed names its FK:
// `matches` points at `programs` twice (`program_id` too), and PostgREST
// refuses an ambiguous one.
const TEAM_MATCH_COLUMNS = `${PERSONAL_MATCH_COLUMNS}, opponent_program_id, opponent_school, opponent_unattached, opponent_program:programs!matches_opponent_program_id_fkey(id, school_name, school_abbrev, crest_path, conference, division, team)`;

/** The public crest bucket — `CRESTS_BUCKET` in `programs-server.ts`, restated so this file imports no cookie module. */
const CRESTS_BUCKET = "program-crests";

export interface TeamOpponentsData {
  /** Sorted by last-match date, newest first. */
  opponents: TeamOpponent[];
  totals: TeamOpponentTotals;
  /** The current academic season — see `PersonalOpponentsData.season`. */
  season: string;
}

/**
 * The team Opponents page's one read: every match recorded for a program
 * (`program_id = programId`; RLS admits any member) and the team's side of
 * each stats row, grouped in `team-opponents.ts`. The roster comes from
 * `program_roster_full`, executable by any member. `avatarUrls` is keyed by
 * login (`getMemberAvatarUrls`); pass an empty map where photos have no use.
 */
export async function loadTeamOpponents(
  supabase: SupabaseClient,
  programId: string,
  viewerId: string,
  avatarUrls: ReadonlyMap<string, string>,
  now: Date = new Date(),
): Promise<TeamOpponentsData> {
  const season = currentSeason(now);

  const [
    { data: matchRows, error: matchError },
    { data: rosterRows, error: rosterError },
  ] = await Promise.all([
    supabase
      .from("matches")
      .select(TEAM_MATCH_COLUMNS)
      .eq("program_id", programId)
      .order("date", { ascending: false, nullsFirst: false }),
    supabase.rpc(
      "program_roster_full",
      { p_program_id: programId },
      { get: true },
    ),
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

  const valuesBySide = await readStatValues(
    supabase,
    matches.map((m) => m.id),
    "Could not load team opponent statistics",
  );

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
      // The team is player one on every team match — see `team-opponents.ts`.
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
      opponent_unattached: match.opponent_unattached === true,
    };
  });

  return { ...groupTeamOpponents(inputs, roster, season, viewerId), season };
}
