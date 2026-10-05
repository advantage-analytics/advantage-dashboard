"use client";

import { useSeparatorDrag } from "./label-divider";
import { RAIL_MAX_PX, RAIL_MIN_PX, clampRailWidth } from "./label-layout";

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
 * The handle on the left edge of the black view's points rail (board 08l's
 * "The rail's edge"): drag it and the rail runs from `RAIL_MIN_PX` to
 * `RAIL_MAX_PX`, the film taking whatever is left.
 *
 * Stateless — the view owns the width and clamps it. This reports the width
 * asked for (`onResize`), and that the default is wanted back
 * (`onReset`: a double-click, or Enter). The pointer and key mechanics are
 * `LabelDivider`'s own (`useSeparatorDrag`): pointer capture, ← / → by
 * `DIVIDER_KEY_STEP_PX` (← widens, the edge going the way the arrow points),
 * Home and End to the least and the most. Never HTML5 drag-and-drop.
 *
 * **Nothing shows until you reach for it.** At rest the 8px strip is empty
 * and the rail's own hairline is all there is. On hover a 1px line and a slim
 * 4×32 grip fade in; while dragged or keyboard-focused the line is 2px
 * `--blue` and the grip 4×40 white with a halo. That change IS its focus
 * mark, so it opts out of the global ring (`data-focus-ring="none"`) the way
 * `LabelDivider` does.
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
    axis: "x",
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
        className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-[rgba(255,255,255,0.45)] opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-focus-visible:w-0.5 group-focus-visible:bg-[var(--blue)] group-focus-visible:opacity-100 group-data-[dragging=true]:w-0.5 group-data-[dragging=true]:bg-[var(--blue)] group-data-[dragging=true]:opacity-100 motion-reduce:transition-none"
      />
      <span
        aria-hidden="true"
        data-rail-resize-grip=""
        className="relative h-8 w-1 rounded-[2px] bg-[rgba(255,255,255,0.85)] opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-focus-visible:h-10 group-focus-visible:bg-white group-focus-visible:opacity-100 group-focus-visible:shadow-[0_0_0_3px_rgba(59,130,246,0.35)] group-data-[dragging=true]:h-10 group-data-[dragging=true]:bg-white group-data-[dragging=true]:opacity-100 group-data-[dragging=true]:shadow-[0_0_0_3px_rgba(59,130,246,0.35)] motion-reduce:transition-none"
      />
    </div>
  );
}
