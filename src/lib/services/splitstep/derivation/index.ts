/**
 * SplitStep derivation — public surface.
 *
 * This library is deliberately pure: it reads a results payload and returns
 * facts about it. It writes nothing.
 *
 * The vendor emits no point-winner field, and `points.won_by_player1` is NOT
 * NULL, so for a while it looked as though nothing could be persisted at all.
 * That was too pessimistic. A third payload, from a match whose true final
 * score we hold, showed the vendor's score stream folds forward to that score
 * exactly — 20 games, 12-8, 6-4 and 6-4 — and yields a winner for 94-99% of
 * points across all three matches. The winner is derivable, and `matches.score`
 * checks it.
 *
 * What is still missing is the outcome *type*: winner vs forced vs unforced
 * error, and ace vs service winner. Nothing in the payload says whether a
 * returner reached a ball, so those are not recoverable at any confidence.
 *
 * This library stays read-only because the write path needs the reconciliation
 * gate built first — a match whose fold does not match the user's entered score
 * must be refused, not published. That is the next piece of work, not a
 * permanent state. See docs/splitstep-vendor-questions.md §5 and §6.
 *
 * Note for whoever builds it: do NOT feed the last stroke's in/net_hit flags
 * into the winner decision. They agree with the score stream on 90% of points
 * in a well-tracked match and 43% in a badly-tracked one, and the score stream
 * is the half that reproduces reality.
 */

/**
 * Version tag for whatever this library currently computes.
 *
 * Written to `processing_jobs.derivation_version` alongside every quality
 * report, so a report can be traced to the code that produced it. Bump it
 * whenever a threshold moves, a check is added or removed, or the parse layer
 * changes what it discards — all three change the grade for the same input,
 * and a grade you cannot attribute to a version is a grade you cannot compare.
 *
 * The suffix marks the scope. `-transcript` (0.2.0) derived points and shots
 * behind the score-reconciliation gate and published statistics with the
 * unmeasurable families suppressed. `-unreconciled` (0.3.0, 2026-09-02) is the
 * temporary "vendor as truth" build: the gate is bypassed
 * (ACCEPT_UNRECONCILED_FOLD in reconcile.ts) and the suppression call is
 * commented out in derive-and-publish.ts. Rows written under this tag were NOT
 * verified against the entered score and must be rebuilt when the gate returns.
 */
export const DERIVATION_VERSION = '0.3.0-unreconciled';

export type {
  RawSplitStepStroke,
  SplitStepStroke,
  SplitStepRally,
  StrokeType,
  StrokeSide,
} from './types';

export {
  parseStrokes,
  normalizeStroke,
  GEOMETRY_BOUNDS,
  type ParseOptions,
  type ParseResult,
} from './parse';

export {
  metersToCourtFrame,
  kmhToMph,
  serveCourtSide,
  isInServiceBox,
  isPlausibleCourtPosition,
  SINGLES_HALF_WIDTH_M,
  DOUBLES_HALF_WIDTH_M,
  SERVICE_LINE_M,
  BASELINE_M,
  MAX_PLAUSIBLE_X_M,
  MAX_PLAUSIBLE_Y_M,
  type CourtPosition,
} from './court';

export {
  groupIntoRallies,
  playerLabels,
  opponentOf,
  rallyDuration,
  type RallyGrouping,
} from './rallies';

export {
  serveBracket,
  serveShotType,
  serveSideCounts,
  aceCandidates,
  type ServeBracket,
  type ServeReading,
  type ServeSideCounts,
} from './serves';

export {
  scoreQuality,
  type QualityReport,
  type QualityCheck,
  type QualityGrade,
  type CheckVerdict,
} from './quality';

export {
  serveZone,
  directionZone,
} from './court';

export {
  resolvePointWinners,
  resolveWinner,
  type PointWinner,
  type WinnerResolution,
} from './winners';

export {
  reconcile,
  foldGames,
  scoreIsSelfMirroring,
  type MatchScore,
  type Reconciliation,
} from './reconcile';

export {
  classifyPoint,
  shotResult,
  shotNumber,
  lastServeIndex,
  type ResultType,
  type ShotResult,
} from './result-type';

export { flagPoint, flagStroke, POINT_FLAGS, SHOT_FLAGS } from './flags';

export { pressureFor, type PressureFlags } from './pressure';

export { ACCEPT_UNRECONCILED_FOLD } from './reconcile';

export {
  buildTranscript,
  type Transcript,
  type DerivedPoint,
  type DerivedShot,
  type BuildOptions,
} from './transcript';

import { parseStrokes, type ParseOptions } from './parse';
import { groupIntoRallies, playerLabels } from './rallies';
import { aceCandidates, serveBracket, serveSideCounts } from './serves';
import { scoreQuality } from './quality';
import type { QualityReport } from './quality';
import type { ServeBracket, ServeSideCounts } from './serves';
import type { SplitStepRally, SplitStepStroke } from './types';

export interface AnalysisResult {
  strokes: SplitStepStroke[];
  rallies: SplitStepRally[];
  /** Vendor's free-text player labels, in order of first appearance. */
  players: string[];
  quality: QualityReport;
  serves: ServeBracket;
  serveSides: ServeSideCounts;
  /** Rallies that look like an ace but cannot be distinguished from one. */
  aceCandidates: number;
  /** Rows the parse layer discarded as structurally unusable. */
  droppedStrokes: number;
  /** Rallies whose stroke numbering was not 1..n. */
  malformedNumbering: number[];
  /** Rallies that did not open on a serve. */
  missingOpeningServe: number[];
}

/**
 * Run the full read-only analysis over a raw results payload.
 *
 * Pass `startTimeSeconds` from `processing_jobs.start_time_seconds` so every
 * timestamp comes back relative to the original video rather than the trimmed
 * one the vendor processed.
 */
export function analyzeResults(
  raw: unknown,
  options: ParseOptions = {}
): AnalysisResult {
  const { strokes, droppedCount } = parseStrokes(raw, options);
  const { rallies, malformedNumbering, missingOpeningServe } =
    groupIntoRallies(strokes);

  return {
    strokes,
    rallies,
    players: playerLabels(strokes),
    quality: scoreQuality(strokes, rallies),
    serves: serveBracket(rallies),
    serveSides: serveSideCounts(rallies),
    aceCandidates: aceCandidates(rallies),
    droppedStrokes: droppedCount,
    malformedNumbering,
    missingOpeningServe,
  };
}
