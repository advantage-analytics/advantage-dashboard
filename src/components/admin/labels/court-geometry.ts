/**
 * The labelling console's vertical court: one frame, and the pure conversion
 * between it and the metres every label is stored in.
 *
 * Court (metres), the `label_shots` frame: `x` is lateral metres from the
 * centre line, `y` metres from the NEAR baseline, so the net is `y = 11.885`
 * and the far baseline `y = 23.77`.
 *
 * Screen (percent): `{ sx, sy }` in percent, 0–100, of the art box, which is
 * what the overlay's SVG attributes take verbatim. The art box is {@link
 * COURT_VIEW_BOX}: the doubles court plus a 1.78 m apron at each side and 4.5 m
 * behind each baseline, since players routinely strike the ball 3–4 m behind
 * it. The near baseline is drawn at the bottom, so `y` grows up the screen
 * while `sy` grows down it:
 *
 *   sx = (x + 7.265) / 14.53 × 100
 *   sy = (28.27 − y) / 32.77 × 100
 *
 * {@link toCourt} and {@link fromCourt} are exact inverses of each other.
 *
 * Half-court: while a stroke is being placed the court zooms to one half, with
 * 4.6 m of run-off beside each doubles sideline, 3.5 m behind the baseline and
 * 0.84 m past the net. The orientation is the whole court's. {@link
 * halfCourtViewBox} is that window in the art's own SVG frame (drawn top-down,
 * far baseline at `0`); {@link toCourtInHalf} and {@link fromCourtInHalf} are
 * its percent conversions, exact inverses too.
 */

import {
  COURT_LENGTH_M,
  NET_Y_M,
} from "@/components/dashboard/matches/match-detail/film/film-court";
import {
  DOUBLES_HALF_WIDTH_M,
  SERVICE_LINE_M,
  SINGLES_HALF_WIDTH_M,
} from "@/lib/services/splitstep/derivation/court";

/** Metres of apron drawn beside each doubles sideline. */
const SIDE_APRON = 1.78;
/** Metres of apron drawn behind each baseline. */
const BACK_APRON = 4.5;

export const COURT_LENGTH = COURT_LENGTH_M;
export const DOUBLES_HALF_WIDTH = DOUBLES_HALF_WIDTH_M;
export const SINGLES_HALF_WIDTH = SINGLES_HALF_WIDTH_M;
export const NET_Y = NET_Y_M;
/** Service lines, measured from the near baseline (6.40 m from the net). */
export const NEAR_SERVICE_Y = NET_Y - SERVICE_LINE_M;
export const FAR_SERVICE_Y = NET_Y + SERVICE_LINE_M;

export const COURT_LEFT = -(DOUBLES_HALF_WIDTH + SIDE_APRON); // -7.265
export const COURT_WIDTH = 2 * (DOUBLES_HALF_WIDTH + SIDE_APRON); // 14.53
export const COURT_TOP = -BACK_APRON; // -4.5
export const COURT_HEIGHT = COURT_LENGTH + 2 * BACK_APRON; // 32.77
/** Metres of `y` at the top edge of the art box (the far apron's edge). */
const FAR_EDGE_Y = COURT_LENGTH + BACK_APRON; // 28.27

/** The art's `viewBox`: `-7.265 -4.5 14.53 32.77`. */
export const COURT_VIEW_BOX = [COURT_LEFT, COURT_TOP, COURT_WIDTH, COURT_HEIGHT]
  .map((n) => Number(n.toFixed(3)))
  .join(" ");

/** A point on the court, in metres (the `label_shots` frame). */
export interface CourtPoint {
  x: number;
  y: number;
}

/** A point over the court art, in percent (0–100) of its box. */
export interface ScreenPoint {
  sx: number;
  sy: number;
}

/** Metres → percent of the art box. */
export function fromCourt({ x, y }: CourtPoint): ScreenPoint {
  return {
    sx: ((x - COURT_LEFT) / COURT_WIDTH) * 100,
    sy: ((FAR_EDGE_Y - y) / COURT_HEIGHT) * 100,
  };
}

/** Percent of the art box → metres. The inverse of {@link fromCourt}. */
export function toCourt({ sx, sy }: ScreenPoint): CourtPoint {
  return {
    x: (sx / 100) * COURT_WIDTH + COURT_LEFT,
    y: FAR_EDGE_Y - (sy / 100) * COURT_HEIGHT,
  };
}

/** Which side of the net: `near` is `y < 11.885`, the bottom of the art. */
export type CourtHalf = "near" | "far";

export function otherHalf(half: CourtHalf): CourtHalf {
  return half === "near" ? "far" : "near";
}

/** The half a `y` in metres is in. A ball on the net line counts as far. */
export function halfOf(y: number): CourtHalf {
  return y < NET_Y ? "near" : "far";
}

/** Metres of run-off drawn beside each doubles sideline in the half view. */
const HALF_SIDE_RUNOFF = 4.6;
/** Metres of run-off drawn behind the baseline in the half view. */
const HALF_BACK_RUNOFF = 3.5;

export const HALF_LEFT = -(DOUBLES_HALF_WIDTH + HALF_SIDE_RUNOFF); // -10.085
export const HALF_WIDTH = 2 * (DOUBLES_HALF_WIDTH + HALF_SIDE_RUNOFF); // 20.17
/** The half's 276 × 222 box, in metres: 16.224. */
export const HALF_HEIGHT = (HALF_WIDTH * 222) / 276;

/** Metres of `y` at the top edge of a half's box. */
function halfTopY(half: CourtHalf): number {
  return half === "near"
    ? HALF_HEIGHT - HALF_BACK_RUNOFF // 12.724 — just past the net
    : COURT_LENGTH + HALF_BACK_RUNOFF; // 27.27 — the far run-off's edge
}

/**
 * A half's window in the art's SVG frame, as `[x, y, width, height]`: the
 * art is drawn top-down with the far baseline at `0`, so the SVG `y` of a
 * court `y` is `23.77 − y`.
 */
export function halfCourtFrame(
  half: CourtHalf,
): [number, number, number, number] {
  return [HALF_LEFT, COURT_LENGTH - halfTopY(half), HALF_WIDTH, HALF_HEIGHT];
}

/** The zoomed art's `viewBox`: `-10.085 11.046 20.17 16.224` for `near`. */
export function halfCourtViewBox(half: CourtHalf): string {
  return halfCourtFrame(half)
    .map((n) => Number(n.toFixed(3)))
    .join(" ");
}

/** Metres → percent of a half's box. Off the box is outside 0–100. */
export function fromCourtInHalf(
  half: CourtHalf,
  { x, y }: CourtPoint,
): ScreenPoint {
  return {
    sx: ((x - HALF_LEFT) / HALF_WIDTH) * 100,
    sy: ((halfTopY(half) - y) / HALF_HEIGHT) * 100,
  };
}

/** Percent of a half's box → metres. The inverse of {@link fromCourtInHalf}. */
export function toCourtInHalf(
  half: CourtHalf,
  { sx, sy }: ScreenPoint,
): CourtPoint {
  return {
    x: (sx / 100) * HALF_WIDTH + HALF_LEFT,
    y: halfTopY(half) - (sy / 100) * HALF_HEIGHT,
  };
}
