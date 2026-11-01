import { useEffect, useRef, useState } from "react";
import { Minus, Plus, RotateCcw } from "lucide-react";
import {
  MARK_FADE_TRANSITION,
  MARK_IN_ANIMATION,
} from "@/components/dashboard/matches/match-detail/film/film-court";
import type { LabelShot } from "@/lib/services/labels/session";
import { cn } from "@/lib/utils";
import {
  COURT_HEIGHT,
  COURT_LENGTH,
  COURT_VIEW_BOX,
  COURT_WIDTH,
  DOUBLES_HALF_WIDTH,
  FAR_SERVICE_Y,
  NEAR_SERVICE_Y,
  NET_Y,
  SINGLES_HALF_WIDTH,
  HALF_HEIGHT,
  HALF_LEFT,
  HALF_WIDTH,
  USUAL_RUNOFF,
  courtWindowViewBox,
  fromCourt,
  fromCourtInWindow,
  halfTopY,
  runoffWindowTop,
  toCourtInWindow,
  type CourtHalf,
  type CourtPoint,
  type ScreenPoint,
} from "./court-geometry";
import {
  MAX_RUNOFF,
  isEstimate,
  nearestEnd,
  type CourtSlide,
  type PlacementTarget,
} from "./court-placement";

/**
 * The court as drawn inside the court panel: the open point's strokes marked on
 * it, a hollow ring where the ball was hit, a filled dot where it landed, a
 * dashed line between.
 *
 * - `view="whole"`: the whole court (`COURT_VIEW_BOX`), read-only.
 * - `view="near" | "far"`: zoomed to that half with its run-off, as a button. A
 *   click anywhere in the box becomes metres through `toCourtInHalf` and goes
 *   to `onPlace`; the end being placed carries the `--blue` ring.
 *
 * Each stroke comes with an opacity for each end: an end at 0 is not drawn, and
 * the dashed path takes the fainter of the two. Ends ease and rise in with the
 * Video tab's `MARK_FADE_TRANSITION` and `MARK_IN_ANIMATION`.
 *
 * The box is the largest one of the art's proportions that fits its size
 * container. Marks are placed in percent and a click is read against the box's
 * own bounding rect, so neither notices the scale.
 *
 * The art zooms (a pinch or ⌃ scroll, or the + / − buttons, up to `MAX_ZOOM`)
 * and pans: a two-finger scroll, or a drag with either button — a two-finger
 * press on a trackpad is a right click, whose menu the court keeps shut. Zoomed, a pan moves the art within
 * the box; unzoomed on a half, it moves the box itself up and down the court
 * (`moveWindow`), as far as the deepest run-off past either baseline, so a
 * ball outside the box the console opened on is reached without placing
 * anything first. That move resets whenever the console opens another box.
 * A drag never places: a press that moves more than `DRAG_SLOP_PX` is a pan,
 * and the click it ends with is dropped. A click is read back through the
 * zoom (`artPoint`) and the moved box, so it still lands where the court
 * under the cursor is. The zoom holds across near ↔ far, which flips on every
 * placing click, and across a slide, re-anchored so the court spot under the
 * box's centre stays there (`carryZoom`); it resets between the whole court
 * and a half, and when another stroke is selected. Marks keep their on-screen
 * size at any zoom.
 *
 * A half's box draws its run-off's guides whenever a run-off is on screen
 * (`windowRunoffs`): a dashed guide every 2 m behind the baseline, labelled
 * "+2 m", "+4 m", …, and a faint line at the usual edge, labelled, out to
 * however deep the box reaches — moved deeper (`moveWindow`), the guides
 * carry on. The box can also slide at the same size (`slide`,
 * court-placement.ts `courtSlide`): back past the usual run-off for a stored
 * deep contact, or across the net for a short ball, the hitter's side washed
 * amber.
 * An end the labeller called an estimate (`unclear`) draws as a dashed amber
 * ring in place of its mark.
 *
 * Placing, the cursor is the end's own glyph (`END_CURSOR`): a hollow ring
 * for a contact, a filled dot for a landing. A click on a mark already drawn
 * — within its own drawn radius on screen (`markEndAt`) — selects that
 * stroke on that end (`onSelectShot`) instead of placing; the end being
 * placed is never such a mark, so re-placing it next to where it was works.
 */

/** One step up from the panel's ground, for the court's surface. */
const SURFACE_FILL = "rgba(255,255,255,0.07)";
const LINE_STRONG = "rgba(255,255,255,0.55)";
const LINE_THIN = "rgba(255,255,255,0.32)";
const NET_LINE = "rgba(255,255,255,0.85)";
/** How far down the box (in %) the zoom control reaches over the court. */
const NET_LABEL_CLEAR_TOP = 12;
const MARK = "rgba(255,255,255,1)";
/** An end the labeller called an estimate: the rail's amber, dashed. */
const ESTIMATE = "var(--rail-amber)";
/** The hitter's side under a short ball. */
const SHANK_WASH = "var(--rail-amber-wash-faint)";
const GUIDE_LINE = "rgba(255,255,255,0.12)";
const USUAL_EDGE_LINE = "rgba(255,255,255,0.28)";

/** Metres of `y` the usual run-off ends at behind `half`'s baseline. */
function usualEdgeY(half: CourtHalf): number {
  return half === "near" ? -USUAL_RUNOFF : COURT_LENGTH + USUAL_RUNOFF;
}

/** The +2 / +4 / … m guides behind `half`'s baseline, out to `runoff`. */
export function runoffGuides(
  half: CourtHalf,
  runoff: number,
): { metres: number; y: number }[] {
  const guides: { metres: number; y: number }[] = [];
  for (let metres = 2; metres <= runoff; metres += 2) {
    guides.push({
      metres,
      y: half === "near" ? -metres : COURT_LENGTH + metres,
    });
  }
  return guides;
}

/** A run-off on screen: the half whose baseline it is behind, and how deep. */
export interface WindowRunoff {
  half: CourtHalf;
  /** Metres behind that baseline the box reaches. */
  runoff: number;
}

/**
 * The run-offs a half's box (its top `y`, metres) shows: behind the near
 * baseline when its bottom edge is past it, behind the far when its top is,
 * each as deep as the box reaches (capped at `MAX_RUNOFF`). The half's own
 * box shows its usual 3.5 m.
 */
export function windowRunoffs(top: number): WindowRunoff[] {
  const out: WindowRunoff[] = [];
  // To the micrometre: the half's own box reaches its usual edge exactly.
  const depth = (n: number) => Math.min(MAX_RUNOFF, Math.round(n * 1e6) / 1e6);
  const near = depth(HALF_HEIGHT - top);
  const far = depth(top - COURT_LENGTH);
  if (near > 0) out.push({ half: "near", runoff: near });
  if (far > 0) out.push({ half: "far", runoff: far });
  return out;
}

/** The art's own height; both views are proportioned against it. */
const BOX_HEIGHT = 222;
/** The whole court at that height, in the art's 14.53 × 32.77 proportions. */
const WHOLE_WIDTH = (BOX_HEIGHT * COURT_WIDTH) / COURT_HEIGHT;
/** A half at that height. */
const HALF_BOX_WIDTH = 276;

export type CourtView = "whole" | CourtHalf;

export const MAX_ZOOM = 4;
const ZOOM_STEP = 1.5;
const DRAG_SLOP_PX = 4;

/** The art's zoom: its scale, and its offset in percent of the box. */
export interface CourtZoom {
  scale: number;
  x: number;
  y: number;
}

export const NO_ZOOM: CourtZoom = { scale: 1, x: 0, y: 0 };

const clamp = (n: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, n));

/**
 * `zoom` scaled to `scale` about the box point (`px`, `py`, percent), kept
 * covering the box: the art's edges never come inside it.
 */
export function zoomAbout(
  zoom: CourtZoom,
  scale: number,
  px: number,
  py: number,
): CourtZoom {
  // A step in and back out by the same factor multiplies to 1 only to within
  // a rounding error; snapped, it is exactly the unzoomed court again.
  const next = Math.abs(scale - 1) < 1e-9 ? 1 : clamp(scale, 1, MAX_ZOOM);
  if (next === 1) return { ...NO_ZOOM };
  const k = next / zoom.scale;
  return panBy(
    { scale: next, x: px - (px - zoom.x) * k, y: py - (py - zoom.y) * k },
    0,
    0,
  );
}

/**
 * `zoom` carried from a half's box at `fromTop` to one at `toTop` (metres of
 * `y` at its top edge) — the console sliding the box, or flipping it near ↔
 * far on a placing click: the court spot under the box's centre stays under
 * its centre, as near as the art can come while still covering the box
 * (`panBy`'s clamp). The scale holds. The percent offsets alone would not do:
 * the same offsets in a moved box show a different spot on the court.
 */
export function carryZoom(
  zoom: CourtZoom,
  fromTop: number,
  toTop: number,
): CourtZoom {
  if (zoom.scale === 1 || fromTop === toTop) return zoom;
  const centre = toCourtInWindow(fromTop, artPoint(zoom, 50, 50));
  const art = fromCourtInWindow(toTop, centre);
  return panBy(
    {
      scale: zoom.scale,
      x: 50 - art.sx * zoom.scale,
      y: 50 - art.sy * zoom.scale,
    },
    0,
    0,
  );
}

/** `zoom` moved by (`dx`, `dy`) percent of the box, kept covering it. */
export function panBy(zoom: CourtZoom, dx: number, dy: number): CourtZoom {
  const min = 100 * (1 - zoom.scale);
  return {
    scale: zoom.scale,
    x: clamp(zoom.x + dx, min, 0),
    y: clamp(zoom.y + dy, min, 0),
  };
}

/** The largest ⌃ wheel delta one event zooms by, in pixels. */
const WHEEL_ZOOM_DELTA_MAX = 20;

/**
 * A ⌃ wheel's `deltaY` as a zoom step: a pinch sends many small deltas, a
 * mouse notch one of about 100 pixels (or a few lines), which would zoom
 * nearly to `MAX_ZOOM` at once. Read in pixels and capped, so one notch is
 * about a fifth of a step in or out and a pinch is untouched.
 */
export function wheelZoomDelta(
  event: Pick<WheelEvent, "deltaY" | "deltaMode">,
): number {
  const pixels = event.deltaMode === 1 ? event.deltaY * 16 : event.deltaY;
  return clamp(pixels, -WHEEL_ZOOM_DELTA_MAX, WHEEL_ZOOM_DELTA_MAX);
}

/** The lowest and highest top a half's box can be moved to: the deepest run-off. */
const WINDOW_TOP_MIN = runoffWindowTop("near", MAX_RUNOFF);
const WINDOW_TOP_MAX = runoffWindowTop("far", MAX_RUNOFF);

/**
 * A half's box (its top `y`, metres) moved by `dy` metres up the court, kept
 * between the deepest run-off behind the near baseline and behind the far.
 */
export function moveWindow(top: number, dy: number): number {
  return clamp(top + dy, WINDOW_TOP_MIN, WINDOW_TOP_MAX);
}

/** A box point (percent) as the art point under it at `zoom`. */
export function artPoint(zoom: CourtZoom, sx: number, sy: number) {
  return { sx: (sx - zoom.x) / zoom.scale, sy: (sy - zoom.y) / zoom.scale };
}

/** How strongly each end of a stroke is drawn, 0–1. An end at 0 is not. */
export interface MarkOpacity {
  hit: number;
  landed: number;
}

const FULL_OPACITY: MarkOpacity = { hit: 1, landed: 1 };

/** One stroke to draw, with its ends' opacities (both 1 when left out). */
export interface CourtStroke {
  shot: LabelShot;
  opacity?: MarkOpacity;
  /** Drawn to read by, never picked: a click on it places. */
  reference?: boolean;
}

/** A stroke on screen: whichever ends are drawn, in percent of the box. */
type MarkEnd = ScreenPoint & { opacity: number; estimate: boolean };

/**
 * The cursor over a half while placing: the end's glyph, as the court draws
 * it — a hollow ring where the ball was hit, a filled dot where it landed —
 * white over a dark halo, its hotspot the centre, with four short ticks to aim
 * by. The crosshair stands in where a data-URI cursor is not drawn.
 */
const cursorOf = (glyph: string) => {
  const ticks =
    "<path d='M12 1v3.5M12 19.5V23M1 12h3.5M19.5 12H23' stroke='black' stroke-opacity='.55' stroke-width='3'/>" +
    "<path d='M12 1v3.5M12 19.5V23M1 12h3.5M19.5 12H23' stroke='white' stroke-width='1.25'/>";
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24' fill='none'>${ticks}${glyph}</svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}") 12 12, crosshair`;
};

export const END_CURSOR: Record<PlacementTarget, string> = {
  contact: cursorOf(
    "<circle cx='12' cy='12' r='5' stroke='black' stroke-opacity='.55' stroke-width='3.5'/>" +
      "<circle cx='12' cy='12' r='5' stroke='white' stroke-width='1.5'/>",
  ),
  landing: cursorOf(
    "<circle cx='12' cy='12' r='4.25' fill='black' fill-opacity='.55'/>" +
      "<circle cx='12' cy='12' r='3' fill='white'/>",
  ),
};

/** A half's mark sizes, in screen pixels at any zoom (see `LabelCourt`). */
const HALF_MARK = { hit: 4.5, hitStroke: 2, landed: 4, ring: 10 };
const WHOLE_MARK = { hit: 3, hitStroke: 1.5, landed: 2.5, ring: 6.5 };

/**
 * How far from its centre, in screen pixels, a half's drawn end takes a click:
 * the mark's own outer edge — a ring's radius plus half its stroke, a dot's
 * radius, an estimate's dashed ring — and no further, so a click just beside
 * a mark still places.
 */
export function markHitRadius(end: PlacementTarget, estimate: boolean): number {
  if (estimate) return HALF_MARK.hit + 0.5 + (HALF_MARK.hitStroke * 0.75) / 2;
  return end === "contact"
    ? HALF_MARK.hit + HALF_MARK.hitStroke / 2
    : HALF_MARK.landed;
}

/** A drawn end a click came down on: its stroke, and which end. */
export interface MarkPick {
  shotId: string;
  end: PlacementTarget;
}

/**
 * The drawn end of `strokes` a click on a half's box lands on, or null.
 * `at` is the click in percent of the box, `box` the box's size in pixels,
 * `top` and `zoom` the box's window and the labeller's zoom. `armed` is the
 * end being placed: the armed stroke's armed end is never picked, placed or
 * not, so a click re-placing it beside its old mark still places. For each
 * stroke the nearer of its drawn ends (`nearestEnd`) is the candidate; it is
 * picked only when the click is within that mark's own drawn radius on
 * screen (`markHitRadius`), the nearest such mark winning.
 */
export function markEndAt(
  strokes: readonly CourtStroke[],
  top: number,
  zoom: CourtZoom,
  at: ScreenPoint,
  box: { width: number; height: number },
  armed: { shotId: string | null; target: PlacementTarget | null },
): MarkPick | null {
  if (box.width === 0 || box.height === 0) return null;
  const clicked = toCourtInWindow(top, artPoint(zoom, at.sx, at.sy));
  const byId = new Map(strokes.map(({ shot }) => [shot.id, shot]));
  let best: (MarkPick & { distance: number }) | null = null;
  const pickable = strokes.filter((stroke) => !stroke.reference);
  for (const mark of marksFor(pickable, "near", top)) {
    const shot = byId.get(mark.id);
    if (!shot) continue;
    const isArmed = mark.id === armed.shotId;
    const hit = isArmed && armed.target === "contact" ? null : mark.hit;
    const landed = isArmed && armed.target === "landing" ? null : mark.landed;
    const end = nearestEnd(
      {
        contactX: hit ? shot.contactX : null,
        contactY: hit ? shot.contactY : null,
        landingX: landed ? shot.landingX : null,
        landingY: landed ? shot.landingY : null,
      },
      clicked,
    );
    const drawn = end === "contact" ? hit : end === "landing" ? landed : null;
    if (!end || !drawn) continue;
    // The mark's centre on screen: through the zoom, then to pixels.
    const dx = ((zoom.x + drawn.sx * zoom.scale - at.sx) / 100) * box.width;
    const dy = ((zoom.y + drawn.sy * zoom.scale - at.sy) / 100) * box.height;
    const distance = Math.hypot(dx, dy);
    if (distance > markHitRadius(end, drawn.estimate)) continue;
    if (!best || distance < best.distance) {
      best = { shotId: mark.id, end, distance };
    }
  }
  return best ? { shotId: best.shotId, end: best.end } : null;
}

interface Mark {
  id: string;
  hit: MarkEnd | null;
  landed: MarkEnd | null;
}

function marksFor(
  strokes: readonly CourtStroke[],
  view: CourtView,
  top: number,
): Mark[] {
  const project = (point: CourtPoint) =>
    view === "whole" ? fromCourt(point) : fromCourtInWindow(top, point);
  const marks: Mark[] = [];
  for (const { shot, opacity = FULL_OPACITY } of strokes) {
    if (shot.status === "deleted") continue;
    const hit =
      opacity.hit > 0 && shot.contactX !== null && shot.contactY !== null
        ? {
            ...project({ x: shot.contactX, y: shot.contactY }),
            opacity: opacity.hit,
            estimate: isEstimate(shot.unclear ?? [], "contact"),
          }
        : null;
    const landed =
      opacity.landed > 0 && shot.landingX !== null && shot.landingY !== null
        ? {
            ...project({ x: shot.landingX, y: shot.landingY }),
            opacity: opacity.landed,
            estimate: isEstimate(shot.unclear ?? [], "landing"),
          }
        : null;
    if (!hit && !landed) continue;
    marks.push({ id: shot.id, hit, landed });
  }
  return marks;
}

const pct = (n: number) => `${n.toFixed(2)}%`;

/** A mark's opacity, eased between steps and risen in on mount. */
const markStyle = (opacity: number) => ({
  opacity,
  transition: MARK_FADE_TRANSITION,
  animation: MARK_IN_ANIMATION,
});

export function LabelCourt({
  strokes,
  view,
  targetShotId = null,
  target = null,
  prompt = null,
  onPlace,
  onSelectShot,
  fadeOnZoom = false,
  slide = null,
}: {
  /**
   * The half's box slid at the same size — back for a deep contact, across
   * the net for a short ball. Ignored on the whole court.
   */
  slide?: CourtSlide | null;
  /**
   * Fade the art in when the court changes between the whole court and a half
   * (`label-court-view-in`, globals.css). Opacity only. Near ↔ far does not
   * fade: it happens on every placing click.
   */
  fadeOnZoom?: boolean;
  /** The strokes to draw, each at its ends' opacities. Tombstones are skipped. */
  strokes: readonly CourtStroke[];
  view: CourtView;
  /** The stroke being placed: its `target` end carries the ring. */
  targetShotId?: string | null;
  /** The end of the target stroke the next click places; it is ringed. */
  target?: PlacementTarget | null;
  /** "Click where shot 3 was hit" — the button's name while placing. */
  prompt?: string | null;
  /** A click on a half, in metres. Absent: the court is a picture. */
  onPlace?: (point: CourtPoint) => void;
  /**
   * A click on a drawn end other than the one being placed (`markEndAt`):
   * select that stroke on that end. Absent: every click places.
   */
  onSelectShot?: (shotId: string, end: PlacementTarget) => void;
}) {
  const zoomed = view !== "whole";
  const slid = zoomed ? slide : null;
  // The box the console opened on; the labeller may move it (`moveWindow`).
  const openedTop = zoomed ? (slid?.top ?? halfTopY(view)) : 0;
  const placing = zoomed && prompt !== null && onPlace !== undefined;

  // The labeller's zoom, reset when the court changes scale (whole ↔ half)
  // or another stroke is selected, and the box they moved, reset whenever the
  // console opens another. A box the console slides or flips near ↔ far
  // carries the zoom (`carryZoom`), so the spot they zoomed to stays put.
  const [zoomState, setZoomState] = useState({
    zoomed,
    shotId: targetShotId,
    zoom: NO_ZOOM,
    openedTop,
    top: openedTop,
  });
  if (zoomState.zoomed !== zoomed || zoomState.shotId !== targetShotId) {
    setZoomState({
      zoomed,
      shotId: targetShotId,
      zoom: NO_ZOOM,
      openedTop,
      top: openedTop,
    });
  } else if (zoomState.openedTop !== openedTop) {
    setZoomState({
      ...zoomState,
      zoom: carryZoom(zoomState.zoom, zoomState.top, openedTop),
      openedTop,
      top: openedTop,
    });
  }
  const zoom = zoomState.zoom;
  const top = zoomed ? zoomState.top : 0;
  const marks = marksFor(strokes, view, top);
  // The run-off guides on screen: any half view, slid or moved or not.
  const runoffs = zoomed ? windowRunoffs(top) : [];
  const placed = marks.length;
  const setZoom = (next: (z: CourtZoom) => CourtZoom) =>
    setZoomState((state) => ({ ...state, zoom: next(state.zoom) }));
  const boxRef = useRef<HTMLElement | null>(null);
  const drag = useRef<{
    id: number;
    x: number;
    y: number;
    zoom: CourtZoom;
    top: number;
    moved: boolean;
  } | null>(null);
  const dropClick = useRef(false);
  // The wheel listener reads the scale without re-subscribing on every zoom.
  const zoomScale = useRef(zoom.scale);
  useEffect(() => {
    zoomScale.current = zoom.scale;
  }, [zoom.scale]);
  // A pinch (a trackpad sends it as a wheel with ⌃ held) zooms about the
  // cursor; a two-finger scroll pans — the art when zoomed, else a half's box
  // up and down the court. Listened to directly, not through React, so it can
  // keep the page from scrolling (React's is passive). With nothing to pan
  // the page scrolls as usual.
  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    function onWheel(event: WheelEvent) {
      const rect = (box as HTMLElement).getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      if (event.ctrlKey) {
        event.preventDefault();
        const px = ((event.clientX - rect.left) / rect.width) * 100;
        const py = ((event.clientY - rect.top) / rect.height) * 100;
        const factor = Math.exp(-wheelZoomDelta(event) * 0.01);
        setZoomState((state) => ({
          ...state,
          zoom: zoomAbout(state.zoom, state.zoom.scale * factor, px, py),
        }));
        return;
      }
      if (zoomScale.current === 1 && !zoomed) return;
      event.preventDefault();
      setZoomState((state) =>
        state.zoom.scale > 1
          ? {
              ...state,
              zoom: panBy(
                state.zoom,
                (-event.deltaX / rect.width) * 100,
                (-event.deltaY / rect.height) * 100,
              ),
            }
          : {
              ...state,
              top: moveWindow(
                state.top,
                (-event.deltaY / rect.height) * HALF_HEIGHT,
              ),
            },
      );
    }
    box.addEventListener("wheel", onWheel, { passive: false });
    return () => box.removeEventListener("wheel", onWheel);
  }, [placing, zoomed]);

  const panHandlers = {
    onPointerDown: (event: React.PointerEvent<HTMLElement>) => {
      // A drag left with no click of its own must not eat this press's.
      dropClick.current = false;
      // The main button, or the secondary: a two-finger press on a trackpad
      // is a right click, and a drag with it pans too (it never places).
      if (event.button !== 0 && event.button !== 2) return;
      // On the whole court, unzoomed, there is nothing to pan, so a press is
      // a click however much the hand shakes.
      if (zoom.scale === 1 && !zoomed) return;
      drag.current = {
        id: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        zoom,
        top: zoomState.top,
        moved: false,
      };
    },
    onPointerMove: (event: React.PointerEvent<HTMLElement>) => {
      const start = drag.current;
      if (!start || start.id !== event.pointerId) return;
      const dx = event.clientX - start.x;
      const dy = event.clientY - start.y;
      if (!start.moved && Math.hypot(dx, dy) <= DRAG_SLOP_PX) return;
      if (!start.moved) {
        start.moved = true;
        event.currentTarget.setPointerCapture?.(event.pointerId);
      }
      const rect = event.currentTarget.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      if (start.zoom.scale > 1) {
        setZoom(() =>
          panBy(start.zoom, (dx / rect.width) * 100, (dy / rect.height) * 100),
        );
      } else {
        // Dragging the court down shows more of it above: the box moves up.
        setZoomState((state) => ({
          ...state,
          top: moveWindow(start.top, (dy / rect.height) * HALF_HEIGHT),
        }));
      }
    },
    onPointerUp: (event: React.PointerEvent<HTMLElement>) => {
      const start = drag.current;
      if (!start || start.id !== event.pointerId) return;
      dropClick.current = start.moved;
      drag.current = null;
    },
    onPointerCancel: () => {
      drag.current = null;
    },
    // The right click that starts a two-finger drag opens no menu over the
    // court.
    onContextMenu: (event: React.MouseEvent<HTMLElement>) => {
      event.preventDefault();
    },
  };
  const zoomBy = (factor: number) =>
    setZoom((z) => zoomAbout(z, z.scale * factor, 50, 50));

  // Zoomed, a mark covers a fifth more court per pixel, so it is drawn larger;
  // under the labeller's own zoom it keeps its on-screen size.
  const base = zoomed ? HALF_MARK : WHOLE_MARK;
  const size = {
    hit: base.hit / zoom.scale,
    hitStroke: base.hitStroke / zoom.scale,
    landed: base.landed / zoom.scale,
    ring: base.ring / zoom.scale,
  };
  const thin = 1 / zoom.scale;
  const description =
    placed === 0
      ? "Court with no strokes placed"
      : `Court with ${placed} ${placed === 1 ? "stroke" : "strokes"} placed`;
  const netAt = zoomed ? fromCourtInWindow(top, { x: 6.9, y: NET_Y }) : null;
  // A box slid back past the net's line draws no NET label.
  const netShown = netAt && netAt.sy >= 0 && netAt.sy <= 100 ? netAt : null;
  // Near the top edge the label would sit under the zoom control (top
  // right), so it moves to the court's other side there.
  const netOnLeft = netShown !== null && netShown.sy < NET_LABEL_CLEAR_TOP;
  const net = netOnLeft
    ? fromCourtInWindow(top, { x: -6.9, y: NET_Y })
    : netShown;
  // A label kept at its size under the labeller's zoom, like the marks.
  const keepSize = (transform: string) =>
    `${transform} scale(${thin.toFixed(3)})`;

  const art = (
    // Keyed by the scale, so a zoom mounts a fresh layer and the fade plays
    // from its mount; a half-to-half flip keeps the layer and replays nothing.
    <span
      key={zoomed ? "half" : "whole"}
      data-court-layer=""
      className={cn(
        "absolute inset-0 block",
        fadeOnZoom && "label-court-view-in",
      )}
      style={
        zoom.scale === 1
          ? undefined
          : {
              transform: `translate(${pct(zoom.x)}, ${pct(zoom.y)}) scale(${zoom.scale.toFixed(3)})`,
              transformOrigin: "0 0",
            }
      }
    >
      <CourtArt
        view={view}
        top={top}
        slide={slid}
        runoffs={runoffs}
        thin={thin}
      />
      <svg
        className="absolute inset-0 block h-full w-full"
        aria-hidden="true"
        data-court-marks=""
      >
        {marks.map((mark) =>
          mark.hit && mark.landed ? (
            <line
              key={`${mark.id}-path`}
              x1={pct(mark.hit.sx)}
              y1={pct(mark.hit.sy)}
              x2={pct(mark.landed.sx)}
              y2={pct(mark.landed.sy)}
              stroke={MARK}
              strokeWidth={thin}
              strokeDasharray={`${3 * thin} ${4 * thin}`}
              style={markStyle(
                0.4 * Math.min(mark.hit.opacity, mark.landed.opacity),
              )}
            />
          ) : null,
        )}
        {marks.map((mark) =>
          mark.hit?.estimate ? (
            <circle
              key={`${mark.id}-hit`}
              data-court-hit=""
              data-court-estimate="contact"
              cx={pct(mark.hit.sx)}
              cy={pct(mark.hit.sy)}
              r={size.hit + 0.5 / zoom.scale}
              fill="none"
              strokeWidth={size.hitStroke * 0.75}
              strokeDasharray={`${2 * thin} ${2 * thin}`}
              style={{ ...markStyle(mark.hit.opacity), stroke: ESTIMATE }}
            />
          ) : mark.hit ? (
            <circle
              key={`${mark.id}-hit`}
              data-court-hit=""
              cx={pct(mark.hit.sx)}
              cy={pct(mark.hit.sy)}
              r={size.hit}
              fill="none"
              stroke={MARK}
              strokeWidth={size.hitStroke}
              style={markStyle(mark.hit.opacity)}
            />
          ) : null,
        )}
        {marks.map((mark) =>
          mark.landed?.estimate ? (
            <circle
              key={`${mark.id}-landed`}
              data-court-landed=""
              data-court-estimate="landing"
              cx={pct(mark.landed.sx)}
              cy={pct(mark.landed.sy)}
              r={size.hit + 0.5 / zoom.scale}
              fill="none"
              strokeWidth={size.hitStroke * 0.75}
              strokeDasharray={`${2 * thin} ${2 * thin}`}
              style={{ ...markStyle(mark.landed.opacity), stroke: ESTIMATE }}
            />
          ) : mark.landed ? (
            <circle
              key={`${mark.id}-landed`}
              data-court-landed=""
              cx={pct(mark.landed.sx)}
              cy={pct(mark.landed.sy)}
              r={size.landed}
              fill={MARK}
              style={markStyle(mark.landed.opacity)}
            />
          ) : null,
        )}
        {marks.map((mark) => {
          if (mark.id !== targetShotId || target === null) return null;
          const end = target === "contact" ? mark.hit : mark.landed;
          return end ? (
            <circle
              key={`${mark.id}-ring`}
              data-selected-ring={target}
              cx={pct(end.sx)}
              cy={pct(end.sy)}
              r={size.ring}
              fill="none"
              strokeWidth={1.5 * thin}
              style={{ stroke: "var(--blue)" }}
            />
          ) : null;
        })}
      </svg>
      {net ? (
        <span
          aria-hidden="true"
          className={cn(
            "mono pointer-events-none absolute text-[8px] tracking-[1px] text-white/50 uppercase",
            netOnLeft ? "origin-right" : "origin-left",
          )}
          // Kept at its size under the labeller's zoom, like the marks.
          style={{
            left: pct(net.sx),
            top: pct(net.sy),
            transform: keepSize(
              netOnLeft ? "translate(-100%, -50%)" : "translateY(-50%)",
            ),
          }}
        >
          Net
        </span>
      ) : null}
      {runoffs.flatMap(({ half, runoff }) =>
        runoffGuides(half, runoff).map((guide) => {
          const at = fromCourtInWindow(top, { x: 0, y: guide.y });
          return (
            <span
              key={`${half}-${guide.metres}`}
              aria-hidden="true"
              data-court-guide={guide.metres}
              // Left, as "usual edge" is: the zoom control holds the top
              // right, where a guide label would sit under it.
              className="mono pointer-events-none absolute left-2 origin-left text-[9px] text-white/40"
              style={{
                top: pct(at.sy),
                transform: keepSize("translateY(-50%)"),
              }}
            >
              +{guide.metres} m
            </span>
          );
        }),
      )}
      {runoffs
        .filter(({ runoff }) => runoff >= USUAL_RUNOFF)
        .map(({ half }) => (
          <span
            key={`${half}-usual`}
            aria-hidden="true"
            data-court-usual-edge=""
            className="pointer-events-none absolute left-2 origin-left text-[10px] text-white/45"
            style={{
              top: pct(
                fromCourtInWindow(top, { x: 0, y: usualEdgeY(half) }).sy,
              ),
              // Inside the run-off, toward the court: at the half's own box
              // the usual edge is the box's edge.
              transform: keepSize(
                half === "near" ? "translateY(-120%)" : "translateY(20%)",
              ),
            }}
          >
            usual edge
          </span>
        ))}
    </span>
  );

  const box = cn(
    "absolute inset-0 block overflow-hidden",
    zoom.scale > 1 ? "cursor-grab active:cursor-grabbing" : undefined,
    zoomed &&
      "rounded-[8px] border border-dashed border-white/[0.22] bg-white/[0.07]",
  );
  const width = zoomed ? HALF_BOX_WIDTH : WHOLE_WIDTH;
  // "Contain" in the nearest size container (`container-type: size`): as
  // wide as the container, unless its height runs out first.
  const style = {
    width: `min(100cqw, calc(100cqh * ${(width / BOX_HEIGHT).toFixed(4)}))`,
    aspectRatio: `${width.toFixed(2)} / ${BOX_HEIGHT}`,
  };

  const surface = placing ? (
    <button
      ref={(el) => {
        boxRef.current = el;
      }}
      type="button"
      data-court-target=""
      data-court-cursor={target ?? undefined}
      data-court-view={view}
      data-court-slide={slid?.kind}
      aria-label={`${prompt}. ${description}. Anywhere in the box counts, including outside the lines for a ball that went out. Positions can also be typed in the stroke's row.`}
      {...panHandlers}
      onClick={(event) => {
        // The click a drag ends with pans; it never places.
        if (dropClick.current) {
          dropClick.current = false;
          return;
        }
        // A keyboard press has no position to place.
        if (event.detail === 0) return;
        const rect = event.currentTarget.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return;
        const at = {
          sx: ((event.clientX - rect.left) / rect.width) * 100,
          sy: ((event.clientY - rect.top) / rect.height) * 100,
        };
        // A click on a mark already drawn selects it, not a placement.
        const pick = onSelectShot
          ? markEndAt(strokes, top, zoom, at, rect, {
              shotId: targetShotId,
              target,
            })
          : null;
        if (pick) {
          onSelectShot?.(pick.shotId, pick.end);
          return;
        }
        onPlace(toCourtInWindow(top, artPoint(zoom, at.sx, at.sy)));
      }}
      className={cn(
        box,
        zoom.scale === 1 && "cursor-crosshair",
        "touch-none p-0 focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none",
      )}
      // The end's glyph as the cursor; zoomed in, the grab hand pans.
      style={
        zoom.scale === 1 && target ? { cursor: END_CURSOR[target] } : undefined
      }
    >
      {art}
    </button>
  ) : (
    <div
      ref={(el) => {
        boxRef.current = el;
      }}
      className={cn(box, "touch-none")}
      role="img"
      aria-label={description}
      data-court-view={view}
      data-court-slide={slid?.kind}
      {...panHandlers}
    >
      {art}
    </div>
  );

  const control =
    "inline-flex size-6 cursor-pointer items-center justify-center rounded-[6px] text-white/70 transition-colors duration-200 hover:bg-white/[0.12] hover:text-white focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none disabled:cursor-default disabled:opacity-40 disabled:hover:bg-transparent";
  return (
    <span className="relative block shrink-0" style={style}>
      {surface}
      <span
        role="group"
        aria-label="Court zoom"
        data-court-zoom=""
        className="absolute top-1.5 right-1.5 flex items-center gap-0.5 rounded-[7px] bg-black/50 p-0.5"
      >
        <button
          type="button"
          aria-label="Zoom out"
          className={control}
          disabled={zoom.scale <= 1}
          onClick={() => zoomBy(1 / ZOOM_STEP)}
        >
          <Minus className="size-3.5" strokeWidth={1.6} aria-hidden="true" />
        </button>
        <button
          type="button"
          aria-label="Zoom in"
          className={control}
          disabled={zoom.scale >= MAX_ZOOM}
          onClick={() => zoomBy(ZOOM_STEP)}
        >
          <Plus className="size-3.5" strokeWidth={1.6} aria-hidden="true" />
        </button>
        {zoom.scale > 1 ? (
          <button
            type="button"
            aria-label="Reset zoom"
            className={control}
            onClick={() => setZoom(() => NO_ZOOM)}
          >
            <RotateCcw
              className="size-3"
              strokeWidth={1.6}
              aria-hidden="true"
            />
          </button>
        ) : null}
      </span>
    </span>
  );
}

/**
 * The court itself, in metres: the court rect runs `y = 0 … 23.77`, drawn
 * top-down in SVG space while the conversions put the near baseline at the
 * bottom; the lines are symmetric about the net, so both frames draw the
 * same picture — and a half is just a different `viewBox` onto it.
 */
function CourtArt({
  view,
  top,
  slide = null,
  runoffs = [],
  thin = 1,
}: {
  view: CourtView;
  /** A half's box: metres of `y` at its top edge. */
  top: number;
  slide?: CourtSlide | null;
  /** The run-offs on screen (`windowRunoffs`): their guides are drawn. */
  runoffs?: readonly WindowRunoff[];
  /** 1 / the labeller's zoom: the lines keep their on-screen width. */
  thin?: number;
}) {
  const lines = { vectorEffect: "non-scaling-stroke" } as const;
  // The art is drawn top-down: the SVG `y` of a court `y` is 23.77 − y.
  const svgY = (y: number) => COURT_LENGTH - y;
  const boxTop = svgY(top);
  return (
    <svg
      viewBox={view === "whole" ? COURT_VIEW_BOX : courtWindowViewBox(top)}
      preserveAspectRatio="none"
      className="absolute inset-0 block h-full w-full"
      aria-hidden="true"
      data-court-art=""
    >
      {slide?.kind === "shank" ? (
        <rect
          data-court-wash=""
          x={HALF_LEFT}
          y={slide.half === "near" ? svgY(NET_Y) : boxTop}
          width={HALF_WIDTH}
          height={
            slide.half === "near"
              ? boxTop + HALF_HEIGHT - svgY(NET_Y)
              : svgY(NET_Y) - boxTop
          }
          style={{ fill: SHANK_WASH }}
        />
      ) : null}
      <rect
        x={-DOUBLES_HALF_WIDTH}
        y="0"
        width={2 * DOUBLES_HALF_WIDTH}
        height={COURT_LENGTH}
        fill={SURFACE_FILL}
      />
      <g fill="none" stroke={LINE_THIN} strokeWidth={thin}>
        <line
          x1={-SINGLES_HALF_WIDTH}
          y1="0"
          x2={-SINGLES_HALF_WIDTH}
          y2={COURT_LENGTH}
          style={lines}
        />
        <line
          x1={SINGLES_HALF_WIDTH}
          y1="0"
          x2={SINGLES_HALF_WIDTH}
          y2={COURT_LENGTH}
          style={lines}
        />
        <line
          x1={-SINGLES_HALF_WIDTH}
          y1={NEAR_SERVICE_Y}
          x2={SINGLES_HALF_WIDTH}
          y2={NEAR_SERVICE_Y}
          style={lines}
        />
        <line
          x1={-SINGLES_HALF_WIDTH}
          y1={FAR_SERVICE_Y}
          x2={SINGLES_HALF_WIDTH}
          y2={FAR_SERVICE_Y}
          style={lines}
        />
        <line
          x1="0"
          y1={NEAR_SERVICE_Y}
          x2="0"
          y2={FAR_SERVICE_Y}
          style={lines}
        />
        <line x1="0" y1="0" x2="0" y2="0.36" style={lines} />
        <line
          x1="0"
          y1={COURT_LENGTH - 0.36}
          x2="0"
          y2={COURT_LENGTH}
          style={lines}
        />
      </g>
      <rect
        x={-DOUBLES_HALF_WIDTH}
        y="0"
        width={2 * DOUBLES_HALF_WIDTH}
        height={COURT_LENGTH}
        fill="none"
        stroke={LINE_STRONG}
        strokeWidth={thin}
        style={lines}
      />
      <line
        x1="-6.36"
        y1={NET_Y}
        x2="6.36"
        y2={NET_Y}
        stroke={NET_LINE}
        strokeWidth={2 * thin}
        style={lines}
      />
      {runoffs.map(({ half, runoff }) => (
        <g key={half} data-court-runoff={half} strokeWidth={thin}>
          {runoffGuides(half, runoff).map((guide) => (
            <line
              key={guide.metres}
              x1={HALF_LEFT}
              y1={svgY(guide.y)}
              x2={HALF_LEFT + HALF_WIDTH}
              y2={svgY(guide.y)}
              stroke={GUIDE_LINE}
              strokeDasharray="2 5"
              style={lines}
            />
          ))}
          {runoff >= USUAL_RUNOFF ? (
            <line
              data-court-usual-edge-line=""
              x1={HALF_LEFT}
              y1={svgY(usualEdgeY(half))}
              x2={HALF_LEFT + HALF_WIDTH}
              y2={svgY(usualEdgeY(half))}
              stroke={USUAL_EDGE_LINE}
              style={lines}
            />
          ) : null}
        </g>
      ))}
    </svg>
  );
}
