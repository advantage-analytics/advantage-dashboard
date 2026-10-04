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
 * A dead ball after the point ended is FLAGGED, not removed: the ball before
 * the last stroke bounced outside the singles lines (per the trajectories
 * file) and the other player hit it back anyway, so the vendor's winner may
 * really be an error by the out ball's hitter. `winner_to_error_by_bounce`
 * marks it for review; the rally, winner and result_type stay the vendor's.
 *
 * DEMOTED 2026-09-29. It shipped in 0.5.0 as an autofix that dropped the last
 * stroke, on 6 of 6 from one labelled match (Ace v Goodman, 1415029e). Two
 * more labelled matches took it to 14 of 18 (Emon v Roger 45ff4bd7: 3 of 5,
 * Quan v Harazaki b74a1e04: 5 of 7). Two of the misses were real winners the
 * player hit after the ball before landed in. That tripped the rule set here
 * in advance: demote below 90% on 10+ firings. Re-promote only at 30+
 * firings across 2+ matches at 95%+, re-scored with scripts/splitstep-eval.ts.
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
  /** The rally with phantom strokes removed. Serves are never removed. */
  rally: SplitStepRally;
  phantoms: number;
  /** Point flags recording what was removed, or what looks like a dead ball. */
  flags: string[];
}

export function playedRally(
  rally: SplitStepRally,
  options: { winner?: string | null; lineCalls?: LineCalls } = {},
): PlayedRally {
  const { winner = null, lineCalls } = options;
  const serveIndex = lastServeIndex(rally);
  const strokes = rally.strokes.filter(
    (s, i) => !(i < serveIndex && s.strokeType !== "serve"),
  );
  const phantoms = rally.strokes.length - strokes.length;
  const flags: string[] = phantoms ? [POINT_FLAGS.PHANTOM_STROKES_DROPPED] : [];

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
    flags.push(POINT_FLAGS.WINNER_TO_ERROR_BY_BOUNCE);
  }

  return {
    rally: phantoms ? { ...rally, strokes } : rally,
    phantoms,
    flags,
  };
}
