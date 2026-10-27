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
import { isLetServe, isServeStroke, type LabelShot } from "./session";

/**
 * What `effectiveShotResult` reads of a stroke; absent columns read as unset.
 * `seed` lets it tell the labeller's own call from the vendor's: without it
 * every stored call reads as the seed's.
 */
export type ResultReadableShot = Partial<
  Pick<
    LabelShot,
    | "stroke"
    | "result"
    | "contactX"
    | "contactY"
    | "landingX"
    | "landingY"
    | "seed"
    | "status"
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

/** What `positionPatch` reads: the geometry, plus the stored result it may keep. */
export type ShotPosition = ShotGeometry &
  Partial<Pick<LabelShotSeedValues, "result">>;

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

  if (didNotClearNet(contact_y, landing_y)) return "net";
  // Signed depth past the net: positive on the far side, negative on the near.
  const landingDepth = landing_y - NET_Y;

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

/** What the shank readers take of a stroke: its two ends, as the row holds them. */
export type ShotEnds = Partial<
  Pick<LabelShot, "contactX" | "contactY" | "landingX" | "landingY">
>;

/** Whether a ball hit from `contactY` came down on that side of the net, or on it. */
function didNotClearNet(contactY: number, landingY: number): boolean {
  const landingDepth = landingY - NET_Y;
  return landingDepth === 0 || (contactY - NET_Y) * landingDepth > 0;
}

/**
 * Whether the ball came down on the hitter's own side of the net (or on the
 * net line itself) — a shank, or a ball into the net: it never crossed. The
 * same reading `deriveShotResult` makes `"net"` from, kept in one place so
 * the court panel's "Didn’t clear the net" and the stored result cannot
 * disagree. False while either end is missing.
 *
 * Such a landing is ALLOWED: nothing refuses a click on the hitter's half
 * (court-placement.ts `nextPlacement` takes any point), and the result the
 * write carries is `"net"`. That is the stored meaning of `result: "net"`
 * today — a ball that did not clear — and this changes none of it.
 */
export function landedOnOwnSide(shot: ShotEnds): boolean {
  const { contactX, contactY, landingX, landingY } = shot;
  if (
    contactX == null ||
    contactY == null ||
    landingX == null ||
    landingY == null
  ) {
    return false;
  }
  return didNotClearNet(contactY, landingY);
}

/**
 * How far short of the net a ball that `landedOnOwnSide` came down, in
 * metres to the centimetre; null for any other landing, or one not placed.
 */
export function shortOfNet(shot: ShotEnds): number | null {
  if (!landedOnOwnSide(shot) || shot.landingY == null) return null;
  return Math.round(Math.abs(shot.landingY - NET_Y) * 100) / 100;
}

/**
 * How far past its line an out landing came down, as the Result menu's
 * second line says it: "0.3 m wide" or "1.2 m long", whichever line it
 * missed by more, to the tenth of a metre. Null for a landing that is in, in
 * the net, not placed, or within 5 cm of the line (it would read "0 m"). A
 * serve's long is past the service line; a serve on the wrong side of the
 * centre line missed no line it can be measured from, so it reads null too.
 */
export function landingMiss(shot: ShotGeometry): string | null {
  if (deriveShotResult(shot) !== "out") return null;
  const { contact_x, landing_x, landing_y } = shot;
  if (contact_x === null || landing_x === null || landing_y === null) {
    return null;
  }
  const depth = Math.abs(landing_y - NET_Y);
  const wide = Math.abs(landing_x) - SINGLES_HALF_WIDTH_M;
  const long = isServeStroke(shot.stroke)
    ? depth - SERVICE_LINE_M
    : depth - BASELINE_M;
  const by = Math.max(wide, long);
  if (by < 0.05) return null;
  return `${by.toFixed(1)} m ${wide >= long ? "wide" : "long"}`;
}

/**
 * What the landing of a serve stored `in` reads as when it contradicts that:
 * `"out"` or `"net"`, else null — for a serve whose landing agrees or is not
 * placed, a serve not stored in, and any other stroke. An in serve cannot
 * have come down outside the service box, so such a landing is the wrong
 * bounce: the console says so on the open point (marks-state.ts
 * `serveInLandingOut`) and the publish writes the serve without it
 * (apply.ts).
 *
 * `"net"` is read from which side of the net the CONTACT is on, so a contact
 * stored on the wrong side would make a good landing read as one. Measured
 * 2026-10-11 over the checked points of six hand-labelled sessions: every in
 * serve whose landing read net (9 of 9) was one the vendor itself had called
 * a net hit — a near-side bounce, not a mis-sided contact — so both readings
 * are treated alike.
 */
export function inServeLandingMiss(shot: {
  stroke?: LabelShot["stroke"];
  result?: LabelShot["result"];
  contactX?: number | null;
  contactY?: number | null;
  landingX?: number | null;
  landingY?: number | null;
}): "out" | "net" | null {
  if (shot.result !== "in" || !isServeStroke(shot.stroke)) return null;
  const landing = deriveShotResult({
    stroke: shot.stroke ?? null,
    contact_x: shot.contactX ?? null,
    contact_y: shot.contactY ?? null,
    landing_x: shot.landingX ?? null,
    landing_y: shot.landingY ?? null,
  });
  return landing === "out" || landing === "net" ? landing : null;
}

/**
 * In, out or net as the stroke's own coordinates say it, when all four are
 * placed; the stored result until then. The one reading the marks and the
 * suggestions share, so a placed landing outranks a stale stored call — but
 * never a let, nor a call the labeller set (`labellerCall`): both are the
 * labeller's override, as `positionPatch` keeps a let.
 */
export function effectiveShotResult(
  shot: ResultReadableShot,
): LabelShotResult | null {
  if (
    isLetServe({ stroke: shot.stroke ?? null, result: shot.result ?? null })
  ) {
    return "let";
  }
  const derived = deriveShotResult({
    stroke: shot.stroke ?? null,
    contact_x: shot.contactX ?? null,
    contact_y: shot.contactY ?? null,
    landing_x: shot.landingX ?? null,
    landing_y: shot.landingY ?? null,
  });
  if (derived === null) return shot.result ?? null;
  return shot.result && labellerCall(shot) ? shot.result : derived;
}

/**
 * Whether the stored call is one the labeller set rather than the seed's:
 * on an added stroke, any call; on a vendor stroke, one that is not the
 * seeded call. `positionPatch` writes the call the ends derive, so a stored
 * call that disagrees with placed ends and with the seed got there by the
 * tray's call toggle or a review answer — the labeller saying the ball, not
 * the bounce, decides. A call still as seeded is the vendor's and the ends
 * outrank it, even after an end moved: the volley link moves a landing
 * without rewriting the call (volley-link.ts), so a moved end is no sign the
 * labeller chose the call. A vendor stroke with no seed (one seeded before
 * the column existed, or a caller that does not pass it) has nothing to
 * compare, so its ends win.
 */
function labellerCall(shot: ResultReadableShot): boolean {
  if (shot.status === "added") return true;
  // A kept row holds its seed by definition; only an edit can carry a call.
  if (shot.status !== "edited") return false;
  // No seed to compare: a vendor stroke seeded before the column existed.
  const seed = shot.seed;
  if (seed == null) return false;
  return shot.result !== seed.result;
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
 * A stored `"let"` is kept the same way: a let is the labeller's override, not
 * something the coordinates can say, so moving an end never overwrites it —
 * picking the calculated item in the result menu is the one way back to the
 * derived result. The volley link's follower writes (volley-link.ts) carry no result and do not
 * come through here.
 */
export function positionPatch(
  shot: ShotPosition,
  end: "contact" | "landing",
  point: { x: number; y: number } | null,
): LabelShotPatch {
  const x = point?.x ?? null;
  const y = point?.y ?? null;
  const placed: LabelShotPatch =
    end === "contact"
      ? { contact_x: x, contact_y: y }
      : { landing_x: x, landing_y: y };
  if (isLetServe({ stroke: shot.stroke, result: shot.result ?? null })) {
    return placed;
  }
  const result = deriveShotResult({ ...shot, ...placed });
  return result === null ? placed : { ...placed, result };
}
