/**
 * The seed's serve landing autofix: a serve stored `in` whose landing reads
 * out past the service line or the singles sideline has its landing pulled
 * back along its path, into the box. Done once, when the session is set up
 * (seed.ts `buildLabelSeed`, beside `fixSettledServeRepeats`), in the row and
 * in its frozen `seed`, so the row reads `kept` and Reset keeps it. The
 * vendor's own bounce stays on the row's `vendor` stroke.
 *
 * The call is almost always right and the bounce wrong, with a long bias
 * (serves.ts). Measured 2026-11-02 over the analyst sessions: of 225 such
 * serves the labellers moved into the box, the miss was a median 0.31 m and
 * the labeller put the ball a median 0.27 m inside the line. Replayed on the
 * 19 complete sessions (`scripts/serve-autofix-eval.ts`), the pull-back moves
 * 296 serves; on the 112 the labeller moved too it lands a median 0.35 m from
 * the labeller's bounce, against 0.81 m for the vendor's, and it clears 292
 * of 544 "Serve in, landing outside the box" hints. 27 of the 296 were serves
 * the labeller re-called out: for those the fix gives a wrong call a bounce
 * that looks right.
 *
 * Not repaired, so the hint stays and the publish keeps dropping the landing
 * (apply.ts): a miss past `PULLBACK_MAX_MISS_M` (`PULLBACK_MAX_MISS_PLAYED_ON_M`
 * after a rally), a bounce on the server's own side, and a bounce inside the
 * wrong service box. Pulling back along the path cannot reach the labeller's
 * bounce for any of these.
 */

import {
  BASELINE_M,
  SERVICE_LINE_M,
  SINGLES_HALF_WIDTH_M,
} from "../splitstep/derivation/court";
import type { LabelPointSeed, LabelShotResult } from "./seed";
import { deriveShotResult, type ShotGeometry } from "./shot-derived";
import { isServeStroke, type LabelStroke } from "./session";
import { DEAD_BALL_TAIL } from "./suggestions";

/** How far inside the line a pulled-back landing is put, metres. */
export const PULLBACK_INSET_M = 0.25;
/**
 * The furthest past its line a landing may be and still be pulled back. A
 * miss of 1–2 m is pulled back only when the rally went on after the serve:
 * replayed 2026-11-02, the labellers re-called 13 of 36 such serves out when
 * the point ended within two strokes, against 4 of 47 when it went on.
 */
export const PULLBACK_MAX_MISS_M = 1;
/** The furthest past its line, when the rally went on after the serve. */
export const PULLBACK_MAX_MISS_PLAYED_ON_M = 2;

/** The net's `y`. */
const NET_Y = BASELINE_M;

/** A court position in the `label_shots` frame. */
export interface CourtPoint {
  x: number;
  y: number;
}

/** What the pull-back reads of a stroke: its ends, and the stored call. */
export type PullbackShot = ShotGeometry & { result: LabelShotResult | null };

/**
 * How far past the box a serve's landing is, metres — the larger of long and
 * wide, negative inside — measured on the receiving side.
 */
function serveMiss(contactY: number, landing: CourtPoint): number {
  const depth = (landing.y - NET_Y) * Math.sign(NET_Y - contactY);
  return Math.max(
    depth - SERVICE_LINE_M,
    Math.abs(landing.x) - SINGLES_HALF_WIDTH_M,
  );
}

/**
 * The landing a serve stored `in` should carry when its own coordinates read
 * out past the service line or the sideline: the point on its path from the
 * contact, `PULLBACK_INSET_M` inside the first line it crossed. Null when
 * nothing should move — not a serve, not stored in, an end missing, the
 * landing already in, on the server's own side, in the wrong box, more than
 * `PULLBACK_MAX_MISS_M` out (`PULLBACK_MAX_MISS_PLAYED_ON_M` when `playedOn`,
 * `servePlayedOn`), or a path that cannot be pulled into the box.
 */
export function pulledBackServeLanding(
  shot: PullbackShot,
  { playedOn = false }: { playedOn?: boolean } = {},
): CourtPoint | null {
  if (!isServeStroke(shot.stroke) || shot.result !== "in") return null;
  const { contact_x, contact_y, landing_x, landing_y } = shot;
  if (
    contact_x === null ||
    contact_y === null ||
    landing_x === null ||
    landing_y === null
  ) {
    return null;
  }
  if (deriveShotResult(shot) !== "out") return null;

  const towards = Math.sign(NET_Y - contact_y);
  const contactDepth = (contact_y - NET_Y) * towards;
  const landingDepth = (landing_y - NET_Y) * towards;
  // On the server's own side: no path back from there reaches the box.
  if (landingDepth <= 0) return null;
  const miss = serveMiss(contact_y, { x: landing_x, y: landing_y });
  const maxMiss = playedOn
    ? PULLBACK_MAX_MISS_PLAYED_ON_M
    : PULLBACK_MAX_MISS_M;
  // Inside both lines but out: the wrong service box.
  if (miss <= 0 || miss > maxMiss) return null;

  // The fraction of the way from contact to landing where the path crosses
  // the inset service line and the inset sideline; the nearer one wins.
  const longLine = SERVICE_LINE_M - PULLBACK_INSET_M;
  const sideLine = SINGLES_HALF_WIDTH_M - PULLBACK_INSET_M;
  const tLong =
    landingDepth > longLine
      ? (longLine - contactDepth) / (landingDepth - contactDepth)
      : 1;
  const tWide =
    Math.abs(landing_x) > sideLine
      ? (Math.sign(landing_x) * sideLine - contact_x) / (landing_x - contact_x)
      : 1;
  const t = Math.min(tLong, tWide);
  const pulled = {
    x: round(contact_x + t * (landing_x - contact_x)),
    y: round(contact_y + t * (landing_y - contact_y)),
  };
  // The path may cross the centre line or the net short of the box: only a
  // landing that reads in is a repair.
  const reads = deriveShotResult({
    ...shot,
    landing_x: pulled.x,
    landing_y: pulled.y,
  });
  return reads === "in" ? pulled : null;
}

/**
 * Whether the rally went on after the stroke at `index` of a point's live
 * strokes in rally order: more than `DEAD_BALL_TAIL` strokes followed it, and
 * the next was not a serve (a serve after a serve means the first faulted).
 */
export function servePlayedOn(
  live: readonly { stroke: LabelStroke | null }[],
  index: number,
): boolean {
  return (
    live.length - 1 - index > DEAD_BALL_TAIL &&
    !isServeStroke(live[index + 1]?.stroke)
  );
}

/**
 * The seed's points with every serve landing `pulledBackServeLanding` repairs
 * written into the row and its frozen `seed`. A stroke the site removed is a
 * ghost, not part of the rally: it is neither moved nor counted as played on.
 */
export function pullBackSeedServeLandings(
  points: LabelPointSeed[],
): LabelPointSeed[] {
  return points.map((point) => {
    const live = point.shots.filter((shot) => shot.site_removal === null);
    let moved = false;
    const shots = point.shots.map((shot) => {
      const index = live.indexOf(shot);
      if (index < 0) return shot;
      const landing = pulledBackServeLanding(shot, {
        playedOn: servePlayedOn(live, index),
      });
      if (!landing) return shot;
      moved = true;
      const values = { landing_x: landing.x, landing_y: landing.y };
      return { ...shot, ...values, seed: { ...shot.seed, ...values } };
    });
    return moved ? { ...point, shots } : point;
  });
}

/** To the millimetre, as the console writes a typed position. */
function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}
