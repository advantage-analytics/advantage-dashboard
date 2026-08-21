/**
 * Per-row data-quality flags.
 *
 * These record where the vendor's payload contradicts itself. A flag never
 * stops a row being written — the row is still our best reading of the point —
 * but it marks a claim that should not be presented with the same confidence as
 * a clean one, and it is the evidence trail that lets us tell the vendor what
 * to fix rather than just that something is wrong.
 *
 * Codes are stable strings; they land in `points.flags` / `shots.flags` and are
 * queried by containment. Adding one is additive, so this list is expected to
 * grow.
 */

import { serveCourtSide } from './court';
import type { SplitStepRally, SplitStepStroke } from './types';

export const POINT_FLAGS = {
  /** Score fold and the last stroke's `in` flag name different winners. */
  WINNER_DISPUTED: 'winner_disputed',
  /** Two consecutive strokes credited to one player — impossible in singles. */
  SAME_PLAYER_CONSECUTIVE: 'same_player_consecutive',
  /** A serve flagged in, yet another serve followed it. Let? Ball on? */
  RESERVE_AFTER_IN: 'reserve_after_in',
  /** Service court failed to alternate from the previous point in the game. */
  SERVICE_COURT_REPEAT: 'service_court_repeat',
  /** No result_type could be assigned honestly. */
  RESULT_TYPE_UNKNOWN: 'result_type_unknown',
} as const;

export const SHOT_FLAGS = {
  /** Flagged out, yet the rally continued past it. */
  OUT_BALL_RALLY_CONTINUED: 'out_ball_rally_continued',
  /** net_hit true while height_at_net_m says the ball cleared the net. */
  NET_HIT_CONTRADICTS_HEIGHT: 'net_hit_contradicts_height',
  /** Struck at a ball that had already faulted. */
  PHANTOM_AFTER_FAULT: 'phantom_after_fault',
  /** Position or bounce discarded by the enclosure guard. */
  GEOMETRY_DISCARDED: 'geometry_discarded',
} as const;

/** Net height at the posts, plus a ball radius of tolerance. */
const NET_CLEARANCE_M = 1.07 + 0.0335;

/**
 * Flags for one stroke.
 *
 * `out_ball_rally_continued` is pure provenance rather than a correction: the
 * structural rule in result-type.ts already writes 'In' for a mid-rally stroke,
 * so the contradiction changes no stored value. It is recorded because it is
 * the single most common defect in the payload — 16% / 38% / 29% of strokes —
 * and the vendor needs the count.
 *
 * Mid-rally `net_hit` is deliberately NOT flagged on its own. The vendor
 * documents net_hit as contact anywhere in the trajectory, and a net-cord ball
 * can legitimately clip and land in, especially where lets are played on. Only
 * the self-contradiction against their own height field is reported.
 */
export function flagStroke(params: {
  stroke: SplitStepStroke;
  index: number;
  rally: SplitStepRally;
  serveIndex: number;
}): string[] {
  const { stroke, index, rally, serveIndex } = params;
  const flags: string[] = [];
  const isLast = index === rally.strokes.length - 1;

  if (!stroke.in && !isLast) flags.push(SHOT_FLAGS.OUT_BALL_RALLY_CONTINUED);

  if (
    stroke.netHit &&
    stroke.heightAtNetM !== null &&
    stroke.heightAtNetM > NET_CLEARANCE_M
  ) {
    flags.push(SHOT_FLAGS.NET_HIT_CONTRADICTS_HEIGHT);
  }

  if (index < serveIndex && stroke.strokeType !== 'serve') {
    flags.push(SHOT_FLAGS.PHANTOM_AFTER_FAULT);
  }

  if (stroke.bounceX === null || stroke.playerX === null) {
    flags.push(SHOT_FLAGS.GEOMETRY_DISCARDED);
  }

  return flags;
}

/**
 * Flags for one point.
 *
 * `service_court_repeat` needs the previous point in the same game, which is
 * why it takes one. Service court alternates every point, so a repeat means a
 * replayed point or one the detector missed — but treat it as review-worthy
 * rather than proof: it fires 5 times on the match whose score reconstructs
 * perfectly, so some share of it is serve-position noise.
 */
export function flagPoint(params: {
  rally: SplitStepRally;
  winner: string | null;
  previousInGame: SplitStepRally | null;
  resultType: string | null;
}): string[] {
  const { rally, winner, previousInGame, resultType } = params;
  const flags: string[] = [];
  const last = rally.strokes[rally.strokes.length - 1];

  // The disagreement that matters: the score fold says one player won, the
  // last stroke's in flag implies the other. These are the points a human
  // should look at first.
  if (winner && last) {
    const byFlag = last.in
      ? last.playerLabel
      : rally.strokes.find((s) => s.playerLabel !== last.playerLabel)
          ?.playerLabel ?? null;
    if (byFlag && byFlag !== winner) flags.push(POINT_FLAGS.WINNER_DISPUTED);
  }

  for (let i = 0; i < rally.strokes.length - 1; i += 1) {
    const a = rally.strokes[i];
    const b = rally.strokes[i + 1];
    const bothServes = a.strokeType === 'serve' && b.strokeType === 'serve';
    if (a.playerLabel === b.playerLabel && !bothServes) {
      flags.push(POINT_FLAGS.SAME_PLAYER_CONSECUTIVE);
      break;
    }
  }

  const serves = rally.serves;
  if (serves.length > 1 && serves[0]?.in) {
    flags.push(POINT_FLAGS.RESERVE_AFTER_IN);
  }

  if (previousInGame) {
    const here = rally.serves[0];
    const before = previousInGame.serves[0];
    if (here && before) {
      const a = serveCourtSide(before.playerX, before.playerY);
      const b = serveCourtSide(here.playerX, here.playerY);
      if (a && b && a === b) flags.push(POINT_FLAGS.SERVICE_COURT_REPEAT);
    }
  }

  if (!resultType) flags.push(POINT_FLAGS.RESULT_TYPE_UNKNOWN);

  return flags;
}
