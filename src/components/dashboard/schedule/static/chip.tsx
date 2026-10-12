"use client";

import { cn } from "@/lib/utils";

/**
 * The schedule's lifecycle pill — All · Upcoming · Completed.
 *
 * Lifted out of `static-schedule.tsx` so day zero can draw the real one
 * instead of a copy. It used to live beside the page that renders it, which
 * was fine until a second file needed it: importing it back from
 * `static-schedule.tsx` would close a cycle (that page imports the day zero),
 * and a hand-copied pill in the ghost toolbar is a second set of geometry that
 * agrees with this one only until somebody edits one of them.
 *
 * `rounded-[var(--radius-pill)]` is deliberate and stays: a filter pill is one
 * of the few shapes in the product that is fully round — buttons are 6px.
 */
export function Chip({
  label,
  active,
  onClick,
  leading,
  detail,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  /**
   * A mark before the label — a roster face in the opponent drawer's
   * "Faced by" row. The pill's left inset drops to 4px so an 18px circle sits
   * concentric with the pill's own round end.
   */
  leading?: React.ReactNode;
  /** A quiet figure after the label (a record: "3-1"), 11px `--ink-500`. */
  detail?: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "inline-flex h-[26px] cursor-pointer items-center gap-1.5 rounded-[var(--radius-pill)] border text-[12px]",
        leading ? "pr-2.5 pl-1" : "px-[11px]",
        "transition-colors duration-[var(--duration-hover)] outline-none focus-visible:shadow-[var(--focus-ring)]",
        active
          ? "border-[var(--border-medium)] bg-[var(--surface-subtle)] font-medium text-[var(--ink-900)]"
          : "border-[var(--border-hairline)] font-normal text-[var(--ink-600)] hover:bg-[var(--surface-subtle)]",
      )}
    >
      {leading}
      {label}
      {detail ? (
        <span className="tabular text-[11px] font-normal text-[var(--ink-500)]">
          {detail}
        </span>
      ) : null}
    </button>
  );
}
