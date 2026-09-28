/**
 * The labelling console's vertical court: one frame, and the pure conversion
 * between it and the metres every label is stored in.
 *
 * ── The two frames ─────────────────────────────────────────────────────────
 * **Court (metres)** — the `shots` / `label_shots` frame: `x` is lateral
 * metres from the centre line, `y` is metres from the NEAR baseline, so the
 * near baseline is `y = 0`, the net `y = 11.885` and the far baseline
 * `y = 23.77`.
 *
 * **Screen (percent)** — where a mark sits over the drawn court, as
 * `{ sx, sy }` in PERCENT, 0–100, of the art box: `sx` from its left edge,
 * `sy` from its top. Percent rather than 0–1 because that is what the
 * overlay's SVG attributes take verbatim (`cx="43.55%"`), so no call site
 * multiplies by 100.
 *
 * The art box is {@link COURT_VIEW_BOX}: the doubles court plus a 0.715 m
 * apron at each side and 2.1 m behind each baseline — board 08's court card.
 * The near baseline is drawn at the BOTTOM (`sy ≈ 92.5`), so `y` grows up
 * the screen while `sy` grows down it:
 *
 *   sx = (x + 6.2) / 12.4 × 100
 *   sy = (25.87 − y) / 27.97 × 100
 *
 * {@link toCourt} and {@link fromCourt} are exact inverses of each other
 * (`tests/label-court-geometry.spec.ts` holds them to it).
 */

/** Metres of apron drawn beside each doubles sideline. */
const SIDE_APRON = 0.715;
/** Metres of apron drawn behind each baseline. */
const BACK_APRON = 2.1;

export const COURT_LENGTH = 23.77;
export const DOUBLES_HALF_WIDTH = 5.485;
export const SINGLES_HALF_WIDTH = 4.115;
export const NET_Y = COURT_LENGTH / 2;
/** Service lines, measured from the near baseline (6.40 m from the net). */
export const NEAR_SERVICE_Y = NET_Y - 6.4;
export const FAR_SERVICE_Y = NET_Y + 6.4;

const LEFT = -(DOUBLES_HALF_WIDTH + SIDE_APRON); // -6.2
const WIDTH = 2 * (DOUBLES_HALF_WIDTH + SIDE_APRON); // 12.4
const TOP = -BACK_APRON; // -2.1
const HEIGHT = COURT_LENGTH + 2 * BACK_APRON; // 27.97
/** Metres of `y` at the top edge of the art box (the far apron's edge). */
const FAR_EDGE_Y = COURT_LENGTH + BACK_APRON; // 25.87

/** The art's `viewBox`: `-6.2 -2.1 12.4 27.97`. */
export const COURT_VIEW_BOX = [LEFT, TOP, WIDTH, HEIGHT]
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
    sx: ((x - LEFT) / WIDTH) * 100,
    sy: ((FAR_EDGE_Y - y) / HEIGHT) * 100,
  };
}

/** Percent of the art box → metres. The inverse of {@link fromCourt}. */
export function toCourt({ sx, sy }: ScreenPoint): CourtPoint {
  return {
    x: (sx / 100) * WIDTH + LEFT,
    y: FAR_EDGE_Y - (sy / 100) * HEIGHT,
  };
}
