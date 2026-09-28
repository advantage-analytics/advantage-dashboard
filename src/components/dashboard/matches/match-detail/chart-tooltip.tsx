import { useCallback, useRef, useState } from "react";

import { positionReadout } from "@/components/dashboard/matches/match-detail/chart-tooltip-position";
import { cn } from "@/lib/utils";

const EASE_PRIMARY = [0.25, 0.46, 0.45, 0.94] as const;

/**
 * The dark readout's skin, apart from its anchoring — so the court-record
 * mosaic and the KPI detail chart, which position their own boxes, draw the
 * same surface this component does rather than a copy of its numbers. The
 * type inside follows the same rule: a 12px white medium title over 11px
 * lines at 64% white (`text-white/[0.64]`).
 */
export const DARK_READOUT_CLASS = "rounded-[12px]";
export const DARK_READOUT_STYLE: React.CSSProperties = {
  background: "var(--ink-900)",
  boxShadow: "var(--shadow-dropdown)",
};

/** The cursor, in the hovered element's own space (its top-left is 0,0). */
export type ReadoutPointer = { x: number; y: number };

/**
 * The card's content box expressed in the hovered element's space: where the
 * card's top-left sits relative to the element, and the card's client size.
 * It is what lets a box that lives inside a 30px row clamp to the card.
 */
export type ReadoutFrame = {
  left: number;
  top: number;
  width: number;
  height: number;
};

/** Gap between the cursor and the readout's nearest corner. */
const POINTER_OFFSET = 12;

/**
 * Pointer tracking for a card whose hovered elements each carry a
 * `ChartTooltip`. Attach `boundsRef` to the card's `<section>`, call
 * `track(key, event)` from each element's `onPointerMove` and `clear(key)`
 * from its `onPointerLeave`, and hand `pointerFor(key)` / `frameFor(key)` to
 * that element's tooltip. A key that is not under the cursor gets `null`, so a
 * keyboard-focused element keeps the element-anchored placement.
 */
export function useReadoutPointer<K extends string>() {
  const boundsRef = useRef<HTMLElement>(null);
  const [tracked, setTracked] = useState<{
    key: K;
    pointer: ReadoutPointer;
    frame: ReadoutFrame;
  } | null>(null);

  const track = useCallback(
    (key: K, event: React.PointerEvent<HTMLElement>) => {
      // The hovered element is the tooltip's positioned parent, so its rect is
      // the origin — the same arithmetic as the performance tracker's
      // `selectFromClientX`.
      const rect = event.currentTarget.getBoundingClientRect();
      const bounds = boundsRef.current;
      const b = bounds?.getBoundingClientRect();
      setTracked({
        key,
        pointer: { x: event.clientX - rect.left, y: event.clientY - rect.top },
        frame:
          bounds && b
            ? {
                left: b.left + bounds.clientLeft - rect.left,
                top: b.top + bounds.clientTop - rect.top,
                width: bounds.clientWidth,
                height: bounds.clientHeight,
              }
            : { left: 0, top: 0, width: rect.width, height: rect.height },
      });
    },
    [],
  );

  const clear = useCallback(
    (key: K) =>
      setTracked((current) => (current?.key === key ? null : current)),
    [],
  );

  return {
    boundsRef,
    track,
    clear,
    pointerFor: (key: K) => (tracked?.key === key ? tracked.pointer : null),
    frameFor: (key: K) => (tracked?.key === key ? tracked.frame : null),
  };
}

/**
 * The dark floating readout shared by the Statistics tab's chart cards.
 *
 * With a `pointer` it follows the cursor: `positionReadout()` places it in the
 * card's space (`frame`), so it clamps to the card rather than to the hovered
 * row. Without one — keyboard focus, or before the cursor has moved — it is
 * anchored above the hovered segment/band, and `align` decides which edge it
 * hangs from so it never runs off the card. `open` fades it in/out rather than
 * mounting/unmounting it, so layout never shifts on hover.
 */
export function ChartTooltip({
  open,
  align,
  bottomOffset,
  pointer = null,
  frame = null,
  className,
  children,
}: {
  open: boolean;
  align: "start" | "center" | "end";
  bottomOffset: number;
  pointer?: ReadoutPointer | null;
  frame?: ReadoutFrame | null;
  className?: string;
  children: React.ReactNode;
}) {
  // The box is always mounted, so its size is known before the first hover;
  // its content never changes with the cursor, so it is measured, not
  // re-read on every move.
  const [size, setSize] = useState<{ width: number; height: number } | null>(
    null,
  );
  const measure = useCallback((el: HTMLSpanElement | null) => {
    if (!el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() =>
      setSize({ width: el.offsetWidth, height: el.offsetHeight }),
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  let placed: { left: number; top: number } | null = null;
  if (pointer) {
    const origin = { x: frame?.left ?? 0, y: frame?.top ?? 0 };
    const at = positionReadout({
      pointer: { x: pointer.x - origin.x, y: pointer.y - origin.y },
      size: size ?? { width: 0, height: 0 },
      bounds: frame ?? { width: Infinity, height: Infinity },
      offset: POINTER_OFFSET,
    });
    placed = { left: at.left + origin.x, top: at.top + origin.y };
  }

  // Leaving clears the pointer while the box is still fading out; holding the
  // last placement until the fade ends keeps it from jumping back to the
  // anchored spot mid-fade. An open box with no pointer is always anchored.
  const [held, setHeld] = useState<{ left: number; top: number } | null>(null);
  if (placed && (held?.left !== placed.left || held?.top !== placed.top)) {
    setHeld(placed);
  }
  const at = placed ?? (open ? null : held);

  return (
    <span
      ref={measure}
      aria-hidden="true"
      className={cn(
        "pointer-events-none absolute z-[3] flex flex-col whitespace-nowrap",
        DARK_READOUT_CLASS,
        className,
      )}
      onTransitionEnd={(e) => {
        if (!open && e.propertyName === "opacity") setHeld(null);
      }}
      style={{
        ...(at
          ? { left: at.left, top: at.top }
          : {
              bottom: `calc(100% + ${bottomOffset}px)`,
              left:
                align === "end" ? undefined : align === "center" ? "50%" : 0,
              right: align === "end" ? 0 : undefined,
              transform: align === "center" ? "translateX(-50%)" : undefined,
            }),
        ...DARK_READOUT_STYLE,
        opacity: open ? 1 : 0,
        transition: `opacity 200ms cubic-bezier(${EASE_PRIMARY.join(",")})`,
      }}
    >
      {children}
    </span>
  );
}
