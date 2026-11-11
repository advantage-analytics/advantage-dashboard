/**
 * Pan/zoom reducer for the fullscreen court viewer (`viz-fullscreen.tsx`,
 * `use-pan-zoom.ts`). Pure TypeScript; no React, no DOM.
 *
 * Transform convention: an art-space point `(ax, ay)` maps to stage-space
 * (the viewer's viewport) as `(px + ax·z, py + ay·z)` — a CSS
 * `transform: translate(px, py) scale(z)` on a layer sized `art.w × art.h`,
 * with the stage's own origin at its top-left. `Size` describes either the
 * art (`{w, h}` in art pixels — 595×948 for `VIEWER_COURT.artPx`) or the
 * stage (the viewport the art is panned/zoomed within).
 *
 * Per the Global Constraints in
 * `docs/superpowers/plans/2026-09-20-visualizations-phase-2a.md`: this state
 * is session-only (a `useState`/`useReducer` in `use-pan-zoom.ts`), NEVER URL
 * state.
 */

export interface PanZoom {
  z: number;
  px: number;
  py: number;
}

export interface Size {
  w: number;
  h: number;
}

/**
 * Absolute bounds on `z` (art px → stage px). The lightbox's 100% is the
 * landing half fitted to the stage (`viewerInitialTransform`), roughly twice
 * the whole-court fit, so the floor sits low enough for "Full court"
 * (`viewerFullCourtTransform`) on a small stage and the ceiling high enough
 * that the half-court 100% still has the old headroom above it — the glide's
 * 150% included on a large screen. The per-stage floor is `minZoomFor`.
 */
export const ZOOM_MIN = 0.3;
export const ZOOM_MAX = 6;
export const WHEEL_STEP = 1.12;
export const BUTTON_STEP = 1.2;
export const KEY_PAN_PX = 40;

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Clamp one axis of `px`/`py` given the art's scaled size on that axis
 * (`artSize · z`) against the stage's size on that axis.
 *
 * The rule (tested at both limits in `tests/viz-pan-zoom.spec.ts`):
 *
 * - **Scaled art ≤ stage** (the art fits, or fits exactly): the art may
 *   move only WITHIN the stage — it can never be panned past either edge,
 *   leaving a gap on one side and none on the other is fine, but the art
 *   must stay fully inside `[0, stageSize]`. That bounds the offset to
 *   `0 ≤ offset ≤ stageSize - scaledArtSize`.
 * - **Scaled art > stage** (the art overflows, the normal case once
 *   zoomed in): the stage must never show past the art's edge by more
 *   than half the stage's own size on that axis — so the court can't be
 *   panned away entirely and lost. That bounds the offset to
 *   `stageSize/2 - scaledArtSize ≤ offset ≤ stageSize/2`.
 *
 * Both branches reduce to the same shape at the boundary (`scaledArtSize
 * === stageSize`), where either formula clamps `offset` to exactly `0`.
 */
function clampAxis(
  offset: number,
  scaledArtSize: number,
  stageSize: number,
): number {
  if (scaledArtSize <= stageSize) {
    return clamp(offset, 0, stageSize - scaledArtSize);
  }
  return clamp(offset, stageSize / 2 - scaledArtSize, stageSize / 2);
}

/**
 * Clamp `t.px`/`t.py` (not `t.z`) so the art stays on-stage per `clampAxis`
 * above, independently on each axis.
 */
export function clampPan(t: PanZoom, art: Size, stage: Size): PanZoom {
  return {
    z: t.z,
    px: clampAxis(t.px, art.w * t.z, stage.w),
    py: clampAxis(t.py, art.h * t.z, stage.h),
  };
}

/**
 * Zoom by `factor` (e.g. `WHEEL_STEP` or `1/WHEEL_STEP`) about `anchor`, a
 * point in STAGE coordinates (the cursor, or the stage's centre for
 * keyboard/button zoom). `z` is clamped to `[ZOOM_MIN, ZOOM_MAX]` first;
 * `px`/`py` are then solved so the art point that was under `anchor` before
 * the zoom is still under it after — i.e. `anchor = t.px + artPoint·t.z`
 * both before and after, holding `artPoint` fixed. Finally clamped with
 * `clampPan` so the result never wanders off-stage.
 */
export function zoomAbout(
  t: PanZoom,
  factor: number,
  anchor: { x: number; y: number },
  art: Size,
  stage: Size,
  /** The floor for THIS stage — `minZoomFor(stage)`. Defaults to the absolute
   *  `ZOOM_MIN` so callers without a stage-aware floor behave as before. */
  minZ: number = ZOOM_MIN,
): PanZoom {
  const z = clamp(t.z * factor, Math.max(ZOOM_MIN, minZ), ZOOM_MAX);
  const artX = (anchor.x - t.px) / t.z;
  const artY = (anchor.y - t.py) / t.z;
  const px = anchor.x - artX * z;
  const py = anchor.y - artY * z;
  return clampPan({ z, px, py }, art, stage);
}

/**
 * Pan by `(dx, dy)` stage pixels at the current zoom — a drag delta or
 * `KEY_PAN_PX` arrow-key step — then clamp.
 */
export function panBy(
  t: PanZoom,
  dx: number,
  dy: number,
  art: Size,
  stage: Size,
): PanZoom {
  return clampPan({ z: t.z, px: t.px + dx, py: t.py + dy }, art, stage);
}

/**
 * How far out the court may be zoomed on THIS stage: a little past the point
 * where the whole court fits (`ZOOM_OUT_SLACK`), never below the absolute
 * `ZOOM_MIN`. The old fixed 55% floor left the court a small island in a
 * large field on a big screen; zooming out exists to see the whole court, and
 * nothing is gained past that.
 */
export const ZOOM_OUT_SLACK = 0.85;
export function minZoomFor(art: Size, stage: Size): number {
  if (stage.w <= 0 || stage.h <= 0) return ZOOM_MIN;
  const fitZ = Math.min(stage.w / art.w, stage.h / art.h);
  return clamp(fitZ * ZOOM_OUT_SLACK, ZOOM_MIN, ZOOM_MAX);
}

/**
 * A pinch's zoom factor from a wheel event's `deltaY`. Trackpad pinches (and
 * ctrl/cmd + wheel) arrive as a stream of small deltas, so the factor is
 * CONTINUOUS — `exp(-deltaY * k)` — instead of the old fixed 12% per event,
 * which made a gentle pinch lurch. One event is capped (`PINCH_MAX_DELTA`) so
 * a physical wheel's 100-unit notch is a firm step, not a jump across the
 * whole range.
 */
export const PINCH_SENSITIVITY = 0.006;
export const PINCH_MAX_DELTA = 40;
export function wheelZoomFactor(deltaY: number): number {
  const d = clamp(deltaY, -PINCH_MAX_DELTA, PINCH_MAX_DELTA);
  return Math.exp(-d * PINCH_SENSITIVITY);
}

/** A wheel delta in pixels, whatever `deltaMode` the device reports. */
export function wheelDeltaPx(delta: number, deltaMode: number): number {
  if (deltaMode === 1) return delta * 16; // lines
  if (deltaMode === 2) return delta * 400; // pages
  return delta;
}

/** `2.2` → `"220%"` — rounded, not truncated. */
export function zoomPercentLabel(z: number): string {
  return `${Math.round(z * 100)}%`;
}

/* ── Glide (selecting a mark) ──────────────────────────────────────────── */

/** How long a selected mark takes to glide to the stage's centre. */
export const GLIDE_MS = 320;
/** The glide's zoom floor, relative to the cut's 100%: below it the glide
 *  also zooms in to it; at or above it the zoom is kept. */
export const GLIDE_MIN_RELATIVE_ZOOM = 1.5;

/**
 * A CSS `cubic-bezier(x1, y1, x2, y2)` timing function as a plain
 * `progress → eased progress` function (Newton's method on x, bisection as the
 * fallback), so a requestAnimationFrame tween eases exactly as the same curve
 * would in CSS.
 */
export function cubicBezier(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): (t: number) => number {
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;
  const sampleX = (s: number) => ((ax * s + bx) * s + cx) * s;
  const sampleY = (s: number) => ((ay * s + by) * s + cy) * s;
  const slopeX = (s: number) => (3 * ax * s + 2 * bx) * s + cx;
  return (t: number) => {
    if (t <= 0) return 0;
    if (t >= 1) return 1;
    let s = t;
    for (let i = 0; i < 8; i++) {
      const err = sampleX(s) - t;
      if (Math.abs(err) < 1e-6) return sampleY(s);
      const d = slopeX(s);
      if (Math.abs(d) < 1e-6) break;
      s -= err / d;
    }
    let lo = 0;
    let hi = 1;
    s = t;
    for (let i = 0; i < 30; i++) {
      const x = sampleX(s);
      if (Math.abs(x - t) < 1e-6) break;
      if (x < t) lo = s;
      else hi = s;
      s = (lo + hi) / 2;
    }
    return sampleY(s);
  };
}

/** The glide's ease-out, `cubic-bezier(0.16, 1, 0.3, 1)`. */
export const glideEase = cubicBezier(0.16, 1, 0.3, 1);

/** The art point at the stage's centre under `t`. */
export function stageCentreArtPoint(
  t: PanZoom,
  stage: Size,
): { x: number; y: number } {
  return { x: (stage.w / 2 - t.px) / t.z, y: (stage.h / 2 - t.py) / t.z };
}

/**
 * The transform that puts the art point `point` at the stage's centre at
 * zoom `z` (clamped to the zoom range), then `clampPan`ned — near the art's
 * edge the clamp may stop it a little short of dead centre.
 */
export function centreOn(
  point: { x: number; y: number },
  z: number,
  art: Size,
  stage: Size,
): PanZoom {
  const zz = clamp(z, ZOOM_MIN, ZOOM_MAX);
  return clampPan(
    { z: zz, px: stage.w / 2 - point.x * zz, py: stage.h / 2 - point.y * zz },
    art,
    stage,
  );
}

/**
 * One frame of a glide from `from` to `to` at eased progress `e` (0..1). The
 * stage-centre's art point and the zoom travel together, so the court moves
 * in one straight line toward the mark while the zoom eases in — rather than
 * interpolating `px`/`py` directly, which curves when the zoom changes. `e = 1`
 * is `to` exactly.
 */
export function glideFrame(
  from: PanZoom,
  to: PanZoom,
  e: number,
  art: Size,
  stage: Size,
): PanZoom {
  if (e >= 1) return to;
  if (e <= 0) return from;
  const a = stageCentreArtPoint(from, stage);
  const b = stageCentreArtPoint(to, stage);
  const z = from.z + (to.z - from.z) * e;
  const x = a.x + (b.x - a.x) * e;
  const y = a.y + (b.y - a.y) * e;
  return clampPan(
    { z, px: stage.w / 2 - x * z, py: stage.h / 2 - y * z },
    art,
    stage,
  );
}
