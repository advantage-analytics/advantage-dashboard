/**
 * Serve statistics — reported as brackets, not point estimates.
 *
 * Vendor question Q1 is answered by the data: faulted serves ARE emitted as
 * strokes. Across both sample matches, 47/156 and 55/168 rallies carry two
 * `serve` strokes separated by 7–45 seconds. So the first/second split by
 * ordinal within the rally is sound, and maps directly onto our
 * `shots.shot_type` values 'First Serve' and 'Second Serve'.
 *
 * What is NOT sound is the `in` flag on a serve. Two independent readings of
 * the same payload disagree badly:
 *
 *   by rally structure — a first serve faulted iff a second serve follows it
 *   by the in flag     — a first serve faulted iff `in` is false
 *
 * On the sample matches those give first-serve-in rates roughly 18 and 26
 * points apart, and double-fault counts that differ by about 7x. The cause is
 * visible in the geometry: serves the vendor calls out land a median of 0.69 m
 * and 1.58 m past the service line, a systematic long bias rather than noise,
 * and dozens of rallies show a lone `in: false` serve that the returner then
 * played with no second serve anywhere in the rally.
 *
 * There is no third signal to arbitrate, so this module refuses to pick. It
 * returns both readings and the spread between them. The spread is the honest
 * error bar: quality.ts turns it into a confidence grade, and no serve number
 * reaches a user until the vendor explains the flag.
 * See docs/splitstep-vendor-questions.md.
 */

import { serveCourtSide } from './court';
import type { SplitStepRally } from './types';

/** One reading of the serve data. Two of these make a bracket. */
export interface ServeReading {
  /** Service points where the first serve landed in. */
  firstServesIn: number;
  /** Service points, i.e. rallies containing at least one serve. */
  servicePoints: number;
  /** firstServesIn / servicePoints, 0–1. */
  firstServePercentage: number;
  /** Service points lost to a double fault. */
  doubleFaults: number;
}

export interface ServeBracket {
  /**
   * Trusts rally structure, ignores the `in` flag: a first serve counts as in
   * unless a second serve follows it, and a point is a double fault only when
   * the rally ends on the second serve with nothing after it.
   *
   * This is the upper bound on first-serve percentage and the lower bound on
   * double faults.
   */
  byRallyStructure: ServeReading;
  /**
   * Requires both signals to agree: a first serve counts as in only when the
   * flag says so AND no second serve follows. A double fault is any two-serve
   * rally whose second serve is flagged out.
   *
   * This is the lower bound on first-serve percentage and the upper bound on
   * double faults.
   */
  byInFlag: ServeReading;
  /**
   * Percentage points between the two first-serve readings. This is the
   * number that decides whether a serve statistic is publishable.
   */
  firstServeSpread: number;
  /** Absolute difference between the two double-fault counts. */
  doubleFaultSpread: number;
}

/** Deuce/ad split of the serves in a match, from server position at contact. */
export interface ServeSideCounts {
  deuce: number;
  ad: number;
  unknown: number;
}

/**
 * Aces are not derivable from this payload and this function documents why.
 *
 * An ace is a serve the returner never touched. Nothing in the stroke stream
 * says whether a stroke was attempted and missed — a missed swing simply is
 * not emitted — so "no stroke followed the serve" covers aces, service
 * winners, and detection failures alike. Both sample matches yield 1 and 4
 * candidates, against 67 aces and 486 service winners in our existing data.
 *
 * Returned as a candidate count for the quality report. Never write it to
 * `points.result_type`.
 */
export function aceCandidates(rallies: SplitStepRally[]): number {
  return rallies.filter(
    (rally) =>
      rally.strokes.length === 1 &&
      rally.strokes[0]?.strokeType === 'serve' &&
      rally.strokes[0]?.in
  ).length;
}

/** Deuce/ad split across every rally's opening serve. */
export function serveSideCounts(rallies: SplitStepRally[]): ServeSideCounts {
  const counts: ServeSideCounts = { deuce: 0, ad: 0, unknown: 0 };

  for (const rally of rallies) {
    const serve = rally.serves[0];
    if (!serve) {
      counts.unknown += 1;
      continue;
    }
    const side = serveCourtSide(serve.playerX, serve.playerY);
    if (side === 'deuce') counts.deuce += 1;
    else if (side === 'ad') counts.ad += 1;
    else counts.unknown += 1;
  }

  return counts;
}

function percentage(part: number, whole: number): number {
  return whole === 0 ? 0 : part / whole;
}

/** Compute both readings and the spread between them. */
export function serveBracket(rallies: SplitStepRally[]): ServeBracket {
  const servicePoints = rallies.filter((rally) => rally.serves.length > 0);
  const total = servicePoints.length;

  let structureIn = 0;
  let structureDoubleFaults = 0;
  let flagIn = 0;
  let flagDoubleFaults = 0;

  for (const rally of servicePoints) {
    const firstServe = rally.serves[0];
    const onlyServe = rally.serves.length === 1;
    // The serve the point was actually decided on. Reading serves[1] assumed
    // a rally can never hold more than two, which neither the docs nor the
    // vendor confirm — Q2 (let handling) is still open, and a replayed let
    // would land here as a third serve. Taking the last one keeps the
    // double-fault tests pointed at the deciding serve either way.
    const decidingServe = rally.serves[rally.serves.length - 1];
    const lastStroke = rally.strokes[rally.strokes.length - 1];

    // --- by rally structure ---
    // A further serve is the vendor telling us the previous one faulted.
    // Absence of one is the strongest evidence available that the first serve
    // was legal, because play continued from it.
    if (onlyServe) structureIn += 1;
    // A double fault ends the point on the serve. If any stroke follows the
    // deciding serve, the returner played it, so it was in whatever the flag
    // says.
    if (!onlyServe && lastStroke === decidingServe) structureDoubleFaults += 1;

    // --- by in flag ---
    if (onlyServe && firstServe?.in) flagIn += 1;
    if (!onlyServe && decidingServe && !decidingServe.in) flagDoubleFaults += 1;
  }

  const byRallyStructure: ServeReading = {
    firstServesIn: structureIn,
    servicePoints: total,
    firstServePercentage: percentage(structureIn, total),
    doubleFaults: structureDoubleFaults,
  };

  const byInFlag: ServeReading = {
    firstServesIn: flagIn,
    servicePoints: total,
    firstServePercentage: percentage(flagIn, total),
    doubleFaults: flagDoubleFaults,
  };

  return {
    byRallyStructure,
    byInFlag,
    firstServeSpread: Math.abs(
      byRallyStructure.firstServePercentage - byInFlag.firstServePercentage
    ),
    doubleFaultSpread: Math.abs(
      byRallyStructure.doubleFaults - byInFlag.doubleFaults
    ),
  };
}

/**
 * Serve ordinal → our `shots.shot_type` value.
 *
 * Safe to use: it depends only on position within the rally, which all three
 * real payloads confirm is reliable.
 *
 * Every ordinal above 0 maps to 'Second Serve' because that is the whole of
 * the `shots.shot_type` serve vocabulary — there is no third value to emit. A
 * rally with three serves (a replayed let, per open question Q2, or two points
 * merged) therefore loses the distinction here. Callers that need to know
 * should read `rally.serves.length` rather than infer it from this.
 */
export function serveShotType(ordinal: number): 'First Serve' | 'Second Serve' {
  return ordinal === 0 ? 'First Serve' : 'Second Serve';
}
