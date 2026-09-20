/**
 * Court geometry for the redesign's two frames — pulled out into a pure
 * module (no React/SVG) so `tests/court-geometry.spec.ts` can import it
 * directly, and so `court-art.tsx` has one source of truth for every
 * coordinate it draws.
 *
 * Ground truth is the design handoff's own SVG markup, copied verbatim into
 * `.superpowers/sdd/2026-09-19-visualizations-tab-phase-1/design-court-frames.md`
 * (F4, frame P1a). Every constant below is a number from that file, not a
 * derived/rounded approximation — `court-art.tsx` draws rects/lines straight
 * off these constants so the two can never drift apart.
 */

/* ── Serve half court ──────────────────────────────────────────────────── */
//
// viewBox="93 9 334 216". The court itself is drawn inside
// `<g transform="translate(260,117) scale(0.85) translate(-260,-125)">` —
// `court-art.tsx` reproduces that `<g>` verbatim (`SERVE_COURT.groupTransform`)
// so every rect/line/dot below is expressed in the SAME pre-transform
// coordinates the design markup uses; the browser does the 0.85 scale-down,
// not this module.
//
// The far BASELINE is at the TOP (y=14), the NET at the BOTTOM (y=236). The
// two service boxes, the centre service line, and the six zone cells all
// span `serviceLineY (116.5) → netY (236)`.
export const SERVE_COURT = {
  viewBox: { minX: 93, minY: 9, w: 334, h: 216 },
  groupTransform: "translate(260,117) scale(0.85) translate(-260,-125)",
  doublesLeft: 135,
  doublesRight: 385,
  singlesLeft: 166.25,
  singlesRight: 353.75,
  baselineY: 14,
  netY: 236,
  serviceLineY: 116.5,
  centerX: 260,
  centerMarkTopY: 14,
  centerMarkBottomY: 22,
  netLineLeft: 122,
  netLineRight: 398,
  netStrokeWidth: 3.3,
  lineWidth: 1.95,
  // Zone band: service-line-to-net, same span the six zone cells occupy.
  zoneTop: 116.5,
  zoneBottom: 236,
} as const;

export const SERVE_BACKGROUND_PATH =
  "M103,9 H417 A10,10 0 0 1 427,19 V225 H93 V19 A10,10 0 0 1 103,9 Z";

export interface ServeDotFraction {
  x: number;
  y: number;
}

/**
 * Projects a 0..1 service-box fraction (a `ServeDot`, from
 * `serve-zones.ts`'s `mapRealCoordsToServeDot`) onto the serve frame's own
 * coordinates: `x=0` → `singlesLeft` (166.25), `x=1` → `singlesRight`
 * (353.75); `y=0` → `serviceLineY` (116.5), `y=1` → `netY` (236) — the same
 * box the fraction was measured against.
 */
export function projectServeDot(d: ServeDotFraction): {
  cx: number;
  cy: number;
} {
  return {
    cx:
      SERVE_COURT.singlesLeft +
      d.x * (SERVE_COURT.singlesRight - SERVE_COURT.singlesLeft),
    cy:
      SERVE_COURT.serviceLineY +
      d.y * (SERVE_COURT.netY - SERVE_COURT.serviceLineY),
  };
}

const ZONE_CELL_COUNT = 6;
const ZONE_CELL_WIDTH =
  (SERVE_COURT.singlesRight - SERVE_COURT.singlesLeft) / ZONE_CELL_COUNT; // 31.25

/**
 * The x-span of the nth zone cell (0-indexed, left→right across the singles
 * box), matching `ZONES`'s own left-to-right order in `serve-zones.ts`
 * (deuce-wide … ad-wide). Six equal 31.25-wide cells inside the 187.5-wide
 * singles box — `ZONES.x1/x2` themselves are literal coordinates in the
 * *legacy* 447-wide frame this redesign replaced, so they aren't reusable
 * here; a cell's position only ever depends on its index in that fixed
 * left-to-right order.
 */
export function zoneCellX(index: number): { x1: number; x2: number } {
  const x1 = SERVE_COURT.singlesLeft + index * ZONE_CELL_WIDTH;
  return { x1, x2: x1 + ZONE_CELL_WIDTH };
}

/* ── Return full court (landscape, pre-rotation) ──────────────────────────
 *
 * viewBox="-43.6 -11.5 431 279". The court is drawn on its side — x is the
 * DEPTH axis (baseline to baseline), y is the LATERAL axis (across the
 * court) — inside two nested groups:
 *   <g transform="translate(-60.6,-125) rotate(90 240 104.5)">
 *     <g transform="translate(240,112) scale(1.02) translate(-240,-104.5)">
 *       ...rects/lines/dots, in the coordinates below...
 *     </g>
 *   </g>
 * `court-art.tsx` reproduces both `<g>`s verbatim — `projectReturnDot`
 * below only ever computes a point in this pre-transform ("logical") space;
 * the browser's SVG engine does the actual 90° turn into a portrait court.
 *
 * 400 units = 23.77 m baseline-to-baseline (`UNITS_PER_METER`); 138.8 units
 * = 8.23 m singles width.
 */
export const RETURN_COURT = {
  viewBox: { minX: -43.6, minY: -11.5, w: 431, h: 279 },
  outerGroupTransform: "translate(-60.6,-125) rotate(90 240 104.5)",
  innerGroupTransform: "translate(240,112) scale(1.02) translate(-240,-104.5)",
  doublesTop: 12,
  doublesBottom: 197,
  singlesTop: 35.1,
  singlesBottom: 173.9,
  centerY: 104.5,
  // The far baseline (opponent's, x=40) and the returner's OWN baseline
  // (x=440) — "near" from the returner's point of view.
  farBaselineX: 40,
  nearBaselineX: 440,
  serviceLineFarX: 132.3,
  serviceLineNearX: 347.7,
  netX: 240,
  netTopY: 0,
  netBottomY: 209,
  netStrokeWidth: 1.74,
  lineWidth: 1.09,
} as const;

export const RETURN_BACKGROUND_PATH = `M${RETURN_COURT.viewBox.minX},${RETURN_COURT.viewBox.minY} H${
  RETURN_COURT.viewBox.minX + RETURN_COURT.viewBox.w
} V${RETURN_COURT.viewBox.minY + RETURN_COURT.viewBox.h} H${RETURN_COURT.viewBox.minX} Z`;

// 400 units of depth = 23.77 m (a full baseline-to-baseline court).
export const UNITS_PER_METER = 400 / 23.77; // ≈16.829

// The lateral axis is scaled independently so the singles sideline lands
// exactly on `singlesTop`/`singlesBottom` at the real singles half-width
// (4.115 m) — using `UNITS_PER_METER` there would land short (≈173.75
// instead of 173.9): the design's own lateral spacing isn't quite the same
// scale as its depth spacing.
const SINGLES_HALF_WIDTH_M = 4.115;
const LATERAL_UNITS_PER_METER =
  (RETURN_COURT.singlesBottom - RETURN_COURT.centerY) / SINGLES_HALF_WIDTH_M; // ≈16.865

export interface ReturnDotMetrics {
  /** Signed metres from the centre line, positive = the returner's right. */
  lateralM: number;
  /**
   * Placement: metres from the net (0 = net, ~11.885 = that half's
   * baseline). Contact: signed metres behind (+) / inside (−) the
   * returner's own baseline.
   */
  depthM: number;
}

/**
 * Projects a return dot's real-world metres onto the return frame's
 * pre-transform coordinates.
 *
 * Depth: `"placement"` runs net (x=240, depthM=0) → that half's baseline
 * (x=440, depthM≈11.885); `"contact"` runs from the returner's own baseline
 * (x=440, depthM=0), with a positive depthM pushing INTO the green run-off
 * past x=440 (a contact struck behind the baseline) and negative pulling
 * back toward the net (a contact struck inside the court).
 *
 * Lateral: the sign is deliberately OPPOSITE between the two kinds. Every
 * dot in this frame goes through the same two `<g>` transforms above
 * (`rotate(90 240 104.5)` then a translate) — but `court-art.tsx` additionally
 * sets `style="transform: rotate(180deg)"` on the `<svg>` itself for
 * `"placement"` only (the design's own choice, copied verbatim). A CSS
 * rotate(180deg) mirrors the rendered image through its own centre — both
 * left/right AND up/down — so a lateral sign that reads correctly for
 * `"contact"` (no extra rotation) would read backwards for `"placement"`
 * once that extra flip is applied. Working through the full transform
 * chain: for `"contact"`, `lateralM > 0` (the returner's right) must map to
 * a SMALLER y here (toward `singlesTop`) to end up on-screen-right; for
 * `"placement"`, because of the extra 180° flip, `lateralM > 0` must map to
 * a LARGER y (toward `singlesBottom`) to *also* end up on-screen-right. Both
 * branches below exist for that reason, not because the underlying data
 * differs.
 */
export function projectReturnDot(
  kind: "placement" | "contact",
  m: ReturnDotMetrics,
): { cx: number; cy: number } {
  const cx =
    kind === "placement"
      ? RETURN_COURT.netX + m.depthM * UNITS_PER_METER
      : RETURN_COURT.nearBaselineX + m.depthM * UNITS_PER_METER;
  const cy =
    kind === "placement"
      ? RETURN_COURT.centerY + m.lateralM * LATERAL_UNITS_PER_METER
      : RETURN_COURT.centerY - m.lateralM * LATERAL_UNITS_PER_METER;
  return { cx, cy };
}

/* ── Shared exports ────────────────────────────────────────────────────── */

// Zone cell opacity (visual-fix-round-2, Defect B): the six zone cells sit on
// top of the blue court fill, so a `var(--viz-you)` blue tint (the original
// design) was unreadable — near-invisible blue-on-blue. Cells are now white,
// shaded by each zone's share of serves *relative to the busiest zone drawn*
// (`maxPct`), not an absolute 0–100 scale: an emptiest-drawn zone (pct=0)
// reads at 0.06, the busiest zone actually drawn (pct=maxPct) at 0.42 — a
// spread wide enough to read cell-to-cell against the blue court, without the
// busiest cell going so opaque it fights the white count/winPct labels drawn
// on top of it.
export const ZONE_OPACITY_MIN = 0.06;
export const ZONE_OPACITY_MAX = 0.42;

/**
 * `maxPct` is the largest `pct` among the zones actually being drawn (not a
 * fixed 100) — so the shade spread always uses the full 0.06–0.42 range even
 * when every zone's share is small. `maxPct <= 0` (no zones drawn, or every
 * zone tied at 0%) returns the minimum shade rather than dividing by zero.
 */
export function zoneOpacity(pct: number, maxPct: number): number {
  if (maxPct <= 0) return ZONE_OPACITY_MIN;
  const t = Math.min(1, Math.max(0, pct / maxPct));
  return ZONE_OPACITY_MIN + t * (ZONE_OPACITY_MAX - ZONE_OPACITY_MIN);
}
