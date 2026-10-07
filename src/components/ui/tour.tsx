"use client";

import * as React from "react";
import * as PopoverPrimitive from "@radix-ui/react-popover";

import { Popover, PopoverAnchor } from "@/components/ui/popover";
import { advButton } from "@/lib/ui/adv-button";

/**
 * One step of a product tour, as a popover pinned to an element on the page.
 *
 * Presentational only: it is told which step it is on and what to say, and it
 * reports Next and Skip. Finding the element (`[data-tour="…"]`), remembering
 * that a tour was seen, and routing between pages belong to the runner that
 * drives it, never to this file.
 *
 * Built on Radix `Popover` for the behaviour — portal, positioning, collision
 * handling, Escape, `role="dialog"` — and drawn as the design system's white
 * popover box: 230px wide, 12px radius, hairline `--border-card`,
 * `--shadow-dropdown`. No scrim, no caret, no entry animation.
 *
 * It wraps `Popover` (Root) and `PopoverAnchor` from `ui/popover.tsx` but not
 * `PopoverContent`, which carries a zoom/slide entrance and a 14px radius the
 * tour box does not want; overriding those through `className` would leave the
 * `motion-safe:animate-*` utilities standing beside the override.
 *
 * Focus. On open, focus moves to the Next button, so Enter advances and Tab
 * reaches Skip. On close — Escape, Skip, or the parent closing after the last
 * Next — focus returns to whatever held it when the tour opened. Radix's own
 * return target is the `Popover.Trigger`, and a tour has none, so this does it
 * itself.
 *
 * Dismissal. Escape calls `onSkip`. A click or focus outside the box does NOT
 * close it: a tour step points at something on the page, and a person reaching
 * for that thing has not asked to end the tour.
 */
export interface TourPopoverProps {
  /** Whether the step is showing. Nothing renders while `anchor` is null. */
  open: boolean;
  /**
   * The element the box points at — typically the result of
   * `document.querySelector('[data-tour="…"]')`. Passed to Radix as a
   * `virtualRef`, so it may live anywhere in the document, outside React's
   * tree. Changing it between steps moves the open box; no remount.
   */
  anchor: HTMLElement | null;
  /** Zero-based step index; the counter prints `index + 1`. */
  index: number;
  /** Number of steps in the tour. */
  total: number;
  title: React.ReactNode;
  body: React.ReactNode;
  /** Next, or Done on the last step (`index === total - 1`). */
  onNext: () => void;
  /** Skip tour, and Escape. */
  onSkip: () => void;
  /** Preferred side of the anchor; Radix flips it when there is no room. */
  side?: "top" | "right" | "bottom" | "left";
}

export function TourPopover({
  open,
  anchor,
  index,
  total,
  title,
  body,
  onNext,
  onSkip,
  side = "bottom",
}: TourPopoverProps) {
  const titleId = React.useId();
  const bodyId = React.useId();
  const nextRef = React.useRef<HTMLButtonElement>(null);
  const returnFocusRef = React.useRef<HTMLElement | null>(null);

  const virtualRef = React.useMemo(
    () => (anchor ? { current: anchor } : null),
    [anchor],
  );

  // Bring the anchor on screen when the step lands on it. Smooth only for
  // people who have not asked the OS for reduced motion.
  React.useEffect(() => {
    if (!open || !anchor) return;
    const reduce = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    anchor.scrollIntoView({
      block: "nearest",
      inline: "nearest",
      behavior: reduce ? "auto" : "smooth",
    });
  }, [open, anchor]);

  if (!virtualRef) return null;

  const last = index >= total - 1;

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        // Outside interaction is cancelled below, so the only way Radix asks
        // to close is Escape.
        if (!next) onSkip();
      }}
    >
      <PopoverAnchor virtualRef={virtualRef} />
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          side={side}
          align="start"
          sideOffset={8}
          collisionPadding={16}
          aria-labelledby={titleId}
          aria-describedby={bodyId}
          onOpenAutoFocus={(event) => {
            // Runs before Radix moves focus, so this is still the element
            // that held it when the tour opened.
            const active = document.activeElement;
            returnFocusRef.current =
              active instanceof HTMLElement && active !== document.body
                ? active
                : null;
            event.preventDefault();
            nextRef.current?.focus();
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            const target = returnFocusRef.current;
            returnFocusRef.current = null;
            if (target?.isConnected) target.focus();
          }}
          onInteractOutside={(event) => event.preventDefault()}
          className="pointer-events-auto z-50 w-[230px] rounded-[12px] border border-[var(--border-card)] bg-[var(--surface-card)] p-4 shadow-[var(--shadow-dropdown)] outline-none"
        >
          <p className="font-mono text-[11px] text-[var(--ink-500)] tabular-nums">
            {index + 1} of {total}
          </p>
          <p
            id={titleId}
            className="mt-1.5 text-[13px] font-medium text-[var(--ink-900)]"
          >
            {title}
          </p>
          <div
            id={bodyId}
            className="mt-1 text-[12px] leading-[1.6] text-[var(--ink-600)]"
          >
            {body}
          </div>
          <div className="mt-4 flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={onSkip}
              className="cursor-pointer rounded-[var(--radius-button)] text-[12px] text-[var(--ink-500)] transition-colors duration-200 hover:text-[var(--ink-900)]"
            >
              Skip tour
            </button>
            <button
              ref={nextRef}
              type="button"
              onClick={onNext}
              className={advButton("primary", "sm")}
            >
              {last ? "Done" : "Next"}
            </button>
          </div>
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </Popover>
  );
}
