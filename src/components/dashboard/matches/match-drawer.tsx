"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronUp, X } from "lucide-react";
import type { AnalysisStatus } from "@/lib/data/match-analysis";
import { ChromeTooltip } from "@/components/dashboard/shared/chrome-tooltip";
import { forgetMatchSnapshot } from "./drawer-sections";
import { cn } from "@/lib/utils";
import {
  DRAWER_RAIL,
  DrawerScrim,
} from "@/components/dashboard/shared/drawer-sheet";

/** The drawer's `role="dialog"` carries this so the window key handler can tell it from a modal. */
export const DRAWER_ATTR = "data-match-drawer";

/** The header's 28px square control — the roster's and the schedule's, verbatim. */
export const ICON_BUTTON =
  "inline-flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-[var(--radius-element)] text-[var(--ink-500)] transition-colors duration-[var(--duration-hover)] hover:bg-[var(--surface-subtle)] hover:text-[var(--ink-700)] focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none disabled:pointer-events-none disabled:opacity-40 touch:hit-area";

/**
 * Drop one match's cached drawer details. Called after an edit changes what a
 * drawer shows, so the next open reads the row again instead of the pre-edit
 * answer.
 */
export function forgetMatchDetails(matchId: string): void {
  forgetMatchSnapshot(matchId);
}

/**
 * The peek rail — the shell Schedule's, Opponents' and the admin lists'
 * drawers share. It was the Matches page's first, hence this file's name;
 * that page's rows open the report now (2026-11-17). 340px, the float shadow, a 44px header with
 * ↑ ↓ stepping, "Kind n / N", the record's ⋯, a divider and the close that
 * also answers Esc. It is the WIDTH that animates (`roster-drawer-in` /
 * `-out`), so the table reflows rather than being covered — at `lg` and up;
 * below it the rail is a sheet over the table instead (`DRAWER_RAIL`). The
 * body scrolls; the footer pins to the bottom.
 */
export function PeekDrawerFrame({
  kind,
  label,
  index,
  total,
  canPrev,
  canNext,
  closing,
  autoFocus,
  focusKey,
  actions,
  footer,
  children,
  onPrev,
  onNext,
  onClose,
  onClosed,
}: {
  /** The counter's noun, and the stepping buttons' — "Match", "Draft". */
  kind: string;
  /** The dialog's accessible name. */
  label: string;
  /** Position among records of this kind — "Draft 1 / 2", "Match 3 / 24". */
  index: number;
  total: number;
  canPrev: boolean;
  canNext: boolean;
  closing: boolean;
  autoFocus: boolean;
  /** Re-takes focus when the record changes under a keyboard user. */
  focusKey: string;
  actions?: React.ReactNode;
  footer: React.ReactNode;
  children: React.ReactNode;
  onPrev: () => void;
  onNext: () => void;
  onClose: () => void;
  onClosed: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (autoFocus) panelRef.current?.focus({ preventScroll: true });
  }, [autoFocus, focusKey]);

  return (
    <>
      <DrawerScrim closing={closing} onClose={onClose} />
      <aside
        {...{ [DRAWER_ATTR]: "" }}
        onAnimationEnd={(event) => {
          if (event.animationName === "roster-drawer-out") onClosed();
        }}
        className={cn(
          DRAWER_RAIL,
          closing
            ? "w-0 animate-[roster-drawer-out_200ms_var(--ease-primary)_both]"
            : "w-[340px] animate-[roster-drawer-in_200ms_var(--ease-primary)_both]",
        )}
      >
        <div
          ref={panelRef}
          role="dialog"
          aria-label={label}
          tabIndex={-1}
          className="flex h-full w-[340px] flex-col outline-none"
        >
          <div className="flex h-11 shrink-0 items-center gap-1.5 border-b border-[var(--border-hairline)] px-5">
            <ChromeTooltip label="Previous" shortcut="↑">
              <button
                type="button"
                aria-label="Previous"
                disabled={!canPrev}
                onClick={onPrev}
                className={ICON_BUTTON}
              >
                <ChevronUp className="size-3.5" strokeWidth={1.5} aria-hidden />
              </button>
            </ChromeTooltip>
            <ChromeTooltip label="Next" shortcut="↓">
              <button
                type="button"
                aria-label="Next"
                disabled={!canNext}
                onClick={onNext}
                className={ICON_BUTTON}
              >
                <ChevronDown
                  className="size-3.5"
                  strokeWidth={1.5}
                  aria-hidden
                />
              </button>
            </ChromeTooltip>
            <span className="ml-1 inline-flex shrink-0 items-baseline gap-1.5 whitespace-nowrap">
              <span className="text-[12px] text-[var(--ink-600)]">{kind}</span>
              <span className="mono tabular text-[11px] text-[var(--ink-400)]">
                {index + 1} / {total}
              </span>
            </span>
            <div className="min-w-2 flex-1" />
            {actions}
            <span
              aria-hidden
              className="mx-0.5 h-3.5 w-px bg-[var(--border-medium)]"
            />
            <ChromeTooltip label="Close" shortcut="Esc">
              <button
                type="button"
                aria-label="Close"
                onClick={onClose}
                className={ICON_BUTTON}
              >
                <X className="size-3.5" strokeWidth={1.5} aria-hidden />
              </button>
            </ChromeTooltip>
          </div>

          {children}

          <div className="flex shrink-0 flex-col gap-3 px-[22px] py-4">
            {footer}
          </div>
        </div>
      </aside>
    </>
  );
}

/** The stall clock's period: a threshold check, not a stopwatch. */
const STALL_TICK_MS = 10_000;

/**
 * The clock the stalled-hand-off check reads — `analysis-steps-column.tsx`'s,
 * for a drawer, shared by both peek drawers (`event-line-drawer.tsx` imports
 * it). Null on the render the server also makes, then set only from timers
 * (first tick straight after mount, so an already-stalled row reads as
 * stalled when it opens, then every `STALL_TICK_MS`), never from `Date.now()`
 * during render: the server has no "now" the client would agree with. Runs
 * only while the row is `uploaded`, the one status the drawer's view reads the
 * clock for; the view ignores it for every other status.
 */
export function useStallClock(
  status: AnalysisStatus | undefined,
): number | null {
  const [now, setNow] = useState<number | null>(null);
  const readsClock = status === "uploaded";

  useEffect(() => {
    if (!readsClock) return;
    const tick = () => setNow(Date.now());
    const first = setTimeout(tick, 0);
    const id = setInterval(tick, STALL_TICK_MS);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, [readsClock]);

  return now;
}
