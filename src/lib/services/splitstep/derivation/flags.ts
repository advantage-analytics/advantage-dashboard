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
 * grow. A code is never renamed once written, even when what it means turns
 * out to be different; the doc comment says what it measures instead.
 *
 * Measured meanings come from the one hand-labelled match so far (Ace v
 * Goodman, match 1415029e, 87 points, 2026-09-28). Re-run
 * scripts/splitstep-eval.ts against each newly labelled match and update them.
 */

import { serveCourtSide } from "./court";
import { lastStrokeWinner } from "./winners";
import type { LineCalls } from "./line-calls";
import type { SplitStepRally, SplitStepStroke } from "./types";

export const POINT_FLAGS = {
  /**
   * Score fold and the last stroke's `in` flag name different winners.
   * Measured: read it as "how the point ended is suspect". On the labelled
   * match it fired 22 times; the winner was wrong on 4, the ending on 12.
   */
  WINNER_DISPUTED: "winner_disputed",
  /**
   * Two consecutive strokes credited to one player — impossible in singles.
   * Measured: usually a stroke the vendor never detected, not a mislabelled
   * hitter (the labeller noted a missed shot on 5 of its 12 hits).
   */
  SAME_PLAYER_CONSECUTIVE: "same_player_consecutive",
  /** A serve flagged in, yet another serve followed it. Let? Ball on? */
  RESERVE_AFTER_IN: "reserve_after_in",
  /** Service court failed to alternate from the previous point in the game. */
  SERVICE_COURT_REPEAT: "service_court_repeat",
  /**
   * The score stream had collapsed (see `collapsedTailStart`), so the winner is
   * the last stroke's guess, not a reading of the score. The stream agrees with
   * that guess on roughly 80% of the points where both exist.
   */
  WINNER_GUESSED: "winner_guessed",
  /**
   * No result_type could be assigned honestly. Measured: both hits on the
   * labelled match were points the server actually won (an ace, a return
   * error the vendor never detected) — too few to act on.
   */
  RESULT_TYPE_UNKNOWN: "result_type_unknown",
  /** Strokes at a faulted serve were removed before the rows were built. */
  PHANTOM_STROKES_DROPPED: "phantom_strokes_dropped",
  /**
   * Second serve called out, yet 1–2 strokes followed and it is stored In. A
   * possible double fault the returner hit back — for review only: on video,
   * 2 of 10 such points were double faults, so it never changes result_type.
   */
  SECOND_SERVE_CALLED_OUT: "second_serve_called_out",
  /**
   * The ball before a derived winner bounced outside the singles lines (per
   * the trajectories file), so the last stroke was dropped as a dead ball and
   * the point reads as an error. An autofix on small evidence: see played.ts.
   */
  WINNER_TO_ERROR_BY_BOUNCE: "winner_to_error_by_bounce",
  /**
   * Review-only. A derived winner whose previous ball landed within
   * ENDING_SUSPECT_MARGIN_M of a line, or that the vendor called out with high
   * line confidence. Measured: 12 of 14 such winners were really errors when
   * the ball was within 1 m.
   */
  ENDING_SUSPECT_LINE: "ending_suspect_line",
} as const;

/** How close to a line the ball before a winner must land to be suspect. */
const ENDING_SUSPECT_MARGIN_M = 1;

/**
 * `line_confidence` only takes about three values (0.5, 0.7, 0.9) and mostly
 * echoes the call. An out call at 0.9 near the end of a point was right 12 of
 * 12 on the labelled match; at 0.5–0.7 it was noise mid-rally.
 */
const CONFIDENT_OUT_CALL = 0.85;

/** Strokes after a second serve that can still be the returner at a dead ball. */
const MAX_DEAD_TAIL = 2;

export const SHOT_FLAGS = {
  /** Flagged out, yet the rally continued past it. */
  OUT_BALL_RALLY_CONTINUED: "out_ball_rally_continued",
  /** net_hit true while height_at_net_m says the ball cleared the net. */
  NET_HIT_CONTRADICTS_HEIGHT: "net_hit_contradicts_height",
  /** Position or bounce discarded by the enclosure guard. */
  GEOMETRY_DISCARDED: "geometry_discarded",
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
}): string[] {
  const { stroke, index, rally } = params;
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
 * perfectly, so some share of it is serve-position noise. It is skipped on a
 * no-ad deciding point, where the receiver chooses the side: on a hand-labelled
 * no-ad match, every one of its four hits was a 40-40 point.
 */
export function flagPoint(params: {
  rally: SplitStepRally;
  winner: string | null;
  previousInGame: SplitStepRally | null;
  resultType: string | null;
  /** processing_jobs.ad_scoring. Defaults to ad, as buildTranscript does. */
  adScoring?: boolean;
  /** Our own line calls; without them only the vendor's call is consulted. */
  lineCalls?: LineCalls;
}): string[] {
  const {
    rally,
    winner,
    previousInGame,
    resultType,
    adScoring = true,
    lineCalls,
  } = params;
  const flags: string[] = [];

  // A winner the ball before it says may have been an error. The autofix in
  // played.ts has already taken the balls that clearly landed out; this is
  // the near-line band it leaves for a person.
  const last = rally.strokes[rally.strokes.length - 1];
  const before = rally.strokes[rally.strokes.length - 2];
  if (
    winner &&
    last &&
    before &&
    last.strokeType !== "serve" &&
    before.strokeType !== "serve" &&
    last.playerLabel === winner
  ) {
    const margin = lineCalls?.get(before)?.margin ?? null;
    const nearLine = margin !== null && margin < ENDING_SUSPECT_MARGIN_M;
    const confidentOut =
      !before.in && (before.lineConfidence ?? 0) >= CONFIDENT_OUT_CALL;
    if (nearLine || confidentOut) flags.push(POINT_FLAGS.ENDING_SUSPECT_LINE);
  }

  // The disagreement that matters: the score fold says one player won, the
  // last stroke's in flag implies the other. These are the points a human
  // should look at first.
  if (winner) {
    const byFlag = lastStrokeWinner(rally);
    if (byFlag && byFlag !== winner) flags.push(POINT_FLAGS.WINNER_DISPUTED);
  }

  for (let i = 0; i < rally.strokes.length - 1; i += 1) {
    const a = rally.strokes[i];
    const b = rally.strokes[i + 1];
    const bothServes = a.strokeType === "serve" && b.strokeType === "serve";
    if (a.playerLabel === b.playerLabel && !bothServes) {
      flags.push(POINT_FLAGS.SAME_PLAYER_CONSECUTIVE);
      break;
    }
  }

  const serves = rally.serves;
  if (serves.length > 1 && serves[0]?.in) {
    flags.push(POINT_FLAGS.RESERVE_AFTER_IN);
  }

  // With three or more strokes after it a rally was plainly played, so the
  // out call is noise; only a short tail can hide a double fault.
  const deciding = rally.strokes.findLastIndex((s) => s.strokeType === "serve");
  const tail = rally.strokes.length - deciding - 1;
  if (
    serves.length >= 2 &&
    deciding >= 0 &&
    !rally.strokes[deciding].in &&
    tail >= 1 &&
    tail <= MAX_DEAD_TAIL
  ) {
    flags.push(POINT_FLAGS.SECOND_SERVE_CALLED_OUT);
  }

  if (previousInGame && !(!adScoring && isDecidingPoint(rally))) {
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

/** 40-40 before the point — under no-ad, the receiver picks the side. */
function isDecidingPoint(rally: SplitStepRally): boolean {
  const parts = (rally.strokes[0]?.predPointScore ?? "").split("-");
  return parts.length === 2 && parts.every((p) => p.trim() === "40");
}
