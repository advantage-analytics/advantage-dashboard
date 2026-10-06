/**
 * What a labelled stroke's coordinates already say: whether the ball went in,
 * out or into the net, and which placement bucket it landed in.
 *
 * Pure and import-free of anything server-side — the `"use client"` console
 * calls it on every court click (court-placement.ts), so a labeller who has
 * clicked where the ball was hit and where it landed never also has to pick
 * In / Out / Net by hand.
 *
 * ── Frame ──────────────────────────────────────────────────────────────────
 * `label_shots` shares the `shots` frame: `x` is metres from the centre line,
 * `y` metres from the NEAR baseline, so the net is `y = 11.885` and the far
 * baseline `y = 23.77`. It never flips with the hitter's end. The court
 * constants and both placement rules come from the derivation's court.ts —
 * its `BASELINE_M` is the baseline's distance from the net, which is the
 * net's `y` in this frame (court-geometry.ts's `NET_Y`). `serveZone` and
 * `directionZone` read x alone, in this same frame, so they take the label's
 * x untouched — exactly as transcript.ts feeds them for `shots.zone`.
 */

import {
  BASELINE_M,
  SERVICE_LINE_M,
  SINGLES_HALF_WIDTH_M,
  directionZone,
  serveZone,
} from "../splitstep/derivation/court";
import type { LabelShotResult, LabelShotSeedValues } from "./seed";
import { isServeStroke } from "./session";

/** The net's `y`, metres from the near baseline. */
const NET_Y = BASELINE_M;
/** The far baseline's `y`. */
const COURT_LENGTH = 2 * BASELINE_M;

/** The columns a stroke's result and placement are read from. */
export type ShotGeometry = Pick<
  LabelShotSeedValues,
  "stroke" | "contact_x" | "contact_y" | "landing_x" | "landing_y"
>;

/** A stroke's placement bucket — a `shots.zone` value. */
export type ShotPlacement =
  | NonNullable<ReturnType<typeof serveZone>>
  | NonNullable<ReturnType<typeof directionZone>>;

/**
 * In, out or net, from where the stroke was hit and where the ball came down.
 *
 * - `null` when any of the four coordinates is missing — unmeasured, never a
 *   guess; the row keeps whatever `result` it has stored.
 * - `"net"` when the ball came down on the hitter's own side of the net (or
 *   on the net line itself): it never crossed.
 * - a serve is `"in"` inside the service box diagonal to the server: within
 *   6.4 m past the net, inside the singles sideline, and across the centre
 *   line from the contact. A server placed exactly on the centre mark has no
 *   side, so either box counts; a ball on the centre line is in both.
 * - any other stroke is `"in"` inside the singles court.
 * - otherwise `"out"`. Lines are in.
 */
export function deriveShotResult(shot: ShotGeometry): LabelShotResult | null {
  const { contact_x, contact_y, landing_x, landing_y } = shot;
  if (
    contact_x === null ||
    contact_y === null ||
    landing_x === null ||
    landing_y === null
  ) {
    return null;
  }

  // Signed depth past the net: positive on the far side, negative on the near.
  const contactDepth = contact_y - NET_Y;
  const landingDepth = landing_y - NET_Y;
  if (landingDepth === 0 || contactDepth * landingDepth > 0) return "net";

  const insideSidelines = Math.abs(landing_x) <= SINGLES_HALF_WIDTH_M;

  if (isServeStroke(shot.stroke)) {
    const crossedCentreLine =
      contact_x === 0 ||
      landing_x === 0 ||
      Math.sign(contact_x) !== Math.sign(landing_x);
    return insideSidelines &&
      Math.abs(landingDepth) <= SERVICE_LINE_M &&
      crossedCentreLine
      ? "in"
      : "out";
  }

  return insideSidelines && landing_y >= 0 && landing_y <= COURT_LENGTH
    ? "in"
    : "out";
}

/**
 * The stroke's placement bucket, by the app's one placement rule: `serveZone`
 * for a serve, `directionZone` for anything else. Null when the coordinates
 * the rule needs are missing.
 */
export function shotPlacement(shot: ShotGeometry): ShotPlacement | null {
  return isServeStroke(shot.stroke)
    ? serveZone(shot.landing_x)
    : directionZone(shot.landing_x, shot.contact_x);
}
