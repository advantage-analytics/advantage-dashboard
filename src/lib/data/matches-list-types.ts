import { formatMatchDuration } from "@/lib/format/duration";
import type { MatchAnalysis } from "@/lib/data/match-analysis";
import { formatMatchDayLong } from "@/lib/data/match-day";
import { matchContextCaption, scoreWinner } from "@/lib/data/match-utils";
import { viewerSide } from "@/lib/data/viewer-side";
import {
  verificationFor,
  type MatchVerification,
} from "@/lib/data/match-verification";

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
    /** Set when the games don't decide it — a retirement or default. */
    winner?: "player1" | "player2";
  } | null;
  result: string | null;
  match_type: string | null;
  court_type: string | null;
  verified: boolean | null;
  verified_at?: string | null;
  duration: number | null;
  source_provider?: string | null;
}

export interface DisplayMatch {
  /** Matches API currently permits only the uploader to edit or delete. */
  canManage?: boolean;
  id: string;
  /** Null when the match was filed with no event — the row renders "No event". */
  tournamentName: string | null;
  /**
   * The day the match was played, already printed: "September 28, 2026"
   * (`formatMatchDayLong`). A label, not a timestamp — shorten it with the
   * `formatMatchDay*` helpers in `@/lib/data/match-day`, which read it back
   * without `new Date()`.
   */
  date: string;
  matchType: string;
  courtType?: string;
  /** Verified by Advantage (`verificationFor`), or null. */
  verification?: MatchVerification | null;
  round?: string;
  matchContext?: string;
  duration?: string;
  sourceProvider?: string;
  /**
   * `id` is `matches.player1_id` — an auth uid or a `program_players.id`
   * (both spaces live in that column), so compare it against both.
   */
  player1: {
    name: string;
    id?: string | null;
    /**
     * The roster profile `id` resolves to on the active team, for linking the
     * name. Null when they are no longer on the roster (archived, or never
     * were) — that page would 404. Absent outside a team list.
     */
    profileId?: string | null;
  };
  player2: { name: string };
  /**
   * Set by `fromPlayerSide`: player1 here is the row's seat TWO, so its own
   * `match_stats` row is `is_player1 = false`.
   */
  turned?: boolean;
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

/**
 * The row in its stored seat order, whoever is looking. A surface that reads
 * player1 as "you" turns it afterwards: `toViewerSide`, or `fromPlayerSide` on
 * a player's profile.
 */
export function transformDbMatch(
  row: DbMatch,
  _userId: string,
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

  return {
    id: row.id,
    tournamentName: row.tournament_name,
    date: formatMatchDayLong(row.date),
    matchType: row.match_type ?? "Match",
    courtType: row.court_type ?? undefined,
    verification: verificationFor(row),
    round: row.round ?? undefined,
    matchContext: matchContextCaption(row.result),
    duration: formatMatchDuration(row.duration),
    sourceProvider: row.source_provider ?? undefined,
    player1: { name: row.player1_name, id: row.player1_id },
    player2: { name: row.player2_name },
    score: {
      sets,
      // The shared rule (a stored winner, then sets). A level score has always
      // read as player2 here.
      winner: scoreWinner(row.score) ?? "player2",
    },
  };
}

/**
 * A Matches-list row turned to this player's side.
 *
 * The list row reads player1 as "you": its opponent column is player2, its
 * result mark is "player1 won". On a profile that is only true when this
 * player was player1. When they were player2 (an intra-squad match), the two
 * sides swap: names, every set's games and tiebreak points, and the winner.
 * Swapping both tiebreak slots is right whichever way a row stores them
 * (`ScoreLineSet`). The opponent's hand and backhand are dropped rather than
 * swapped: the row only ever carried player2's, which is this player's own.
 *
 * `decided` is whether the score names a winner (`scoreWinner`). When it does
 * not — a level or unfinished score — the list's transform defaults the
 * winner to player2, which is arbitrary; flipping that default would turn it
 * into a win on one teammate's page and a loss on the other's. Left as is, the
 * row reads the same from either side.
 */
export function fromPlayerSide(
  match: DisplayMatch,
  isPlayer1: boolean,
  decided = true,
): DisplayMatch {
  if (isPlayer1) return match;
  return {
    ...match,
    player1: { name: match.player2.name },
    player2: { name: match.player1.name },
    player2Hand: undefined,
    player2Backhand: undefined,
    turned: true,
    score: {
      winner: !decided
        ? match.score.winner
        : match.score.winner === "player1"
          ? "player2"
          : "player1",
      sets: match.score.sets.map((set) => ({
        player1: set.player2,
        player2: set.player1,
        player1Tiebreak: set.player2Tiebreak,
        player2Tiebreak: set.player1Tiebreak,
      })),
    },
  };
}

/**
 * A personal list row turned to the viewer's side. The seat comes from
 * `viewerSide`, the rule Opponents and the KPIs use, and a row whose side is
 * unknown stays as stored rather than being guessed at.
 */
export function toViewerSide(
  match: DisplayMatch,
  row: Pick<DbMatch, "player1_id" | "score"> & {
    player2_id: string | null;
    created_by: string | null;
  },
  myPlayerIds: readonly string[],
  viewerId: string,
): DisplayMatch {
  if (viewerSide(row, myPlayerIds, viewerId, row.created_by) !== "player2") {
    return match;
  }
  return fromPlayerSide(match, false, scoreWinner(row.score) !== null);
}
