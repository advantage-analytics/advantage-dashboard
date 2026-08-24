import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import {
  buildScoreString,
  matchOutcome,
  shortDate,
  shortName,
  type MatchScore,
} from "@/lib/data/match-utils";
import { meanOfPresent, pct } from "@/lib/data/aggregate";
import { PLAYER_MEASURES } from "@/lib/data/player-measures";
import type { MemberRole } from "@/lib/data/team-settings-server";

/**
 * One player, everything the program knows about them.
 *
 * The destination the roster row points at. A coach clicking a name wants that
 * person, not a picker.
 *
 * ── Measures ────────────────────────────────────────────────────────────────
 * `PLAYER_MEASURES`, the same ten an opponent's profile is read on. They are
 * every serve/return/pressure rate that derivation can produce, so a
 * video-analysed match contributes on the same terms as an imported one — and
 * one player's page must not disagree with another's about what a first serve
 * percentage is.
 *
 * ── Trend ───────────────────────────────────────────────────────────────────
 * Recent window against everything before it, the same shape the roster's
 * first-serve delta uses. Null when there is no earlier window: a player with
 * four matches has a season average and no trend, and inventing one from a
 * two-match baseline would be a number that moves for no reason.
 */

/** How many recent matches "lately" means, here and on the roster. */
const RECENT_WINDOW = 5;

export interface ProfileMatch {
  id: string;
  /** "def." / "l." / "vs" is the caller's business; this is the fact. */
  won: boolean | null;
  opponent: string;
  /** From this player's perspective, "6-4, 6-2". */
  score: string;
  date: string;
  event: string | null;
  /** Whether this player was player one, for reading their side of the stats. */
  isPlayer1: boolean;
}

export interface ProfileMeasure {
  key: string;
  label: string;
  hint: string;
  /** Season average, or null where no match supplied it. */
  value: number | null;
  /** Recent window minus everything earlier, in points. Null with no baseline. */
  trend: number | null;
}

export interface PlayerProfile {
  playerId: string;
  profileId: string | null;
  name: string;
  email: string | null;
  role: MemberRole;
  classYear: string | null;
  lineupSpot: number | null;
  managedBy: "coach" | "self";
  matchesPlayed: number;
  wins: number;
  losses: number;
  /** Oldest first, at most five. Unscored matches are left out. */
  form: ("win" | "loss")[];
  recentMatches: ProfileMatch[];
  measures: ProfileMeasure[];
}

interface DbRosterFullRow {
  player_id: string;
  profile_id: string | null;
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
}

/** How many matches the page lists before it stops being a page and starts being a log. */
const RECENT_LIMIT = 8;

export const getPlayerProfile = cache(async function getPlayerProfile(
  programId: string,
  playerId: string
): Promise<PlayerProfile | null> {
  const supabase = await createClient();

  // The roster is the identity source, and it is already the one place that
  // knows how to name somebody who has no login. Reading `users` directly would
  // return at most the viewer's own row.
  const { data: rosterRows } = await supabase.rpc("program_roster_full", {
    p_program_id: programId,
  });

  const row = ((rosterRows ?? []) as DbRosterFullRow[]).find(
    (r) => r.player_id === playerId
  );

  // An id that names nobody on this roster is a 404, not an empty profile. It
  // arrives from a URL and is untrusted.
  if (!row) return null;

  const { data: matchRows } = await supabase
    .from("matches")
    .select(
      "id, player1_id, player2_id, player1_name, player2_name, score, date, tournament_name"
    )
    .eq("program_id", programId)
    .or(`player1_id.eq.${playerId},player2_id.eq.${playerId}`)
    // NULLs last, or an undated row would head the list and be read as the most
    // recent thing this player did.
    .order("date", { ascending: false, nullsFirst: false });

  const matches = (matchRows ?? []) as DbMatchRow[];

  const results = matches.map((match) => {
    const isPlayer1 = match.player1_id === playerId;
    return { match, isPlayer1, won: matchOutcome(match.score, isPlayer1) };
  });

  let wins = 0;
  let losses = 0;
  for (const result of results) {
    if (result.won === true) wins++;
    else if (result.won === false) losses++;
  }

  const statsByPlayer = new Map<string, Record<string, unknown>>();
  if (matches.length > 0) {
    const columns = [
      "match_id",
      "is_player1",
      ...PLAYER_MEASURES.map((m) => m.key),
    ];
    const { data: statRows } = await supabase
      .from("match_stats_with_percentages")
      .select(columns.join(", "))
      .in(
        "match_id",
        matches.map((m) => m.id)
      );

    for (const stat of (statRows ?? []) as unknown as Record<string, unknown>[]) {
      statsByPlayer.set(`${stat.match_id}:${stat.is_player1 ? 1 : 0}`, stat);
    }
  }

  // `results` is newest first, so the first slice is "lately" and the rest is
  // the baseline it is measured against.
  const measures: ProfileMeasure[] = PLAYER_MEASURES.map((measure) => {
    const series = results.map((r) => {
      const stat = statsByPlayer.get(
        `${r.match.id}:${r.isPlayer1 ? 1 : 0}`
      );
      // The view returns numerics as strings over PostgREST — parsing here
      // rather than trusting the type keeps a silent NaN out of the mean.
      return pct(stat?.[measure.key] as string | number | null | undefined);
    });

    const recent = meanOfPresent(series.slice(0, RECENT_WINDOW), 0);
    const earlier = meanOfPresent(series.slice(RECENT_WINDOW), 0);

    return {
      key: measure.key,
      label: measure.label,
      hint: measure.hint,
      value: meanOfPresent(series, 0),
      trend: recent === null || earlier === null ? null : recent - earlier,
    };
  });

  return {
    playerId: row.player_id,
    profileId: row.profile_id,
    name: row.display_name?.trim() || row.email?.split("@")[0] || "Unnamed player",
    email: row.email,
    role: row.role as MemberRole,
    classYear: row.class_year,
    lineupSpot: row.lineup_spot,
    managedBy: row.managed_by === "coach" ? "coach" : "self",
    matchesPlayed: results.length,
    wins,
    losses,
    // Reversed so the strip reads left to right in the order the season was
    // played, which is how a coach reads a run of results out loud.
    form: results
      .filter((r) => r.won !== null)
      .slice(0, RECENT_WINDOW)
      .reverse()
      .map((r) => (r.won ? ("win" as const) : ("loss" as const))),
    recentMatches: results.slice(0, RECENT_LIMIT).map((r) => ({
      id: r.match.id,
      won: r.won,
      opponent: shortName(
        (r.isPlayer1 ? r.match.player2_name : r.match.player1_name) ?? "Unknown"
      ),
      score: buildScoreString(r.match.score, r.isPlayer1).replaceAll(" ", ", "),
      date: r.match.date ? shortDate(r.match.date) : "",
      event: r.match.tournament_name,
      isPlayer1: r.isPlayer1,
    })),
    measures,
  };
});
