"use client";

import { useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { cn } from "@/lib/utils";
import { DIVIDER_KEY_STEP_PX, type DockedLayoutMode } from "./label-layout";

/**
 * The edge between the docked video-and-court and the points table (T25):
 * drag it and the dock grows or shrinks, the table taking whatever is left.
 *
 * A window splitter (`role="separator"` with a value, in px): horizontal
 * under the docked-top band, vertical beside the docked-side column. The
 * console owns the size and its bounds — this only reports where the labeller
 * wants it (`onResize`, unclamped) and that they want the default back
 * (`onReset`).
 *
 * - **Pointer**: `pointerdown` captures the pointer, `pointermove` reports the
 *   size the drag has reached, `pointerup` / `pointercancel` let go. Never
 *   HTML5 drag-and-drop (Reorder Mode's rule). `select-none` and `touch-none`
 *   keep a drag from selecting the table's text or scrolling the page.
 * - **Keys**: the arrows across the edge move it `DIVIDER_KEY_STEP_PX` — ↑ / ↓
 *   under the band, ← / → beside the column, the edge going the way the arrow
 *   points — Home and End go to the least and the most, Enter back to the
 *   default. Each is `preventDefault`ed, which is also what tells the
 *   console's own ← / → / Enter shortcuts to stand down.
 * - **Double-click**: back to the default.
 *
 * It sits in the 16px gap the dock and the table already had (an 8px grab
 * area, 4px either side), so nothing moves to make room for it: a hairline at
 * rest, `--blue` and 2px while dragged or focused. That change IS its focus
 * mark, so it opts out of the global ring (`data-focus-ring="none"`,
 * focus.css) the way the underline fields do — a ring boxed round an 8px strip
 * was a second, heavier mark on top of it.
 */
export function LabelDivider({
  mode,
  value,
  min,
  max,
  onResize,
  onReset,
}: {
  /** Which dock this edge belongs to: the band above it, or the column after it. */
  mode: DockedLayoutMode;
  /** The dock's size now, in px — the band's height or the column's width. */
  value: number;
  min: number;
  max: number;
  /** The size asked for, in px. The console clamps it. */
  onResize: (px: number) => void;
  /** Back to the mode's default size. */
  onReset: () => void;
}) {
  const top = mode === "docked-top";
  // Dragging the edge down grows the band above it; dragging it left grows
  // the column to its right.
  const sign = top ? 1 : -1;
  const drag = useRef<{ pointerId: number; from: number; size: number } | null>(
    null,
  );
  const [dragging, setDragging] = useState(false);

  const along = (event: PointerEvent<HTMLDivElement>) =>
    top ? event.clientY : event.clientX;

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    drag.current = {
      pointerId: event.pointerId,
      from: along(event),
      size: value,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragging(true);
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    const held = drag.current;
    if (!held || held.pointerId !== event.pointerId) return;
    onResize(held.size + sign * (along(event) - held.from));
  }

  function release(event: PointerEvent<HTMLDivElement>) {
    const held = drag.current;
    if (!held || held.pointerId !== event.pointerId) return;
    drag.current = null;
    setDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    const grow = top ? "ArrowDown" : "ArrowLeft";
    const shrink = top ? "ArrowUp" : "ArrowRight";
    if (event.key === grow) onResize(value + DIVIDER_KEY_STEP_PX);
    else if (event.key === shrink) onResize(value - DIVIDER_KEY_STEP_PX);
    else if (event.key === "Home") onResize(min);
    else if (event.key === "End") onResize(max);
    else if (event.key === "Enter") onReset();
    else return;
    event.preventDefault();
  }

  return (
    <div
      role="separator"
      aria-orientation={top ? "horizontal" : "vertical"}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={value}
      aria-label="Resize video and court"
      tabIndex={0}
      data-label-divider={mode}
      data-dragging={dragging ? "true" : "false"}
      data-focus-ring="none"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={release}
      onPointerCancel={release}
      onLostPointerCapture={release}
      onDoubleClick={onReset}
      onKeyDown={onKeyDown}
      className={cn(
        "group relative shrink-0 touch-none select-none focus-visible:outline-none",
        top ? "my-1 h-2 cursor-row-resize" : "mx-1 w-2 cursor-col-resize",
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "absolute transition-colors duration-200",
          top
            ? "inset-x-0 top-1/2 -translate-y-1/2"
            : "inset-y-0 left-1/2 -translate-x-1/2",
          dragging
            ? cn("bg-[var(--blue)]", top ? "h-0.5" : "w-0.5")
            : cn(
                "bg-[var(--border-hairline)] group-hover:bg-[var(--ink-300)] group-focus-visible:bg-[var(--blue)]",
                top
                  ? "h-px group-focus-visible:h-0.5"
                  : "w-px group-focus-visible:w-0.5",
              ),
        )}
      />
    </div>
  );
}
