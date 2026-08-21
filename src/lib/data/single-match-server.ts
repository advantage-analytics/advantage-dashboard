import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { loadMatchAnalysis } from "@/lib/data/match-analysis-server";
import type { AnalysisStatus } from "@/lib/data/match-analysis";

/**
 * One team match that belongs to no event.
 *
 * A challenge, a practice set, an outside tournament: it carries `program_id`
 * so the program can see it, and `event_entry_id` null because nothing minted
 * it. That second condition is the whole definition, and it is what keeps these
 * out of a dual's team score.
 */
export interface TeamSingleMatch {
  id: string;
  playerName: string;
  /** The account behind `playerName`, when the match is linked to one. */
  playerUserId: string | null;
  opponentName: string;
  /** Whatever the coach called it — "Cincinnati Racquet Club", a tournament. */
  context: string | null;
  round: string | null;
  /** ISO timestamp as stored. */
  date: string;
  surface: string | null;
  matchType: string | null;
  score: { player1: number[]; player2: number[] } | null;
  status: AnalysisStatus;
  hasVideo: boolean;
  /**
   * The engine's own sentence, read RAW.
   *
   * `getMatchDetailData()` substitutes FILLER_INSIGHTS when this column is
   * null — hardcoded prose about a second serve nobody measured. That is fine
   * where it is, but a "From the report" panel that quotes it would be this
   * page inventing analysis for a match that has none. Null here means no
   * panel.
   */
  summary: string | null;
}

interface DbRow {
  id: string;
  player1_id: string | null;
  player1_name: string;
  player2_name: string;
  tournament_name: string | null;
  round: string | null;
  date: string;
  score: { player1: number[]; player2: number[] } | null;
  match_type: string | null;
  court_type: string | null;
  insights: { player1?: { summary?: string } } | null;
}

export const getTeamSingleMatch = cache(async function getTeamSingleMatch(
  programId: string,
  matchId: string
): Promise<TeamSingleMatch | null> {
  const supabase = await createClient();

  const { data } = await supabase
    .from("matches")
    .select(
      "id, player1_id, player1_name, player2_name, tournament_name, round, date, score, match_type, court_type, insights"
    )
    .eq("id", matchId)
    .eq("program_id", programId)
    // Scoped to matches with no event. One that belongs to a dual line has a
    // richer page of its own, and rendering it here would show a court as if it
    // were a challenge match.
    .is("event_entry_id", null)
    .maybeSingle();

  if (!data) return null;
  const row = data as DbRow;

  const jobs = await loadMatchAnalysis(supabase, [row.id]);
  const analysis = jobs.get(row.id);

  return {
    id: row.id,
    playerName: row.player1_name,
    // Carried so a re-upload of this match keeps whoever it already belongs to,
    // rather than re-deriving the player from whoever happens to be uploading.
    playerUserId: row.player1_id,
    opponentName: row.player2_name,
    context: row.tournament_name,
    round: row.round,
    date: row.date,
    surface: row.court_type,
    matchType: row.match_type,
    score: row.score,
    status: analysis?.status ?? "manual",
    hasVideo: analysis !== undefined,
    summary: row.insights?.player1?.summary ?? null,
  };
});
