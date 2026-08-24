"use client";

import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The bordered pill select the round-4 rows use.
 *
 * A native `<select>` under a transparent overlay rather than a Radix menu: it
 * is one row inside a settings card, the options are three words each, and the
 * platform control already gives keyboard handling, mobile pickers and screen
 * reader support that a custom listbox would have to re-earn.
 */
export function SettingsInlineSelect<T extends string>({
  value,
  options,
  onChange,
  label,
  disabled,
  className,
}: {
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (next: T) => void;
  /** Accessible name — the visible copy is the row label beside it. */
  label: string;
  disabled?: boolean;
  className?: string;
}) {
  const current = options.find((option) => option.value === value);

  return (
    <div
      className={cn(
        "relative flex h-[30px] shrink-0 items-center gap-2 rounded-[6px] border border-[var(--border-field)] px-3",
        // The `<select>` below is opacity-0, so its own ring is invisible —
        // this box carries the indicator instead.
        "focus-within:shadow-[var(--focus-ring-field)]",
        disabled && "opacity-60",
        className
      )}
    >
      <span className="text-[12px] text-[var(--ink-900)]">
        {current?.label ?? value}
      </span>
      <ChevronDown
        className="size-3 text-[var(--ink-500)]"
        strokeWidth={1.5}
        aria-hidden="true"
      />
      <select
        aria-label={label}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value as T)}
        className="absolute inset-0 cursor-pointer opacity-0 disabled:cursor-not-allowed"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}
