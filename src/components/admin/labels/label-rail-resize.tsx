"use client";

import { useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import {
  RAIL_KEY_STEP_PX,
  RAIL_MAX_PX,
  RAIL_MIN_PX,
  clampRailWidth,
} from "./label-layout";

/**
 * The pointer and key mechanics of a window splitter (`role="separator"` with
 * a value, in px) on an edge that travels sideways — the rail's handle,
 * below.
 *
 * - **Pointer**: `pointerdown` captures the pointer, `pointermove` reports the
 *   size the drag has reached (`sizeFromDrag`), `pointerup` / `pointercancel`
 *   let go. Never HTML5 drag-and-drop (Reorder Mode's rule).
 * - **Keys**: `growKey` / `shrinkKey` move it `RAIL_KEY_STEP_PX`, Home and
 *   End go to the least and the most, Enter back to the default. Each is
 *   `preventDefault`ed, which is also what tells the console's own ← / → /
 *   Enter shortcuts to stand down.
 * - **Double-click**: back to the default.
 *
 * Spread `separatorProps` on the element; `dragging` is for its styling.
 */
export function useSeparatorDrag({
  value,
  min,
  max,
  growKey,
  shrinkKey,
  sizeFromDrag,
  onResize,
  onReset,
}: {
  /** The size now, in px. */
  value: number;
  min: number;
  max: number;
  /** The arrow keys that grow and shrink what the edge sizes. */
  growKey: string;
  shrinkKey: string;
  /** The size a drag has reached: where it began, and where the pointer is. */
  sizeFromDrag: (startSize: number, from: number, at: number) => number;
  /** The size asked for, in px. */
  onResize: (px: number) => void;
  /** Back to the default size. */
  onReset: () => void;
}) {
  const drag = useRef<{ pointerId: number; from: number; size: number } | null>(
    null,
  );
  const [dragging, setDragging] = useState(false);

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    drag.current = {
      pointerId: event.pointerId,
      from: event.clientX,
      size: value,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragging(true);
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    const held = drag.current;
    if (!held || held.pointerId !== event.pointerId) return;
    onResize(sizeFromDrag(held.size, held.from, event.clientX));
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
    if (event.key === growKey) onResize(value + RAIL_KEY_STEP_PX);
    else if (event.key === shrinkKey) onResize(value - RAIL_KEY_STEP_PX);
    else if (event.key === "Home") onResize(min);
    else if (event.key === "End") onResize(max);
    else if (event.key === "Enter") onReset();
    else return;
    event.preventDefault();
  }

  return {
    dragging,
    separatorProps: {
      role: "separator",
      "aria-orientation": "vertical",
      "aria-valuemin": min,
      "aria-valuemax": max,
      "aria-valuenow": value,
      tabIndex: 0,
      "data-dragging": dragging ? "true" : "false",
      "data-focus-ring": "none",
      onPointerDown,
      onPointerMove,
      onPointerUp: release,
      onPointerCancel: release,
      onLostPointerCapture: release,
      onDoubleClick: onReset,
      onKeyDown,
    },
  } as const;
}

/**
 * The rail's width once a drag that began at `startWidth`, with the pointer
 * at `startX`, has the pointer at `clientX`. The handle is the rail's LEFT
 * edge, so a pointer moving left widens it — 40px left adds 40px — held
 * inside the rail's bounds.
 */
export function railWidthFromDrag(
  startWidth: number,
  startX: number,
  clientX: number,
): number {
  return clampRailWidth(startWidth + (startX - clientX));
}

/**
 * The handle on the left edge of the points rail (board 08l's
 * "The rail's edge"): drag it and the rail runs from `RAIL_MIN_PX` to
 * `RAIL_MAX_PX`, the film taking whatever is left.
 *
 * Stateless — the view owns the width and clamps it. This reports the width
 * asked for (`onResize`), and that the default is wanted back
 * (`onReset`: a double-click, or Enter). The pointer and key mechanics are
 * `useSeparatorDrag`'s: pointer capture, ← / → by
 * `RAIL_KEY_STEP_PX` (← widens, the edge going the way the arrow points),
 * Home and End to the least and the most. Never HTML5 drag-and-drop.
 *
 * **Nothing shows until you reach for it.** At rest the 8px strip is empty
 * and the rail's own hairline is all there is. On hover a 1px line and a slim
 * 4×32 grip fade in; while dragged or keyboard-focused the line is 2px
 * `--blue` and the grip 4×40 white with a halo. That change IS its focus
 * mark, so it opts out of the global ring (`data-focus-ring="none"`) the way
 * the underline fields do.
 *
 * The parent rail must be `relative`: this sits `absolute` across its left
 * edge, 4px either side.
 */
export function LabelRailResize({
  width,
  onResize,
  onReset,
}: {
  /** The rail's width now, in px. */
  width: number;
  /** The width asked for, in px; the view clamps it. */
  onResize: (px: number) => void;
  /** Back to `RAIL_DEFAULT_PX`. */
  onReset: () => void;
}) {
  const { separatorProps } = useSeparatorDrag({
    value: width,
    min: RAIL_MIN_PX,
    max: RAIL_MAX_PX,
    growKey: "ArrowLeft",
    shrinkKey: "ArrowRight",
    sizeFromDrag: railWidthFromDrag,
    onResize,
    onReset,
  });

  return (
    <div
      {...separatorProps}
      aria-label="Resize the points list"
      data-label-rail-resize=""
      className="group absolute inset-y-0 -left-1 z-[2] flex w-2 cursor-col-resize touch-none items-center justify-center select-none focus-visible:outline-none"
    >
      <span
        aria-hidden="true"
        data-rail-resize-line=""
        className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-white/45 opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-focus-visible:w-0.5 group-focus-visible:bg-[var(--blue)] group-focus-visible:opacity-100 group-data-[dragging=true]:w-0.5 group-data-[dragging=true]:bg-[var(--blue)] group-data-[dragging=true]:opacity-100 motion-reduce:transition-none"
      />
      <span
        aria-hidden="true"
        data-rail-resize-grip=""
        className="relative h-8 w-1 rounded-[2px] bg-white/85 opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-focus-visible:h-10 group-focus-visible:bg-white group-focus-visible:opacity-100 group-focus-visible:shadow-[0_0_0_3px_rgba(59,130,246,0.35)] group-data-[dragging=true]:h-10 group-data-[dragging=true]:bg-white group-data-[dragging=true]:opacity-100 group-data-[dragging=true]:shadow-[0_0_0_3px_rgba(59,130,246,0.35)] motion-reduce:transition-none"
      />
    </div>
  );
}
