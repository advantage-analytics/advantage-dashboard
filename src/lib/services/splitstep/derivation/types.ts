/**
 * SplitStep derivation — shared types.
 *
 * Two shapes live here and the difference between them is the whole point of
 * the parse layer:
 *
 *   RawSplitStepStroke  — exactly what the vendor sends, sentinels and all.
 *   SplitStepStroke     — the same stroke after sentinels and physically
 *                         impossible geometry have become `null`.
 *
 * Nothing downstream should ever see the raw shape. See parse.ts.
 */

/** A stroke exactly as it appears in the vendor's results JSON. */
export interface RawSplitStepStroke {
  video_id: string;
  event_id: number;
  frame: number;
  time: number;

  // Ground-truth fields. Documented as "from input rally metadata, if
  // provided" — the job request has no rally metadata parameter, and both
  // sample matches carry the string "None" in 100% of rows. Treat as absent.
  rally_id: string | number;
  rally_stroke_number: string | number;
  player_id: string;
  point_score: string;
  game_score: string;
  set_score: string;

  // Model predictions. These are the only usable fields.
  pred_rally_id: number;
  pred_rally_stroke_number: number;
  pred_player_id: string;
  pred_point_score: string;
  pred_game_score: string;
  pred_set_score: string;

  stroke_type: string;
  stroke_side: string;
  stroke_score: number;
  side_score: number;

  player_x_m: number;
  player_y_m: number;
  player_x1_px: number;
  player_y1_px: number;
  player_x2_px: number;
  player_y2_px: number;
  opponent_x_m: number;
  opponent_y_m: number;
  opponent_x1_px: number;
  opponent_y1_px: number;
  opponent_x2_px: number;
  opponent_y2_px: number;

  speed_kmh: number;
  ang_vel_mag_rpm: number;
  spin_type: string;
  initial_height_m: number;
  height_at_net_m: number;
  net_hit: boolean;

  bounce_frame: number;
  bounce_score: number;
  bounce_x_m: number;
  bounce_y_m: number;
  bounce_x_px: number;
  bounce_y_px: number;

  in: boolean;
  line_confidence: number;
}

/** The three stroke categories the vendor emits. Nothing finer exists. */
export type StrokeType = 'serve' | 'groundstroke' | 'volley';

/** The three stroke sides the vendor emits. */
export type StrokeSide = 'forehand' | 'backhand' | 'overhead';

/**
 * A stroke after normalization: sentinels nulled, geometry sanity-checked,
 * `time` shifted into original-video coordinates.
 */
export interface SplitStepStroke {
  /** Vendor's own index into the results array. Stable, useful for tracing. */
  eventId: number;
  /** Seconds from the start of the ORIGINAL video, not the trimmed one. */
  videoTime: number;
  /**
   * Frame index in the TRIMMED video. Retained for debugging only — never
   * seek against it. The vendor re-encodes, so frame indices may not map back
   * to the original if the framerate changed. Seconds survive re-encoding.
   */
  trimmedFrame: number;

  rallyId: number;
  strokeNumber: number;
  /** Vendor's free-text player label, e.g. "Quan". Not player1/player2. */
  playerLabel: string;

  /** Raw prediction strings. Unreliable — see quality.ts. Kept verbatim. */
  predPointScore: string | null;
  predGameScore: string | null;
  predSetScore: string | null;

  strokeType: StrokeType | null;
  strokeSide: StrokeSide | null;
  strokeScore: number | null;
  sideScore: number | null;

  playerX: number | null;
  playerY: number | null;
  opponentX: number | null;
  opponentY: number | null;

  speedKmh: number | null;
  spinType: string | null;
  initialHeightM: number | null;
  heightAtNetM: number | null;
  netHit: boolean;

  bounceX: number | null;
  bounceY: number | null;
  bounceScore: number | null;

  /**
   * The vendor's in/out call.
   *
   * Do NOT read this as "the serve was legal" — on both sample matches a
   * systematic long bias near the service line makes it a false negative on a
   * material fraction of serves. serves.ts brackets every serve statistic
   * rather than trusting it. See docs/splitstep-vendor-questions.md.
   */
  in: boolean;
  lineConfidence: number | null;
}

/** Strokes of one point, in play order, as segmented by the vendor. */
export interface SplitStepRally {
  rallyId: number;
  strokes: SplitStepStroke[];
  /** Player label of the first stroke. High confidence per spec §4.3. */
  server: string;
  /** Every `serve` stroke in the rally, in order. */
  serves: SplitStepStroke[];
}
