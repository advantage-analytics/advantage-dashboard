import type { SupabaseClient } from "@supabase/supabase-js";
import { scoreSetsFrom, type ScoreLineSet } from "@/lib/ui/score-format";
import { loadMatchAnalysis } from "@/lib/data/match-analysis-server";
import {
  isAnalysisFailed,
  isInFlight,
  type AnalysisStatus,
} from "@/lib/data/match-analysis";
import { viewerSide } from "@/lib/data/viewer-side";

export interface DbRecentMatch {
  id: string;
  created_by: string;
  player1_id: string | null;
  player2_id: string | null;
  player1_name: string;
  player2_name: string;
  tournament_name: string | null;
  round: string | null;
  date: string;
  score: {
    player1: number[];
    player2: number[];
    player1_tiebreaks?: (number | null)[];
    player2_tiebreaks?: (number | null)[];
  } | null;
  result: string | null;
  match_type: string | null;
  court_type: string | null;
  verified: boolean | null;
  duration: number | null;
  opponent_hand: string | null;
  opponent_backhand: string | null;
}

function formatOpponentMeta(
  hand: string | null,
  backhand: string | null,
): string[] {
  const meta: string[] = [];
  if (hand === "left" || hand === "right") {
    meta.push(`${hand.toUpperCase()} HANDED`);
  }
  if (backhand === "one-handed" || backhand === "two-handed") {
    meta.push(`${backhand === "one-handed" ? "1" : "2"}-HANDED BACKHAND`);
  }
  return meta;
}

export interface MatchStats {
  match_id: string;
  is_player1: boolean;
  first_serve_pct: string | null;
  winners: number | null;
  unforced_errors: number | null;
  break_points_saved: number | null;
  break_points_faced: number | null;
  break_point_opportunities: number | null;
  break_points_converted: number | null;
}

export interface EventGroup {
  id: string;
  tournamentName: string;
  date: string;
  matchType: string | null;
  courtType: string | null;
  verificationStatus: string | null;
  matches: MatchRow[];
}

export interface MatchRow {
  id: string;
  opponentName: string;
  /**
   * Sets, already turned the viewer's way round — not a formatted string. The
   * rail used to carry "6-4 6-2" from a private formatter here, which is how
   * the home page ended up spelling scores differently from the matches list.
   * `<ScoreLine>` owns the spelling now; this row only owns the orientation.
   */
  score: ScoreLineSet[];
  won: boolean;
  firstServePct: number | null;
  winners: number | null;
  errors: number | null;
  opponentMeta?: string[];
  /**
   * Set while the match is still analyzing, or while analysis has failed —
   * swaps the row for the loader/error + `StatusChip` treatment instead of a
   * result. `isInFlight` alone used to gate this, which meant a `failed` or
   * `derivation_failed` job fell through to the ordinary win/loss row: real
   * score, dashes for every stat, nothing on screen saying the analysis never
   * finished. `manual` doesn't need the same carve-out — it never resolves to
   * a status here at all (no job row exists for it), so it already renders as
   * the plain result row its dashes correctly describe.
   */
  analysisStatus?: AnalysisStatus;
}

function formatDisplayDate(isoDate: string): string {
  try {
    const d = new Date(isoDate);
    if (Number.isNaN(d.getTime())) return isoDate;
    const now = new Date();
    const dDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const nowDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const diffDays = Math.round(
      (nowDay.getTime() - dDay.getTime()) / (1000 * 60 * 60 * 24),
    );

    if (diffDays === 0) return "Today";
    if (diffDays === 1) return "Yesterday";
    if (diffDays > 1 && diffDays <= 6) return `${diffDays} days ago`;
    if (diffDays > 6 && diffDays <= 13) return "Last week";

    const sameYear = d.getFullYear() === now.getFullYear();
    return d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      ...(sameYear ? {} : { year: "numeric" }),
    });
  } catch {
    return isoDate;
  }
}

function didUserWin(
  score: DbRecentMatch["score"],
  isUserPlayer1: boolean,
): boolean {
  if (!score?.player1?.length || !score?.player2?.length) return false;
  let p1Sets = 0;
  let p2Sets = 0;
  score.player1.forEach((s, i) => {
    if (s > (score.player2[i] ?? 0)) p1Sets++;
    else if ((score.player2[i] ?? 0) > s) p2Sets++;
  });
  return isUserPlayer1 ? p1Sets > p2Sets : p2Sets > p1Sets;
}

/** Cheap record count from the base rows Personal Home already resolved. */
export function countViewerWins(
  rows: readonly DbRecentMatch[],
  playerIds: readonly string[],
  viewerId: string,
): number {
  let wins = 0;
  for (const row of rows) {
    const side = viewerSide(row, playerIds, viewerId, row.created_by);
    if (side && didUserWin(row.score, side === "player1")) wins += 1;
  }
  return wins;
}

function groupMatchesIntoEvents(
  rows: DbRecentMatch[],
  playerIds: readonly string[],
  viewerId: string,
  statsMap: Map<string, MatchStats>,
  analysisMap: Map<string, AnalysisStatus>,
): EventGroup[] {
  const byKey = new Map<string, DbRecentMatch[]>();
  for (const row of rows) {
    const dateOnly =
      row.date && row.date.length >= 10 ? row.date.slice(0, 10) : row.date;
    const key = `${row.tournament_name ?? ""}|${dateOnly}`;
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key)!.push(row);
  }
  const events: EventGroup[] = [];
  const keys = Array.from(byKey.keys()).sort((a, b) => {
    const dateA = byKey.get(a)![0].date;
    const dateB = byKey.get(b)![0].date;
    return dateB.localeCompare(dateA);
  });
  for (const key of keys.slice(0, 3)) {
    const matches = byKey.get(key)!;
    const first = matches[0];
    const mapped: MatchRow[] = [];

    for (const m of matches) {
      if (!m.score?.player1?.length) continue;
      // The id set, not one id: a match a coach recorded for this athlete
      // before they had an account carries their roster PROFILE's id, and this
      // is what picks the opponent and orients the score.
      //
      // Three-state, not two: a match where the viewer is neither player used
      // to fall through the old `Boolean(...)` check straight into "assume
      // player2" — a stranger's name, orientation and win/loss rendered as
      // the viewer's own. `viewerSide()` (shared with `performance-server.ts`,
      // which is why the KPI strip already dropped what this list used to
      // render wrong) answers "player1" | "player2" | null; null means drop.
      const side = viewerSide(m, playerIds, viewerId, m.created_by);
      if (side === null) continue;
      const isUserPlayer1 = side === "player1";
      const opponent = isUserPlayer1 ? m.player2_name : m.player1_name;
      const stat = statsMap.get(m.id);
      const status = analysisMap.get(m.id);

      mapped.push({
        id: m.id,
        opponentName: opponent,
        // `swap` when the viewer is stored as player2, so the row reads from
        // their side — game counts and tiebreaks flipped together.
        score: scoreSetsFrom(m.score, { swap: !isUserPlayer1 }),
        won: didUserWin(m.score, isUserPlayer1),
        firstServePct: stat
          ? Math.round(parseFloat(stat.first_serve_pct ?? "0"))
          : null,
        winners: stat?.winners ?? null,
        errors: stat?.unforced_errors ?? null,
        opponentMeta: formatOpponentMeta(m.opponent_hand, m.opponent_backhand),
        analysisStatus:
          status && (isInFlight(status) || isAnalysisFailed(status))
            ? status
            : undefined,
      });
    }

    if (mapped.length === 0) continue;
    events.push({
      id: first.id,
      tournamentName: first.tournament_name ?? "Unknown event",
      date: formatDisplayDate(first.date),
      matchType: first.match_type ?? null,
      courtType: first.court_type ?? null,
      // Sentence case — the DS's one register for labels, and how Pa2 spells it.
      verificationStatus: first.verified ? "Verified result" : null,
      matches: mapped,
    });
  }
  return events;
}

export async function loadRecentMatches(
  supabase: SupabaseClient,
  userId: string,
  playerIds: readonly string[],
  initialRows?: DbRecentMatch[],
): Promise<EventGroup[]> {
  const { data: rows, error: fetchError } = initialRows
    ? { data: initialRows, error: null }
    : await supabase
        .from("matches")
        .select(
          "id, created_by, player1_name, player2_name, tournament_name, round, date, score, result, match_type, court_type, verified, duration, player1_id, player2_id, opponent_hand, opponent_backhand",
        )
        .eq("created_by", userId)
        // AND no program. `/dashboard` is the personal home — same predicate as
        // the matches list (`matches/page.tsx`), for the same reason:
        // `matches.program_id` is nullable precisely so "no program" is the
        // personal workspace.
        .is("program_id", null)
        .order("date", { ascending: false })
        .limit(50);

  if (fetchError) {
    throw new Error(fetchError.message);
  }
  const list = (rows ?? []) as DbRecentMatch[];
  const matchIds = list.map((m) => m.id);
  if (!matchIds.length) return [];

  // Stats and in-flight analysis state key off the same id set and neither
  // reads the other's output, so they run together rather than in series.
  const [{ data: stats, error: statsError }, analysis] = await Promise.all([
    supabase
      .from("match_stats_with_percentages")
      .select(
        "match_id, is_player1, first_serve_pct, winners, unforced_errors, break_points_saved, break_points_faced, break_point_opportunities, break_points_converted",
      )
      .in("match_id", matchIds),
    loadMatchAnalysis(supabase, matchIds),
  ]);
  if (statsError) throw new Error(statsError.message);
  const analysisMap = new Map<string, AnalysisStatus>();
  for (const [id, a] of analysis) analysisMap.set(id, a.status);

  const matchById = new Map(list.map((m) => [m.id, m]));
  const statsMap = new Map<string, MatchStats>();
  if (stats) {
    for (const stat of stats as MatchStats[]) {
      const match = matchById.get(stat.match_id);
      if (!match) continue;
      const side = viewerSide(match, playerIds, userId, match.created_by);
      if (side === null) continue;
      const isUserPlayer1 = side === "player1";
      if (stat.is_player1 === isUserPlayer1) {
        statsMap.set(stat.match_id, stat);
      }
    }
  }

  return groupMatchesIntoEvents(list, playerIds, userId, statsMap, analysisMap);
}
