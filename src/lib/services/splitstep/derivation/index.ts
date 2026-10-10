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
 * 0.3.1 (2026-09-27) resolves tiebreak points across a serve rotation
 * (winners.ts rule 2); before it, every match with a tiebreak was refused.
 * 0.3.2 (2026-09-28) folds under the ad rule the vendor was told
 * (processing_jobs.ad_scoring) instead of matches.format's; only the
 * break/set/match-point flags can differ.
 * 0.4.1 (2026-09-28) keeps a trailing run of rallies whose score stream reset
 * to 0-0 / 0-0 / no set (collapsedTailStart in rallies.ts): they fold into the
 * last real game and take the last stroke's guess as winner, flagged
 * `winner_guessed`. Before it, such a match was refused for points that
 * resolved no winner. Numbered past 0.4.0 (phantom strokes, played.ts), which
 * was already stamped on live rows from another branch.
 * 0.4.2 (2026-09-28) lands 0.4.0's phantom-stroke drop on top of 0.4.1: a
 * non-serve stroke before the deciding serve no longer reaches shots
 * (played.ts, point flag `phantom_strokes_dropped`). It also adds the
 * review-only `second_serve_called_out` flag and stops flagging
 * `service_court_repeat` on a no-ad deciding point, where the receiver picks
 * the side.
 * 0.5.0 (2026-09-28) reads the trajectories file for our own line calls
 * (line-calls.ts). When the ball before a derived winner bounced outside the
 * singles lines, the winner's stroke is dropped as a dead ball and the point
 * becomes an error by the out ball's hitter (played.ts,
 * `winner_to_error_by_bounce`) — an autofix on 6 of 6 from one labelled
 * match, with its reconsideration criteria in played.ts. A near-line or
 * confidently-out ball flags `ending_suspect_line` for review instead. A job
 * with no trajectories file derives exactly as 0.4.2.
 * 0.6.0 (2026-09-29) demotes `winner_to_error_by_bounce` to a review flag:
 * two more labelled matches took it to 14 of 18, under the 90% line
 * played.ts set in advance, so the dead ball is no longer dropped and the
 * vendor's ending stands. Adds two review flags on the score stream (flags.ts):
 * `tiebreak_score_off_six_all` (tiebreak point scores while games are not
 * 6-6 — Quan v Harazaki's real 5-7 set) and `score_side_mismatch` (points
 * played in the game say one court, the server's stance says the other).
 * 0.7.0 (2026-09-30) stops refusing a match for points the score stream
 * cannot resolve. A run of 8+ identical score readings (frozen.ts) is split
 * into games from the serve's end and court, the server alternating game by
 * game and the strokes relabelled to match; its points take the last stroke's
 * guess, flagged `winner_guessed` + `score_frozen`, with null score columns.
 * A shorter stall inside a game keeps the vendor's game and guesses the same
 * way. Job ac56ef8b (Quan v Balciunas) froze for all of set two.
 */
export const DERIVATION_VERSION = "0.7.0-unreconciled";

export type {
  RawSplitStepStroke,
  SplitStepStroke,
  SplitStepRally,
  StrokeType,
  StrokeSide,
} from "./types";

export {
  parseStrokes,
  normalizeStroke,
  GEOMETRY_BOUNDS,
  type ParseOptions,
  type ParseResult,
} from "./parse";

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
} from "./court";

export {
  groupIntoRallies,
  playerLabels,
  opponentOf,
  rallyDuration,
  collapsedTailStart,
  type RallyGrouping,
} from "./rallies";

export {
  FROZEN_MIN_RALLIES,
  frozenStretches,
  frozenGameStarts,
  withServer,
  type FrozenStretch,
} from "./frozen";

export {
  playerAtEnd,
  serveEnd,
  type CourtEnd,
  type EndSchedule,
} from "./position";

export {
  proposeSegmentation,
  SEGMENT_COSTS,
  type CostRow,
  type ProposedGame,
  type RallyOutcome,
  type SegmentationInput,
  type SegmentationProposal,
  type ServeSide,
} from "./segmentation";

export {
  serveBracket,
  serveShotType,
  serveSideCounts,
  aceCandidates,
  type ServeBracket,
  type ServeReading,
  type ServeSideCounts,
} from "./serves";

export {
  scoreQuality,
  type QualityReport,
  type QualityCheck,
  type QualityGrade,
  type CheckVerdict,
} from "./quality";

export { serveZone, directionZone } from "./court";

export {
  resolvePointWinners,
  resolveWinner,
  lastStrokeWinner,
  type PointWinner,
  type WinnerResolution,
} from "./winners";

export {
  reconcile,
  foldGames,
  scoreIsSelfMirroring,
  type MatchScore,
  type Reconciliation,
} from "./reconcile";

export {
  classifyPoint,
  shotResult,
  shotNumber,
  lastServeIndex,
  type ResultType,
  type ShotResult,
} from "./result-type";

export {
  flagPoint,
  flagStroke,
  pointsPlayed,
  POINT_FLAGS,
  SHOT_FLAGS,
} from "./flags";
export { playedRally, type PlayedRally } from "./played";
export {
  lineCallsFor,
  singlesMargin,
  type LineCall,
  type LineCalls,
} from "./line-calls";
export {
  serversByChangeover,
  CHANGEOVER_MIN_GAP_S,
  CHANGEOVER_MAX_GAP_S,
} from "./server-witness";
export {
  groupTrajectories,
  flightSamples,
  type TrajectoryFlight,
  type TrajectoryRow,
  type BallSample,
} from "./trajectory";

export { pressureFor, type PressureFlags } from "./pressure";

export { ACCEPT_UNRECONCILED_FOLD } from "./reconcile";

export {
  buildTranscript,
  proposedPointsOf,
  type ProposedPoint,
  type Transcript,
  type DerivedPoint,
  type DerivedShot,
  type BuildOptions,
} from "./transcript";

export { fitFrameToTime, bounceVideoTimes } from "./frame-clock";

export {
  deriveBallPaths,
  BALL_PATHS_VERSION,
  type BallPathSample,
  type BallPathStroke,
  type BallPathsFile,
} from "./ball-paths";

import { parseStrokes, type ParseOptions } from "./parse";
import { groupIntoRallies, playerLabels } from "./rallies";
import { aceCandidates, serveBracket, serveSideCounts } from "./serves";
import { scoreQuality } from "./quality";
import type { QualityReport } from "./quality";
import type { ServeBracket, ServeSideCounts } from "./serves";
import type { SplitStepRally, SplitStepStroke } from "./types";

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
  options: ParseOptions = {},
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
