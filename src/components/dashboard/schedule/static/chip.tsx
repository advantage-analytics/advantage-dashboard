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
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "inline-flex h-[26px] cursor-pointer items-center rounded-[var(--radius-pill)] border px-[11px] text-[12px]",
        "transition-colors duration-[var(--duration-hover)] outline-none focus-visible:shadow-[var(--focus-ring)]",
        active
          ? "border-[var(--border-medium)] bg-[var(--surface-subtle)] font-medium text-[var(--ink-900)]"
          : "border-[var(--border-hairline)] font-normal text-[var(--ink-600)] hover:bg-[var(--surface-subtle)]"
      )}
    >
      {label}
    </button>
  );
}
