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
 * Tried and rejected (2026-09-28): turning an out-called second serve with a
 * 1–2 stroke tail into a Double Fault when the server lost. Checked against
 * video on 10 such points across three matches, only 2 were double faults —
 * the vendor's out call on a second serve that was played on is not evidence.
 */

import { POINT_FLAGS } from "./flags";
import { lastServeIndex } from "./result-type";
import type { SplitStepRally } from "./types";

export interface PlayedRally {
  /** The rally with phantom strokes removed. Serves are never removed. */
  rally: SplitStepRally;
  phantoms: number;
  /** Point flags recording what was removed. */
  flags: string[];
}

export function playedRally(rally: SplitStepRally): PlayedRally {
  const serveIndex = lastServeIndex(rally);
  const strokes = rally.strokes.filter(
    (s, i) => !(i < serveIndex && s.strokeType !== "serve"),
  );
  const phantoms = rally.strokes.length - strokes.length;

  return {
    rally: phantoms ? { ...rally, strokes } : rally,
    phantoms,
    flags: phantoms ? [POINT_FLAGS.PHANTOM_STROKES_DROPPED] : [],
  };
}
