import { cache } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { matchOutcome, type MatchScore } from "@/lib/data/match-utils";
import {
  canonicalRosterIds,
  idsResolvingTo,
  sideOf,
} from "@/lib/data/roster-ids";
import {
  dualRecordFrom,
  lineHistoryFrom,
  seasonStrip,
  RECENT_WINDOW,
  type LineRow,
  type ProfileEntry,
  type ProfileEvent,
  type ProfileResult,
  profileFormBar,
  rosterPlayerName,
} from "@/lib/data/player-profile";
import type { FormBar } from "@/lib/data/form-bar";
import type { MemberRole } from "@/lib/data/team-settings-server";

/**
 * One player, everything the program knows about them — Platform Audit
 * `Te` / `Te2`.
 *
 * The destination the roster row points at, and the page a player reaches
 * from their own name at the foot of the rail. A coach clicking a name wants
 * that person, not a picker.
 *
 * ── Viewer-independent, on purpose ──────────────────────────────────────────
 * `cache()`d on (program, player) and nothing else. Whether the reader is the
 * player themself, their coach or a teammate changes the chrome around this —
 * the "You" pill, "Edit player", the roster switcher — never the data, which
 * is what "fully open" buys a program. The page decides those from
 * `getMyPlayerIds()` and the workspace role.
 *
 * ── Two id eras ─────────────────────────────────────────────────────────────
 * A claimed player's pre-claim matches carry their user id; the ones after
 * carry the profile id, and neither is rewritten on claim. Both are folded
 * through `canonicalRosterIds()` here exactly as the roster does, so the
 * Record on this page is the Record in the roster's column. The program-wide
 * matches read is what makes that possible.
 *
 * ── Whose side ──────────────────────────────────────────────────────────────
 * Every figure comes from THIS player's side: `isPlayer1` per match picks the
 * result and the opponent's name, and the season loader folds each match from
 * that same seat. `docs/ui-revamp-guardrails.md`.
 *
 * ── One read, two loaders ───────────────────────────────────────────────────
 * The roster RPC, the matches read and the seat decision are
 * `readPlayerMatchSides`, shared with the season loader
 * (`player-season-server.ts`) through the `cache()`d `getPlayerMatchSides`.
 * The two loaders therefore fold the same matches from the same seats — a
 * match the record counts is a match the season may fold — and a page that
 * renders both pays for one roster RPC and one matches read.
 */

export interface PlayerProfile {
  playerId: string;
  profileId: string | null;
  userId: string | null;
  name: string;
  /** Just the given name, for a sentence about them. */
  firstName: string;
  email: string | null;
  role: MemberRole;
  classYear: string | null;
  lineupSpot: number | null;
  /** Their saved hand and backhand, raw ("right", "two-handed"), or null. */
  hand: string | null;
  backhand: string | null;
  managedBy: "coach" | "self";
  matchesPlayed: number;
  wins: number;
  losses: number;
  duals: { wins: number; losses: number };
  /** Oldest first, at most five. Unscored matches are left out. */
  form: FormBar[];
  lines: LineRow[];
}

/** One row of `program_roster_full`, as the profile reads it. */
export interface DbRosterFullRow {
  player_id: string;
  profile_id: string | null;
  user_id: string | null;
  display_name: string | null;
  email: string | null;
  role: string;
  class_year: string | null;
  lineup_spot: number | null;
  managed_by: string;
  /** `coalesce(users.hand, program_players.hand)` — the claimed player's own once claimed. */
  hand?: string | null;
  backhand?: string | null;
}

/**
 * A match row as this player's surfaces read it — the profile here and the
 * season fold in `player-season-server.ts`.
 */
export interface DbPlayerMatchRow {
  id: string;
  player1_id: string | null;
  player2_id: string | null;
  player1_name: string | null;
  player2_name: string | null;
  score: MatchScore | null;
  date: string | null;
  tournament_name: string | null;
  event_entry_id: string | null;
  // The rest of what the Matches list reads (`DbMatch`), so the profile's
  // history can be drawn by the list's own row.
  round: string | null;
  result: string | null;
  match_type: string | null;
  court_type: string | null;
  verified: boolean | null;
  verified_at: string | null;
  /** When Advantage judged its errors forced/unforced (`errorSplitJudged`). */
  errors_judged_at: string | null;
  duration: number | null;
  source_provider: string | null;
  created_by: string | null;
  /** The opponent's stored id — the Opponents page's key when it is set. */
  opponent_player_id: string | null;
  /** Raw, unvalidated hands (`normalizePlayerHand`). The wizard writes
   *  `player_*` for seat one and `opponent_*` for seat two. */
  player_hand: string | null;
  opponent_hand: string | null;
}

interface DbEntryRow {
  id: string;
  event_id: string;
  discipline: string | null;
  slot: string | null;
  opponent_school: string | null;
  forfeit: string | null;
}

interface DbEventRow {
  id: string;
  kind: string;
  name: string;
  starts_on: string | null;
}

/** One of this player's matches, and the seat they sat in for it. */
export interface PlayerMatchSide {
  match: DbPlayerMatchRow;
  /**
   * Which seat is this player's. Picks their statistics row, their
   * opponent's name and their half of the insight; the season fold tallies
   * every match with it, never a normalised seat (guardrails §4).
   */
  isPlayer1: boolean;
}

/** Who this is and what they have played — what every profile surface starts from. */
export interface PlayerMatchSides {
  /** Their `program_roster_full` row, the identity source. */
  roster: DbRosterFullRow;
  /** Every match of theirs the program recorded, newest first, undated last. */
  own: PlayerMatchSide[];
}

/**
 * The roster row and the matches of one player, through `supabase` (RLS as
 * the viewer), each match with the seat this player sat in — the "two id
 * eras" and "whose side" rules above. `null` for an id that names nobody on
 * this roster.
 *
 * Takes the client so a spec can hand in a fake and watch what is asked;
 * `getPlayerMatchSides` is the request-time wrapper the loaders call.
 */
export async function readPlayerMatchSides(
  supabase: SupabaseClient,
  programId: string,
  playerId: string,
): Promise<PlayerMatchSides | null> {
  // The roster is the identity source, and the one place that knows how to
  // name somebody who has no login. Its rows also carry both of a claimed
  // player's ids, which is what `canonicalRosterIds` folds.
  const { data: rosterRows, error: rosterError } = await supabase.rpc(
    "program_roster_full",
    { p_program_id: programId },
  );
  // A failed read is not "not on the roster": as one, every profile would
  // 404 and the insight route would answer player_not_found.
  if (rosterError) {
    throw new Error(`Could not read the roster: ${rosterError.message}`);
  }
  const roster = (rosterRows ?? []) as DbRosterFullRow[];
  const row = roster.find((r) => r.player_id === playerId);

  // An id that names nobody on this roster is a 404, not an empty profile. It
  // arrives from a URL and is untrusted.
  if (!row) return null;

  const canonical = canonicalRosterIds(roster);

  // Every id that means this person on a match row: their profile id, and —
  // for a claimed player — the user id their pre-claim matches still carry.
  // `canonical` maps both to the one `player_id`, so the query can name them
  // and the database does the filtering. Reading the whole program's matches
  // and filtering in JS would fetch a squad's season to keep one player's.
  //
  // Never empty, and the query below depends on that: `canonicalRosterIds`
  // maps every roster row's `player_id` to itself, and this player's row was
  // found above — so their own id is always in here. An empty `in.()` is not
  // a filter PostgREST accepts.
  const ownIds = idsResolvingTo(canonical, playerId);

  const { data: matchRows, error: matchesError } = await supabase
    .from("matches")
    .select(
      "id, player1_id, player2_id, player1_name, player2_name, score, date, tournament_name, event_entry_id, round, result, match_type, court_type, verified, verified_at, errors_judged_at, duration, source_provider, created_by, opponent_player_id, player_hand, opponent_hand",
    )
    .eq("program_id", programId)
    .or(
      `player1_id.in.(${ownIds.join(",")}),player2_id.in.(${ownIds.join(",")})`,
    )
    // NULLs last, or an undated row would head the list and be read as the
    // most recent thing this player did.
    .order("date", { ascending: false, nullsFirst: false });

  // A failed read is not "no matches": reading it as one put "0 matches" on
  // every profile when this select once named a column the table lacks.
  if (matchesError) {
    throw new Error(
      `Could not read this player's matches: ${matchesError.message}`,
    );
  }
  const matches = (matchRows ?? []) as DbPlayerMatchRow[];

  // Which side of each match is this player. The query already guarantees one
  // of the two ids is theirs; this decides which, and that answer picks their
  // statistics row, their opponent's name and their half of the insight.
  const own = matches.flatMap((match) => {
    const isPlayer1 = sideOf(match, canonical, playerId);
    return isPlayer1 === null ? [] : [{ match, isPlayer1 }];
  });

  return { roster: row, own };
}

/**
 * `readPlayerMatchSides` on the request's cookie client, `cache()`d on
 * (program, player) so the profile and the season share one roster RPC and
 * one matches read per request.
 */
export const getPlayerMatchSides = cache(async function getPlayerMatchSides(
  programId: string,
  playerId: string,
): Promise<PlayerMatchSides | null> {
  const supabase = await createClient();
  return readPlayerMatchSides(supabase, programId, playerId);
});

export const getPlayerProfile = cache(async function getPlayerProfile(
  programId: string,
  playerId: string,
): Promise<PlayerProfile | null> {
  const sides = await getPlayerMatchSides(programId, playerId);
  if (!sides) return null;
  const { roster: row, own } = sides;

  const supabase = await createClient();

  const entriesPromise = (async () => {
    const ids = [
      ...new Set(
        own
          .map((r) => r.match.event_entry_id)
          .filter((id): id is string => id !== null),
      ),
    ];
    const entriesById = new Map<string, ProfileEntry>();
    const eventsById = new Map<string, ProfileEvent>();
    if (ids.length === 0) return { entriesById, eventsById };

    const { data: entryRows } = await supabase
      .from("program_event_entries")
      .select("id, event_id, discipline, slot, opponent_school, forfeit")
      .in("id", ids);
    for (const entry of (entryRows ?? []) as DbEntryRow[]) {
      entriesById.set(entry.id, {
        id: entry.id,
        eventId: entry.event_id,
        slot: entry.slot,
        discipline: entry.discipline,
        opponentSchool: entry.opponent_school,
        forfeit: entry.forfeit,
      });
    }

    const eventIds = [
      ...new Set([...entriesById.values()].map((e) => e.eventId)),
    ];
    if (eventIds.length > 0) {
      const { data: eventRows } = await supabase
        .from("program_events")
        .select("id, kind, name, starts_on")
        .in("id", eventIds);
      for (const event of (eventRows ?? []) as DbEventRow[]) {
        eventsById.set(event.id, {
          id: event.id,
          kind: event.kind,
          name: event.name,
          startsOn: event.starts_on,
        });
      }
    }
    return { entriesById, eventsById };
  })();

  const { entriesById: entries, eventsById: events } = await entriesPromise;

  const results: ProfileResult[] = own.map(({ match, isPlayer1 }) => ({
    id: match.id,
    date: match.date,
    isPlayer1,
    won: matchOutcome(match.score, isPlayer1),
    entryId: match.event_entry_id,
    opponentName:
      (isPlayer1 ? match.player2_name : match.player1_name) ?? "Unknown",
    score: match.score,
    tournamentName: match.tournament_name,
    stats: null,
  }));

  const duals = dualRecordFrom(results, entries, events);
  const strip = seasonStrip(results, duals);
  const { wins, losses } = strip;

  const { name, firstName } = rosterPlayerName(row);

  return {
    playerId: row.player_id,
    profileId: row.profile_id,
    userId: row.user_id,
    name,
    firstName,
    email: row.email,
    role: row.role as MemberRole,
    classYear: row.class_year,
    lineupSpot: row.lineup_spot,
    hand: row.hand ?? null,
    backhand: row.backhand ?? null,
    managedBy: row.managed_by === "coach" ? "coach" : "self",
    matchesPlayed: results.length,
    wins,
    losses,
    duals,
    // Reversed so the strip reads left to right in the order the season was
    // played, which is how a coach reads a run of results out loud.
    form: results
      .filter((r) => r.won !== null)
      .slice(0, RECENT_WINDOW)
      .reverse()
      .map(profileFormBar),
    lines: lineHistoryFrom(results, entries),
  };
});
