import type { MatchPoint, MatchShot } from "@/lib/data/match-points-server";
import { isServeShotType } from "@/lib/data/serve-return-shots";

import { NET_Y_M } from "../film/film-court";
import { lastShotOf } from "./model";
import {
  netApproachShotOf,
  netEndingOf,
  netEntryOf,
  type NetEnding,
  type NetEntry,
} from "./net-game";
import type { Hand } from "./shot-geometry";

/**
 * One approach to the net, classified for the Visualizations "Approaches"
 * cut: where the approach shot went in the opponent's court, which wing of
 * theirs that was, its direction, and how the point ended. Pure (no React),
 * built on the Net game classifiers in `net-game.ts` without changing them, so
 * this cut and the Net game card count the same points the same way.
 *
 * Attribution: `isPlayer1` is the caller's seat (the subject of the cut), never
 * re-derived here (`docs/ui-revamp-guardrails.md` §4).
 */

/** Geometric third of the opponent's singles court, seen from the hitter. */
export type ApproachLane = "left" | "middle" | "right";

/** The opponent's wing that third faces. */
export type ApproachWing = "forehand" | "middle" | "backhand";

/** The approach shot's direction (`shots.zone`). */
export type ApproachDirection = "Crosscourt" | "Middle" | "Down the Line";

/**
 * The "How it ended" row. `passed-or-lobbed-*` replace `passed-*` and
 * `lobbed` when lobs cannot be told apart (`lobKeys` null), the Net game
 * card's convention.
 */
export type ApproachEndingBucket =
  | "passed-dtl"
  | "passed-crosscourt"
  | "passed-or-lobbed-dtl"
  | "passed-or-lobbed-crosscourt"
  | "lobbed"
  | "won-at-net"
  | "own-error";

export const APPROACH_BUCKET_LABEL: Record<ApproachEndingBucket, string> = {
  "passed-dtl": "Passed down the line",
  "passed-crosscourt": "Passed crosscourt",
  "passed-or-lobbed-dtl": "Passed or lobbed down the line",
  "passed-or-lobbed-crosscourt": "Passed or lobbed crosscourt",
  lobbed: "Lobbed",
  "won-at-net": "Won at the net",
  "own-error": "Your error",
};

export interface Approach {
  /** How the side came in (`netEntryOf`). */
  entry: NetEntry;
  /**
   * The shot that took the side in (`netApproachShotOf`): the approach shot,
   * the serve on serve and volley, or the short ball on drawn in.
   */
  shot: MatchShot;
  /** How the point ended, from the side's view (`netEndingOf`). */
  ending: NetEnding;
  /** The "How it ended" row `ending` falls in. */
  bucket: ApproachEndingBucket;
  /**
   * The opponent's deciding shot when the side was passed or lobbed
   * (`lastShotOf`), else `null`.
   */
  reply: MatchShot | null;
  /**
   * Which third of the opponent's singles court the approach shot landed in,
   * seen from behind the hitter. `null` when the landing is unmeasured or the
   * ball never crossed the net (no placement to place).
   */
  lane: ApproachLane | null;
  /** The opponent's wing for `lane`; `null` with it. */
  wing: ApproachWing | null;
  /** The opponent's hand was unknown, so `wing` assumes a right-hander. */
  handAssumed: boolean;
  /** The approach shot's `zone`; `null` for a serve or an unknown zone. */
  direction: ApproachDirection | null;
}

/** Singles half-width over three, in metres — one lane of the court. */
export const SINGLES_HALF_M = 4.115;
export const LATERAL_THIRD_M = SINGLES_HALF_M / 3;

/**
 * Where `shot` landed across the court, in metres to the hitter's RIGHT as
 * they face the net, or `null` when it did not reach the opponent's half.
 * The same orientation as `rallyLandingMetrics` (`shots/viz-model.ts`): the
 * stored frame is fixed for the match, so a hitter at the high-y end has x
 * mirrored, which is what handles end changes.
 */
export function approachLateralM(
  shot: Pick<MatchShot, "contactY" | "landingX" | "landingY" | "result">,
): number | null {
  const { contactY, landingX, landingY } = shot;
  if (
    contactY == null ||
    landingX == null ||
    landingY == null ||
    ![contactY, landingX, landingY].every(Number.isFinite)
  ) {
    return null;
  }
  const farEnd = contactY > NET_Y_M;
  const depthM = farEnd ? NET_Y_M - landingY : landingY - NET_Y_M;
  if (shot.result === "Net" || depthM < 0) return null;
  return farEnd ? -landingX : landingX;
}

/** The hitter's-view third of the court at `lateralM` (metres to their right). */
export function laneOf(lateralM: number): ApproachLane {
  if (lateralM < -LATERAL_THIRD_M) return "left";
  if (lateralM > LATERAL_THIRD_M) return "right";
  return "middle";
}

/**
 * The opponent's wing facing `lane`. A right-hander facing the hitter has
 * their forehand on the hitter's left; a left-hander the reverse. `hand` null
 * reads as right-handed (the caller flags `handAssumed`).
 */
export function wingOf(lane: ApproachLane, hand: Hand | null): ApproachWing {
  if (lane === "middle") return "middle";
  const leftIsForehand = hand !== "left";
  return (lane === "left") === leftIsForehand ? "forehand" : "backhand";
}

function directionOf(
  shot: Pick<MatchShot, "shotType" | "zone">,
): ApproachDirection | null {
  if (isServeShotType(shot.shotType)) return null;
  const z = (shot.zone ?? "").trim().toLowerCase();
  if (z === "crosscourt") return "Crosscourt";
  if (z === "middle") return "Middle";
  if (z === "down the line") return "Down the Line";
  return null;
}

/**
 * The bucket for `ending`. A pass is split by the reply's `zone`: Down the
 * Line is down the line, anything else (Crosscourt, Middle, unknown) is
 * crosscourt, so every pass lands in one of the two rows and the rows sum to
 * the approaches.
 */
function bucketOf(
  ending: NetEnding,
  reply: MatchShot | null,
  lobsKnown: boolean,
): ApproachEndingBucket {
  if (ending === "winner" || ending === "opponent-error") return "won-at-net";
  if (ending === "own-error") return "own-error";
  if (ending === "lobbed") return "lobbed";
  const dtl = (reply?.zone ?? "").trim().toLowerCase() === "down the line";
  if (lobsKnown) return dtl ? "passed-dtl" : "passed-crosscourt";
  return dtl ? "passed-or-lobbed-dtl" : "passed-or-lobbed-crosscourt";
}

/**
 * `isPlayer1`'s approach to the net on `point`, or `null` exactly where
 * `cameToNet` is false. `lobKeys` as for `netEndingOf` (null: lobs unknown);
 * `opponentHand` is the hand of the side being approached against.
 */
export function approachOf(
  point: MatchPoint,
  isPlayer1: boolean,
  lobKeys: ReadonlySet<number> | null | undefined,
  opponentHand: Hand | null,
): Approach | null {
  const ending = netEndingOf(point, isPlayer1, lobKeys);
  const entry = netEntryOf(point, isPlayer1);
  if (ending === null || entry === null) return null;
  const shot = netApproachShotOf(point, isPlayer1);
  if (!shot) return null;

  const last = lastShotOf(point);
  const reply =
    (ending === "passed" || ending === "lobbed") && last ? last : null;
  const lateralM = approachLateralM(shot);
  const lane = lateralM === null ? null : laneOf(lateralM);

  return {
    entry,
    shot,
    ending,
    bucket: bucketOf(ending, reply, !!lobKeys),
    reply,
    lane,
    wing: lane === null ? null : wingOf(lane, opponentHand),
    handAssumed: opponentHand === null,
    direction: directionOf(shot),
  };
}

const ENTRY_PREFIX: Record<NetEntry, string> = {
  approach: "",
  "serve-volley": "Serve and volley · ",
  "drawn-in": "Drawn in · ",
};

const DIRECTION_WORDS: Record<ApproachDirection, string> = {
  Crosscourt: "crosscourt",
  Middle: "down the middle",
  "Down the Line": "down the line",
};

const WING_WORDS: Record<ApproachWing, string> = {
  backhand: "to their backhand",
  middle: "to the middle",
  forehand: "to their forehand",
};

/** The approach shot's stroke: "Serve" for either serve, else its type. */
function strokeWordOf(shot: Pick<MatchShot, "shotType">): string {
  const type = shot.shotType?.trim() ?? "";
  if (!type) return "Approach";
  if (isServeShotType(type)) return "Serve";
  return type.charAt(0).toUpperCase() + type.slice(1).toLowerCase();
}

/**
 * The Approaches cut's point-list line (the opened view's Points pane): the
 * shot that took the side in, where it went and which wing of theirs that
 * was — "Forehand down the line, to their backhand". A serve and volley or a
 * drawn-in point says so first ("Serve and volley · Serve to their
 * backhand"); a plain approach has no prefix. A missing direction (a serve,
 * an unknown zone) or wing (unmeasured landing) is left out with its
 * separator, so the line never dangles, and a ball down the middle to the
 * middle says so once. "Their" is the side approached
 * against, whichever seat the cut is turned to. Pure; beside `pointDetail`
 * (`film/film-shots.ts`), which the Video tab and the label rows share and
 * which this does not change.
 */
export function approachDetail(
  approach: Pick<Approach, "entry" | "shot" | "wing" | "direction">,
): string {
  const direction = approach.direction
    ? DIRECTION_WORDS[approach.direction]
    : null;
  // "Down the middle" already says where a middle ball went.
  const wing =
    approach.wing &&
    !(approach.wing === "middle" && approach.direction === "Middle")
      ? WING_WORDS[approach.wing]
      : null;
  let line = strokeWordOf(approach.shot);
  if (direction) line += ` ${direction}`;
  if (wing) line += `${direction ? "," : ""} ${wing}`;
  return ENTRY_PREFIX[approach.entry] + line;
}
