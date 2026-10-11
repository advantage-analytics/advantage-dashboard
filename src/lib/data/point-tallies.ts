import {
  emptyOutcomeTally,
  OUTCOME_KEYS,
  outcomeTally,
  rallyBands,
  type OutcomeTally,
  type RallyBands,
  type TallyPoint,
} from "@/components/dashboard/matches/match-detail/match-filters/model";

/**
 * The match report's two point tallies (`rallyBands`, `outcomeTally` in
 * `match-filters/model.ts`) summed over a season for the personal Statistics
 * page.
 *
 * The viewer's seat differs per match there, so each match's points are
 * tallied with THAT match's own `isPlayer1` and `isDerived`, then the
 * tallies are added — never one call with one seat for every point, which
 * would credit the viewer's wins to the opponent wherever they sat on the
 * other side (guardrails §4). Pure: no React, no `next/*`.
 *
 * One known gap from the report card: a `StatisticsPoint` carries no shot
 * rows, so `winnerHitBy` / `errorMadeBy` take their no-shot fallback here
 * (the point's winner for a winner, its loser for an unforced error) where
 * the report reads the decisive shot's hitter. The side is still the
 * match's own seat; a season figure may differ by a point or two from the
 * same match's card wherever the last shot's hitter is not the point's
 * winner or loser.
 */

/** What a season tally needs of each match: its id, the viewer's seat, its kind. */
export interface TallySeat {
  id: string;
  /** The VIEWER's seat in this match — never player1 by default. */
  isPlayer1: boolean;
  /** An Advantage Intelligence match: its aces are its unreturned serves. */
  isDerived: boolean;
}

/** A point that knows its match — `StatisticsPoint`'s shape. */
export type SeasonPoint = TallyPoint & { matchId: string };

/**
 * Each match's points, bucketed by id — only for the matches given, so a
 * point of a match outside the set (filtered out) is dropped here and
 * counted nowhere.
 */
function pointsByMatch(
  points: readonly SeasonPoint[],
  matches: readonly TallySeat[],
): Map<string, SeasonPoint[]> {
  const buckets = new Map<string, SeasonPoint[]>();
  for (const match of matches) buckets.set(match.id, []);
  for (const point of points) buckets.get(point.matchId)?.push(point);
  return buckets;
}

/** `rallyBands` over a set of matches: per match with its seat, then summed. */
export function rallyBandsAcross(
  points: readonly SeasonPoint[],
  matches: readonly TallySeat[],
): RallyBands {
  const buckets = pointsByMatch(points, matches);
  const sum = rallyBands([], true);
  for (const match of matches) {
    const own = rallyBands(buckets.get(match.id) ?? [], match.isPlayer1);
    sum.total += own.total;
    sum.shots += own.shots;
    for (let i = 0; i < sum.bands.length; i += 1) {
      sum.bands[i].count += own.bands[i].count;
      sum.bands[i].youWon += own.bands[i].youWon;
      sum.bands[i].oppWon += own.bands[i].oppWon;
    }
  }
  sum.avgShots = sum.total > 0 ? sum.shots / sum.total : 0;
  return sum;
}

export interface OutcomeTallies {
  /** The viewer's own outcomes, summed over the matches. */
  you: OutcomeTally;
  /** The opponents', summed likewise. */
  opp: OutcomeTally;
  /** Matches that held at least one point — the divisor for a per-match mean. */
  matchesWithPoints: number;
}

/**
 * `outcomeTally` for both sides over a set of matches: per match with that
 * match's seat and derived-aces rule, then summed.
 */
export function outcomeTalliesAcross(
  points: readonly SeasonPoint[],
  matches: readonly TallySeat[],
): OutcomeTallies {
  const buckets = pointsByMatch(points, matches);
  const you = emptyOutcomeTally();
  const opp = emptyOutcomeTally();
  let matchesWithPoints = 0;
  for (const match of matches) {
    const own = buckets.get(match.id) ?? [];
    if (own.length === 0) continue;
    matchesWithPoints += 1;
    const mine = outcomeTally(own, match.isPlayer1, match.isDerived);
    const theirs = outcomeTally(own, !match.isPlayer1, match.isDerived);
    for (const key of OUTCOME_KEYS) {
      you[key] += mine[key];
      opp[key] += theirs[key];
    }
  }
  return { you, opp, matchesWithPoints };
}
