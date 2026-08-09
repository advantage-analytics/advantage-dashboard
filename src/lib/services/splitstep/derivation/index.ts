/**
 * SplitStep derivation — public surface.
 *
 * This library is deliberately pure: it reads a results payload and returns
 * facts about it. It writes nothing.
 *
 * That is not tidiness, it is a schema constraint. `points.won_by_player1` is
 * NOT NULL and `shots.point_id` is NOT NULL, so there is no way to persist a
 * single derived shot without first committing to a winner for every point —
 * and the vendor emits no point-winner field. The two signals that could
 * stand in for one (score deltas, and the last stroke's in/net flags) agree on
 * 88% of points in one sample match and 43% in the other, with no way to tell
 * which is wrong on any given point.
 *
 * So until the vendor answers, a SplitStep match reaches "processed, analysis
 * pending" with a quality report attached and no statistics. See
 * docs/splitstep-vendor-questions.md for the open questions and the agreed
 * design for the point-winner engine.
 */

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
  metersToNormalized,
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
  type NormalizedPosition,
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
