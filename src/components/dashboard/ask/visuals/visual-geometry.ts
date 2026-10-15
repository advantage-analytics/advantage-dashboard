/**
 * The arithmetic behind the Ask visual blocks, kept apart from the markup so
 * `tests/ask-visual-geometry.spec.ts` can hold it with no browser.
 *
 * Geometry only: every function here turns a resolved `value` into a width or
 * a coordinate. None of them produces a number anybody reads — what a block
 * prints is the server's `text`, never something computed here.
 */

import {
  BASELINE_Y,
  CENTER_X,
  SERVICE_Y,
  SINGLES_LEFT,
  SINGLES_RIGHT,
  ZONE_LINES_X,
} from "@/lib/data/serve-zones";

/** A bar's width as a percentage of its track, held inside the track. */
export function barWidth(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(Math.max(value, 0), 100);
}

/**
 * Each part's share of a whole as a flex weight, or null when there is no
 * whole to divide (every count is zero): the caller draws an empty track
 * rather than three collapsed segments.
 */
export function shareWeights(counts: readonly number[]): number[] | null {
  const weights = counts.map((count) =>
    Number.isFinite(count) && count > 0 ? count : 0,
  );
  return weights.some((weight) => weight > 0) ? weights : null;
}

/** The trend plot's box, in viewBox units. The right gutter holds the last
 *  point's value, so the label never sits on the line. */
export const TREND_BOX = {
  width: 640,
  height: 120,
  top: 12,
  right: 60,
  bottom: 12,
  left: 6,
} as const;

export interface TrendGeometry {
  /** One coordinate per value, in order. */
  points: { x: number; y: number }[];
  /** The line through them, as an SVG path. */
  path: string;
  /** Where the mean of the values sits — the dashed rule. */
  averageY: number;
  /**
   * The second series, when one was given: its coordinates and line, on the
   * same scale as `points` so the two can be read against each other.
   */
  baseline?: { points: { x: number; y: number }[]; path: string };
}

/**
 * Values in order as a line across the plot box, lowest value on the bottom
 * edge and highest on the top. Equal values have no range to spread over, so
 * they run as a flat line through the middle rather than along the floor.
 *
 * `baseline` is a second series with one value per point; the scale then
 * spans both series. A baseline of another length is not the same points
 * and is ignored.
 */
export function trendGeometry(
  values: readonly number[],
  box: typeof TREND_BOX = TREND_BOX,
  baseline?: readonly number[],
): TrendGeometry {
  const innerW = box.width - box.left - box.right;
  const innerH = box.height - box.top - box.bottom;
  const middle = box.top + innerH / 2;
  if (values.length === 0) return { points: [], path: "", averageY: middle };

  const second =
    baseline && baseline.length === values.length ? baseline : null;
  const all = second ? [...values, ...second] : [...values];
  const low = Math.min(...all);
  const high = Math.max(...all);
  const span = high - low;
  const round = (n: number) => Math.round(n * 100) / 100;
  const x = (index: number) =>
    round(
      box.left +
        (values.length === 1
          ? innerW / 2
          : (index / (values.length - 1)) * innerW),
    );
  const y = (value: number) =>
    span > 0
      ? round(box.top + innerH - ((value - low) / span) * innerH)
      : middle;
  const line = (points: readonly { x: number; y: number }[]) =>
    points
      .map((point, index) => `${index === 0 ? "M" : "L"}${point.x},${point.y}`)
      .join(" ");

  const points = values.map((value, index) => ({ x: x(index), y: y(value) }));
  const average = values.reduce((sum, value) => sum + value, 0) / values.length;
  const out: TrendGeometry = {
    points,
    path: line(points),
    averageY: y(average),
  };
  if (second) {
    const other = second.map((value, index) => ({ x: x(index), y: y(value) }));
    out.baseline = { points: other, path: line(other) };
  }
  return out;
}

// ── Momentum ─────────────────────────────────────────────────────────────────

/** The momentum plot's box, in viewBox units. */
export const MOMENTUM_BOX = {
  width: 640,
  height: 140,
  top: 10,
  right: 10,
  bottom: 10,
  left: 10,
} as const;

export interface MomentumGeometry {
  /** One coordinate per point: the running difference after it. */
  points: { x: number; y: number }[];
  /** The line from level, before the first point, through every point. */
  path: string;
  /** Where level — as many won as lost — sits. */
  zeroY: number;
  /** Each set's span across the plot, in play order; empty when no point names one. */
  sets: { set: number; x1: number; x2: number }[];
}

/**
 * Points in play order as a line of the running difference, points won
 * minus points lost: level is the middle of the box, and the scale is
 * symmetric about it, so a lead and a deficit of the same size are the same
 * distance from the rule. The line starts at level before the first point.
 */
export function momentumGeometry(
  points: readonly { won: boolean; set?: number }[],
  box: typeof MOMENTUM_BOX = MOMENTUM_BOX,
): MomentumGeometry {
  const innerW = box.width - box.left - box.right;
  const innerH = box.height - box.top - box.bottom;
  const zeroY = box.top + innerH / 2;
  const round = (n: number) => Math.round(n * 100) / 100;
  if (points.length === 0) return { points: [], path: "", zeroY, sets: [] };

  const differences: number[] = [];
  let running = 0;
  for (const point of points) {
    running += point.won ? 1 : -1;
    differences.push(running);
  }
  const reach = Math.max(1, ...differences.map((d) => Math.abs(d)));
  const x = (index: number) =>
    round(box.left + ((index + 1) / points.length) * innerW);
  const y = (difference: number) =>
    round(zeroY - (difference / reach) * (innerH / 2));
  const coordinates = differences.map((difference, index) => ({
    x: x(index),
    y: y(difference),
  }));
  const path = [
    `M${box.left},${round(zeroY)}`,
    ...coordinates.map((point) => `L${point.x},${point.y}`),
  ].join(" ");

  const sets: MomentumGeometry["sets"] = [];
  points.forEach((point, index) => {
    if (point.set === undefined) return;
    const last = sets[sets.length - 1];
    const x1 = index === 0 ? box.left : coordinates[index - 1].x;
    if (last && last.set === point.set) last.x2 = coordinates[index].x;
    else sets.push({ set: point.set, x1, x2: coordinates[index].x });
  });
  return { points: coordinates, path, zeroY: round(zeroY), sets };
}

// ── The serve court ──────────────────────────────────────────────────────────

/** The three serve directions, in the order the serve block holds them. */
export type ServeZoneKey = "t" | "body" | "wide";
export const SERVE_ZONES: readonly ServeZoneKey[] = ["t", "body", "wide"];

/** The two service courts a point is played from (`ask.points.court`). */
export type ServeCourtSide = "deuce" | "ad";

/**
 * A court label that names a side: "Deuce", "ad", "Deuce court", "Ad side".
 * Anything else — "First serves", "All serves" — is a group of serves, not
 * a place on the court.
 */
const COURT_LABEL = /^(deuce|ad)(?:[\s-]+(?:court|side))?$/;

/**
 * Which of a serve block's courts is the deuce court and which the ad, or
 * null unless there are exactly two and each names one side. Only then is
 * the block a court; with any other labelling it stays a bar per court.
 */
export function serveCourtSides(
  courts: readonly { label: string }[],
): Record<ServeCourtSide, number> | null {
  if (courts.length !== 2) return null;
  const sides = courts.map(
    (court) => COURT_LABEL.exec(court.label.trim().toLowerCase())?.[1] ?? null,
  );
  const deuce = sides.indexOf("deuce");
  const ad = sides.indexOf("ad");
  return deuce !== -1 && ad !== -1 ? { deuce, ad } : null;
}

export interface ServeCourtCell {
  zone: ServeZoneKey;
  /** The third of the service box the zone is, in court units. */
  x: number;
  width: number;
  /** A column standing on the net line, as deep as the zone's share of the court's serves. */
  y: number;
  height: number;
  /** The zone's share of the court's three counts, 0–1; 0 when there is nothing to divide. */
  share: number;
}

/**
 * The thirds of each service box, as `serve-zones.ts`'s `ZONES` cut them
 * (the same constants `half-court-svg.tsx` draws with): the deuce court is
 * the left box, wide at the sideline and T at the centre line; the ad court
 * is the right box, T at the centre line and wide at the sideline.
 */
const BOX_THIRDS: Record<
  ServeCourtSide,
  Record<ServeZoneKey, readonly [number, number]>
> = {
  deuce: {
    wide: [SINGLES_LEFT, ZONE_LINES_X[0]],
    body: [ZONE_LINES_X[0], ZONE_LINES_X[1]],
    t: [ZONE_LINES_X[1], CENTER_X],
  },
  ad: {
    t: [CENTER_X, ZONE_LINES_X[2]],
    body: [ZONE_LINES_X[2], ZONE_LINES_X[3]],
    wide: [ZONE_LINES_X[3], SINGLES_RIGHT],
  },
};

/**
 * One court's three zones as columns on the court: each stands in its own
 * third of the service box and rises from the net line by its share of the
 * court's serves, the full box depth being every serve. A zone with no
 * serves has no column; a court with no serves has none at all.
 */
export function serveCourtCells(
  side: ServeCourtSide,
  counts: Record<ServeZoneKey, number>,
): ServeCourtCell[] {
  const depth = BASELINE_Y - SERVICE_Y;
  const weights = shareWeights(SERVE_ZONES.map((zone) => counts[zone]));
  const total = weights ? weights.reduce((sum, weight) => sum + weight, 0) : 0;
  const round = (n: number) => Math.round(n * 100) / 100;
  return SERVE_ZONES.map((zone, index) => {
    const [x1, x2] = BOX_THIRDS[side][zone];
    const share = weights && total > 0 ? weights[index] / total : 0;
    const height = round(share * depth);
    return {
      zone,
      x: round(x1),
      width: round(x2 - x1),
      y: round(BASELINE_Y - height),
      height,
      share: Math.round(share * 10000) / 10000,
    };
  });
}
