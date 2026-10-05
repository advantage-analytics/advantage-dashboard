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
 * The art box is {@link COURT_VIEW_BOX}: the doubles court plus a 1.78 m
 * apron at each side and 4.5 m behind each baseline. Board 08 drew 0.715 m
 * and 2.1 m, which clipped real contact points: players routinely strike the
 * ball 3–4 m behind the baseline. The two aprons grew together so the box
 * keeps board 08's 86 × 194 proportions.
 * The near baseline is drawn at the BOTTOM (`sy ≈ 86.3`), so `y` grows up
 * the screen while `sy` grows down it:
 *
 *   sx = (x + 7.265) / 14.53 × 100
 *   sy = (28.27 − y) / 32.77 × 100
 *
 * {@link toCourt} and {@link fromCourt} are exact inverses of each other
 * (`tests/label-court-geometry.spec.ts` holds them to it).
 *
 * There is no zoomed frame: a stroke is placed on this whole court, at this
 * scale. The court can be drawn the other way up ("Flip side"), which is a
 * turn of the screen point about the box's centre — {@link turnScreen} — not
 * a frame of its own, since the art is symmetric about the net.
 */

/** Metres of apron drawn beside each doubles sideline. */
const SIDE_APRON = 1.78;
/** Metres of apron drawn behind each baseline. */
const BACK_APRON = 4.5;

export const COURT_LENGTH = 23.77;
export const DOUBLES_HALF_WIDTH = 5.485;
export const SINGLES_HALF_WIDTH = 4.115;
export const NET_Y = COURT_LENGTH / 2;
/** Service lines, measured from the near baseline (6.40 m from the net). */
export const NEAR_SERVICE_Y = NET_Y - 6.4;
export const FAR_SERVICE_Y = NET_Y + 6.4;

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

/**
 * The screen point turned half a turn about the box's centre — the court
 * drawn the other way up. Its own inverse, so one function serves both the
 * mark going on and the click coming off.
 */
export function turnScreen({ sx, sy }: ScreenPoint): ScreenPoint {
  return { sx: 100 - sx, sy: 100 - sy };
}
