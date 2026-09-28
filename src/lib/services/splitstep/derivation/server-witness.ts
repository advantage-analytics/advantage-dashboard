/**
 * Who served each point, without trusting the vendor's player labels — STUDY
 * ONLY, not yet read by derivation.
 *
 * The vendor's labels and its score stream drift together: on the labelled
 * match (Ace v Goodman, 1415029e, 2026-09-28) they named the wrong server on
 * 4 of 87 points and lagged the real game by ~2 points in stretches, which is
 * where most wrongly-credited points came from. This witness uses none of
 * that. It needs three facts:
 *
 *   1. Which end each point was served from: the sign of the deciding serve's
 *      `playerY` (+y = top of frame).
 *   2. Who stood at the top at the start: the wizard's
 *      `initial_top_player_is_player1`.
 *   3. When the players changed ends. A changeover (after games 1, 3, 5, …)
 *      is a 90-second break, so the time from one serve to the next is long:
 *      85–141 s on the labelled match, against at most 58 s for a game change
 *      without one. Longer still is a set break or a stoppage (232 s and
 *      588 s there), which is NOT treated as a swap.
 *
 * Result on the labelled match: 86 of 87 servers right, against the vendor's
 * 83; right on all four the vendor got wrong. The one miss (point 28) may be
 * the label's. The players file was tried first as a continuity tracker and
 * failed (44 of 87): players leave the frame at changeovers, so a track keeps
 * its end rather than its player. It has no player id.
 *
 * Known gaps before derivation may read this:
 *   - a set break with an odd game count DOES swap ends; the gap cap below
 *     ignores it. The set boundary has to come from the score to handle it.
 *   - the thresholds are from one match. Re-measure with
 *     scripts/splitstep-eval.ts on every newly labelled one.
 *
 * Pure: no I/O.
 */

import { lastServeIndex } from "./result-type";
import type { SplitStepRally } from "./types";

/** Shortest serve-to-serve time read as a changeover. */
export const CHANGEOVER_MIN_GAP_S = 80;
/** Longest; beyond it the break is a set break or a stoppage. */
export const CHANGEOVER_MAX_GAP_S = 180;

/**
 * The server of each rally, in order, by end of court and changeovers.
 * Null where the deciding serve has no position.
 */
export function serversByChangeover(
  rallies: readonly SplitStepRally[],
  topAtStart: string,
  bottomAtStart: string,
): (string | null)[] {
  let top = topAtStart;
  let bottom = bottomAtStart;
  let previousServeTime: number | null = null;

  return rallies.map((rally) => {
    const serve = rally.strokes[lastServeIndex(rally)] ?? rally.strokes[0];
    if (!serve) return null;

    if (previousServeTime !== null) {
      const gap = serve.videoTime - previousServeTime;
      if (gap > CHANGEOVER_MIN_GAP_S && gap <= CHANGEOVER_MAX_GAP_S) {
        [top, bottom] = [bottom, top];
      }
    }
    previousServeTime = serve.videoTime;

    if (serve.playerY === null || serve.playerY === 0) return null;
    return serve.playerY > 0 ? top : bottom;
  });
}
