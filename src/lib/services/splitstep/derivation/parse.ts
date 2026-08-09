/**
 * SplitStep results JSON → normalized strokes.
 *
 * This is the ONLY place sentinels are handled. Spec §4.1 and handoff §6 both
 * call this non-negotiable, and the reason is that the failure is invisible:
 * a single -9999 surviving into AVG(speed) corrupts a match's statistics
 * without erroring, without looking wrong in the UI, and without appearing in
 * any log.
 *
 * Three sentinel forms exist in the wild:
 *   -9999.0   float fields (bounce_x_m, height_at_net_m, bounce_score, …)
 *   -9999     integer fields (bounce_frame)
 *   "None"    string fields (every ground-truth column, in 100% of rows)
 *
 * A fourth failure mode is not a sentinel at all and the spec does not mention
 * it: coordinates that are numerically fine but physically impossible, up to
 * `bounce_y_m: 371.7` on a court that ends at 11.885. One of the two sample
 * matches carries these on 22% of strokes. They are nulled here too.
 */

import {
  isPlausibleCourtPosition,
  MAX_PLAUSIBLE_X_M,
  MAX_PLAUSIBLE_Y_M,
} from './court';
import type {
  RawSplitStepStroke,
  SplitStepStroke,
  StrokeSide,
  StrokeType,
} from './types';

/** Numeric sentinel the vendor uses for "not measured". */
const NUMERIC_SENTINEL = -9999;
/** String sentinel the vendor uses for "not provided". */
const STRING_SENTINEL = 'None';

const STROKE_TYPES: readonly string[] = ['serve', 'groundstroke', 'volley'];
const STROKE_SIDES: readonly string[] = ['forehand', 'backhand', 'overhead'];

/** A numeric field, or null if it carries the sentinel or isn't finite. */
function num(value: unknown): number | null {
  if (typeof value !== 'number') return null;
  if (!Number.isFinite(value)) return null;
  // Compare with a tolerance: the sentinel appears as both -9999 and -9999.0,
  // and float round-tripping through JSON has been observed to shift it.
  if (Math.abs(value - NUMERIC_SENTINEL) < 1) return null;
  return value;
}

/** A string field, or null if it carries the sentinel or is blank. */
function str(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed === STRING_SENTINEL) return null;
  // Both `nan-nan` and `NaN` have been seen in pred_set_score.
  if (/^nan([.-]|$)/i.test(trimmed)) return null;
  return trimmed;
}

function strokeType(value: unknown): StrokeType | null {
  const s = str(value)?.toLowerCase();
  return s && STROKE_TYPES.includes(s) ? (s as StrokeType) : null;
}

function strokeSide(value: unknown): StrokeSide | null {
  const s = str(value)?.toLowerCase();
  return s && STROKE_SIDES.includes(s) ? (s as StrokeSide) : null;
}

/**
 * A coordinate pair, nulled together.
 *
 * Nulled as a pair on purpose: half a position is worse than none. A valid x
 * with a corrupt y would place a bounce at a real sideline and a nonsense
 * depth, which reads as a plausible shot on a court diagram.
 */
function position(
  rawX: unknown,
  rawY: unknown
): { x: number | null; y: number | null } {
  const x = num(rawX);
  const y = num(rawY);
  if (x === null || y === null) return { x: null, y: null };
  if (!isPlausibleCourtPosition(x, y)) return { x: null, y: null };
  return { x, y };
}

export interface ParseOptions {
  /**
   * Trim start, in seconds, relative to the original video.
   *
   * The vendor's `time` is relative to the TRIMMED video they processed. Our
   * `points.video_time` / `shots.video_time` are relative to the original,
   * because that is what the player component seeks against. Adding the offset
   * here — once, at the boundary — is the whole of spec §3.6.
   */
  startTimeSeconds?: number;
}

export interface ParseResult {
  strokes: SplitStepStroke[];
  /** Rows dropped for being structurally unusable (no rally id, no time). */
  droppedCount: number;
}

/**
 * Normalize one raw stroke. Exported for tests; callers want parseStrokes.
 */
export function normalizeStroke(
  raw: RawSplitStepStroke,
  startTimeSeconds: number
): SplitStepStroke | null {
  const rallyId = num(raw.pred_rally_id);
  const strokeNumber = num(raw.pred_rally_stroke_number);
  const time = num(raw.time);
  const playerLabel = str(raw.pred_player_id);

  // Without a rally, a position in it, a timestamp, and a hitter there is
  // nothing to derive. Drop rather than guess.
  if (rallyId === null || strokeNumber === null || time === null || !playerLabel) {
    return null;
  }

  const bounce = position(raw.bounce_x_m, raw.bounce_y_m);
  const player = position(raw.player_x_m, raw.player_y_m);
  const opponent = position(raw.opponent_x_m, raw.opponent_y_m);

  return {
    eventId: num(raw.event_id) ?? -1,
    videoTime: time + startTimeSeconds,
    trimmedFrame: num(raw.frame) ?? -1,

    rallyId,
    strokeNumber,
    playerLabel,

    predPointScore: str(raw.pred_point_score),
    predGameScore: str(raw.pred_game_score),
    predSetScore: str(raw.pred_set_score),

    strokeType: strokeType(raw.stroke_type),
    strokeSide: strokeSide(raw.stroke_side),
    strokeScore: num(raw.stroke_score),
    sideScore: num(raw.side_score),

    playerX: player.x,
    playerY: player.y,
    opponentX: opponent.x,
    opponentY: opponent.y,

    speedKmh: num(raw.speed_kmh),
    spinType: str(raw.spin_type),
    initialHeightM: num(raw.initial_height_m),
    heightAtNetM: num(raw.height_at_net_m),
    netHit: raw.net_hit === true,

    bounceX: bounce.x,
    bounceY: bounce.y,
    bounceScore: num(raw.bounce_score),

    in: raw.in === true,
    lineConfidence: num(raw.line_confidence),
  };
}

/**
 * Parse a full results payload.
 *
 * Accepts the parsed JSON array. Callers reading from Supabase Storage should
 * JSON.parse first — keeping this function off the I/O path is what makes it
 * testable against a fixture.
 */
export function parseStrokes(
  raw: unknown,
  options: ParseOptions = {}
): ParseResult {
  if (!Array.isArray(raw)) {
    throw new Error(
      'SplitStep results must be a JSON array of stroke objects'
    );
  }

  const startTimeSeconds = options.startTimeSeconds ?? 0;
  const strokes: SplitStepStroke[] = [];
  let droppedCount = 0;

  for (const row of raw) {
    const stroke = normalizeStroke(row as RawSplitStepStroke, startTimeSeconds);
    if (stroke) strokes.push(stroke);
    else droppedCount += 1;
  }

  return { strokes, droppedCount };
}

/** Re-exported so callers can report the geometry bounds they were held to. */
export const GEOMETRY_BOUNDS = {
  maxX: MAX_PLAUSIBLE_X_M,
  maxY: MAX_PLAUSIBLE_Y_M,
} as const;
