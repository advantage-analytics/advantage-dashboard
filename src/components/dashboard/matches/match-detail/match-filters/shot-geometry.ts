import type { MatchPoint, MatchShot } from "@/lib/data/match-points-server";

import { NET_Y_M } from "../film/film-court";

/**
 * Per-shot court geometry for the match filters — pure, no React.
 *
 * Everything here reads `MatchShot`'s stored frame: metres, x about the centre
 * line, y = 0 at one baseline, 11.885 at the net, 23.77 at the other. The frame
 * is FIXED for the match and does not follow end changes (see the frame notes
 * in `film/film-court.ts`), so "the hitter's right" has to be worked out from
 * which end they are standing at.
 *
 * ── Which sign of x is the deuce court ──────────────────────────────────────
 *
 * The deuce court is the server's RIGHT as they face the net. The anchor is
 * `serveCourtSide()` in `src/lib/services/splitstep/derivation/court.ts`, the
 * rule the Advantage Intelligence derivation labels every serve with:
 * `hittingToward = playerY < 0 ? 1 : -1; deuce ⇔ playerX * hittingToward > 0`.
 * Its `playerY` is the vendor's net-origin y, so `playerY < 0` is this frame's
 * `contactY < NET_Y_M`. Hence:
 *
 *   - low-y end  (contactY < 11.885, facing +y): deuce ⇔ contactX > 0
 *   - high-y end (contactY > 11.885, facing −y): deuce ⇔ contactX < 0
 *
 * `film/film-court.ts` states the same thing from the drawing side ("a server
 * [at the low-y end] stands at +x for a deuce point"), and the Shots tab's
 * `serveLandingSide` (`shots/viz-model.ts`) agrees on the receiving end: a
 * deuce serve lands at negative lateral x once normalised to the server's end.
 *
 * Only the sign of x matters, never a y-only flip — flipping y alone swaps
 * deuce and ad silently (the trap `metersToCourtFrame` documents).
 */

/** Which half of the court, in the hitter's own facing frame. */
export type CourtHalf = "deuce" | "ad";

/** Stroke hand, as stored on the player/match rows. */
export type Hand = "right" | "left";

/**
 * The four mutually exclusive directions the Custom filter offers. The first
 * two are `shots.zone` (the one rule — `directionZone` in `court.ts`); the last
 * two are layered on top of it here, in the browser, and are never stored.
 */
export type ShotDirection =
  "Crosscourt" | "Down the Line" | "Inside Out" | "Inside In";

type Positioned = Pick<MatchShot, "contactX" | "contactY">;

function isNum(v: number | null | undefined): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

/**
 * The half of the court the hitter struck from, as THEY face the net: deuce is
 * their right, ad their left. Null when the contact is unmeasured, on the
 * centre line (x = 0) or exactly at the net — unmeasured, never a guess.
 */
export function hitterHalf(shot: Positioned): CourtHalf | null {
  const { contactX: x, contactY: y } = shot;
  if (!isNum(x) || !isNum(y) || x === 0 || y === NET_Y_M) return null;
  // Facing +y from the low-y end, facing −y from the high-y end.
  const facing = y < NET_Y_M ? 1 : -1;
  return x * facing > 0 ? "deuce" : "ad";
}

/** The half a player's backhand side faces: ad for a right-hander. */
export function backhandHalf(hand: Hand): CourtHalf {
  return hand === "right" ? "ad" : "deuce";
}

/** The half a player's forehand side faces: deuce for a right-hander. */
export function forehandHalf(hand: Hand): CourtHalf {
  return hand === "right" ? "deuce" : "ad";
}

/** Forehand strokes by label — serves ("First Serve") never match. */
export function isForehand(shotType: string | null | undefined): boolean {
  return (shotType ?? "").toLowerCase().includes("forehand");
}

/** Backhand strokes by label, volleys included, as `isForehand`. */
export function isBackhand(shotType: string | null | undefined): boolean {
  return (shotType ?? "").toLowerCase().includes("backhand");
}

/** Overheads (and smashes) by label. */
export function isOverhead(shotType: string | null | undefined): boolean {
  const type = (shotType ?? "").toLowerCase();
  return type.includes("overhead") || type.includes("smash");
}

function baseDirection(
  zone: string | null | undefined,
): "Crosscourt" | "Down the Line" | null {
  const z = (zone ?? "").trim().toLowerCase();
  if (z === "crosscourt") return "Crosscourt";
  if (z === "down the line") return "Down the Line";
  return null;
}

/**
 * The shot's direction for the Custom filter.
 *
 * Starts from `shot.zone`. A stroke struck from the other wing's half is
 * renamed — a FOREHAND or an OVERHEAD (struck above the forehand shoulder)
 * from the hitter's backhand half (ad for a right-hander), a BACKHAND from
 * their forehand half (deuce for a right-hander): Crosscourt → Inside Out,
 * Down the Line → Inside In. Volleys count with their wing. A serve, an
 * unknown hand, an unmeasured contact, and Middle / serve / null zones are
 * never Inside-*; Middle and anything that is not a rally direction return
 * null.
 */
export function shotDirection(
  shot: Pick<MatchShot, "shotType" | "zone" | "contactX" | "contactY">,
  hand: Hand | null,
): ShotDirection | null {
  const base = baseDirection(shot.zone);
  if (base === null) return null;
  if (hand === null) return base;
  const half = hitterHalf(shot);
  const inside =
    ((isForehand(shot.shotType) || isOverhead(shot.shotType)) &&
      half === backhandHalf(hand)) ||
    (isBackhand(shot.shotType) && half === forehandHalf(hand));
  if (!inside) return base;
  return base === "Crosscourt" ? "Inside Out" : "Inside In";
}

/** Fewest qualifying strokes of a wing before it can name a hand. */
export const INFER_HAND_MIN_FOREHANDS = 10;
/** Share of those strokes that must come from one half. */
export const INFER_HAND_MIN_SHARE = 0.65;

/** How many of a player's strokes of each wing came from each half. */
export interface WingHalves {
  forehand: Record<CourtHalf, number>;
  backhand: Record<CourtHalf, number>;
}

export const emptyWingHalves = (): WingHalves => ({
  forehand: { deuce: 0, ad: 0 },
  backhand: { deuce: 0, ad: 0 },
});

/** One stroke's evidence: a forehand or backhand with a known half. */
export function countWingHalf(
  halves: WingHalves,
  shotType: string | null | undefined,
  half: CourtHalf | null,
): void {
  if (half === null) return;
  if (isForehand(shotType)) halves.forehand[half] += 1;
  else if (isBackhand(shotType)) halves.backhand[half] += 1;
}

/** The hand one wing's halves name: its own half is `ownHalfForRight`'s. */
function handFromWing(
  { deuce, ad }: Record<CourtHalf, number>,
  ownHalfForRight: CourtHalf,
): Hand | null {
  const total = deuce + ad;
  if (total < INFER_HAND_MIN_FOREHANDS) return null;
  const own = ownHalfForRight === "deuce" ? deuce : ad;
  if (own / total >= INFER_HAND_MIN_SHARE) return "right";
  if ((total - own) / total >= INFER_HAND_MIN_SHARE) return "left";
  return null;
}

/**
 * A player's hand from where their forehands, then backhands, were struck: a
 * right-hander hits most forehands from the deuce half and most backhands from
 * the ad half. Forehands decide when they can; a player who runs round many
 * backhands splits them, and then the backhands decide. Each wing needs at
 * least {@link INFER_HAND_MIN_FOREHANDS} strokes with at least
 * {@link INFER_HAND_MIN_SHARE} on one half; otherwise null.
 */
export function handFromHalves(halves: WingHalves): Hand | null {
  return (
    handFromWing(halves.forehand, "deuce") ??
    handFromWing(halves.backhand, "ad")
  );
}

/**
 * A player's hand, inferred from where their strokes were struck
 * ({@link handFromHalves}). Counts only that player's forehands and backhands
 * with a known `hitterHalf` and `shotNumber ≥ 1` (0 is a faulted serve or a
 * feed).
 *
 * A fallback for when the match row carries no hand — never preferred over a
 * stored one.
 */
export function inferHand(
  points: readonly Pick<MatchPoint, "shots">[],
  isPlayer1: boolean,
): Hand | null {
  const halves = emptyWingHalves();
  for (const point of points) {
    for (const shot of point.shots ?? []) {
      if (shot.isPlayer1 !== isPlayer1) continue;
      if (!(shot.shotNumber >= 1)) continue;
      countWingHalf(halves, shot.shotType, hitterHalf(shot));
    }
  }
  return handFromHalves(halves);
}
