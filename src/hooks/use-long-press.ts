"use client";

import { useEffect, useRef } from "react";

/**
 * Press-and-hold, the finger's stand-in for hover.
 *
 * A mouse names a control by resting on it; a finger has nothing between
 * "not touching" and "tapping". iOS answers that with the long press — hold
 * for half a second and the thing tells you about itself instead of acting.
 * These two hooks are that gesture and its dismissal, signed off in the
 * `/design/ipad` prototype and shared by the tooltip primitive and the KPI
 * tile's detail peek.
 *
 * Attach them only on a coarse pointer (`useCoarsePointer()`): with a mouse a
 * 500ms press is just a slow click, and swallowing it would break the click.
 */

/** How long a press must hold before it peeks, as iOS's own context menus do. */
export const LONG_PRESS_MS = 500;

/** A finger that travels further than this is scrolling, not holding. */
const MOVE_TOLERANCE_PX = 8;

export interface LongPressHandlers {
  onPointerDown: (e: React.PointerEvent) => void;
  onPointerMove: (e: React.PointerEvent) => void;
  onPointerUp: () => void;
  onPointerCancel: () => void;
  onClickCapture: (e: React.MouseEvent) => void;
  onContextMenu: (e: React.MouseEvent) => void;
  style: React.CSSProperties;
}

/**
 * Fires `onHold` after `LONG_PRESS_MS` unless the finger lifts or moves first,
 * and swallows the click that follows a hold, so a peek never also performs
 * the tap — a held link does not navigate. A short tap passes straight
 * through to the control.
 *
 * Spread the result onto the element. Every handler is a plain prop, so a
 * caller that already has its own `onPointerDown` must compose the two
 * rather than let one overwrite the other.
 */
export function useLongPress(onHold: () => void): LongPressHandlers {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const held = useRef(false);
  const start = useRef<{ x: number; y: number } | null>(null);

  const clear = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };
  useEffect(() => clear, []);

  return {
    onPointerDown: (e) => {
      held.current = false;
      start.current = { x: e.clientX, y: e.clientY };
      clear();
      timer.current = setTimeout(() => {
        held.current = true;
        onHold();
      }, LONG_PRESS_MS);
    },
    onPointerMove: (e) => {
      const s = start.current;
      if (s && Math.hypot(e.clientX - s.x, e.clientY - s.y) > MOVE_TOLERANCE_PX)
        clear();
    },
    onPointerUp: clear,
    onPointerCancel: clear,
    // Capture phase, so the swallow lands before the control's own onClick —
    // React's stopPropagation here also skips the bubble-phase handlers on
    // the target itself.
    onClickCapture: (e) => {
      if (held.current) {
        e.preventDefault();
        e.stopPropagation();
        held.current = false;
      }
    },
    // iOS would otherwise open its own callout over a held link.
    onContextMenu: (e) => e.preventDefault(),
    style: { WebkitTouchCallout: "none" },
  };
}

/**
 * Close on the next touch anywhere, the way an iOS label or peek dismisses.
 * Pass a stable `close` (a `useCallback`), or the listener re-registers on
 * every render.
 */
export function useDismissOnNextPress(open: boolean, close: () => void) {
  useEffect(() => {
    if (!open) return;
    const onDown = () => close();
    // Registered after the press that opened it has finished, so the finger
    // still down from the hold is not counted as the next press.
    const id = setTimeout(
      () => window.addEventListener("pointerdown", onDown, { once: true }),
      0,
    );
    return () => {
      clearTimeout(id);
      window.removeEventListener("pointerdown", onDown);
    };
  }, [open, close]);
}
