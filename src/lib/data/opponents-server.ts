import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { PLAYER_MEASURES } from "@/lib/data/player-measures";
import { meanOfPresent, pct } from "@/lib/data/aggregate";
import { buildScoreString, matchOutcome, shortDate, type MatchScore } from "@/lib/data/match-utils";

/**
 * Who a program is about to play, and what is known about them.
 *
 * ── The two tiers, and why the seam is here rather than in a policy ─────────
 * Everything this module reads falls on one side of a line that the database
 * draws structurally:
 *
 *   TIER 1  pooled_roster / _player / _lineups / _results — the public record.
 *           Rosters, lineups and scores, pooled across every program that has
 *           not opted out. Already published by schools and the conference; the
 *           new thing is that it aggregates.
 *
 *   TIER 3  match_stats — derived statistics, gated by `visible_match_ids()`
 *           and therefore only ever THIS program's own matches.
 *
 * The seam matters because the whole feature exists to work around a sample
 * size problem. A program plays a conference opponent's #3 singles once a
 * season: a profile built only from Tier 3 is a profile over n=1, which is a
 * match report wearing a different title. Tier 1 is what makes the page worth
 * opening — it shows what that opponent has been fielding all year, because six
 * other programs each wrote a line down.
 *
 * Nothing here re-states an access rule. The `pooled_*` functions are SECURITY
 * DEFINER with hand-written column lists, so the pool's membership and the
 * columns it may expose are both settled in SQL; `match_stats` obeys the
 * caller's policy. A second copy of either rule in TypeScript could only drift
 * from the enforced one.
 */

export interface ConferenceProgram {
  id: string;
  schoolName: string;
  team: string;
  division: string | null;
  state: string | null;
  /** True for the viewer's own program, which sorts first and is not a rival. */
  isSelf: boolean;
}

export interface OpponentRosterPlayer {
  id: string;
  name: string;
  classYear: string | null;
  lineupSpot: number | null;
}

export interface OpponentLineupLine {
  entryId: string;
  eventName: string;
  startsOn: string;
  discipline: string;
  /** 'S1'..'S6' / 'D1'..'D3', or null for a tournament entry. */
  slot: string | null;
  /** Who THEY played on this line. */
  players: string[];
  /** Result from the recording program's side, where one was recorded. */
  score: string | null;
}

export interface HeadToHeadMatch {
  matchId: string;
  date: string;
  opponentName: string;
  score: string;
  won: boolean | null;
}

export interface OpponentDetail {
  program: ConferenceProgram;
  conference: string | null;
  roster: OpponentRosterPlayer[];
  lineups: OpponentLineupLine[];
  headToHead: HeadToHeadMatch[];
  wins: number;
  losses: number;
}

export interface OpponentMeasure {
  key: string;
  label: string;
  hint: string;
  /** Mean across the matches YOU played them. Null where nothing measured it. */
  value: number | null;
}

export interface OpponentPlayerProfile {
  playerId: string;
  name: string;
  classYear: string | null;
  lineupSpot: number | null;
  programName: string;
  /**
   * How many of YOUR matches fed the measures below. Displayed beside every
   * figure, never omitted: a rate over one match and a rate over nine are
   * different claims, and the reader cannot tell them apart otherwise.
   */
  matchesAgainst: number;
  /** Their hand and backhand, as recorded on the most recent match. */
  hand: string | null;
  backhand: string | null;
  measures: OpponentMeasure[];
}

interface DbProgramRow {
  id: string;
  school_name: string;
  team: string;
  division: string | null;
  state: string | null;
  conference: string | null;
}

function toProgram(row: DbProgramRow, selfId: string): ConferenceProgram {
  return {
    id: row.id,
    schoolName: row.school_name,
    team: row.team,
    division: row.division,
    state: row.state,
    isSelf: row.id === selfId,
  };
}

/**
 * Every program in the viewer's conference.
 *
 * The one part of this page that has content on day one. `programs` is a seeded
 * directory of 1,940 rows with `conference` and `division` populated on every
 * one of them, so a program that has never recorded a match still opens
 * Opponents onto its own conference rather than onto an empty state.
 *
 * The viewer's own program is included and flagged rather than filtered. A
 * conference table with a hole where you should be reads as a bug, and the
 * caller needs to know which row is theirs to render it differently.
 */
export const getConferenceTable = cache(async function getConferenceTable(
  programId: string
): Promise<{ conference: string | null; programs: ConferenceProgram[] }> {
  const supabase = await createClient();

  const { data: selfRow } = await supabase
    .from("programs")
    .select("conference")
    .eq("id", programId)
    .maybeSingle();

  const conference = (selfRow as { conference: string | null } | null)?.conference ?? null;
  if (!conference) return { conference: null, programs: [] };

  const { data } = await supabase
    .from("programs")
    .select("id, school_name, team, division, state, conference")
    .eq("conference", conference)
    .order("school_name", { ascending: true });

  return {
    conference,
    programs: ((data ?? []) as DbProgramRow[]).map((row) => toProgram(row, programId)),
  };
});

/**
 * Programs this one has actually played, newest fixture first.
 *
 * Read from the viewer's own entries rather than from the pool: "who have we
 * played" is a question about this program's season, and answering it from
 * every program's entries would return the whole conference.
 *
 * Entries whose opponent was typed as free text rather than picked from the
 * directory are absent, deliberately. They have no id to navigate to, and
 * inventing one by name-matching is the drift this column was added to end.
 */
export const getOpponentsPlayed = cache(async function getOpponentsPlayed(
  programId: string
): Promise<ConferenceProgram[]> {
  const supabase = await createClient();

  const { data: entries } = await supabase
    .from("program_event_entries")
    .select("opponent_program_id")
    .eq("program_id", programId)
    .not("opponent_program_id", "is", null);

  const ids = [
    ...new Set(
      ((entries ?? []) as { opponent_program_id: string }[]).map((e) => e.opponent_program_id)
    ),
  ];
  if (ids.length === 0) return [];

  const { data } = await supabase
    .from("programs")
    .select("id, school_name, team, division, state, conference")
    .in("id", ids)
    .order("school_name", { ascending: true });

  return ((data ?? []) as DbProgramRow[]).map((row) => toProgram(row, programId));
});

/**
 * One opponent: who they are, who they field, and how it has gone against us.
 *
 * Four reads, never N. The lineup history is the pooled one — every line ANY
 * program recorded against them — while the head-to-head is only this
 * program's, because a score is public record and a result is a fact about two
 * specific teams.
 */
export const getOpponentDetail = cache(async function getOpponentDetail(
  programId: string,
  opponentProgramId: string
): Promise<OpponentDetail | null> {
  const supabase = await createClient();

  const { data: programRow } = await supabase
    .from("programs")
    .select("id, school_name, team, division, state, conference")
    .eq("id", opponentProgramId)
    .maybeSingle();

  if (!programRow) return null;
  const program = programRow as DbProgramRow;

  const [{ data: rosterRows }, { data: lineupRows }, { data: matchRows }] = await Promise.all([
    // RPCs, not views. The pooled reads are SECURITY DEFINER functions with
    // hand-written column lists — the same construct `program_roster_full` uses,
    // and for the same reason: a policy cannot restrict columns, and a definer
    // VIEW is the shape 20260817074053 caught leaking. Ordering happens below
    // rather than in PostgREST, since these return a set rather than a table.
    supabase.rpc("pooled_roster", { p_program_id: opponentProgramId }),
    supabase.rpc("pooled_lineups", { p_opponent_program_id: opponentProgramId }),
    supabase
      .from("matches")
      .select("id, player2_name, score, date, opponent_player_id")
      .eq("program_id", programId)
      .order("date", { ascending: false, nullsFirst: false }),
  ]);

  const roster: OpponentRosterPlayer[] = (
    (rosterRows ?? []) as {
      id: string;
      first_name: string;
      last_name: string;
      class_year: string | null;
      lineup_spot: number | null;
    }[]
  )
    .map((row) => ({
      id: row.id,
      name: `${row.first_name} ${row.last_name}`.trim(),
      classYear: row.class_year,
      lineupSpot: row.lineup_spot,
    }))
    // Lineup order, unranked last. A null is "nobody has recorded where they
    // play", and floating those to #1 would publish a ladder nobody set.
    .sort((a, b) => {
      if (a.lineupSpot === b.lineupSpot) return a.name.localeCompare(b.name);
      if (a.lineupSpot === null) return 1;
      if (b.lineupSpot === null) return -1;
      return a.lineupSpot - b.lineupSpot;
    });

  const entryIds = ((lineupRows ?? []) as { entry_id: string }[]).map((r) => r.entry_id);

  // Scores for those lines. `pooled_results` keys on `event_entry_id` and
  // deliberately returns no match id, so nothing reachable from here can join to
  // a statistic belonging to the program that recorded the line.
  const { data: resultRows } = entryIds.length
    ? await supabase.rpc("pooled_results", { p_entry_ids: entryIds })
    : { data: [] as { event_entry_id: string; score: MatchScore | null }[] };

  const scoreByEntry = new Map<string, MatchScore | null>();
  for (const row of (resultRows ?? []) as { event_entry_id: string; score: MatchScore | null }[]) {
    scoreByEntry.set(row.event_entry_id, row.score);
  }

  const lineups: OpponentLineupLine[] = (
    (lineupRows ?? []) as {
      entry_id: string;
      event_name: string;
      starts_on: string;
      discipline: string;
      slot: string | null;
      opponent_labels: string[] | null;
    }[]
  )
    .map((row) => {
      const score = scoreByEntry.get(row.entry_id) ?? null;
      return {
        entryId: row.entry_id,
        eventName: row.event_name,
        startsOn: row.starts_on,
        discipline: row.discipline,
        slot: row.slot,
        players: row.opponent_labels ?? [],
        score: score ? buildScoreString(score, true) : null,
      };
    })
    // Newest fixture first, then by lineup slot within a fixture, so a dual
    // reads down the order it was played rather than in insertion order.
    .sort(
      (a, b) =>
        b.startsOn.localeCompare(a.startsOn) || (a.slot ?? "").localeCompare(b.slot ?? "")
    );

  // Head to head. Identity first, name second — every row recorded before the
  // opponent-identity path shipped carries a name and nothing else, and
  // `docs/ui-revamp-guardrails.md` §2 rules out backfilling them.
  const rosterIds = new Set(roster.map((p) => p.id));
  const rosterNames = new Set(roster.map((p) => p.name.toLowerCase()));
  const headToHead: HeadToHeadMatch[] = (
    (matchRows ?? []) as {
      id: string;
      player2_name: string | null;
      score: MatchScore | null;
      date: string;
      opponent_player_id: string | null;
    }[]
  )
    .filter((m) =>
      m.opponent_player_id
        ? rosterIds.has(m.opponent_player_id)
        : rosterNames.has((m.player2_name ?? "").trim().toLowerCase())
    )
    .map((m) => ({
      matchId: m.id,
      date: shortDate(m.date),
      opponentName: (m.player2_name ?? "").trim(),
      score: buildScoreString(m.score, true),
      won: matchOutcome(m.score, true),
    }));

  let wins = 0;
  let losses = 0;
  for (const match of headToHead) {
    if (match.won === true) wins++;
    else if (match.won === false) losses++;
  }

  return {
    program: toProgram(program, programId),
    conference: program.conference,
    roster,
    lineups,
    headToHead,
    wins,
    losses,
  };
});

/**
 * One opposing player, read from the matches THIS program played against them.
 *
 * ── Where the numbers come from ─────────────────────────────────────────────
 * `match_stats` is keyed on `(match_id, is_player1)` — two rows per match, and
 * the second one is the opponent. It has been written for every match that
 * finished processing since the product shipped and has never been read as an
 * opponent profile. That row, and only that row, is what this returns.
 *
 * It is Tier 3 and therefore strictly private: `visible_match_ids()` restricts
 * the match query to this program's own matches, so what comes back is how this
 * opponent played against US. It is never how they played against anyone else,
 * at any pool setting, and there is no view that would make it so.
 *
 * ── Why `matchesAgainst` is part of the return type ─────────────────────────
 * Because it is usually 1. A rate over a single match is a legitimate thing to
 * show a coach and an illegitimate thing to show without its denominator, and
 * making the count optional would make omitting it the easy path.
 */
export const getOpponentPlayerProfile = cache(async function getOpponentPlayerProfile(
  programId: string,
  playerId: string
): Promise<OpponentPlayerProfile | null> {
  const supabase = await createClient();

  const { data: playerRows } = await supabase.rpc("pooled_player", {
    p_player_id: playerId,
  });

  const playerRow = ((playerRows ?? []) as unknown[])[0];
  if (!playerRow) return null;
  const player = playerRow as {
    id: string;
    program_id: string;
    first_name: string;
    last_name: string;
    class_year: string | null;
    lineup_spot: number | null;
  };
  const name = `${player.first_name} ${player.last_name}`.trim();

  const { data: programRow } = await supabase
    .from("programs")
    .select("school_name, team")
    .eq("id", player.program_id)
    .maybeSingle();

  // This program's matches against them.
  //
  // `opponent_player_id` where the upload named their program, the typed name
  // everywhere else. NOT `player2_id` — that column is one arm of the `matches`
  // SELECT policy, so an opponent id there would hand them this match and both
  // players' statistics the day they claim the profile (20260823090000).
  const { data: matchRows } = await supabase
    .from("matches")
    .select("id, opponent_player_id, player2_name, date, opponent_hand, opponent_backhand")
    .eq("program_id", programId)
    .order("date", { ascending: false, nullsFirst: false });

  const matches = (
    (matchRows ?? []) as {
      id: string;
      opponent_player_id: string | null;
      player2_name: string | null;
      date: string;
      opponent_hand: string | null;
      opponent_backhand: string | null;
    }[]
  ).filter(
    (m) =>
      m.opponent_player_id === playerId ||
      // The name fallback is confined to rows carrying no identity at all, so a
      // match explicitly attributed to somebody else can never be pulled in by
      // a namesake.
      (m.opponent_player_id === null &&
        (m.player2_name ?? "").trim().toLowerCase() === name.toLowerCase())
  );

  const measures: OpponentMeasure[] = PLAYER_MEASURES.map((measure) => ({
    key: measure.key,
    label: measure.label,
    hint: measure.hint,
    value: null,
  }));

  if (matches.length > 0) {
    const columns = ["match_id", "is_player1", ...PLAYER_MEASURES.map((m) => m.key)];
    const { data: statRows } = await supabase
      .from("match_stats_with_percentages")
      .select(columns.join(", "))
      // The opponent is player two. This is the entire trick: the row has been
      // sitting beside our own in every processed match all along.
      .eq("is_player1", false)
      .in(
        "match_id",
        matches.map((m) => m.id)
      );

    const byMatch = new Map<string, Record<string, unknown>>();
    for (const row of (statRows ?? []) as unknown as Record<string, unknown>[]) {
      byMatch.set(String(row.match_id), row);
    }

    for (const measure of measures) {
      // `meanOfPresent`, never `?? 0`. A SplitStep-derived match withholds the
      // whole return family, and averaging that absence in as a zero would
      // publish "they win no return points" — a specific false claim about a
      // real person, on a page a coach plans around.
      measure.value = meanOfPresent(
        matches.map((m) => pct(byMatch.get(m.id)?.[measure.key] as string | number | null)),
        0
      );
    }
  }

  const mostRecent = matches[0];

  return {
    playerId: player.id,
    name,
    classYear: player.class_year,
    lineupSpot: player.lineup_spot,
    programName: programRow
      ? `${(programRow as { school_name: string }).school_name} ${(programRow as { team: string }).team}`.trim()
      : "",
    matchesAgainst: matches.length,
    hand: mostRecent?.opponent_hand ?? null,
    backhand: mostRecent?.opponent_backhand ?? null,
    measures,
  };
});
