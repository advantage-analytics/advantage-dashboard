import type { Match, Player, PlayerStatistics } from "@/lib/data/types";
import type { MatchStatisticsResult } from "@/lib/data/match-stats-server";
import type { ScoreLineSet } from "@/lib/ui/score-format";
import { shortName } from "@/lib/data/match-utils";
import { useMatchData } from "@/components/dashboard/matches/match-data-provider";

/**
 * The ONE place that decides which side of a match is "you".
 *
 * Everything on the round-46 match page that draws a you/opp distinction — the
 * check glyph, the left legend slot, name emphasis, viz-you vs viz-opp — takes
 * this helper's output rather than re-deriving it from player1/player2. The key
 * is strictly `match.isUserPlayer1`; nothing else may stand in for it (see
 * docs/ui-revamp-guardrails.md §4 for what a silent flip costs: every statistic
 * attributed to the wrong player with nothing looking broken on screen).
 */

export interface MatchSide {
  /** Whether this side is stored as player1 on the match row. */
  isPlayer1: boolean;
  player: Player;
  /** Display name, preferring the stats result's resolved name. */
  name: string;
  /** `name` through the shared `shortName()` abbreviation (max 14). */
  shortName: string;
  /** "Marcus Reid" → "MR". */
  initials: string;
  /** Published stats for this side, or null when none are published. */
  stats: PlayerStatistics | null;
}

export interface MatchSides {
  you: MatchSide;
  opp: MatchSide;
  /**
   * Sets oriented you-first (`player1` = you), with the tiebreak slots swapped
   * TOGETHER with the game counts — flipping one without the other moves a
   * tiebreak onto the wrong side of the set. Feed these to `<ScoreLine>`.
   */
  sets: ScoreLineSet[];
  /** Pick the "you" value out of a player1/player2 pair. */
  pick: <T>(player1Value: T, player2Value: T) => T;
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "";
  const first = parts[0][0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1][0] ?? "") : "";
  return `${first}${last}`.toUpperCase();
}

function sideOf(
  match: Match,
  statsResult: MatchStatisticsResult | null | undefined,
  isPlayer1: boolean,
): MatchSide {
  const player = isPlayer1 ? match.player1 : match.player2;
  const name =
    (isPlayer1 ? statsResult?.player1Name : statsResult?.player2Name) ??
    player.name;
  const stats =
    (isPlayer1
      ? statsResult?.statistics?.player1Stats
      : statsResult?.statistics?.player2Stats) ?? null;
  return {
    isPlayer1,
    player,
    name,
    shortName: shortName(name, 14),
    initials: initialsOf(name),
    stats,
  };
}

/**
 * Pure form — usable from Server Components (which cannot read the
 * `MatchDataProvider` context) and from anything that already holds the match.
 */
export function getMatchSides(
  match: Match,
  statsResult: MatchStatisticsResult | null = null,
): MatchSides {
  const youIsPlayer1 = match.isUserPlayer1;

  const sets: ScoreLineSet[] = match.score.sets.map((set) =>
    youIsPlayer1
      ? {
          player1: set.player1,
          player2: set.player2,
          player1Tiebreak: set.player1Tiebreak ?? null,
          player2Tiebreak: set.player2Tiebreak ?? null,
        }
      : {
          player1: set.player2,
          player2: set.player1,
          player1Tiebreak: set.player2Tiebreak ?? null,
          player2Tiebreak: set.player1Tiebreak ?? null,
        },
  );

  return {
    you: sideOf(match, statsResult, youIsPlayer1),
    opp: sideOf(match, statsResult, !youIsPlayer1),
    sets,
    pick: (player1Value, player2Value) =>
      youIsPlayer1 ? player1Value : player2Value,
  };
}

/** Hook form for client components under `MatchDataProvider`. */
export function useMatchSides(): MatchSides {
  const { match, statsResult } = useMatchData();
  return getMatchSides(match, statsResult);
}
