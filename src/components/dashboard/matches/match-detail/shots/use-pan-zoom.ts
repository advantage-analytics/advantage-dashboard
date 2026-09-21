"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { VIEWER_COURT, viewerInitialTransform } from "./court-geometry";
import {
  BUTTON_STEP,
  WHEEL_STEP,
  panBy,
  zoomAbout,
  type PanZoom,
  type Size,
} from "./pan-zoom";
import type { Cut } from "./viz-model";

/**
 * React around Task 1's pure reducer (`pan-zoom.ts`) for the fullscreen court
 * viewer: measures the stage, seeds the transform from
 * `viewerInitialTransform(cut, stage)`, and turns pointer drags, the wheel and
 * the slab's buttons into `panBy`/`zoomAbout` calls.
 *
 * Per the plan's Global Constraints this state is SESSION state — a
 * `useState` here, never the URL. Nothing in this hook touches
 * `viz-url.ts`.
 *
 * Gestures that start inside `[data-chrome]` (the translucent slabs, the
 * menus they open) are ignored, so dragging a slab or scrolling a menu never
 * moves the court underneath it.
 */

const ART: Size = VIEWER_COURT.artPx;

/**
 * Fix round 1: a pointer has to travel this far (Manhattan distance, in stage
 * px) before the gesture counts as a drag. Below it the press is a CLICK — no
 * pointer capture, no `panning`, so a plain click on a mark no longer blinks
 * its readout off and back on. Above it the drag begins from the press's own
 * origin, so nothing is lost to the dead zone.
 */
const DRAG_DEAD_ZONE_PX = 4;

export interface PanZoomApi {
  /** The current transform — `translate(px, py) scale(z)` on the pan layer. */
  t: PanZoom;
  /** The stage's measured size; `{w:0,h:0}` before the first measurement. */
  stage: Size;
  /** True from the moment a press passes `DRAG_DEAD_ZONE_PX` until it ends —
   *  NOT from pointer-down, so a click is not a drag. */
  panning: boolean;
  zoomIn: () => void;
  zoomOut: () => void;
  /** Back to `viewerInitialTransform(cut, stage)` — the "Fit the court" button
   *  and the `0` key. */
  fit: () => void;
  /** One arrow-key step, in stage pixels. */
  nudge: (dx: number, dy: number) => void;
  onPointerDown: (e: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerMove: (e: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerUp: (e: ReactPointerEvent<HTMLDivElement>) => void;
}

function isChrome(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest("[data-chrome]") !== null;
}

/**
 * `stageRef` is the CALLER's ref on the stage element, passed in rather than
 * created and returned here: a hook that returns a ref inside its result
 * object makes every later property read of that object a ref access during
 * render as far as the React Compiler rules are concerned, and the whole API
 * goes red. The caller already owns the element, so it owns the ref.
 */
export function usePanZoom(
  cut: Cut,
  stageRef: React.RefObject<HTMLDivElement | null>,
  /** Fired once, when a press turns into a real drag — the court uses it to
   *  drop whichever mark was under the cursor, so the readout doesn't snap
   *  back to a mark that is no longer there when the drag ends. Must be
   *  referentially stable. */
  onDragStart?: () => void,
  /**
   * Phase 2B, Task 4: the band editor holds the court still. While `true`
   * the transform is frozen where it is — no pointer pan, no wheel zoom, and
   * `zoomIn`/`zoomOut`/`fit`/`nudge` are no-ops — so a divider drag can never
   * move the court out from under the handle, and the editor's px→ft
   * conversions stay valid for the whole edit. (A stage RESIZE still re-fits:
   * losing the court off-screen would be worse, and the handles are
   * positioned from the current zoom on every render, so they follow.)
   */
  locked = false,
): PanZoomApi {
  const [stage, setStage] = useState<Size>({ w: 0, h: 0 });
  const [t, setT] = useState<PanZoom>({ z: 1, px: 0, py: 0 });
  const [panning, setPanning] = useState(false);

  const dragRef = useRef<{
    id: number;
    /** Last position a delta was measured from. */
    x: number;
    y: number;
    /** Past the dead zone: this press is a drag. */
    active: boolean;
  } | null>(null);

  /* ── Measure the stage ─────────────────────────────────────────────────── */

  // Final review #4: a LAYOUT effect, so the stage is measured and the
  // initial transform is seeded before the browser paints. In a plain
  // `useEffect` the viewer painted one frame at z=1 pinned to the top-left
  // and then jumped to the centred fit — a visible sideways pop on every
  // open, worse on the contact cuts where the seed zoom is 1.6x. Safe here:
  // this hook only ever runs in a client-only component (`ssr: false`), so
  // there is no server render to warn about.
  useLayoutEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const measure = () => {
      const rect = el.getBoundingClientRect();
      setStage((prev) =>
        prev.w === rect.width && prev.h === rect.height
          ? prev
          : { w: rect.width, h: rect.height },
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [stageRef]);

  /* ── Seed / re-fit ─────────────────────────────────────────────────────── */

  // The brief: "Initial + Fit = viewerInitialTransform(cut, stage); re-fit
  // when the cut changes or the stage resizes." A zero-sized stage (the first
  // render, before layout) would seed a degenerate transform, so it waits.
  useLayoutEffect(() => {
    if (stage.w === 0 || stage.h === 0) return;
    setT(viewerInitialTransform(cut, stage));
  }, [cut, stage]);

  const fit = useCallback(() => {
    if (locked || stage.w === 0 || stage.h === 0) return;
    setT(viewerInitialTransform(cut, stage));
  }, [cut, stage, locked]);

  /* ── Zoom ──────────────────────────────────────────────────────────────── */

  // Buttons and the +/− keys zoom about the stage's centre; only the wheel
  // zooms about a cursor.
  const zoomByFactor = useCallback(
    (factor: number) => {
      if (locked || stage.w === 0 || stage.h === 0) return;
      const centre = { x: stage.w / 2, y: stage.h / 2 };
      setT((prev) => zoomAbout(prev, factor, centre, ART, stage));
    },
    [stage, locked],
  );

  const zoomIn = useCallback(() => zoomByFactor(BUTTON_STEP), [zoomByFactor]);
  const zoomOut = useCallback(
    () => zoomByFactor(1 / BUTTON_STEP),
    [zoomByFactor],
  );

  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    if (stage.w === 0 || stage.h === 0) return;
    const onWheel = (e: WheelEvent) => {
      if (isChrome(e.target)) return;
      if (locked) {
        // Still swallowed — the page behind the portal must not scroll
        // either — but the court does not zoom.
        e.preventDefault();
        return;
      }
      // Non-passive, so the page behind the portal never scrolls under the
      // gesture — `{ passive: false }` on the listener is what makes this
      // legal, which is why it isn't React's `onWheel`.
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const anchor = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      const factor = e.deltaY < 0 ? WHEEL_STEP : 1 / WHEEL_STEP;
      setT((prev) => zoomAbout(prev, factor, anchor, ART, stage));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
    // Re-attached whenever the stage resizes, so the handler always clamps
    // against the CURRENT stage — cheaper than a ref read during render,
    // which the React Compiler rules (rightly) reject.
  }, [stage, stageRef, locked]);

  /* ── Pan ───────────────────────────────────────────────────────────────── */

  const nudge = useCallback(
    (dx: number, dy: number) => {
      if (locked || stage.w === 0 || stage.h === 0) return;
      setT((prev) => panBy(prev, dx, dy, ART, stage));
    },
    [stage, locked],
  );

  // The press is only RECORDED here. Capture and `panning` wait for the dead
  // zone, below — a press that never moves is a click on whatever is under it.
  const onPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (locked || e.button !== 0 || isChrome(e.target)) return;
      dragRef.current = {
        id: e.pointerId,
        x: e.clientX,
        y: e.clientY,
        active: false,
      };
    },
    [locked],
  );

  const onPointerMove = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      const drag = dragRef.current;
      if (locked || drag === null || drag.id !== e.pointerId) return;
      const dx = e.clientX - drag.x;
      const dy = e.clientY - drag.y;
      if (!drag.active) {
        if (Math.abs(dx) + Math.abs(dy) <= DRAG_DEAD_ZONE_PX) return;
        // Crossed the dead zone: NOW it is a drag. The pan below still starts
        // from the press's own origin, so the first few pixels aren't dropped.
        drag.active = true;
        e.currentTarget.setPointerCapture(e.pointerId);
        setPanning(true);
        onDragStart?.();
      }
      drag.x = e.clientX;
      drag.y = e.clientY;
      setT((prev) => panBy(prev, dx, dy, ART, stage));
    },
    [stage, onDragStart, locked],
  );

  const onPointerUp = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (drag === null || drag.id !== e.pointerId) return;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    dragRef.current = null;
    if (drag.active) setPanning(false);
  }, []);

  return {
    t,
    stage,
    panning,
    zoomIn,
    zoomOut,
    fit,
    nudge,
    onPointerDown,
    onPointerMove,
    onPointerUp,
  };
}
