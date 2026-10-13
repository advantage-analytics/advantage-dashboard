"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import { X } from "lucide-react";

import { ChromeTooltip } from "@/components/dashboard/shared/chrome-tooltip";
import { Popover, PopoverAnchor } from "@/components/ui/popover";
import { advButton } from "@/lib/ui/adv-button";
import { cn } from "@/lib/utils";

/**
 * One step of a product tour: the page dimmed around the element the step is
 * about, and a popover pinned beside it.
 *
 * Presentational only: it is told which step it is on and what to say, and it
 * reports Next, Back and Skip. Finding the element (`[data-tour="…"]`),
 * remembering that a tour was seen, and routing between pages belong to the
 * runner that drives it, never to this file.
 *
 * The dim. `TourSpotlight` lays the Dialog scrim (`rgba(13,13,13,0.4)`) over
 * the whole viewport with a rounded hole cut around the anchor, so the one
 * thing the step talks about is the one thing left at full strength. It is
 * drawn as a single box whose spread shadow is the scrim, and the box glides
 * from anchor to anchor (300ms, `--ease-primary`; instant under reduced
 * motion). No blur: the design system bans decorative blur and glass. The
 * scrim takes no pointer events — a person reaching for the highlighted thing
 * has not asked to end the tour, and the rest of the page stays theirs too.
 *
 * The box. Radix `Popover` for the behaviour — portal, positioning, collision
 * handling, Escape, `role="dialog"` — drawn as the popover primitive's own
 * white 14px hairline surface at 288px, the menu width. Top to bottom: the
 * `StepBar` (2px, one segment per step, done and current in Signal Blue), the
 * title beside the modal-chrome close X (mandatory on a multi-step popover),
 * the body, then the footer — the mono "n of N" left, Back and the one
 * primary right. A single-step tour (`total === 1`) has no progress to show,
 * so it drops the StepBar and the counter and keeps the rest. No caret, no
 * entry animation.
 *
 * It wraps `Popover` (Root) and `PopoverAnchor` from `ui/popover.tsx` but not
 * `PopoverContent`, which carries a zoom/slide entrance the tour box does not
 * want; overriding it through `className` would leave the `motion-safe:
 * animate-*` utilities standing beside the override.
 *
 * Focus. On open, focus moves to the Next button, so Enter advances and Tab
 * reaches the rest. On close — Escape, the X, or the parent closing after the
 * last Next — focus returns to whatever held it when the tour opened. Radix's
 * own return target is the `Popover.Trigger`, and a tour has none, so this
 * does it itself.
 *
 * Dismissal. Escape and the X call `onSkip`. A click or focus outside the box
 * does NOT close it, for the same reason the scrim lets clicks through.
 */
export interface TourPopoverProps {
  /** Whether the step is showing. Nothing renders while `anchor` is null. */
  open: boolean;
  /**
   * The element the box points at — typically the result of
   * `document.querySelector('[data-tour="…"]')`. Passed to Radix as a
   * `virtualRef`, so it may live anywhere in the document, outside React's
   * tree. Changing it between steps moves the open box and glides the
   * spotlight; no remount.
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
  /** Back. The button shows only from the second step, and only when given. */
  onBack?: () => void;
  /** The close X, and Escape. */
  onSkip: () => void;
  /** Preferred side of the anchor; Radix flips it when there is no room. */
  side?: "top" | "right" | "bottom" | "left";
}

/** Breathing room between the anchor's edge and the spotlight's. */
const SPOTLIGHT_PAD = 6;
/** The Dialog scrim (`reference/chrome.md` → Dialog (v3)). */
const SCRIM = "rgba(13, 13, 13, 0.4)";
/** Anchor to anchor: `--duration-enter` on `--ease-primary`. */
const GLIDE =
  "top 300ms var(--ease-primary), left 300ms var(--ease-primary), width 300ms var(--ease-primary), height 300ms var(--ease-primary)";

export function TourPopover({
  open,
  anchor,
  index,
  total,
  title,
  body,
  onNext,
  onBack,
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
    anchor.scrollIntoView({
      block: "nearest",
      inline: "nearest",
      behavior: prefersReducedMotion() ? "auto" : "smooth",
    });
  }, [open, anchor]);

  if (!virtualRef || !anchor) return null;

  const last = index >= total - 1;
  const canGoBack = Boolean(onBack) && index > 0;

  return (
    <>
      {open && <TourSpotlight anchor={anchor} />}
      <Popover
        open={open}
        onOpenChange={(next) => {
          // Outside interaction is cancelled below, so the only way Radix
          // asks to close is Escape.
          if (!next) onSkip();
        }}
      >
        <PopoverAnchor virtualRef={virtualRef} />
        <PopoverPrimitive.Portal>
          <PopoverPrimitive.Content
            side={side}
            align="start"
            sideOffset={SPOTLIGHT_PAD + 8}
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
            className="pointer-events-auto z-50 w-[288px] rounded-[14px] border border-[var(--border-card)] bg-[var(--surface-card)] px-4 pt-4 pb-3.5 shadow-[var(--shadow-dropdown)] outline-none"
          >
            {total > 1 && <TourStepBar index={index} total={total} />}

            <div className="mt-3.5 flex items-start justify-between gap-3">
              <p
                id={titleId}
                className="pt-[5px] text-[14px] leading-[1.35] font-medium text-[var(--ink-900)]"
              >
                {title}
              </p>
              <ChromeTooltip label="Skip tour" side="top">
                <button
                  type="button"
                  onClick={onSkip}
                  aria-label="Skip tour"
                  className="-mr-1.5 flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-lg text-[#888888] transition-colors duration-200 hover:bg-[#F5F5F5] hover:text-[#0D0D0D]"
                >
                  <X className="size-3.5" strokeWidth={1.5} aria-hidden />
                </button>
              </ChromeTooltip>
            </div>
            <div
              id={bodyId}
              className="mt-1 text-[12px] leading-[1.6] text-[var(--ink-600)]"
            >
              {body}
            </div>

            <div className="mt-4 flex items-center justify-between gap-3">
              {total > 1 ? (
                <p className="font-mono text-[11px] text-[var(--ink-500)] tabular-nums">
                  {index + 1} of {total}
                </p>
              ) : (
                <span aria-hidden />
              )}
              <div className="flex items-center gap-2">
                {canGoBack && (
                  <button
                    type="button"
                    onClick={() => {
                      // Back vanishes on the first step; keep focus in the
                      // box, on the button Enter should press next.
                      nextRef.current?.focus();
                      onBack?.();
                    }}
                    className={advButton("outline", "sm")}
                  >
                    Back
                  </button>
                )}
                <button
                  ref={nextRef}
                  type="button"
                  onClick={onNext}
                  className={advButton("primary", "sm")}
                >
                  {last ? "Done" : "Next"}
                </button>
              </div>
            </div>
          </PopoverPrimitive.Content>
        </PopoverPrimitive.Portal>
      </Popover>
    </>
  );
}

/**
 * The design system's `StepBar`: 2px tall, one flex child per step — never a
 * fixed count with greyed segments — done and current in Signal Blue, the
 * rest `--border-hairline`.
 */
function TourStepBar({ index, total }: { index: number; total: number }) {
  return (
    <div className="flex h-[2px] gap-1" aria-hidden>
      {Array.from({ length: total }, (_, i) => (
        <span
          key={i}
          data-step-segment={i <= index ? "on" : "off"}
          className={cn(
            "flex-1 rounded-full transition-colors duration-200",
            i <= index ? "bg-[var(--blue)]" : "bg-[var(--border-hairline)]",
          )}
        />
      ))}
    </div>
  );
}

function prefersReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

type Box = { top: number; left: number; width: number; height: number };

/**
 * The page dimmed around `anchor`. One fixed box over the anchor's rect whose
 * spread shadow paints the scrim across the rest of the viewport. The rect is
 * re-read every frame while it shows — scrolling, a view switching underneath
 * and layout shifts all move the anchor, and a per-frame read is the one
 * thing that tracks all three — but state only changes when it moved.
 */
function TourSpotlight({ anchor }: { anchor: HTMLElement }) {
  const [box, setBox] = React.useState<Box | null>(null);
  const spotRef = React.useRef<HTMLDivElement>(null);
  const firstAnchorRef = React.useRef<HTMLElement | null>(null);

  React.useEffect(() => {
    // The first anchor appears in place; every later one glides there. Only
    // between anchors: during a scroll the box must stick to the anchor, not
    // trail it, so the transition comes off once the glide has landed.
    const spot = spotRef.current;
    let settle = 0;
    if (firstAnchorRef.current === null) firstAnchorRef.current = anchor;
    else if (spot && !prefersReducedMotion()) {
      spot.style.transition = GLIDE;
      settle = window.setTimeout(() => (spot.style.transition = ""), 320);
    }

    let frame = 0;
    let last = "";
    const read = () => {
      const r = anchor.getBoundingClientRect();
      const next = {
        top: Math.round(r.top) - SPOTLIGHT_PAD,
        left: Math.round(r.left) - SPOTLIGHT_PAD,
        width: Math.round(r.width) + SPOTLIGHT_PAD * 2,
        height: Math.round(r.height) + SPOTLIGHT_PAD * 2,
      };
      const key = `${next.top}|${next.left}|${next.width}|${next.height}`;
      if (key !== last) {
        last = key;
        setBox(next);
      }
      frame = requestAnimationFrame(read);
    };
    frame = requestAnimationFrame(read);
    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(settle);
    };
  }, [anchor]);

  return createPortal(
    <div
      ref={spotRef}
      aria-hidden
      data-tour-spotlight=""
      className="motion-safe:animate-in motion-safe:fade-in-0"
      // Geometry inline: it is what the spotlight is, not styling.
      style={{
        position: "fixed",
        zIndex: 45,
        borderRadius: 12,
        pointerEvents: "none",
        ...(box
          ? { ...box, boxShadow: `0 0 0 200vmax ${SCRIM}` }
          : { visibility: "hidden" }),
      }}
    />,
    document.body,
  );
}
