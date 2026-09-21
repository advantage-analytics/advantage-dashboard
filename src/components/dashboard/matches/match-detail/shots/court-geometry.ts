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

import type { Cut, VizDot } from "./viz-model";
import {
  clampPan,
  ZOOM_MIN,
  ZOOM_MAX,
  type PanZoom,
  type Size,
} from "./pan-zoom";

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
 *
 * (Fix round 1, F3: `VizDot` no longer carries the `x`/`y` fraction this
 * reads — both `court-art.tsx` serve call sites moved to
 * `projectServeMetricDot`, since an out/net serve can't be represented as
 * an in-box fraction. This function stays: it's a plain, correct projection
 * with no other dependency, `tests/court-geometry.spec.ts` exercises it
 * directly against `SERVE_COURT`'s own constants, and removing it would
 * mean deleting that coverage for no behavioural gain.)
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
 * viewBox originally "-43.6 -11.5 431 279" in the design handoff — minY/h
 * are now DIFFERENT (fix round 4B below is a deliberate, user-requested
 * deviation from the handoff on this one edge; see the spec's "As built").
 * The court is drawn on its side — x is the DEPTH axis (baseline to
 * baseline), y is the LATERAL axis (across the court) — inside two nested
 * groups:
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

// Fix round 4B: the handoff's own viewBox.minY (-11.5) clips the net line
// off the visible frame entirely — the net's own centreline projects to
// viewBoxY = -20.5 (`depthToViewBoxY(240)`, defined further below in this
// file: `1.02*(240-240) + 104.5 - 125`), short of -11.5 by 9 units. Extended
// so the net line is fully visible AND a net-gutter mark (fix round 4A:
// where a `atNet` dot draws instead of its real, unusable landing) can sit
// just beyond it, on the hitter's side, without clipping — the SAME
// consistent "just past the net" placement the serve frame already uses,
// rather than an arbitrary inset from the old (net-less) visible edge.
//
// Fix round 5 (robustness, no behaviour change): the `-20.5` below is
// `depthToViewBoxY(RETURN_COURT.netX)`'s own result, hard-coded rather than
// computed — `depthToViewBoxY` genuinely can't be called here, since it
// reads `RETURN_COURT.netX`/`.centerY`, and `RETURN_COURT` isn't
// constructed yet at this point in the module (the circular dependency is
// real). `tests/court-geometry.spec.ts` pins this identity instead, calling
// the real (exported) `depthToViewBoxY(RETURN_COURT.netX)` once the module
// has fully loaded and asserting it equals `RETURN_VIEWBOX_MIN_Y +
// RETURN_VIEWBOX_MIN_Y_CLEARANCE` — so a drift in `netX`, `centerY`,
// `RETURN_INNER_SCALE` or `RETURN_OUTER_TRANSLATE_Y` fails a test instead of
// silently clipping the net line again.
//
// Clearance from the net's own centreline: half its rendered stroke width
// (so the LINE itself isn't clipped) + one mark's nominal radius
// (`RETURN_DOT_R`, below — court-art.tsx imports it from here rather than
// keeping its own second copy) + a small margin so the mark's own outer
// edge doesn't touch the frame's edge either.
const RETURN_NET_STROKE_WIDTH = 1.74; // = RETURN_COURT.netStrokeWidth, below
const RETURN_NET_HALF_STROKE = RETURN_NET_STROKE_WIDTH / 2; // 0.87
// The nominal radius every return-frame mark draws at (fix round 5: the
// ONE source — `court-art.tsx` imports this rather than keeping its own
// `RETURN_DOT_R` literal, and the viewBox clearance below and
// `netGutterFor`'s clearance read the SAME export, so a radius change can't
// silently stop being covered by either).
export const RETURN_DOT_R = 2.4;
const RETURN_VIEWBOX_MARGIN = 1;
// A net-gutter mark's centre sits this far past the net's own centreline —
// just clearing its rendered stroke — on the hitter's side (`netGutterFor`
// below applies it as a SUBTRACTION from `RETURN_COURT.netX`, since the
// hitter's side is the smaller-depth-x direction).
const RETURN_NET_GUTTER_OFFSET = RETURN_NET_HALF_STROKE;
// Exported so `tests/court-geometry.spec.ts` can pin the `-20.5` identity
// above without duplicating this arithmetic a second time.
export const RETURN_VIEWBOX_MIN_Y_CLEARANCE =
  RETURN_NET_HALF_STROKE + RETURN_DOT_R + RETURN_VIEWBOX_MARGIN; // 4.27
const RETURN_VIEWBOX_MIN_Y = -20.5 - RETURN_VIEWBOX_MIN_Y_CLEARANCE; // -24.77
const RETURN_VIEWBOX_MIN_Y_ORIGINAL = -11.5; // the design handoff's own value
// h grows by exactly how much minY decreased, so the far edge (minY + h)
// is unchanged.
const RETURN_VIEWBOX_H_GROWTH =
  RETURN_VIEWBOX_MIN_Y_ORIGINAL - RETURN_VIEWBOX_MIN_Y; // ≈13.27

export const RETURN_COURT = {
  viewBox: {
    minX: -43.6,
    minY: RETURN_VIEWBOX_MIN_Y,
    w: 431,
    h: 279 + RETURN_VIEWBOX_H_GROWTH,
  },
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

/* ── Heat filter bounds (G3a, Data; full-view rewrite P2j; density-blob
 *    rewrite superseding both) ─────────────────────────────────────────────
 *
 * `heatBoundsFor(cut)` below is each frame's WHOLE VISIBLE VIEW — its own
 * `viewBox` — mapped back through that frame's group transform(s) into the
 * SAME pre-transform (dots') coordinate space `projectServeDot`/
 * `projectReturnDot` output, so the density heatmap's `<filter>`
 * (`court-art.tsx`'s `HeatFilterDef`, region from `heatFilterRegionFor`
 * below) covers the entire court rather than a sub-region. `returnPlacement`,
 * `returnContact` and `rallyPosition` all read the SAME `RETURN_HEAT_BOUNDS`
 * — they share one frame, so only which frame the dots are drawn on matters,
 * never which cut it is. `serve` gets its own `SERVE_HEAT_BOUNDS`.
 */
export interface HeatBounds {
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
}

// The serve group transform's own numbers — `translate(260,117) scale(0.85)
// translate(-260,-125)` — named so the inverse below reads off the same
// numbers `court-art.tsx` renders with (`SERVE_COURT.groupTransform`)
// instead of a second, driftable copy. `SERVE_COURT.centerX` (260) already
// doubles as both the outer translate's x target and the inner translate's
// x origin, so only the y-axis pair needs new names here.
const SERVE_GROUP_SCALE = 0.85;
const SERVE_GROUP_TRANSLATE_Y = 117;
const SERVE_GROUP_ORIGIN_Y = 125;

/**
 * Inverts `SERVE_COURT.groupTransform` on the x-axis — maps a point in the
 * serve `<svg>`'s own viewBox space back to the pre-transform x
 * `projectServeDot` outputs. Forward:
 * `X = SERVE_GROUP_SCALE*(x-centerX)+centerX`; algebraic inverse below.
 * `tests/court-geometry.spec.ts` cross-checks both axes against an
 * independent re-implementation of the transform string itself.
 */
function serveViewBoxToLogicalX(viewBoxX: number): number {
  return (
    (viewBoxX - SERVE_COURT.centerX) / SERVE_GROUP_SCALE + SERVE_COURT.centerX
  );
}

/**
 * Inverts `SERVE_COURT.groupTransform` on the y-axis. Forward:
 * `Y = SERVE_GROUP_SCALE*(y-SERVE_GROUP_ORIGIN_Y)+SERVE_GROUP_TRANSLATE_Y`;
 * algebraic inverse below.
 */
function serveViewBoxToLogicalY(viewBoxY: number): number {
  return (
    (viewBoxY - SERVE_GROUP_TRANSLATE_Y) / SERVE_GROUP_SCALE +
    SERVE_GROUP_ORIGIN_Y
  );
}

// The full visible serve-frame view, in pre-transform (logical) coordinates
// — every corner of `SERVE_COURT.viewBox` mapped back through
// `groupTransform` via the two inverses above.
export const SERVE_HEAT_BOUNDS: HeatBounds = {
  xMin: serveViewBoxToLogicalX(SERVE_COURT.viewBox.minX),
  xMax: serveViewBoxToLogicalX(
    SERVE_COURT.viewBox.minX + SERVE_COURT.viewBox.w,
  ),
  yMin: serveViewBoxToLogicalY(SERVE_COURT.viewBox.minY),
  yMax: serveViewBoxToLogicalY(
    SERVE_COURT.viewBox.minY + SERVE_COURT.viewBox.h,
  ),
};

// The return-frame transform numbers that matter for the two inverse
// projections below — copied from `RETURN_COURT.innerGroupTransform`'s own
// `scale(1.02)` and `translate(240,112)`, and
// `RETURN_COURT.outerGroupTransform`'s own `translate(-60.6,-125)` — so the
// algebra reads straight off the same numbers `court-art.tsx` renders with
// instead of a second, driftable copy.
const RETURN_INNER_SCALE = 1.02;
const RETURN_INNER_TRANSLATE_TARGET_Y = 112;
const RETURN_OUTER_TRANSLATE_X = -60.6;
const RETURN_OUTER_TRANSLATE_Y = -125;

/**
 * Maps a pre-transform depth-x value — the SAME coordinate
 * `projectReturnDot`'s `cx` uses for `"contact"`/`"placement"` — to the y it
 * lands on in the return frame's OWN viewBox, after the frame's real two
 * `<g>` transforms (`innerGroupTransform` then `outerGroupTransform`,
 * innermost-first, exactly as `court-art.tsx` nests them).
 *
 * Composing `translate(240,112) scale(1.02) translate(-240,-104.5)` with
 * `translate(-60.6,-125) rotate(90 240 104.5)`: because the rotation is an
 * exact 90°, the composed transform's output-y depends ONLY on input
 * depth-x (the lateral input drops out of the y-component entirely) —
 * algebra, using `RETURN_COURT.netX` (240, both the inner translate's x
 * target AND the rotation centre's x) and `RETURN_COURT.centerY` (104.5,
 * the rotation centre's y):
 *   innerX(depthX) = RETURN_INNER_SCALE*(depthX - netX) + netX
 *   rotatedY = centerY + (innerX(depthX) - netX)
 *            = RETURN_INNER_SCALE*(depthX - netX) + centerY
 *   outputY = rotatedY + RETURN_OUTER_TRANSLATE_Y
 * `tests/court-geometry.spec.ts` cross-checks this against an independent
 * re-implementation of the same two transform strings, and (fix round 5)
 * pins `RETURN_COURT.viewBox.minY`'s own derivation against a live call to
 * this function — see that constant's own doc comment above.
 */
export function depthToViewBoxY(depthX: number): number {
  return (
    RETURN_INNER_SCALE * (depthX - RETURN_COURT.netX) +
    RETURN_COURT.centerY +
    RETURN_OUTER_TRANSLATE_Y
  );
}

/**
 * The algebraic inverse of `depthToViewBoxY` — the pre-transform depth-x
 * value that lands at a given return-frame viewBox y. `RETURN_INNER_SCALE`
 * is linear, so this is an exact inverse, not a bisection search.
 */
function viewBoxYToDepthX(viewBoxY: number): number {
  return (
    (viewBoxY - RETURN_COURT.centerY - RETURN_OUTER_TRANSLATE_Y) /
      RETURN_INNER_SCALE +
    RETURN_COURT.netX
  );
}

/**
 * Maps a pre-transform lateral-y value — the SAME coordinate
 * `projectReturnDot`'s `cy` uses — to the x it lands on in the return
 * frame's OWN viewBox, after the same two `<g>` transforms. Symmetric to
 * `depthToViewBoxY`: because the rotation is an exact 90°, output-x depends
 * ONLY on input lateral-y (the depth input drops out entirely):
 *   innerY(lateralY) = RETURN_INNER_SCALE*(lateralY - centerY) + RETURN_INNER_TRANSLATE_TARGET_Y
 *   rotatedX = netX - (innerY(lateralY) - centerY)
 *   outputX = rotatedX + RETURN_OUTER_TRANSLATE_X
 */
export function lateralToViewBoxX(lateralY: number): number {
  const innerY =
    RETURN_INNER_SCALE * (lateralY - RETURN_COURT.centerY) +
    RETURN_INNER_TRANSLATE_TARGET_Y;
  const rotatedX = RETURN_COURT.netX - (innerY - RETURN_COURT.centerY);
  return rotatedX + RETURN_OUTER_TRANSLATE_X;
}

/** The algebraic inverse of `lateralToViewBoxX`. */
function viewBoxXToLateralY(viewBoxX: number): number {
  const rotatedX = viewBoxX - RETURN_OUTER_TRANSLATE_X;
  const innerY = RETURN_COURT.centerY - (rotatedX - RETURN_COURT.netX);
  return (
    (innerY - RETURN_INNER_TRANSLATE_TARGET_Y) / RETURN_INNER_SCALE +
    RETURN_COURT.centerY
  );
}

// The full visible return-frame view, in pre-transform (logical) coordinates
// — every corner of `RETURN_COURT.viewBox` mapped back through both `<g>`
// transforms via `viewBoxYToDepthX`/`viewBoxXToLateralY` above. Depth: the
// near viewBox y-edge (`viewBox.minY`) maps to ≈248.8 (NOT `netX`/240 — the
// net itself sits just outside the visible viewBox on that edge), the far
// edge (`viewBox.minY + viewBox.h`) to ≈522.35 (this used to be the
// separately-named `RETURN_HEAT_DEPTH_MAX`; it's now just `xMax` here).
// Lateral: the mapping is order-reversing on this axis (see
// `lateralToViewBoxX`'s sign) — the left viewBox x-edge maps to the LARGER
// lateral-y (≈315.77, `yMax`), the right edge to the SMALLER (≈-106.77,
// `yMin`).
export const RETURN_HEAT_BOUNDS: HeatBounds = {
  xMin: viewBoxYToDepthX(RETURN_COURT.viewBox.minY),
  xMax: viewBoxYToDepthX(RETURN_COURT.viewBox.minY + RETURN_COURT.viewBox.h),
  yMin: viewBoxXToLateralY(RETURN_COURT.viewBox.minX + RETURN_COURT.viewBox.w),
  yMax: viewBoxXToLateralY(RETURN_COURT.viewBox.minX),
};

/**
 * A cut's heat FILTER region, in the SAME projected coordinate space the
 * dots (`court-art.tsx`'s per-dot `<circle>`s, since the density heatmap
 * rewrite below draws directly from `VizDot`s, not a binned grid) are
 * projected into. Still the single source `court-art.tsx` reads for the
 * `<filter>`'s `userSpaceOnUse` region (I2, unchanged by that rewrite):
 * `returnPlacement`, `returnContact` and `rallyPosition` share the same
 * return-frame view (`RETURN_HEAT_BOUNDS`) since they share one frame —
 * only `serve` differs, on its own frame (`SERVE_HEAT_BOUNDS`).
 */
export function heatBoundsFor(
  cut: "serve" | "returnPlacement" | "returnContact" | "rallyPosition",
): HeatBounds {
  return cut === "serve" ? SERVE_HEAT_BOUNDS : RETURN_HEAT_BOUNDS;
}

/* ── Density heatmap (blur+colourize) — replaces the P2i/P2j cell grid ────
 *
 * User decision: "the heatmap shouldn't be rectangles, just blobs/blurs like
 * a regular one" — `court-art.tsx` now draws one circle per dot (fill white,
 * fixed opacity) and colourizes the whole thing with a single SVG filter
 * (feGaussianBlur → feColorMatrix → feComponentTransfer) instead of binning
 * into a grid of `<rect>`s. The constants below are the pure, testable
 * numbers that filter needs: a blob radius per frame (so a blob reads the
 * same apparent size on both court shapes) and the colour/alpha ramp tables
 * `feComponentTransfer` walks.
 */

// The blob radius, in the return frame's own pre-transform units — the
// user's "more focused" pick (tightened from an earlier 1.1 m: "the heatmap
// should be more focused for each point" — a distinct small hot spot per
// shot, only merging on a real overlap), expressed as a real-world size
// (0.55 m) via `UNITS_PER_METER` (the depth axis' own metres→units scale —
// see that constant's own doc comment). ≈9.26 units.
export const RETURN_HEAT_DOT_RADIUS = 0.55 * UNITS_PER_METER;

// The serve frame's own design units aren't calibrated to real metres the
// way the return frame's are (see `UNITS_PER_METER`'s doc comment), so
// matching "the same 1.1 m" there isn't meaningful — matching the RETURN
// radius' actual SCREEN size is. Both frames render into a box of
// (approximately) the same aspect ratio: the wall/saved-view tile's art box
// is CSS-locked to the SERVE frame's own aspect (`court-tile.tsx`'s
// `aspectRatio: "334 / 216"` ≈ 1.5463). Fix round 4B's `RETURN_COURT.viewBox`
// extension (net-line visibility, see that section's own comment) moved the
// return frame's own viewBox aspect from 431/279 ≈ 1.5448 (differed from the
// box by under 0.1%) to 431/292.27 ≈ 1.4746 (now ≈4.6% off) — `court-tile.tsx`
// and `viz-focused.tsx`'s fixed-aspect wrappers were checked against this:
// with `preserveAspectRatio="xMidYMid meet"`, the return frame is now
// slightly HEIGHT-constrained inside that box (content proportionally
// taller than the box), leaving ≈2.3% empty margin on each side rather than
// effectively none — a thin, not "bad", letterbox; visual confirmation is
// still worth a look before shipping, but no code change follows from this
// alone. `preserveAspectRatio` scales each viewBox by very nearly
// `boxWidthPx / viewBox.w` for both regardless, so the radius-matching maths
// below is still directionally correct even though the two frames' own
// aspects no longer agree as tightly. A dot's on-screen radius is therefore
// (radius in this module's pre-transform units) × (that frame's own
// group-transform scale) × (boxWidthPx / viewBox.w). Solving `radius_serve`
// so the two screen radii match, for the SAME `boxWidthPx`:
//   radius_serve = radius_return
//     × (RETURN's own inner-group scale ÷ SERVE's own group scale)
//     × (SERVE_COURT.viewBox.w ÷ RETURN_COURT.viewBox.w)
// `tests/court-geometry.spec.ts` cross-checks this against an independent
// re-implementation of both scale factors. ≈8.61 units.
export const SERVE_HEAT_DOT_RADIUS =
  RETURN_HEAT_DOT_RADIUS *
  (RETURN_INNER_SCALE / SERVE_GROUP_SCALE) *
  (SERVE_COURT.viewBox.w / RETURN_COURT.viewBox.w);

/** A cut's blob radius, in the SAME projected coordinate space
 * `heatBoundsFor(cut)` and `projectServeDot`/`projectReturnDot` share. */
export function heatDotRadiusFor(
  cut: "serve" | "returnPlacement" | "returnContact" | "rallyPosition",
): number {
  return cut === "serve" ? SERVE_HEAT_DOT_RADIUS : RETURN_HEAT_DOT_RADIUS;
}

// Margin around `heatBoundsFor(cut)` the `<filter>`'s own `userSpaceOnUse`
// region pads by, as a multiple of that cut's blob radius — big enough that
// `feGaussianBlur`'s kernel (effectively ~3×`stdDeviation`, itself half the
// radius, so ~1.5×radius of real spread) settles well inside the filter
// region's own edge instead of getting clipped there into a visible hard
// line right at the boundary.
const HEAT_FILTER_MARGIN_RATIO = 2;

export interface HeatFilterRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * The `<filter>` element's own `x`/`y`/`width`/`height` (with
 * `filterUnits="userSpaceOnUse"`) for a cut's heat chart — `heatBoundsFor(cut)`
 * (the frame's whole visible view) padded by `HEAT_FILTER_MARGIN_RATIO` blob
 * radii on every side. Every pixel inside this rectangle gets painted by
 * `feComponentTransfer`'s table lookups regardless of whether a dot circle
 * actually reached it (`court-art.tsx`'s `HeatFilterDef` doc comment has the
 * mechanism), which is what makes "the filter region" and "the whole tinted
 * view" the same rectangle — so this needing to fully cover `heatBoundsFor`
 * is exactly what "the tint fills the entire view" comes down to.
 */
export function heatFilterRegionFor(
  cut: "serve" | "returnPlacement" | "returnContact" | "rallyPosition",
): HeatFilterRegion {
  const bounds = heatBoundsFor(cut);
  const margin = heatDotRadiusFor(cut) * HEAT_FILTER_MARGIN_RATIO;
  return {
    x: bounds.xMin - margin,
    y: bounds.yMin - margin,
    width: bounds.xMax - bounds.xMin + margin * 2,
    height: bounds.yMax - bounds.yMin + margin * 2,
  };
}

// The heat ramp's four colour stops — `--viz-heatmap-0..3`,
// `src/styles/design-system/colors.css` (light mode only: an SVG filter
// primitive's `tableValues` takes literal numbers, not a CSS custom
// property, so this can't track the dark-mode variant the token also
// carries there — consistent with DESIGN.md's dark-mode deferral).
const HEAT_RAMP_HEX = ["#F2F2F2", "#B8D4F9", "#6AABFF", "#3B82F6"] as const;

/**
 * One channel's `feFuncR`/`feFuncG`/`feFuncB` `tableValues` string — each
 * ramp colour's own byte for that channel, normalised to 0..1 the way SVG
 * filter primitives expect. Pure and exported so
 * `tests/court-geometry.spec.ts` can round-trip it back against
 * `HEAT_RAMP_HEX` without duplicating the parsing.
 */
export function heatRampChannelTable(channel: "r" | "g" | "b"): string {
  const start = channel === "r" ? 1 : channel === "g" ? 3 : 5;
  return HEAT_RAMP_HEX.map((hex) => {
    const byte = parseInt(hex.slice(start, start + 2), 16);
    return (byte / 255).toFixed(3);
  }).join(" ");
}

export const HEAT_RAMP_R_TABLE = heatRampChannelTable("r");
export const HEAT_RAMP_G_TABLE = heatRampChannelTable("g");
export const HEAT_RAMP_B_TABLE = heatRampChannelTable("b");

// The alpha ramp `feFuncA` walks: starts at 0 now (NOT a floor — "the tint is
// not consistent on the view" traced to the filter itself painting a floor
// across its whole region while the letterbox strips outside the svg's own
// content box painted a SEPARATE, slightly different green; the fix moves
// the floor tint out of the filter entirely, onto one uniform wash div over
// the whole art box — see `heatFloorTintRgba` below) and climbs STEEPLY — the
// "more sensitive" feedback — so a single dot's blob is already clearly
// visible against that wash rather than reading as a flat, hard-to-see
// minimum; a denser cluster still has headroom up to 0.82 (P2i's own
// ceiling) before it flattens out.
export const HEAT_ALPHA_TABLE = "0 0.5 0.68 0.77 0.82";

// The uniform wash's own alpha — NOT the filter's floor any more (that's 0,
// above). Same 0.1 the filter's floor used to be, kept as its own named
// constant since the two are no longer the same number by construction, only
// by coincidence of matching the old value.
export const HEAT_WASH_ALPHA = 0.1;

/**
 * The uniform heat wash's colour (`HEAT_RAMP_HEX[0]` at `HEAT_WASH_ALPHA`) as
 * a CSS `rgba()` string, derived from the SAME ramp constant the filter's own
 * colour tables use rather than a second hand-picked literal. `viz-focused.tsx`/
 * `court-tile.tsx` paint this as ONE flat div covering the whole art box
 * (above the svg, not inside it) so the tint reads as a single consistent
 * colour across the entire box — including any sliver the svg's own
 * `preserveAspectRatio` letterboxes inside itself — rather than two
 * different-looking greens (the bug this replaces: the filter's old floor
 * tint painted only the svg's own content box, and a CSS gradient painted a
 * second, visibly different green underneath the letterbox strips).
 */
export function heatFloorTintRgba(): string {
  const hex = HEAT_RAMP_HEX[0];
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${HEAT_WASH_ALPHA})`;
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
 * when every zone's share is small. A non-positive `maxPct` (no zones drawn,
 * or every zone tied at 0%) returns the minimum shade rather than dividing
 * by zero — written as `!(maxPct > 0)`, not `maxPct <= 0`, so it also catches
 * `NaN` (Task 2 fix round 1, F1): `serve-zones.ts`'s `computeZoneStats`
 * divides by `dots.length`, which is 0 (every `pct` becomes `NaN`) whenever
 * every serve reaching this chart is out/net — `count > 0` no longer implies
 * a non-empty `serveDots` the way it did before Task 2. `NaN <= 0` is
 * `false`, so the old guard let `NaN` through into `fillOpacity`; `NaN > 0`
 * is also `false`, so negating it still catches this case.
 */
export function zoneOpacity(pct: number, maxPct: number): number {
  if (!(maxPct > 0)) return ZONE_OPACITY_MIN;
  const t = Math.min(1, Math.max(0, pct / maxPct));
  return ZONE_OPACITY_MIN + t * (ZONE_OPACITY_MAX - ZONE_OPACITY_MIN);
}

/* ── Triangle marks (G2) ───────────────────────────────────────────────────
 *
 * Area-match a triangle to a circle of the same nominal radius — moved here
 * verbatim from `court-art.tsx`'s old `trianglePoints` (visualizations-tab-
 * phase-1 spec's derivation), the constant kept local since no other module
 * needs it.
 */
const TRIANGLE_AREA_SCALE = 1.33;

export type TriangleKind = "serve" | "contact" | "placement";

/**
 * A "backhand" triangle mark whose apex lands screen-UP once `court-art.tsx`
 * applies that court's real transform chain — NOT local −y in every case,
 * because two of the three frames rotate what this function draws:
 *
 * - "serve": the serve `<svg>` carries no rotation at all, so local −y
 *   already IS screen-up. Unchanged from the old `trianglePoints`.
 * - "contact": the return frame's shared `<g rotate(90 240 104.5)>` maps a
 *   local vector `(dx, dy) -> (-dy, dx)`. Solving `(-dy, dx) = (0, -k)` for
 *   the apex vector gives local `(-k, 0)` — the apex points local −x here so
 *   that rotate(90) turns it screen-up.
 * - "placement": same outer rotate(90), PLUS the extra CSS
 *   `transform: rotate(180deg)` `court-art.tsx` sets on that `<svg>` only
 *   for this kind, which negates both axes on top of the rotate(90) result:
 *   `(dy, -dx) = (0, -k)` solves to local `(k, 0)` — the apex points local
 *   +x.
 *
 * Both return cases are 90°-rotations of the SAME triangle "serve" draws
 * (base corners rotated the same amount as the apex), so area and centroid
 * are identical across all three kinds for a given `size` — only the
 * orientation differs. `tests/court-geometry.spec.ts` composes each kind's
 * real frame rotation(s) and asserts the apex is the topmost of the three
 * vertices.
 */
export function trianglePointsFor(
  kind: TriangleKind,
  cx: number,
  cy: number,
  size: number,
): string {
  const s = size * TRIANGLE_AREA_SCALE;
  const apexOffset = s * 1.1883;
  const baseOffset = s * 0.5942;
  if (kind === "contact") {
    // Apex points local −x; base corners rotated the same −90°.
    return `${cx - apexOffset},${cy} ${cx + baseOffset},${cy - s} ${cx + baseOffset},${cy + s}`;
  }
  if (kind === "placement") {
    // Apex points local +x; base corners rotated the same +90°.
    return `${cx + apexOffset},${cy} ${cx - baseOffset},${cy - s} ${cx - baseOffset},${cy + s}`;
  }
  // "serve": unrotated frame, local −y is already screen-up.
  return `${cx},${cy - apexOffset} ${cx - s},${cy + baseOffset} ${cx + s},${cy + baseOffset}`;
}

/* ── Ace star (G2b) ────────────────────────────────────────────────────────
 *
 * A regular 5-point star (10 vertices, alternating outer radius R and inner
 * radius R/2), first vertex straight up on screen. The serve frame has no
 * rotation on its `<svg>` (unlike the return frames), so "straight up" here
 * needs no frame composition — angle −90° in a y-down coordinate system
 * (screen) is the top of the circle, matching `trianglePointsFor("serve",…)`'s
 * own unrotated apex.
 */
export function starPoints(cx: number, cy: number, outerR: number): string {
  const innerR = outerR * 0.5;
  const points: string[] = [];
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? outerR : innerR;
    const angleDeg = -90 + i * 36;
    const angleRad = (angleDeg * Math.PI) / 180;
    const x = cx + r * Math.cos(angleRad);
    const y = cy + r * Math.sin(angleRad);
    points.push(`${x},${y}`);
  }
  return points.join(" ");
}

/* ── Serve metric projection + net gutter (Task 2) ────────────────────────
 *
 * `viz-model.ts`'s `servePlacementMetrics` measures a serve in real-world
 * METRES (`lateralM`, `depthPastNetM`) straight off the shot's own contact
 * and landing coordinates, rather than the legacy 0..1 service-box fraction
 * `serve-zones.ts`'s `mapRealCoordsToServeDot` produces (which clamps an
 * "In" serve inside the box and can't represent an out/net serve at all).
 * `projectServeMetricDot` is that measurement's own projection onto the
 * serve frame, independent of `projectServeDot`/`ServeDotFraction` above —
 * the two scales below are derived from `SERVE_COURT`'s own design-unit
 * constants and the real service-box depth/half-width, not hard-coded
 * results, so a future frame resize keeps them in sync automatically.
 */

// Real-world metres, matching `viz-model.ts`'s own (private) constants of
// the same names — kept as a separate local copy rather than a VALUE import
// since this module stays plain geometry/SVG-adjacent and shouldn't reach
// back into the model layer for two literals. (Fix round 1: this file DOES
// now carry a TYPE-only import of `Cut`/`VizDot` from `./viz-model`, for
// `projectViewerDot`/`viewerInitialTransform`'s own signatures — that's
// erased at compile time and creates no runtime dependency either way, so
// the "no reaching into the model layer" reasoning here still holds for
// actual VALUES like these two constants.)
const SERVE_REAL_NET_Y = 11.885;
const SERVE_REAL_SERVICE_Y = 5.485;
const SERVE_REAL_BOX_DEPTH_M = SERVE_REAL_NET_Y - SERVE_REAL_SERVICE_Y; // 6.4
const SERVE_REAL_SINGLES_HALF_M = 4.115;

// Depth: net (0m past net) → `SERVE_COURT.netY`; the service line (6.4m
// past the net) → `SERVE_COURT.serviceLineY`. Sanity in `court-geometry.spec.ts`:
// 0 → 236, 6.4 → 116.5, 11.885 (a full-court depth, e.g. the far baseline)
// → ≈14.1 (`SERVE_COURT.baselineY` is 14).
export const SERVE_DEPTH_UNITS_PER_METER =
  (SERVE_COURT.netY - SERVE_COURT.serviceLineY) / SERVE_REAL_BOX_DEPTH_M;

// Lateral: the centre line (0m) → `SERVE_COURT.centerX`; the singles
// half-width (4.115m) → `SERVE_COURT.singlesRight`. Sanity: the doubles
// sideline (5.485m) → ≈135 (`SERVE_COURT.doublesLeft`).
export const SERVE_LATERAL_UNITS_PER_METER =
  (SERVE_COURT.singlesRight - SERVE_COURT.centerX) / SERVE_REAL_SINGLES_HALF_M;

export interface ServeMetricDot {
  lateralM: number;
  depthPastNetM: number;
}

/**
 * Projects a serve's real-world measurement (`servePlacementMetrics`) onto
 * the serve frame's own pre-transform coordinates, clamped to
 * `SERVE_HEAT_BOUNDS` (the frame's whole visible view) inset by a dot's
 * radius — a badly-out serve (up to ~12m past the net in the ground-truth
 * data) lands pinned at the visible edge instead of vanishing off-canvas.
 */
export function projectServeMetricDot(m: ServeMetricDot): {
  cx: number;
  cy: number;
} {
  const rawCx =
    SERVE_COURT.centerX + m.lateralM * SERVE_LATERAL_UNITS_PER_METER;
  const rawCy =
    SERVE_COURT.netY - m.depthPastNetM * SERVE_DEPTH_UNITS_PER_METER;
  const margin = SERVE_HEAT_DOT_RADIUS;
  const cx = Math.min(
    SERVE_HEAT_BOUNDS.xMax - margin,
    Math.max(SERVE_HEAT_BOUNDS.xMin + margin, rawCx),
  );
  const cy = Math.min(
    SERVE_HEAT_BOUNDS.yMax - margin,
    Math.max(SERVE_HEAT_BOUNDS.yMin + margin, rawCy),
  );
  return { cx, cy };
}

// Serve frame's own "just past the net" inset — real-world metres, since
// (unlike the return frame's mark, fixed as a small offset from its own
// rendered stroke above) the serve frame's visible apron below the net line
// leaves generous room to work in real units instead.
const SERVE_NET_GUTTER_INSET_M = 0.3;

/**
 * The frame coordinate an `atNet` dot's (fix round 4A: the POSITION fact,
 * `VizDot.atNet`/`ReturnDotMetric.atNet` — no longer a distinct `shape`)
 * DEPTH axis takes — always the same spot regardless of the ball's own
 * (unusable, hitter's-side) landing. Exactly one of `cx`/`cy` is set (the
 * axis this frame's net sits on); the caller keeps the OTHER axis from that
 * same dot's normal projection (`projectServeMetricDot`/`projectReturnDot`,
 * which already reads the dot's true lateral position correctly) —
 * `court-art.tsx` does exactly that merge.
 */
export function netGutterFor(
  cut: "serve" | "returnPlacement" | "returnContact" | "rallyPosition",
): { cx: number | null; cy: number | null } {
  if (cut === "serve") {
    return {
      cx: null,
      cy:
        SERVE_COURT.netY +
        SERVE_NET_GUTTER_INSET_M * SERVE_DEPTH_UNITS_PER_METER,
    };
  }
  // Fix round 4B: the hitter's side is the SMALLER-depth-x direction from
  // the net (`projectReturnDot`'s own convention — a negative `depthM`
  // already means "stayed on the hitter's side"), so this subtracts from
  // `netX` rather than the OLD arbitrary inset from the frame's (formerly
  // net-less) visible edge. `RETURN_NET_GUTTER_OFFSET` is the same offset
  // the viewBox extension above reserved clearance for.
  return {
    cx: RETURN_COURT.netX - RETURN_NET_GUTTER_OFFSET,
    cy: null,
  };
}

/* ── Fullscreen viewer court frame (Phase 2A, Task 2) ─────────────────────
 *
 * The wall/focused views draw a SERVE half-court or a RETURN full-court
 * (rotated on its side) — two different frames because a dot only ever
 * needs ONE of them at a time. The fullscreen viewer draws every cut on one
 * shared, upright, full-length court instead (so pan/zoom has a single
 * stable frame to operate on across a cut change): the FAR half is exactly
 * `SERVE_COURT`'s own box (far baseline at the top, net at the bottom,
 * `farBaselineY`/`farServiceY`/`netY`/`centreX`/`netX1`/`netX2` are its
 * `baselineY`/`serviceLineY`/`netY`/`centerX`/`netLineLeft`/`netLineRight`,
 * unchanged), and the NEAR half is that FAR half reflected across the net
 * line (`nearBaselineY = netY + (netY - farBaselineY)`, `nearServiceY = netY
 * + (netY - farServiceY)`) — a hitter's-side apron the serve frame never
 * needed to draw. `viewBox.minY` (-30) and the bottom edge (`minY + h` =
 * 502) both extend past the two baselines so a dot struck/landed outside
 * the lines (an out serve's real depth, a contact well behind the baseline)
 * still has room to draw before `projectViewerDot`'s clamp kicks in.
 */
export const VIEWER_COURT = {
  viewBox: { minX: 93, minY: -30, w: 334, h: 532 },
  artPx: { w: 595, h: 948 },
  doubles: { x: 135, y: 14, w: 250, h: 444 },
  singlesLeft: 166.25,
  singlesRight: 353.75,
  farBaselineY: 14,
  nearBaselineY: 458,
  farServiceY: 116.5,
  nearServiceY: 355.5,
  centreX: 260,
  netY: 236,
  netX1: 122,
  netX2: 398,
  lineWidth: 1.6,
  netWidth: 3,
  markRadius: 2.2,
  markStroke: 0.5,
} as const;

function clampNum(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/* ── Depth/contact bands in the viewer (Phase 2B, Task 3) ─────────────────
 *
 * `viz-bands.ts` stores every divider in FEET FROM THE BASELINE — the one
 * space the band UI reads, writes and prints ("0 ft" is always "at the
 * baseline"). These two functions are the ONLY place that space is turned
 * into `VIEWER_COURT` viewBox units, so the band overlay and the dots it
 * sits behind can never be drawn to two different scales: the metres→units
 * factor is `SERVE_DEPTH_UNITS_PER_METER`, exactly what `projectViewerDot`
 * already uses for both halves.
 */

/** Metres in one foot, exactly. The same literal `viz-bands.ts`'s own
 *  metre-native bucketing uses (`5 * 0.3048 === 1.524` bit-for-bit), rather
 *  than dividing by the reciprocal `FT_PER_M`. */
const BAND_METRES_PER_FOOT = 0.3048;

/**
 * A band divider in feet-from-the-baseline → its `VIEWER_COURT.viewBox` y.
 *
 * - `"depth"` (return LANDINGS, the FAR half): `0` is `farBaselineY` (14) and
 *   increasing feet move DOWN the frame toward the net, so `COURT_HALF_FT`
 *   (≈38.993 ft = 11.885 m, the baseline→net distance) lands on `netY` (236).
 * - `"contact"` (return/rally CONTACT, the NEAR half): `0` is
 *   `nearBaselineY` (458); positive feet are BEHIND the baseline (a larger
 *   y, out past the court) and negative feet are INSIDE it (a smaller y,
 *   toward the net) — the same signing `contactDividersFt` itself carries.
 *
 * The result is clamped into `VIEWER_COURT.viewBox`, so an extreme divider
 * pins at the visible edge rather than drawing a rect off-canvas — the same
 * behaviour `projectViewerDot` gives a badly-out dot.
 */
export function viewerBandY(kind: "depth" | "contact", ft: number): number {
  const origin =
    kind === "depth" ? VIEWER_COURT.farBaselineY : VIEWER_COURT.nearBaselineY;
  const raw = origin + ft * BAND_METRES_PER_FOOT * SERVE_DEPTH_UNITS_PER_METER;
  return clampNum(
    raw,
    VIEWER_COURT.viewBox.minY,
    VIEWER_COURT.viewBox.minY + VIEWER_COURT.viewBox.h,
  );
}

/**
 * The n+1 horizontal edges of the n+1 bands `dividersFt` (ascending,
 * feet-from-the-baseline) cuts its half into — `[outerEdge, ...dividers,
 * outerEdge]`. Band `i` is the rect between `edges[i]` and `edges[i + 1]`,
 * in the SAME order `depthBandRows`/`contactBandRows` list their rows, so a
 * row and its rect are matched by index.
 *
 * The two OUTER edges are not dividers — they are how far the overlay is
 * allowed to cover its half:
 *
 * - `"depth"` ends on the net line, and starts at the FAR BASELINE (P2k:
 *   "DEEP starts at the FAR baseline"). The one exception is a divider at or
 *   before the baseline itself — the "Inside the baseline" preset, whose
 *   first band is everything that landed PAST the far baseline and is
 *   therefore genuinely outside the court. There the first edge opens up into
 *   the far apron (`viewBox.minY`) so that band has somewhere to draw instead
 *   of collapsing to nothing.
 * - `"contact"` runs down to the bottom of the viewBox (a contact struck well
 *   behind the baseline), but its inside edge is CAPPED at the near service
 *   line: the innermost band is open-ended toward the net, and left uncapped
 *   it would wash the entire near half rather than reading as a band.
 *
 * Edges are always non-decreasing — a divider outside its half's own span is
 * clamped to the nearest edge, so a band can be empty but never inside-out.
 */
export function viewerBandEdges(
  kind: "depth" | "contact",
  dividersFt: number[],
): number[] {
  const vb = VIEWER_COURT.viewBox;
  const [innerCap, outerCap] =
    kind === "depth"
      ? [VIEWER_COURT.farBaselineY, VIEWER_COURT.netY]
      : [VIEWER_COURT.nearServiceY, vb.minY + vb.h];

  const inner = dividersFt.map((ft) =>
    clampNum(viewerBandY(kind, ft), innerCap, outerCap),
  );
  // The far apron only opens up for a depth scheme whose first band really
  // does sit outside the court (a divider at or before the baseline).
  const first =
    kind === "depth" && dividersFt.length > 0 && dividersFt[0] <= 0
      ? vb.minY
      : innerCap;

  const edges = [first, ...inner, outerCap];
  for (let i = 1; i < edges.length; i++) {
    edges[i] = Math.max(edges[i], edges[i - 1]);
  }
  return edges;
}

/**
 * The heat blob radius in `VIEWER_COURT`'s own units (Phase 2A, Task 4).
 *
 * `SERVE_HEAT_DOT_RADIUS` is expressed in the serve frame's PRE-group-transform
 * units, so on screen it draws at `SERVE_GROUP_SCALE` × that. `VIEWER_COURT`
 * has no group transform at all and its far half IS the serve frame's box at
 * scale 1 in the same 334-wide viewBox — so multiplying the serve radius by
 * that same group scale gives a blob covering the identical patch of COURT
 * here that it covers in-shell. No second hand-picked number.
 */
export const VIEWER_HEAT_DOT_RADIUS = SERVE_HEAT_DOT_RADIUS * SERVE_GROUP_SCALE;

/**
 * The viewer heat `<filter>`'s `userSpaceOnUse` box: the whole
 * `VIEWER_COURT.viewBox`, padded by the same `HEAT_FILTER_MARGIN_RATIO` blob
 * radii `heatFilterRegionFor` uses, so a blob near the edge has room for its
 * blur kernel to settle instead of being clipped into a hard line.
 */
export function viewerHeatFilterRegion(): HeatFilterRegion {
  const margin = VIEWER_HEAT_DOT_RADIUS * HEAT_FILTER_MARGIN_RATIO;
  return {
    x: VIEWER_COURT.viewBox.minX - margin,
    y: VIEWER_COURT.viewBox.minY - margin,
    width: VIEWER_COURT.viewBox.w + margin * 2,
    height: VIEWER_COURT.viewBox.h + margin * 2,
  };
}

/**
 * A point in `VIEWER_COURT.viewBox` coordinates → the `artPx` (595×948) pan
 * layer the viewer positions its transform against: the SVG `viewBox` →
 * element-size mapping the viewer's `<svg>` performs in the browser,
 * reproduced in TS so `viewerInitialTransform` can target a specific
 * on-screen spot before anything has rendered, and so the viewer's hover
 * readout can be positioned at a mark inside that same pan layer.
 *
 * The two aspect ratios agree to within 0.03% (334/532 vs 595/948), so the
 * letterboxing `preserveAspectRatio="xMidYMid meet"` leaves is a fraction of
 * a pixel and is deliberately ignored here.
 */
export function viewerArtPoint(
  viewBoxX: number,
  viewBoxY: number,
): { x: number; y: number } {
  return {
    x:
      ((viewBoxX - VIEWER_COURT.viewBox.minX) / VIEWER_COURT.viewBox.w) *
      VIEWER_COURT.artPx.w,
    y:
      ((viewBoxY - VIEWER_COURT.viewBox.minY) / VIEWER_COURT.viewBox.h) *
      VIEWER_COURT.artPx.h,
  };
}

/**
 * Projects a `VizDot`'s normalised court metres (`lateralM`/`depthM`, the
 * SAME fields `projectServeMetricDot`/`projectReturnDot` already read — see
 * `VizDot`'s own doc comment in `viz-model.ts`) onto `VIEWER_COURT`, sharing
 * the serve frame's scale (`SERVE_LATERAL_UNITS_PER_METER`/
 * `SERVE_DEPTH_UNITS_PER_METER`) rather than a third, independently-derived
 * pair — `VIEWER_COURT`'s far half IS `SERVE_COURT`'s box, unchanged.
 *
 * Per cut (this is the ONE place that has to agree with every other
 * frame's own convention — see each source function's doc comment):
 *
 * - `"serve"` / `"returnPlacement"` (landings, `servePlacementMetrics`/
 *   `pointToReturnDots`'s `"landing"` dot): `depthM` is metres PAST THE NET
 *   in the direction of travel (0 = net, negative = came down on the
 *   hitter's own side — a net ball) — the exact meaning
 *   `projectServeMetricDot`'s `depthPastNetM` already has. The dot draws in
 *   the FAR half: `y = netY − depthM · SERVE_DEPTH_UNITS_PER_METER`, the
 *   same formula `projectServeMetricDot` uses for `cy`.
 * - `"returnContact"` / `"rallyPosition"` (the hitter's own contact,
 *   `contactMetrics`): `depthM` is metres signed from the hitter's OWN
 *   baseline — positive BEHIND it (an out-of-court contact), negative
 *   INSIDE it (toward the net) — `projectReturnDot`'s `"contact"` `depthM`
 *   convention, unrelated to the net. The dot draws in the NEAR half:
 *   `y = nearBaselineY + depthM · SERVE_DEPTH_UNITS_PER_METER` (the mirror
 *   of the landing formula above, since the near half is the far half
 *   reflected across the net).
 *
 * Lateral sign is the SAME formula for all four cuts — deliberately, unlike
 * `projectReturnDot`, which needs two opposite-signed branches
 * (`"contact"` vs `"placement"`) ONLY because the in-shell return frame
 * composes an outer `rotate(90 240 104.5)` with an EXTRA CSS
 * `transform: rotate(180deg)` on `"placement"`'s own `<svg>` alone — two
 * branches that (per that function's own doc comment) still converge on the
 * SAME final on-screen sense: `lateralM > 0` (serve: screen-right by
 * construction; return: "the returner's right") always ends up
 * screen-right once every transform is composed, for BOTH branches. This
 * frame has no such rotation at all (`VIEWER_COURT` is drawn upright, one
 * frame, no per-cut `<svg>` transform) — so reproducing the in-shell
 * calculation's mismatched intermediate signs here would be reproducing an
 * artifact of a transform chain this frame doesn't have. One formula,
 * `x = centreX + lateralM · SERVE_LATERAL_UNITS_PER_METER`, already lands
 * `lateralM > 0` screen-right for every cut — the SAME final sense the two
 * in-shell branches (after their different intermediate signs) both
 * converge on. `tests/court-geometry.spec.ts` pins this against the
 * existing `projectServeMetricDot`/`projectReturnDot` fixtures (same inputs,
 * same left/right-of-centre verdict).
 *
 * `atNet` (`VizDot.atNet` — only `"serve"`/`"returnPlacement"` ever set it)
 * overrides the depth axis to draw exactly on the net line (`y = netY`) at
 * the dot's true lateral, per the task brief — simpler than the in-shell
 * frames' small net-gutter inset (`netGutterFor`), since this frame's net
 * line sits comfortably inside the viewBox on both sides already.
 *
 * Every result is clamped inside `VIEWER_COURT.viewBox`, inset by
 * `markRadius`, so a dot's full glyph (never just its centre) stays
 * on-canvas — the same "badly-out serve pins at the visible edge instead of
 * vanishing" behaviour `projectServeMetricDot` already has.
 */
export function projectViewerDot(
  cut: Cut,
  dot: Pick<VizDot, "lateralM" | "depthM" | "atNet">,
): { x: number; y: number } {
  const rawX =
    VIEWER_COURT.centreX + dot.lateralM * SERVE_LATERAL_UNITS_PER_METER;
  const isLanding = cut === "serve" || cut === "returnPlacement";
  const rawY = dot.atNet
    ? VIEWER_COURT.netY
    : isLanding
      ? VIEWER_COURT.netY - dot.depthM * SERVE_DEPTH_UNITS_PER_METER
      : VIEWER_COURT.nearBaselineY + dot.depthM * SERVE_DEPTH_UNITS_PER_METER;

  const r = VIEWER_COURT.markRadius;
  const xMin = VIEWER_COURT.viewBox.minX + r;
  const xMax = VIEWER_COURT.viewBox.minX + VIEWER_COURT.viewBox.w - r;
  const yMin = VIEWER_COURT.viewBox.minY + r;
  const yMax = VIEWER_COURT.viewBox.minY + VIEWER_COURT.viewBox.h - r;

  return {
    x: clampNum(rawX, xMin, xMax),
    y: clampNum(rawY, yMin, yMax),
  };
}

// Contact/rally cuts zoom in relative to the plain "fit the whole court"
// scale landing cuts use — the task brief's own multiplier: close enough to
// read individual contact points without the far (unused) half of the court
// eating half the stage.
const VIEWER_CONTACT_ZOOM_MULTIPLIER = 1.6;

// Contact/rally cuts pin the near baseline at this fraction of the stage's
// OWN height (not the art's) — the task brief's own target spot, leaving
// headroom above for the near apron and enough below for the on-screen
// controls docked at the bottom of the fullscreen viewer.
const VIEWER_CONTACT_BASELINE_STAGE_FRACTION = 500 / 950;

/**
 * The fullscreen viewer's starting pan/zoom for `cut`, given the current
 * `stage` (viewport) size — `use-pan-zoom.ts` seeds its reducer with this on
 * mount and on every cut change, then `zoomAbout`/`panBy` (Task 1,
 * `pan-zoom.ts`) take over from user input.
 *
 * `"serve"`/`"returnPlacement"` (landing cuts): fit the whole
 * `VIEWER_COURT.artPx` (595×948) inside `stage`, centred on both axes — the
 * same "see the whole court" starting point `viz-focused.tsx`'s existing
 * tiles already give those two cuts.
 *
 * `"returnContact"`/`"rallyPosition"` (contact/rally cuts): the useful
 * content is only the NEAR half, so start zoomed in
 * (`VIEWER_CONTACT_ZOOM_MULTIPLIER` × the fit scale above) with the near
 * baseline placed at `VIEWER_CONTACT_BASELINE_STAGE_FRACTION` of the
 * stage's height and the court horizontally centred — solving
 * `stagePoint = px + artPoint · z` for `px`/`py` with that target
 * `stagePoint` and the near-baseline/centre-line `artPoint`s held fixed.
 *
 * Both branches clamp `z` to `[ZOOM_MIN, ZOOM_MAX]` (Task 1's own range)
 * before solving `px`/`py`, then clamp the whole result with Task 1's
 * `clampPan` so a degenerate (very small/large) `stage` can never seed a
 * transform that immediately violates `clampPan`'s own invariant.
 */
export function viewerInitialTransform(cut: Cut, stage: Size): PanZoom {
  const art = VIEWER_COURT.artPx;
  const fitZ = Math.min(stage.w / art.w, stage.h / art.h);
  const isLanding = cut === "serve" || cut === "returnPlacement";
  const rawZ = isLanding ? fitZ : fitZ * VIEWER_CONTACT_ZOOM_MULTIPLIER;
  const z = clampNum(rawZ, ZOOM_MIN, ZOOM_MAX);

  let px: number;
  let py: number;
  if (isLanding) {
    px = (stage.w - art.w * z) / 2;
    py = (stage.h - art.h * z) / 2;
  } else {
    const centre = viewerArtPoint(VIEWER_COURT.centreX, 0);
    const nearBaseline = viewerArtPoint(0, VIEWER_COURT.nearBaselineY);
    px = stage.w / 2 - centre.x * z;
    py = stage.h * VIEWER_CONTACT_BASELINE_STAGE_FRACTION - nearBaseline.y * z;
  }

  return clampPan({ z, px, py }, art, stage);
}
