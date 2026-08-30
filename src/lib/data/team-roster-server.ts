import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import {
  matchOutcome,
  shortDate,
  shortName,
  zonedDayString,
  type MatchScore,
} from "@/lib/data/match-utils";
import { meanOfPresent, pct, statKey } from "@/lib/data/aggregate";
import { canonicalRosterIds } from "@/lib/data/roster-ids";
import { normalizedPersonName } from "@/lib/data/person-name";
import { scoreSetsFrom, type ScoreLineSet } from "@/lib/ui/score-format";
import { loadMatchAnalysis } from "@/lib/data/match-analysis-server";
import { isWorking } from "@/lib/data/match-analysis";
import type { MemberRole } from "@/lib/data/team-settings-server";

/**
 * What the Roster page reads.
 *
 * Named `team-roster-server` rather than `roster-server` on purpose: the
 * events/lineups branch owns `lib/data/roster-server.ts` for `getLadder()`,
 * which answers a different question (who plays which line) against a
 * different table. Two files with one name and unrelated contents is a merge
 * conflict that resolves into whichever one the person doing the merge happens
 * to keep.
 *
 * ── Access ──────────────────────────────────────────────────────────────────
 * Nothing here filters on who may see what. `program_roster_full` is SECURITY
 * DEFINER and carries the membership check; `matches` is gated by a policy that
 * gives staff the whole program and gives a player either the whole program or
 * only their own rows, depending on `programs.roster_visible`. So a player's
 * roster is this same query returning fewer rows, not a second code path. A
 * rule restated in TypeScript is a second answer able to drift from the
 * enforced one.
 *
 * ── Why the analysis-time column is gone ────────────────────────────────────
 * The month's per-member hours live in Settings › Usage, which reads
 * `program_usage_by_member` and is the page built to answer "where did the
 * budget go". Carrying a second copy here meant two match counts on one screen
 * — matches *played* beside matches *sent for analysis* — and a coach reading
 * the roster has no way to tell which one they are looking at.
 *
 * ── Two kinds of row, one id ────────────────────────────────────────────────
 * A player may be coach-managed (a `program_players` row with no login) or
 * self-managed (the same row, claimed). `program_roster_full` returns both
 * through one `player_id` column — the id their matches carry — so everything
 * below stays a Map keyed on one uuid. `userId` is separate and nullable,
 * because it answers a different question: who may sign in as this person.
 */

export interface RosterMatch {
  /** Already shortened for the cell: "Ana Castillo" → "A. Castillo". */
  opponent: string;
  /**
   * The set scores, oriented so `player1` is this member — `<ScoreLine>` draws
   * them with superscript tiebreaks. Usually present even while `analyzing` is
   * true: the score is a wizard input entered at upload time, so it is known
   * long before the stats are — the cell just shows the "Analyzing" chip in the
   * score's place until analysis settles. Empty only for a match stored with no
   * score at all.
   */
  sets: ScoreLineSet[];
  /** Null when the score is missing or the sets are level. */
  won: boolean | null;
  /**
   * Their most recent match is still in analysis — a video the coach uploaded
   * that has not come back. The cell trades the outcome mark and score for a
   * live "Analyzing" chip, on the same status vocabulary the matches list uses
   * (`isWorking`), so one job never reads two ways across two screens.
   */
  analyzing: boolean;
  /** "Aug 8". */
  date: string;
}

export interface RosterMember {
  /**
   * The id this person's matches carry — a `program_players.id` for a player,
   * a `users.id` for staff. This is the roster's key, not `userId`.
   */
  playerId: string;
  /** The profile row, when there is one. Staff have none. */
  profileId: string | null;
  /** The login, or null for a coach-managed player who has not claimed yet. */
  userId: string | null;
  name: string;
  /** A coach-managed profile may genuinely have no address on file. */
  email: string | null;
  role: MemberRole;
  /** "coach" until they claim the profile, then "self". */
  managedBy: "coach" | "self";
  uploadEnabled: boolean;
  classYear: string | null;
  /** Their line in the lineup, or null where the program has never set one. */
  lineupSpot: number | null;
  /** "Aug 20" — when the row appeared, which is what the invite picker shows. */
  addedOn: string;
  /**
   * They bound a login to this profile today.
   *
   * Computed here, not in the browser. A client-side "today" compared against a
   * server-rendered timestamp is a hydration mismatch and a timezone bug in one
   * line — the server and the viewer can disagree about what day it is, and the
   * pill would flicker in or out on first paint.
   */
  claimedToday: boolean;
  /**
   * Another live row on this roster with the same name, when there is exactly
   * one. The roster offers the merge repair from here, because a coach finds a
   * duplicate by looking at the list — not by knowing a tool exists.
   *
   * Null when the name is unique, when three or more rows share it (which is
   * not a duplicate, it is a mess that needs a person), or when both rows are
   * claimed — `merge_program_players` refuses that case, so offering it would
   * be an affordance that always fails.
   */
  duplicateOfPlayerId: string | null;
  matchesPlayed: number;
  /** The last five results, oldest first. Unscored matches are left out. */
  form: ("win" | "loss")[];
  lastMatch: RosterMatch | null;
  /** Mean first-serve percentage across their matches, or null with no stats. */
  firstServePct: number | null;
  /** Recent form against the rest, in points. Null with nothing to compare. */
  firstServeDelta: number | null;
}

export interface RosterInvite {
  id: string;
  email: string;
  role: MemberRole;
  /** "Aug 4" — formatted here so the list does not run Intl per render. */
  invitedOn: string;
}

export interface RosterData {
  members: RosterMember[];
  /**
   * Outstanding invitations. Always empty for a player — the RLS policy on
   * `program_invites` grants select to staff only, so this needs no branch
   * here. The database is the authority and the page cannot forget to ask it.
   */
  invites: RosterInvite[];
  /** Program-wide default. A member's own flag can still override it. */
  playersCanUpload: boolean;
  /** Whether players see the whole squad's matches or only their own. */
  rosterVisible: boolean;
  /** What the invite dialogs state about the program's account allowance. */
  seats: SeatUsage;
}

export interface SeatUsage {
  seats: number;
  /** Members holding one. */
  used: number;
  /** Unexpired open invites reserving one. */
  pending: number;
}

interface DbRosterRow {
  player_id: string;
  profile_id: string | null;
  user_id: string | null;
  display_name: string | null;
  email: string | null;
  role: string;
  class_year: string | null;
  lineup_spot: number | null;
  managed_by: string;
  upload_enabled: boolean;
  joined_at: string;
  claimed_at: string | null;
}

interface DbMatchRow {
  id: string;
  player1_id: string | null;
  player2_id: string | null;
  player1_name: string | null;
  player2_name: string | null;
  score: MatchScore | null;
  date: string | null;
}

interface DbStatRow {
  match_id: string;
  is_player1: boolean;
  /** A `numeric` column: PostgREST hands it over as a string. */
  first_serve_pct: string | number | null;
}

/**
 * Whether `iso` falls on the same calendar day as `now`, read in `timeZone`.
 *
 * Used to take neither argument: it read `new Date()` directly and compared
 * with the `Date` object's own local getters, which is the SERVER's zone —
 * UTC on Vercel — regardless of which program's "today" was being asked
 * about. Team Home reads this through `claimedTodayNames()` below with the
 * program's own zone and the one `now` its whole read is built on; a second
 * clock here is exactly the failure `getTeamHomeData`'s single-clock comment
 * exists to prevent. See `zonedDayString`.
 */
function isToday(iso: string | null, now: Date, timeZone: string): boolean {
  if (!iso) return false;
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return false;
  return zonedDayString(then, timeZone) === zonedDayString(now, timeZone);
}

/** One match as it bears on one of the two people who played it. */
interface MemberResult {
  match: DbMatchRow;
  isPlayer1: boolean;
  won: boolean | null;
  firstServePct: number | null;
}

/** How many recent matches the form ticks and the serve trend look at. */
const FORM_WINDOW = 5;

/**
 * "ana.vasquez@school.edu" → "ana.vasquez", for a seat-holder with no name yet.
 *
 * Only reachable for STAFF now. A player row comes from `program_players`,
 * whose first and last names are NOT NULL and non-empty by constraint — the
 * coach typed them, which is the whole Add player form. That is deliberate:
 * six separate fallback ladders in this app terminated in an email address,
 * and a coach-managed player may have none.
 */
function fallbackName(email: string | null): string {
  if (!email) return "Unnamed member";
  return email.split("@")[0] || email;
}

/**
 * Everyone on the roster who bound a login to a profile today, by name.
 *
 * Team Home's roster card reads this over the rows it has already fetched from
 * the same `program_roster_full` RPC — so "claimed today" means one thing on
 * both surfaces, resolved on one clock, with one answer for a row whose name is
 * missing. A second definition of "today" is a pill that shows on one page and
 * not the other for the same person on the same afternoon.
 *
 * `now` and `timeZone` come from the caller rather than being read in here —
 * `getTeamHomeData` hands over the one `now` its whole read is built on and
 * the program's own zone, the same two arguments `localDay`/`weekBounds`
 * already take, so the weekend dual sheet and this pill cannot disagree about
 * what day it is.
 */
export function claimedTodayNames(
  rows: {
    display_name: string | null;
    email: string | null;
    claimed_at: string | null;
  }[],
  now: Date,
  timeZone: string
): string[] {
  return rows
    .filter((row) => isToday(row.claimed_at, now, timeZone))
    .map((row) => row.display_name?.trim() || fallbackName(row.email));
}

export const getRosterData = cache(async function getRosterData(
  programId: string
): Promise<RosterData> {
  const supabase = await createClient();

  // The one clock this read's "claimed today" pill is computed on — see
  // `isToday`.
  const now = new Date();

  // Every one of these has to land before a single row renders, and no branch
  // depends on another — so they go together rather than in the sequence the
  // page happens to display them in. Only the last has an internal order.
  const [rosterResult, seatResult, invitesResult, programResult, matchesResult] =
    await Promise.all([
      // One call for both kinds of roster row. `program_roster` still exists and
      // is deliberately untouched — it is the SEAT list, which Settings › Team
      // and the usage breakdown want, and changing its shape would have broken
      // five call sites in the migration that introduced the concept.
      supabase.rpc("program_roster_full", { p_program_id: programId }),
      supabase.rpc("program_seat_usage", { p_program_id: programId }),
      supabase
        .from("program_invites")
        .select("id, email, role, created_at")
        .eq("program_id", programId)
        .is("accepted_at", null)
        .order("created_at", { ascending: false }),
      supabase
        .from("programs")
        .select("players_can_upload, roster_visible, time_zone")
        .eq("id", programId)
        .maybeSingle(),
      // First serve needs the match ids, so it cannot join the siblings above —
      // but it has no reason to wait on them either. Chained inside the
      // `Promise.all` it costs `matches + stats`, not `all five + stats`.
      (async () => {
        const { data } = await supabase
          .from("matches")
          .select("id, player1_id, player2_id, player1_name, player2_name, score, date")
          .eq("program_id", programId)
          // `nullsFirst` is not a detail here: Postgres puts NULLs first on a
          // DESC sort, so an undated row would take the front of every member's
          // list and be reported as their last match.
          .order("date", { ascending: false, nullsFirst: false });

        const rows = (data ?? []) as DbMatchRow[];
        if (rows.length === 0) return { matches: rows, stats: [] as DbStatRow[] };

        const { data: stats } = await supabase
          .from("match_stats_with_percentages")
          .select("match_id, is_player1, first_serve_pct")
          .in(
            "match_id",
            rows.map((m) => m.id)
          );
        return { matches: rows, stats: (stats ?? []) as DbStatRow[] };
      })(),
    ]);

  const { matches, stats } = matchesResult;

  // The program's own zone for "claimed today" — the same column Team Home
  // reads through `getTeamSettings`, ridden along on the select above rather
  // than a second query. Falls back to the column's own default for a program
  // whose row somehow did not come back.
  const timeZone = programResult.data?.time_zone ?? "UTC";

  // Keyed on the view's natural key, the way every other reader of this table
  // does — one `set` per row rather than a read-modify-write of a pair.
  const serveByPlayer = new Map<string, number | null>();
  for (const row of stats) {
    serveByPlayer.set(statKey(row.match_id, row.is_player1), pct(row.first_serve_pct));
  }

  // One pass, indexed by player, rather than a scan of every program match per
  // member: a squad of twenty over a season of three hundred matches is six
  // thousand comparisons for an answer each match already carries. `matches`
  // arrived newest first, so each list keeps that order and every window below
  // is a slice from the front.
  const rows = (rosterResult.data ?? []) as DbRosterRow[];

  // Both eras of player id resolve to the same roster row — the shared rule,
  // in `lib/data/roster-ids.ts`, which Team Home asks the membership half of.
  // It used to be spelled out here and read `player_id` only over there, and
  // that is precisely the drift the file exists to end: a claimed player's
  // pre-claim matches counted on this page and went unattributed on that one.
  const canonical = canonicalRosterIds(rows);

  const resultsByMember = new Map<string, MemberResult[]>();
  for (const match of matches) {
    for (const [rawId, isPlayer1] of [
      [match.player1_id, true],
      [match.player2_id, false],
    ] as const) {
      if (!rawId) continue;
      const userId = canonical.get(rawId) ?? rawId;
      const list = resultsByMember.get(userId) ?? [];
      list.push({
        match,
        isPlayer1,
        won: matchOutcome(match.score, isPlayer1),
        firstServePct: serveByPlayer.get(statKey(match.id, isPlayer1)) ?? null,
      });
      resultsByMember.set(userId, list);
    }
  }

  // The newest match a member has may still be analyzing — a video the coach
  // uploaded that has not come back. One batched read of `processing_jobs`,
  // keyed on those latest match ids, so the "Last match" cell can carry a live
  // "Analyzing" chip instead of an empty result. A match with no job row (a file
  // import, a hand-scored line) is absent from the map and reads as settled —
  // exactly the fallback `loadMatchAnalysis` documents.
  const latestMatchIds = rows
    .map((row) => resultsByMember.get(row.player_id)?.[0]?.match.id)
    .filter((id): id is string => Boolean(id));
  const analysisByMatch = await loadMatchAnalysis(supabase, latestMatchIds);

  const members: RosterMember[] = rows.map((row) => {
    const results = resultsByMember.get(row.player_id) ?? [];

    const decided = results.filter((r) => r.won !== null);
    const serves = results.map((r) => r.firstServePct);
    // Whole points: this sits beside a set score, and "63.4%" claims a
    // precision a five-match window does not have.
    const recentServe = meanOfPresent(serves.slice(0, FORM_WINDOW), 0);
    const earlierServe = meanOfPresent(serves.slice(FORM_WINDOW), 0);

    const latest = results[0];
    const latestJob = latest ? analysisByMatch.get(latest.match.id) : undefined;

    return {
      playerId: row.player_id,
      profileId: row.profile_id,
      userId: row.user_id,
      name: row.display_name?.trim() || fallbackName(row.email),
      email: row.email,
      role: row.role as MemberRole,
      managedBy: row.managed_by === "coach" ? ("coach" as const) : ("self" as const),
      uploadEnabled: row.upload_enabled,
      classYear: row.class_year,
      lineupSpot: row.lineup_spot,
      addedOn: shortDate(row.joined_at),
      claimedToday: isToday(row.claimed_at, now, timeZone),
      // Filled in below, once every row is known.
      duplicateOfPlayerId: null,
      matchesPlayed: results.length,
      // Reversed so the strip reads left to right in the order the season was
      // played, which is how a coach reads a run of results out loud.
      form: decided
        .slice(0, FORM_WINDOW)
        .reverse()
        .map((r) => (r.won ? ("win" as const) : ("loss" as const))),
      lastMatch: latest
        ? {
            opponent: shortName(
              (latest.isPlayer1 ? latest.match.player2_name : latest.match.player1_name) ??
                "Unknown"
            ),
            // `swap` when this member is stored as player2, so the games and the
            // tiebreak digits flip together — the perspective rule
            // `buildScoreString` used to carry, now shared with `<ScoreLine>`.
            sets: scoreSetsFrom(latest.match.score, { swap: !latest.isPlayer1 }),
            won: latest.won,
            analyzing: latestJob ? isWorking(latestJob.status) : false,
            date: latest.match.date ? shortDate(latest.match.date) : "",
          }
        : null,
      firstServePct: recentServe,
      firstServeDelta:
        recentServe === null || earlierServe === null
          ? null
          : recentServe - earlierServe,
    };
  });

  // ── Likely duplicates ─────────────────────────────────────────────────────
  // Same normalized name, exactly two live player rows, not both claimed. The
  // same comparison `normalized_person_name` makes in SQL, so the affordance
  // and the function that backs it agree about what a duplicate is. That
  // comparison now lives in `person-name.ts`, because Add player's warning has
  // to ask the same question before the second row exists.
  const byName = new Map<string, RosterMember[]>();
  for (const member of members) {
    if (member.role !== "player") continue;
    const key = normalizedPersonName(member.name);
    byName.set(key, [...(byName.get(key) ?? []), member]);
  }
  for (const pair of byName.values()) {
    if (pair.length !== 2) continue;
    if (pair.every((m) => m.managedBy === "self")) continue;
    pair[0].duplicateOfPlayerId = pair[1].playerId;
    pair[1].duplicateOfPlayerId = pair[0].playerId;
  }

  // Staff first, then players by lineup, each group alphabetical where nothing
  // else separates them. Ordering by `joined_at` would put the owner first only
  // by accident of being the first to join, and a roster is read to find a
  // person, not to see who arrived when. An unranked player sorts after a
  // ranked one: a null is "we have not decided", not "line zero".
  const rank: Record<string, number> = { owner: 0, coach: 1, staff: 2, player: 3 };
  members.sort((a, b) => {
    if (rank[a.role] !== rank[b.role]) return rank[a.role] - rank[b.role];
    if (a.lineupSpot !== b.lineupSpot) {
      if (a.lineupSpot === null) return 1;
      if (b.lineupSpot === null) return -1;
      return a.lineupSpot - b.lineupSpot;
    }
    return a.name.localeCompare(b.name);
  });

  return {
    members,
    invites: (invitesResult.data ?? []).map((row) => ({
      id: row.id as string,
      email: row.email as string,
      role: row.role as MemberRole,
      invitedOn: shortDate(row.created_at as string),
    })),
    playersCanUpload: Boolean(programResult.data?.players_can_upload),
    rosterVisible: Boolean(programResult.data?.roster_visible),
    // A row-returning function: PostgREST hands back an array of one.
    seats: (Array.isArray(seatResult.data) ? seatResult.data[0] : seatResult.data) ?? {
      seats: 0,
      used: 0,
      pending: 0,
    },
  };
});
