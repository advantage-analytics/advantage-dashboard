import { formatDuration } from "@/components/dashboard/matches/new-match-wizard/utils";
import type { MatchAnalysis } from "@/lib/data/match-analysis";

export interface DbMatch {
  id: string;
  player1_id: string | null;
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
  source_provider?: string | null;
}

export interface DisplayMatch {
  id: string;
  tournamentName: string;
  date: string;
  matchType: string;
  courtType?: string;
  verificationStatus?: string;
  round?: string;
  matchContext?: string;
  duration?: string;
  sourceProvider?: string;
  player1: { name: string };
  player2: { name: string };
  player2Hand?: string;
  player2Backhand?: string;
  /**
   * Processing state, attached by the page after transform. Optional because
   * the transform itself only knows about the `matches` row — analysis lives in
   * `processing_jobs` and is joined in one level up.
   */
  analysis?: MatchAnalysis;
  score: {
    /**
     * The two `*Tiebreak` numbers are the POINTS. Which slot holds what is
     * disputed — production stores both, each side's own points — so see
     * `ScoreLineSet` in `@/lib/ui/score-format` rather than trusting a
     * one-line summary here. `tiebreakOf()` there is the one place that knows
     * which of the pair a given surface raises, and it is right under either
     * reading; `<ScoreLine>` and the match page's boxed scoreboard both call
     * it rather than restating it.
     */
    sets: {
      player1: number;
      player2: number;
      player1Tiebreak?: number | null;
      player2Tiebreak?: number | null;
    }[];
    winner: "player1" | "player2";
  };
}

export function formatDisplayDate(isoDate: string): string {
  try {
    const d = new Date(isoDate);
    return d.toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return isoDate;
  }
}

export function transformDbMatch(
  row: DbMatch,
  _userId: string
): DisplayMatch | null {
  if (!row.score?.player1?.length || !row.score?.player2?.length) return null;

  const sets = row.score.player1.map((p1Score, i) => ({
    player1: p1Score,
    player2: row.score?.player2[i] ?? 0,
    // The tiebreak POINTS, carried through rather than reduced to a "this set
    // had a breaker" flag: the list row prints them as the superscript in
    // "6-7³".
    player1Tiebreak: row.score?.player1_tiebreaks?.[i] ?? null,
    player2Tiebreak: row.score?.player2_tiebreaks?.[i] ?? null,
  }));

  let p1Sets = 0;
  let p2Sets = 0;
  for (const set of sets) {
    if (set.player1 > set.player2) p1Sets++;
    else if (set.player2 > set.player1) p2Sets++;
  }

  return {
    id: row.id,
    tournamentName: row.tournament_name ?? "Unknown Event",
    date: formatDisplayDate(row.date),
    matchType: row.match_type ?? "Match",
    courtType: row.court_type ?? undefined,
    verificationStatus: row.verified ? "Verified Result" : undefined,
    round: row.round ?? undefined,
    matchContext: row.result ?? "Final Score",
    duration: formatDuration(row.duration ?? undefined),
    sourceProvider: row.source_provider ?? undefined,
    player1: { name: row.player1_name },
    player2: { name: row.player2_name },
    score: {
      sets,
      winner: p1Sets > p2Sets ? "player1" : "player2",
    },
  };
}
