import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

/**
 * Two players, the same measures.
 *
 * The one screen in the product that answers a question only a coach asks —
 * not "how did this match go" but "which of these two is holding serve, and
 * which of them is winning the return games we keep losing".
 *
 * ── Why percentages and not counts ──────────────────────────────────────────
 * Players on one squad do not play the same number of matches. A senior with
 * fourteen matches and a freshman with three cannot be compared on aces or
 * winners without the comparison being a statement about opportunity. Every
 * measure here is a rate, and the match count sits beside it so a rate over
 * three matches is legible as a rate over three matches.
 *
 * ── Access ──────────────────────────────────────────────────────────────────
 * Nothing here filters on who may see what. `matches` is gated by
 * `visible_match_ids()` and `match_stats_with_percentages` runs
 * `security_invoker = on`, so a player without `roster_visible` gets their own
 * rows and nothing else — from the same query a coach uses. Restating the rule
 * in TypeScript would be a second answer able to drift from the enforced one.
 */

export interface ComparableMeasure {
  key: string;
  label: string;
  /** Longer form, for the row's title attribute. */
  hint: string;
}

/**
 * The measures, in reading order.
 *
 * Deliberately the set the radar on the match page already uses: every one is
 * a serve/return/pressure rate that derivation can produce, so a video-analysed
 * match contributes to this comparison on the same terms as an imported one.
 * Aces, winners and unforced errors are absent on purpose — they depend on
 * `result_type`, and a squad mixing imported and video matches would be
 * comparing two players on differently-populated columns.
 */
export const COMPARE_MEASURES: ComparableMeasure[] = [
  { key: "first_serve_pct", label: "First serve in", hint: "Share of first serves landing in" },
  { key: "first_serve_won_pct", label: "First serve won", hint: "Points won behind a first serve" },
  { key: "second_serve_won_pct", label: "Second serve won", hint: "Points won behind a second serve" },
  { key: "service_games_won_pct", label: "Service games held", hint: "Service games won" },
  { key: "break_points_saved_pct", label: "Break points saved", hint: "Break points faced and survived" },
  { key: "first_return_won_pct", label: "First return won", hint: "Points won returning a first serve" },
  { key: "second_return_won_pct", label: "Second return won", hint: "Points won returning a second serve" },
  { key: "return_games_won_pct", label: "Return games won", hint: "Opponent service games broken" },
  { key: "break_points_converted_pct", label: "Break points taken", hint: "Break chances converted" },
  { key: "total_points_won_pct", label: "Total points won", hint: "Share of all points won" },
];

export interface ComparablePlayer {
  userId: string;
  name: string;
  matchCount: number;
}

export interface PlayerComparison {
  userId: string;
  name: string;
  matchesPlayed: number;
  wins: number;
  losses: number;
  /** Measure key → average, or null where no match supplied that measure. */
  measures: Record<string, number | null>;
}

interface DbMatchRow {
  id: string;
  player1_id: string | null;
  player2_id: string | null;
  score: { player1?: number[]; player2?: number[] } | null;
}

/** Sets won by player1 and player2, from the entered score. */
function setsFrom(score: DbMatchRow["score"]): [number, number] {
  const p1 = score?.player1 ?? [];
  const p2 = score?.player2 ?? [];
  let a = 0;
  let b = 0;
  for (let i = 0; i < Math.max(p1.length, p2.length); i++) {
    const x = p1[i] ?? 0;
    const y = p2[i] ?? 0;
    if (x > y) a++;
    else if (y > x) b++;
  }
  return [a, b];
}

function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10;
}

/**
 * Everyone on the program who has actually played, with how much.
 *
 * Built from matches rather than from the roster: a member with no match has
 * nothing to compare, and offering them in a picker produces a column of
 * dashes that looks like a bug rather than an absence.
 */
export const getComparablePlayers = cache(async function getComparablePlayers(
  programId: string
): Promise<ComparablePlayer[]> {
  const supabase = await createClient();

  const { data: matches } = await supabase
    .from("matches")
    .select("id, player1_id, player2_id")
    .eq("program_id", programId);

  const counts = new Map<string, number>();
  for (const row of (matches ?? []) as DbMatchRow[]) {
    for (const id of [row.player1_id, row.player2_id]) {
      if (id) counts.set(id, (counts.get(id) ?? 0) + 1);
    }
  }
  if (counts.size === 0) return [];

  const { data: users } = await supabase
    .from("users")
    .select("id, first_name, last_name, email")
    .in("id", [...counts.keys()]);

  return (users ?? [])
    .map((u) => {
      const name =
        [u.first_name, u.last_name].filter(Boolean).join(" ").trim() ||
        String(u.email).split("@")[0];
      return {
        userId: u.id as string,
        name,
        matchCount: counts.get(u.id as string) ?? 0,
      };
    })
    .sort((a, b) => b.matchCount - a.matchCount || a.name.localeCompare(b.name));
});

/**
 * Aggregate one or two players across the program's matches.
 *
 * Takes the ids together rather than one call each, because both sides read
 * the same two tables — splitting it would double the round trips to answer
 * one screen.
 */
export const getPlayerComparison = cache(async function getPlayerComparison(
  programId: string,
  userIds: string[]
): Promise<PlayerComparison[]> {
  if (userIds.length === 0) return [];

  const supabase = await createClient();

  const { data: matchRows } = await supabase
    .from("matches")
    .select("id, player1_id, player2_id, score")
    .eq("program_id", programId);

  const matches = (matchRows ?? []) as DbMatchRow[];
  if (matches.length === 0) {
    return userIds.map((userId) => emptyComparison(userId));
  }

  const columns = ["match_id", "is_player1", ...COMPARE_MEASURES.map((m) => m.key)];
  const { data: statRows } = await supabase
    .from("match_stats_with_percentages")
    .select(columns.join(", "))
    .in(
      "match_id",
      matches.map((m) => m.id)
    );

  // (match_id, is_player1) → the row. That pair is the view's natural key, and
  // building the map once keeps the per-player pass below a lookup rather than
  // a scan of every stat row per match.
  const stats = new Map<string, Record<string, unknown>>();
  for (const row of (statRows ?? []) as unknown as Record<string, unknown>[]) {
    stats.set(`${row.match_id}:${row.is_player1 ? 1 : 0}`, row);
  }

  const { data: users } = await supabase
    .from("users")
    .select("id, first_name, last_name, email")
    .in("id", userIds);

  const nameById = new Map<string, string>();
  for (const u of users ?? []) {
    nameById.set(
      u.id as string,
      [u.first_name, u.last_name].filter(Boolean).join(" ").trim() ||
        String(u.email).split("@")[0]
    );
  }

  return userIds.map((userId) => {
    const collected: Record<string, number[]> = {};
    for (const measure of COMPARE_MEASURES) collected[measure.key] = [];

    let wins = 0;
    let losses = 0;
    let played = 0;

    for (const match of matches) {
      const isP1 = match.player1_id === userId;
      const isP2 = match.player2_id === userId;
      if (!isP1 && !isP2) continue;

      played++;
      const [p1Sets, p2Sets] = setsFrom(match.score);
      // A match with no sets recorded counts as played and as neither — an
      // unfinished or unscored row should not invent a result either way.
      if (p1Sets !== p2Sets) {
        const won = isP1 ? p1Sets > p2Sets : p2Sets > p1Sets;
        if (won) wins++;
        else losses++;
      }

      const row = stats.get(`${match.id}:${isP1 ? 1 : 0}`);
      if (!row) continue;

      for (const measure of COMPARE_MEASURES) {
        // The view returns numerics as strings over PostgREST. Parsing here
        // rather than trusting the type keeps a silent NaN out of the mean.
        const raw = row[measure.key];
        const value =
          typeof raw === "number" ? raw : raw != null ? parseFloat(String(raw)) : NaN;
        if (!isNaN(value)) collected[measure.key].push(value);
      }
    }

    const measures: Record<string, number | null> = {};
    for (const measure of COMPARE_MEASURES) {
      measures[measure.key] = mean(collected[measure.key]);
    }

    return {
      userId,
      name: nameById.get(userId) ?? "Unknown",
      matchesPlayed: played,
      wins,
      losses,
      measures,
    };
  });
});

function emptyComparison(userId: string): PlayerComparison {
  const measures: Record<string, number | null> = {};
  for (const measure of COMPARE_MEASURES) measures[measure.key] = null;
  return { userId, name: "Unknown", matchesPlayed: 0, wins: 0, losses: 0, measures };
}
