/**
 * What a labelled stroke's coordinates already say: whether the ball went in,
 * out or into the net, and which placement bucket it landed in. Pure; the
 * console calls it on every court click (court-placement.ts).
 *
 * `label_shots` shares the `shots` frame: `x` is metres from the centre line,
 * `y` metres from the NEAR baseline (net `y = 11.885`, far baseline `y =
 * 23.77`). It never flips with the hitter's end. The court constants and both
 * placement rules come from the derivation's court.ts; `serveZone` and
 * `directionZone` read x alone, so they take the label's x untouched.
 */

import {
  BASELINE_M,
  SERVICE_LINE_M,
  SINGLES_HALF_WIDTH_M,
  directionZone,
  serveZone,
} from "../splitstep/derivation/court";
import type { LabelShotPatch } from "./edit";
import type { LabelShotResult, LabelShotSeedValues } from "./seed";
import { isServeStroke, type LabelShot } from "./session";

/** What `effectiveShotResult` reads of a stroke; absent columns read as unset. */
export type ResultReadableShot = Partial<
  Pick<
    LabelShot,
    "stroke" | "result" | "contactX" | "contactY" | "landingX" | "landingY"
  >
>;

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
 * In, out or net as the stroke's own coordinates say it, when all four are
 * placed; the stored result until then. The one reading the marks and the
 * suggestions share, so a placed landing outranks a stale stored call.
 */
export function effectiveShotResult(
  shot: ResultReadableShot,
): LabelShotResult | null {
  return (
    deriveShotResult({
      stroke: shot.stroke ?? null,
      contact_x: shot.contactX ?? null,
      contact_y: shot.contactY ?? null,
      landing_x: shot.landingX ?? null,
      landing_y: shot.landingY ?? null,
    }) ??
    shot.result ??
    null
  );
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

/**
 * The patch a position sends, typed or clicked on the court (`nextPlacement`):
 * the two coordinates of that end and the result the row's values derive once
 * they are in, in one write. With an end missing `deriveShotResult` answers
 * null, the patch carries no `result` key and the row keeps its stored value.
 * The volley link's follower writes (volley-link.ts) carry no result and do not
 * come through here.
 */
export function positionPatch(
  shot: ShotGeometry,
  end: "contact" | "landing",
  point: { x: number; y: number } | null,
): LabelShotPatch {
  const x = point?.x ?? null;
  const y = point?.y ?? null;
  const placed: LabelShotPatch =
    end === "contact"
      ? { contact_x: x, contact_y: y }
      : { landing_x: x, landing_y: y };
  const result = deriveShotResult({ ...shot, ...placed });
  return result === null ? placed : { ...placed, result };
}
