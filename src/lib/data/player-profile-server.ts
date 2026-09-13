import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import {
  buildScoreString,
  getInitials,
  matchOutcome,
  shortDate,
  shortName,
  type MatchScore,
} from "@/lib/data/match-utils";
import { statKey } from "@/lib/data/aggregate";
import { canonicalRosterIds } from "@/lib/data/roster-ids";
import { pickServeShot } from "@/lib/data/serve-return-shots";
import {
  computeZoneStats,
  pointToServeDot,
  type ServeDot,
  type ZoneKey,
  type ZoneStats,
} from "@/lib/data/serve-zones";
import {
  dualRecordFrom,
  lineHistoryFrom,
  resolveLine,
  resolveSchool,
  seasonStrip,
  statRowsByKey,
  RECENT_WINDOW,
  STAT_COLUMNS,
  type DbStatRow,
  type LineRow,
  type ProfileEntry,
  type ProfileEvent,
  type ProfileKpi,
  type ProfileResult,
  type ProfileStatRow,
} from "@/lib/data/player-profile";
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
 * `match_stats` row, the opponent's name, the insight paragraph and — for the
 * serve map — which points they served. `docs/ui-revamp-guardrails.md`.
 */

export interface ProfileMatchRow {
  id: string;
  /** "Apr 12", or "" for an undated row. */
  date: string;
  opponent: string;
  school: string | null;
  /** Initials of the school, for the 26px square. */
  schoolAbbr: string | null;
  /** "S3", or null when the match was not played on a line. */
  line: string | null;
  won: boolean | null;
  /** From this player's perspective, "6-4, 3-6, 6-2"; "" when unscored. */
  score: string;
}

export interface ProfileChip {
  label: string;
  value: string;
}

export interface ProfileLastMatch extends ProfileMatchRow {
  /** The opponent's initial, for the 32px square. */
  opponentInitial: string;
  /** Advantage Intelligence's paragraph for this player's side, when written. */
  insight: { summary: string } | null;
  /** Empty when the match has no stats row on this side. */
  chips: ProfileChip[];
}

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
  managedBy: "coach" | "self";
  matchesPlayed: number;
  wins: number;
  losses: number;
  duals: { wins: number; losses: number };
  /** Oldest first, at most five. Unscored matches are left out. */
  form: ("win" | "loss")[];
  kpis: ProfileKpi[];
  /** Any stats row on this player's side — what turns the empty strip real. */
  hasStats: boolean;
  lastMatch: ProfileLastMatch | null;
  /** Every match, newest first. */
  history: ProfileMatchRow[];
  lines: LineRow[];
  serve: {
    zoneStats: Record<ZoneKey, ZoneStats> | null;
    /** How many matches the map was read from. */
    matchCount: number;
    /** How many serves it plots. */
    serves: number;
  };
}

interface DbRosterFullRow {
  player_id: string;
  profile_id: string | null;
  user_id: string | null;
  display_name: string | null;
  email: string | null;
  role: string;
  class_year: string | null;
  lineup_spot: number | null;
  managed_by: string;
}

interface DbMatchRow {
  id: string;
  player1_id: string | null;
  player2_id: string | null;
  player1_name: string | null;
  player2_name: string | null;
  score: MatchScore | null;
  date: string | null;
  tournament_name: string | null;
  event_entry_id: string | null;
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

interface DbInsights {
  player1?: { summary?: string };
  player2?: { summary?: string };
}

/** A serve row and the point it belongs to, as the map needs them. */
interface DbServeShotRow {
  shot_number: number | null;
  shot_type: string | null;
  landing_x: number | null;
  landing_y: number | null;
  result: string | null;
  spin_type: string | null;
  zone: string | null;
  point_id: string;
  points: {
    id: string;
    match_id: string;
    server_is_player1: boolean;
    set_number: number | null;
    result_type: string | null;
    point_score: string | null;
    game_score: string | null;
    won_by_player1: boolean | null;
  } | null;
}

/**
 * How many matches the serve map reads. A season's serve rows are a few
 * thousand; ten matches is the recent shape of a player's serve, and it
 * bounds the read the way Home's "last 4" does.
 */
const SERVE_MAP_MATCHES = 10;

/** The evidence row under the last match — omitted per chip where unmeasured. */
function chipsFrom(stats: ProfileStatRow | null): ProfileChip[] {
  if (!stats) return [];
  const chips: ProfileChip[] = [];
  const firstServe = stats.rates["first_serve_pct"];
  const firstServeWon = stats.rates["first_serve_won_pct"];
  if (firstServe !== null && firstServe !== undefined) {
    chips.push({ label: "1st serve in", value: `${Math.round(firstServe)}%` });
  }
  if (firstServeWon !== null && firstServeWon !== undefined) {
    chips.push({
      label: "1st serve won",
      value: `${Math.round(firstServeWon)}%`,
    });
  }
  if (stats.winners !== null)
    chips.push({ label: "Winners", value: String(stats.winners) });
  if (stats.unforcedErrors !== null) {
    chips.push({ label: "Unforced", value: String(stats.unforcedErrors) });
  }
  if (
    stats.breakPointsConverted !== null &&
    stats.breakPointOpportunities !== null
  ) {
    chips.push({
      label: "Break pts",
      value: `${stats.breakPointsConverted} of ${stats.breakPointOpportunities}`,
    });
  }
  return chips;
}

/**
 * The serve map for a set of matches, from this player's service points.
 *
 * The filter is per match: `server_is_player1` must equal whether THIS player
 * was player one IN THAT MATCH. Home can read `serverIsPlayer1` bare because
 * the viewer is always player one of their own uploads; here the player may
 * be either side, and reading the wrong one would plot their opponents'
 * serves under their name.
 */
async function serveMapFor(
  supabase: Awaited<ReturnType<typeof createClient>>,
  /** This player's matches, newest first, and which side of each they were. */
  sides: readonly { id: string; isPlayer1: boolean }[],
): Promise<PlayerProfile["serve"]> {
  const recent = sides.slice(0, SERVE_MAP_MATCHES);
  if (recent.length === 0) return { zoneStats: null, matchCount: 0, serves: 0 };

  const sideByMatch = new Map(recent.map((r) => [r.id, r.isPlayer1]));

  const { data } = await supabase
    .from("shots")
    .select(
      "shot_number, shot_type, landing_x, landing_y, result, spin_type, zone, point_id, points!inner(id, match_id, server_is_player1, set_number, result_type, point_score, game_score, won_by_player1)",
    )
    .in("points.match_id", [...sideByMatch.keys()])
    .in("shot_type", ["First Serve", "Second Serve"])
    .order("shot_number", { ascending: true });

  const shotsByPoint = new Map<string, DbServeShotRow[]>();
  for (const shot of (data ?? []) as unknown as DbServeShotRow[]) {
    if (!shot.points) continue;
    const list = shotsByPoint.get(shot.point_id);
    if (list) list.push(shot);
    else shotsByPoint.set(shot.point_id, [shot]);
  }

  const dots: ServeDot[] = [];
  for (const pointShots of shotsByPoint.values()) {
    const point = pointShots[0].points;
    if (!point) continue;
    const isPlayer1 = sideByMatch.get(point.match_id);
    if (isPlayer1 === undefined || point.server_is_player1 !== isPlayer1)
      continue;

    const serve = pickServeShot(pointShots);
    const dot = pointToServeDot({
      id: point.id,
      serverIsPlayer1: point.server_is_player1,
      firstShotLandingX: serve?.landing_x ?? null,
      firstShotLandingY: serve?.landing_y ?? null,
      firstShotZone: serve?.zone ?? null,
      firstShotSpin: serve?.spin_type ?? null,
      firstShotType: serve?.shot_type ?? null,
      firstShotResult: serve?.result ?? null,
      resultType: point.result_type,
      wonByPlayer1: point.won_by_player1 ?? false,
      setNumber: point.set_number ?? undefined,
      pointScore: point.point_score,
      gameScore: point.game_score,
    });
    if (dot) dots.push(dot);
  }

  return {
    zoneStats: computeZoneStats(dots),
    matchCount: recent.length,
    serves: dots.length,
  };
}

export const getPlayerProfile = cache(async function getPlayerProfile(
  programId: string,
  playerId: string,
): Promise<PlayerProfile | null> {
  const supabase = await createClient();

  // The roster is the identity source, and the one place that knows how to
  // name somebody who has no login. Its rows also carry both of a claimed
  // player's ids, which is what `canonicalRosterIds` folds.
  const { data: rosterRows } = await supabase.rpc("program_roster_full", {
    p_program_id: programId,
  });
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
  const ownIds = [...canonical.entries()]
    .filter(([, canonicalId]) => canonicalId === playerId)
    .map(([id]) => id);

  const { data: matchRows } = await supabase
    .from("matches")
    .select(
      "id, player1_id, player2_id, player1_name, player2_name, score, date, tournament_name, event_entry_id",
    )
    .eq("program_id", programId)
    .or(
      `player1_id.in.(${ownIds.join(",")}),player2_id.in.(${ownIds.join(",")})`,
    )
    // NULLs last, or an undated row would head the list and be read as the
    // most recent thing this player did.
    .order("date", { ascending: false, nullsFirst: false });

  const matches = (matchRows ?? []) as DbMatchRow[];

  // Which side of each match is this player. The query already guarantees one
  // of the two ids is theirs; this decides which, and that answer picks their
  // statistics row, their opponent's name and their half of the insight.
  const own = matches.flatMap((match) => {
    if (match.player1_id && canonical.get(match.player1_id) === playerId) {
      return [{ match, isPlayer1: true }];
    }
    if (match.player2_id && canonical.get(match.player2_id) === playerId) {
      return [{ match, isPlayer1: false }];
    }
    return [];
  });

  const statsPromise = (async () => {
    if (own.length === 0) return new Map<string, ProfileStatRow>();
    const { data } = await supabase
      .from("match_stats_with_percentages")
      .select(STAT_COLUMNS)
      .in(
        "match_id",
        own.map((r) => r.match.id),
      );
    return statRowsByKey((data ?? []) as unknown as DbStatRow[]);
  })();

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

  // Insights only for the one match that shows them: the column is a
  // paragraph per side, and reading it for every row would be most of the
  // payload for one card.
  const insightPromise = (async () => {
    const last = own[0];
    if (!last) return null;
    const { data } = await supabase
      .from("matches")
      .select("insights")
      .eq("id", last.match.id)
      .maybeSingle();
    return (data?.insights ?? null) as DbInsights | null;
  })();

  // The heaviest read on the page, and it depends on nothing the others
  // produce — only on which side of each match this player was, which `own`
  // already knows. Sequencing it after them would add a whole round trip to
  // the time before anything renders.
  const servePromise = serveMapFor(
    supabase,
    own.map((r) => ({ id: r.match.id, isPlayer1: r.isPlayer1 })),
  );

  const [
    statsByKey,
    { entriesById: entries, eventsById: events },
    insightRow,
    serve,
  ] = await Promise.all([
    statsPromise,
    entriesPromise,
    insightPromise,
    servePromise,
  ]);

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
    stats: statsByKey.get(statKey(match.id, isPlayer1)) ?? null,
  }));

  const duals = dualRecordFrom(results, entries, events);
  const strip = seasonStrip(results, duals);
  const { wins, losses } = strip;

  const toRow = (result: ProfileResult): ProfileMatchRow => {
    const entry = result.entryId ? entries.get(result.entryId) : null;
    const event = entry ? events.get(entry.eventId) : null;
    const school = resolveSchool(entry, event, result.tournamentName);
    return {
      id: result.id,
      date: result.date ? shortDate(result.date) : "",
      opponent: shortName(result.opponentName),
      school,
      schoolAbbr: school ? getInitials(school) : null,
      line: resolveLine(entry),
      won: result.won,
      score: buildScoreString(result.score, result.isPlayer1),
    };
  };

  const last = results[0];
  const lastMatch: ProfileLastMatch | null = last
    ? {
        ...toRow(last),
        opponentInitial: getInitials(last.opponentName).charAt(0) || "?",
        insight: (() => {
          const side = last.isPlayer1
            ? insightRow?.player1
            : insightRow?.player2;
          const summary = side?.summary?.trim();
          return summary ? { summary } : null;
        })(),
        chips: chipsFrom(last.stats),
      }
    : null;

  const name =
    row.display_name?.trim() || row.email?.split("@")[0] || "Unnamed player";

  return {
    playerId: row.player_id,
    profileId: row.profile_id,
    userId: row.user_id,
    name,
    firstName: name.split(/\s+/)[0] ?? name,
    email: row.email,
    role: row.role as MemberRole,
    classYear: row.class_year,
    lineupSpot: row.lineup_spot,
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
      .map((r) => (r.won ? ("win" as const) : ("loss" as const))),
    kpis: strip.kpis,
    hasStats: strip.hasStats,
    lastMatch,
    history: results.map(toRow),
    lines: lineHistoryFrom(results, entries),
    serve,
  };
});
