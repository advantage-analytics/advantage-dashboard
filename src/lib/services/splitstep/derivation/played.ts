/**
 * The strokes that were actually played, as opposed to every swing detected.
 *
 * A phantom — a non-serve stroke between a faulted serve and the next serve,
 * the receiver striking a fault back — was persisted at shot_number 0, tied
 * with the faulted serve, and every "first non-serve row" reader
 * (serve-return-shots.ts, film-shots.ts) took it as the point's return. It is
 * removed here, before any row is built, so numbering, results, result_type,
 * flags and rally length all read the same stroke list. The raw vendor payload
 * still holds every stroke.
 *
 * The second removal is a dead ball after the point ended: the ball before
 * the last stroke bounced outside the singles lines, and the other player hit
 * it back anyway. The vendor keeps that swing, so the point reads as a winner
 * by the player who hit the dead ball. Dropping it makes the out ball the
 * last stroke, and classifyPoint then reads an error by its hitter. The point
 * winner does not change; only how the point ended does.
 *
 * AUTOFIX ON SMALL EVIDENCE — reconsider as labels arrive. It was 6 of 6 on
 * the one hand-labelled match (Ace v Goodman, 1415029e, 2026-09-28), and it
 * missed 13 other winner→error points. Re-run scripts/splitstep-eval.ts on
 * every newly labelled match, then:
 *   - keep it once it reaches 30+ firings across 2+ matches at 95%+ precision;
 *   - demote it to the `ending_suspect_line` flag the first time precision
 *     falls below 90% on 10+ firings;
 *   - widen the threshold (0 → 0.3 m inside) only if that also holds 95%.
 * It needs trajectory evidence: the strokes file's own bounce was missing on 8
 * of the 33 balls measured, and was never tested as the trigger.
 *
 * Tried and rejected (2026-09-28): turning an out-called second serve with a
 * 1–2 stroke tail into a Double Fault when the server lost. Checked against
 * video on 10 such points across three matches, only 2 were double faults —
 * the vendor's out call on a second serve that was played on is not evidence.
 */

import { POINT_FLAGS } from "./flags";
import type { LineCalls } from "./line-calls";
import { lastServeIndex } from "./result-type";
import type { SplitStepRally } from "./types";

export interface PlayedRally {
  /** The rally with dead-ball strokes removed. Serves are never removed. */
  rally: SplitStepRally;
  phantoms: number;
  /** 1 when the last stroke was dropped as a dead ball after an out ball. */
  deadBall: number;
  /** Point flags recording what was removed. */
  flags: string[];
}

export function playedRally(
  rally: SplitStepRally,
  options: { winner?: string | null; lineCalls?: LineCalls } = {},
): PlayedRally {
  const { winner = null, lineCalls } = options;
  const serveIndex = lastServeIndex(rally);
  let strokes = rally.strokes.filter(
    (s, i) => !(i < serveIndex && s.strokeType !== "serve"),
  );
  const phantoms = rally.strokes.length - strokes.length;
  const flags: string[] = phantoms ? [POINT_FLAGS.PHANTOM_STROKES_DROPPED] : [];

  let deadBall = 0;
  const last = strokes[strokes.length - 1];
  const before = strokes[strokes.length - 2];
  const call = before && lineCalls?.get(before);
  if (
    winner &&
    last &&
    before &&
    last.strokeType !== "serve" &&
    before.strokeType !== "serve" &&
    last.playerLabel === winner &&
    before.playerLabel !== winner &&
    call?.source === "trajectory" &&
    call.margin !== null &&
    call.margin < 0
  ) {
    strokes = strokes.slice(0, -1);
    deadBall = 1;
    flags.push(POINT_FLAGS.WINNER_TO_ERROR_BY_BOUNCE);
  }

  return {
    rally: phantoms || deadBall ? { ...rally, strokes } : rally,
    phantoms,
    deadBall,
    flags,
  };
}
