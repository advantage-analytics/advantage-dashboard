import type { MatchPoint, MatchShot } from "@/lib/data/match-points-server";
import { isFeedShotType, isServeShotType } from "@/lib/data/serve-return-shots";
import type { BallPathsFile } from "@/lib/services/splitstep/derivation/ball-paths";

import { NET_Y_M } from "../film/film-court";
import { cameToNet, isNetShot, lastShotOf, winnerHitBy } from "./model";

/**
 * The net game — how a side got to the net and how those points ended. Pure
 * logic beside `model.ts` (no React, no `next/navigation`), so Playwright
 * specs import it directly. Read by the Statistics tab's Net game card and
 * the head-to-head Points rows, and by the Film cut extras those open
 * (`netEntry`, `netEnding`, `lobBy` in `film-cut-context.tsx`), so a figure
 * and its "Watch all N" are one predicate.
 *
 * Every classifier answers `null` exactly where `cameToNet` is false: a point
 * the side never came in on has no entry and no net ending.
 *
 * "Estimated from movement": a side is seen at the net only when it strikes
 * the ball there (`cameToNet`'s own caveat), and lobs come from the vendor's
 * ball heights, which no labelled match has checked yet.
 */

/** How a side got to the net. */
export type NetEntry = "serve-volley" | "approach" | "drawn-in";

/** How a point the side came in on ended, from that side's view. */
export type NetEnding =
  "winner" | "opponent-error" | "own-error" | "passed" | "lobbed";

/**
 * How close to the net the opponent's ball has to bounce for the side's first
 * net shot to count as "drawn in": half the service box, in metres. A short
 * ball the side had to run up to, rather than an approach it chose.
 */
export const DRAWN_IN_DEPTH_M = 3.2;

/**
 * How far from that bounce, in metres along the court, the side may strike
 * the ball and still have been drawn in. A ball that died near the net is met
 * close to its bounce; one that bounced short but carried on is met well
 * behind it, from where the side chose to take it — an approach.
 *
 * Tuned 2026-11-13 on Stoiber v Perelman (bca5777b…) against hand labels from
 * the video: the two labelled drawn-in points were met 1.3 m and 2.0 m from
 * the bounce, the labelled approaches 4.9 m to 10.2 m, and one the labeller
 * called either way 5.0 m. Seven points; tune against more labelled matches.
 */
export const DRAWN_IN_RUN_IN_M = 3;

/**
 * A stroke whose ball climbs at least this high before it bounces is a lob,
 * in metres. UNVALIDATED against labelled matches. 2026-11-07: raised from
 * 4.0 after Moore v Baek (79de1d34…, 709 strokes): rally balls peak at 2.3 m
 * (median) and 3.1 m (90th percentile), and 4.0 caught the top 3% — high
 * defensive balls from points already being lost, not lobs (Lob points won
 * read 0 of 8 and 0 of 1). Tune against hand-labelled matches.
 */
export const LOB_APEX_M = 5.0;

const isServeOrFeed = (shot: Pick<MatchShot, "shotType">) =>
  isServeShotType(shot.shotType) || isFeedShotType(shot.shotType);

/**
 * How `isPlayer1` came to the net in `point`, or `null` when it did not
 * (`!cameToNet`). N is the side's first shot passing `isNetShot` — the shot
 * that made `cameToNet` true.
 *
 * - `serve-volley` — the side served, N is its first shot after the serve (no
 *   earlier shot of theirs other than a serve or a pre-serve feed) AND N is a
 *   volley by type (product decision, 2026-11-13). A server's first ball
 *   struck inside the service line as a groundstroke, or an overhead, is not
 *   one: it is read by the two rules below like any other net shot.
 * - `drawn-in` — N is a groundstroke (not a volley or overhead: those take
 *   the ball out of the air, so it never bounced) answering an opponent's
 *   ball that bounced on the side's own half within `DRAWN_IN_DEPTH_M` of the
 *   net, and N was struck within `DRAWN_IN_RUN_IN_M` of that bounce: the side
 *   ran onto a ball that died short.
 * - `approach` — anything else. That includes an approach shot hit off a
 *   short ball (the ordinary way to come in, not being dragged in), a short
 *   ball that carried on and was met well behind its bounce, a bounce
 *   recorded on the hitter's own side of the net, and a ball with no bounce
 *   or contact recorded: coming in is the side's choice unless the data says
 *   it was dragged in.
 */
export function netEntryOf(
  point: MatchPoint,
  isPlayer1: boolean,
): NetEntry | null {
  const shots = point.shots ?? [];
  const n = shots.findIndex((s) => s.isPlayer1 === isPlayer1 && isNetShot(s));
  if (n < 0) return null;

  const nType = (shots[n].shotType ?? "").toLowerCase();
  const ownBefore = shots.slice(0, n).filter((s) => s.isPlayer1 === isPlayer1);
  if (
    point.serverIsPlayer1 === isPlayer1 &&
    nType.includes("volley") &&
    ownBefore.every(isServeOrFeed)
  ) {
    return "serve-volley";
  }

  if (nType.includes("volley") || nType === "overhead") return "approach";

  let answered: MatchShot | undefined;
  for (let i = n - 1; i >= 0; i -= 1) {
    if (shots[i].isPlayer1 !== isPlayer1) {
      answered = shots[i];
      break;
    }
  }
  const bounce = answered?.landingY ?? null;
  const contact = shots[n].contactY;
  if (bounce === null || contact === null) return "approach";

  // Signed from the net: the same sign is the same half of the court.
  const bounceFromNet = bounce - NET_Y_M;
  const contactFromNet = contact - NET_Y_M;
  const onOwnHalf =
    bounceFromNet !== 0 &&
    Math.sign(bounceFromNet) === Math.sign(contactFromNet);
  if (
    onOwnHalf &&
    Math.abs(bounceFromNet) <= DRAWN_IN_DEPTH_M &&
    Math.abs(contact - bounce) <= DRAWN_IN_RUN_IN_M
  ) {
    return "drawn-in";
  }
  return "approach";
}

/**
 * A ball-paths contact time as a lookup key: rounded to the millisecond, so a
 * `shots.video_time` that went through the database and back still finds the
 * stroke whose `contactTime` is that same value.
 */
export function lobKeyOf(time: number): number {
  return Math.round(time * 1000) / 1000;
}

/**
 * Whether `lobKeys` holds the stroke struck at `time` (a `shots.video_time`).
 * The column is a float4, so a contact time comes back up to ~0.25 ms off the
 * ball-paths file's float64 one late in a two-hour match, and its millisecond
 * key can land one step either side: checked on 20,000 random times, an exact
 * key missed 7.6% of strokes. Strokes are hundreds of milliseconds apart, so
 * a neighbouring key can never be a different stroke.
 */
export function hasLobKey(lobKeys: ReadonlySet<number>, time: number): boolean {
  return (
    lobKeys.has(lobKeyOf(time)) ||
    lobKeys.has(lobKeyOf(time - 0.001)) ||
    lobKeys.has(lobKeyOf(time + 0.001))
  );
}

const finite = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

/**
 * The contact times (`lobKeyOf`) of every stroke in `file` that is a lob: its
 * highest sample before the bounce — every sample when the vendor saw no
 * bounce — is at least `LOB_APEX_M`. The threshold is unvalidated against
 * labelled matches (see `LOB_APEX_M`). Malformed strokes are skipped, since
 * `parseBallPathsFile` checks the file's shape only.
 */
export function lobShotKeys(file: BallPathsFile): Set<number> {
  const keys = new Set<number>();
  for (const stroke of file.strokes ?? []) {
    if (!stroke || !finite(stroke.contactTime) || !Array.isArray(stroke.path))
      continue;
    const bounce = finite(stroke.bounceTime) ? stroke.bounceTime : null;
    let apex = -Infinity;
    for (const sample of stroke.path) {
      if (!Array.isArray(sample)) continue;
      const [t, , , z] = sample;
      if (!finite(t) || !finite(z)) continue;
      if (bounce !== null && t > bounce) continue;
      if (z > apex) apex = z;
    }
    if (apex >= LOB_APEX_M) keys.add(lobKeyOf(stroke.contactTime));
  }
  return keys;
}

/**
 * Whether `shot` is a lob: a groundstroke (not a serve, feed, volley or
 * overhead — a high volley or a smash is not a lob) whose contact time is in
 * `lobKeys`.
 */
export function isLobShot(
  shot: Pick<MatchShot, "shotType" | "videoTime">,
  lobKeys: ReadonlySet<number>,
): boolean {
  if (isServeOrFeed(shot)) return false;
  const type = (shot.shotType ?? "").toLowerCase();
  if (
    type.includes("volley") ||
    type.includes("overhead") ||
    type.includes("smash")
  ) {
    return false;
  }
  return shot.videoTime !== null && hasLobKey(lobKeys, shot.videoTime);
}

/**
 * How a point `isPlayer1` came to the net on ended, from that side's view, or
 * `null` when it did not come in (`!cameToNet`). Read off the same shot as
 * How points ended (`lastShotOf`, `winnerHitBy`), so the two cards agree.
 *
 * Won by the side:
 * - `winner` — its own winner (`winnerHitBy`).
 * - `opponent-error` — anything else it won: the opponent missed.
 *
 * Lost by the side:
 * - `own-error` — the deciding shot is the side's own.
 * - `lobbed` — the opponent's deciding shot is a lob (`isLobShot`). Only with
 *   `lobKeys`; with none (no ball-paths file) nothing is lobbed.
 * - `passed` — the opponent's deciding shot otherwise.
 */
export function netEndingOf(
  point: MatchPoint,
  isPlayer1: boolean,
  lobKeys: ReadonlySet<number> | null | undefined,
): NetEnding | null {
  if (!cameToNet(point, isPlayer1)) return null;
  const last = lastShotOf(point);
  if (point.wonByPlayer1 === isPlayer1) {
    return winnerHitBy(point) === isPlayer1 ? "winner" : "opponent-error";
  }
  if (!last || last.isPlayer1 === isPlayer1) return "own-error";
  return lobKeys && isLobShot(last, lobKeys) ? "lobbed" : "passed";
}

/**
 * How far from the net, in metres, a drop shot must be struck from — about
 * 1.6 m behind the service line, so a touch volley or a short angle hit from
 * inside the box is not one.
 */
export const DROP_SHOT_FROM_M = 8;

/**
 * A drop shot: a forehand or backhand (never a serve, volley or overhead)
 * struck with backspin from at least `DROP_SHOT_FROM_M` from the net that
 * lands within `DRAWN_IN_DEPTH_M` of it — the same short-ball line the
 * drawn-in rule uses (which reads the bounce and where it was met, not the
 * spin, so it does not depend on this). Backspin is "backspin" on an Advantage
 * Intelligence match and "Slice" on a SwingVision import; a shot with no
 * spin, contact or landing recorded is never one. Unvalidated against
 * labelled matches: on 2026-11-07 it matched 356 of 18,920 video rally
 * balls (1.9%), averaging 45 mph against 72 mph for deep balls.
 */
export function isDropShot(
  shot: Pick<MatchShot, "shotType" | "spinType" | "contactY" | "landingY">,
): boolean {
  const type = (shot.shotType ?? "").toLowerCase();
  if (type !== "forehand" && type !== "backhand") return false;
  const spin = (shot.spinType ?? "").toLowerCase();
  if (spin !== "backspin" && spin !== "slice") return false;
  if (shot.contactY === null || shot.landingY === null) return false;
  return (
    Math.abs(shot.contactY - NET_Y_M) >= DROP_SHOT_FROM_M &&
    Math.abs(shot.landingY - NET_Y_M) <= DRAWN_IN_DEPTH_M
  );
}

/** Whether `isPlayer1` struck at least one drop shot (`isDropShot`) in `point`. */
export function hitADropShot(point: MatchPoint, isPlayer1: boolean): boolean {
  return (point.shots ?? []).some(
    (shot) => shot.isPlayer1 === isPlayer1 && isDropShot(shot),
  );
}

/** Whether `isPlayer1` struck at least one lob (`isLobShot`) in `point`. */
export function hitALob(
  point: MatchPoint,
  isPlayer1: boolean,
  lobKeys: ReadonlySet<number>,
): boolean {
  return (point.shots ?? []).some(
    (shot) => shot.isPlayer1 === isPlayer1 && isLobShot(shot, lobKeys),
  );
}

/** Per-side net game counts — the Net game card's bars. */
export interface NetGameTally {
  /** Points the side came to the net on (`cameToNet`). */
  total: number;
  endings: Record<NetEnding, number>;
  entries: Record<NetEntry, number>;
}

/** One pass over `points` for `isPlayer1`'s net game. */
export function netGameTally(
  points: readonly MatchPoint[],
  isPlayer1: boolean,
  lobKeys: ReadonlySet<number> | null | undefined,
): NetGameTally {
  const t: NetGameTally = {
    total: 0,
    endings: {
      winner: 0,
      "opponent-error": 0,
      "own-error": 0,
      passed: 0,
      lobbed: 0,
    },
    entries: { "serve-volley": 0, approach: 0, "drawn-in": 0 },
  };
  for (const p of points) {
    const ending = netEndingOf(p, isPlayer1, lobKeys);
    if (ending === null) continue;
    t.total += 1;
    t.endings[ending] += 1;
    const entry = netEntryOf(p, isPlayer1);
    if (entry) t.entries[entry] += 1;
  }
  return t;
}
