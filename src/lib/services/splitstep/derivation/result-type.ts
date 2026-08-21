/**
 * Point outcome and per-shot result.
 *
 * `calculate_match_stats` reads aces, double faults, service winners, winners,
 * unforced errors and the forehand/backhand breakdown EXCLUSIVELY from
 * `points.result_type`. Leaving it NULL is not the safe option it looks like:
 * every one of those stats then reads 0, and 0 is indistinguishable from a
 * clean match on screen.
 *
 * Two things it does NOT read, which shapes what we bother to derive:
 *   - `Forced Error` — `match_stats.forced_errors` is inserted as literal NULL,
 *     so the forced/unforced split is not consumed anywhere. Forced errors fold
 *     into the Unforced Error bucket by construction, and the column means
 *     "forced plus unforced" for this provider.
 *   - `shots.zone` — placement stats are recomputed from `landing_x` directly.
 *
 * Never emit 'Forehand Forced Error' or 'Backhand Forced Error': those strings
 * match neither `LIKE '%Winner%'` nor `LIKE '%Unforced Error%'`, so the point
 * would vanish from every aggregate rather than land in the wrong one.
 */

import type { SplitStepRally, SplitStepStroke } from './types';

/** Values `calculate_match_stats` can actually see. */
export type ResultType =
  | 'Double Fault'
  | 'Service Winner'
  | 'Forehand Winner'
  | 'Backhand Winner'
  | 'Overhead Winner'
  | 'Winner'
  | 'Forehand Unforced Error'
  | 'Backhand Unforced Error'
  | 'Overhead Unforced Error'
  | 'Unforced Error';

const SIDE_LABEL: Record<string, string> = {
  forehand: 'Forehand',
  backhand: 'Backhand',
  overhead: 'Overhead',
};

/** Index of the serve the point was actually played from. -1 when none. */
export function lastServeIndex(rally: SplitStepRally): number {
  let index = -1;
  rally.strokes.forEach((stroke, i) => {
    if (stroke.strokeType === 'serve') index = i;
  });
  return index;
}

/**
 * Classify how a point ended.
 *
 * The winner argument comes from the score fold, never from the `in` flag —
 * see winners.ts for why. That is what lets this stay a structural rule rather
 * than a guess: whoever struck last either won the point (a winner) or lost it
 * (an error), and nothing else needs to be inferred.
 *
 * `Ace` is deliberately never emitted. Distinguishing an ace from a service
 * winner needs to know whether the returner reached the ball, and nothing in
 * the payload records an attempted-and-missed swing — a missed swing simply is
 * not a stroke. Every unreturned serve therefore becomes `Service Winner`, and
 * `match_stats.aces` must be suppressed rather than published as 0.
 */
export function classifyPoint(
  rally: SplitStepRally,
  winner: string
): ResultType | null {
  const last = rally.strokes[rally.strokes.length - 1];
  if (!last) return null;

  const serveCount = rally.strokes.filter(
    (s) => s.strokeType === 'serve'
  ).length;

  if (last.strokeType === 'serve') {
    // Tested on the stroke's own type rather than on identity with the last
    // serve: 20 / 17 / 17 rallies across the three payloads carry a groundstroke
    // BETWEEN the two serves, so "the last serve" and "the last stroke" are not
    // the same object even in ordinary play.
    if (winner === rally.server) return 'Service Winner';
    if (serveCount >= 2) return 'Double Fault';
    // A lone serve that ended the point with the server LOSING is not a double
    // fault — there was no first fault. It is a fault whose second serve the
    // vendor did not emit, so no honest result_type exists for it.
    return null;
  }

  const side = last.strokeSide ? SIDE_LABEL[last.strokeSide] : null;
  const won = last.playerLabel === winner;

  if (won) return (side ? `${side} Winner` : 'Winner') as ResultType;
  return (side ? `${side} Unforced Error` : 'Unforced Error') as ResultType;
}

/** The `shots.result` vocabulary already in the table. */
export type ShotResult = 'In' | 'Out' | 'Net';

/**
 * Derive `shots.result` structurally rather than from the `in` flag.
 *
 * `in` reads false on 16% / 38% / 29% of strokes that have more strokes after
 * them in the same rally, which is impossible — if the opponent played the next
 * ball, this one was in. So rally position decides, and `in` is consulted only
 * where it cannot be contradicted.
 *
 * Returns null for a stroke played on a ball that was already dead (a swing at
 * a serve that had faulted), where no result is meaningful.
 */
export function shotResult(params: {
  stroke: SplitStepStroke;
  index: number;
  rally: SplitStepRally;
  serveIndex: number;
  winner: string;
}): ShotResult | null {
  const { stroke, index, rally, serveIndex, winner } = params;
  const isLast = index === rally.strokes.length - 1;
  const missed = stroke.netHit ? 'Net' : 'Out';

  if (index < serveIndex) {
    // Before the deciding serve. A serve here faulted; anything else is a
    // phantom swing at a dead ball and has no result.
    return stroke.strokeType === 'serve' ? missed : null;
  }

  if (stroke.strokeType === 'serve') {
    if (!isLast) return 'In';
    // The point ended on the serve. If the server won it, the serve was in and
    // unreturned — marking it Out would contradict the Service Winner we just
    // assigned and drop it from second_serves_in.
    return winner === rally.server ? 'In' : missed;
  }

  if (!isLast) return 'In';
  return stroke.playerLabel === winner ? 'In' : missed;
}

/**
 * Position of a stroke within a point, in the database's convention.
 *
 * Serves that faulted, and any stroke played before the deciding serve, take
 * shot_number 0 — an established convention here, where SwingVision already
 * files pre-point `Feed` rows at 0 and nothing joins on it. The deciding serve
 * is 1 and the return is 2, which is what `calculate_match_stats` assumes when
 * it joins `serve.shot_number = 1` to `ret.shot_number = 2`.
 *
 * The obvious alternative — mirroring SwingVision by giving both serves the
 * number 1 — is a trap. That join carries no shot_type or result filter, so two
 * rows at 1 fan it out; live production shows 1,550 returns producing 2,534
 * joined rows, with 170 returns counted as both Crosscourt and Down the Line.
 */
export function shotNumber(index: number, serveIndex: number): number {
  return index < serveIndex ? 0 : index - serveIndex + 1;
}
