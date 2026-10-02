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

/** Forehand strokes by label — serves ("First Serve") never match. */
export function isForehand(shotType: string | null | undefined): boolean {
  return (shotType ?? "").toLowerCase().includes("forehand");
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
 * Starts from `shot.zone`. A FOREHAND struck from the hitter's backhand half
 * (ad for a right-hander, deuce for a left-hander) is renamed: Crosscourt →
 * Inside Out, Down the Line → Inside In. Backhands, an unknown hand, an
 * unmeasured contact, and Middle / serve / null zones are never Inside-*;
 * Middle and anything that is not a rally direction return null.
 */
export function shotDirection(
  shot: Pick<MatchShot, "shotType" | "zone" | "contactX" | "contactY">,
  hand: Hand | null,
): ShotDirection | null {
  const base = baseDirection(shot.zone);
  if (base === null) return null;
  if (hand === null || !isForehand(shot.shotType)) return base;
  if (hitterHalf(shot) !== backhandHalf(hand)) return base;
  return base === "Crosscourt" ? "Inside Out" : "Inside In";
}

/** Fewest qualifying forehands before a hand is inferred at all. */
export const INFER_HAND_MIN_FOREHANDS = 10;
/** Share of those forehands that must come from one half. */
export const INFER_HAND_MIN_SHARE = 0.65;

/**
 * A player's hand, inferred from where their forehands were struck: a
 * right-hander hits most forehands from the deuce half, a left-hander from the
 * ad half. Counts only that player's forehands with a known `hitterHalf` and
 * `shotNumber ≥ 1` (0 is a faulted serve or a feed). Returns a hand only with
 * at least {@link INFER_HAND_MIN_FOREHANDS} such forehands and at least
 * {@link INFER_HAND_MIN_SHARE} of them on one half; otherwise null.
 *
 * A fallback for when the match row carries no hand — never preferred over a
 * stored one.
 */
export function inferHand(
  points: readonly Pick<MatchPoint, "shots">[],
  isPlayer1: boolean,
): Hand | null {
  let deuce = 0;
  let ad = 0;
  for (const point of points) {
    for (const shot of point.shots ?? []) {
      if (shot.isPlayer1 !== isPlayer1) continue;
      if (!(shot.shotNumber >= 1)) continue;
      if (!isForehand(shot.shotType)) continue;
      const half = hitterHalf(shot);
      if (half === "deuce") deuce += 1;
      else if (half === "ad") ad += 1;
    }
  }
  const total = deuce + ad;
  if (total < INFER_HAND_MIN_FOREHANDS) return null;
  if (deuce / total >= INFER_HAND_MIN_SHARE) return "right";
  if (ad / total >= INFER_HAND_MIN_SHARE) return "left";
  return null;
}
