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
 *
 * ── Deliberately NOT `AdvSelect` ────────────────────────────────────────────
 * The other five native-select wrappers collapsed into `ui/adv-select.tsx`
 * because they were all trying to be the same field. This one is not a field:
 * it is a 30px pill at 12px, the trailing control on a settings row, sitting
 * beside a label that is already the row's question — the register `Toggle`
 * and the row's other trailing controls use, not the register `Input` uses.
 * `AdvSelect` would make it a 34px underline at 13px with a label above it,
 * which is a layout change to two settings pages dressed up as a cleanup.
 *
 * It is also already right by the design system's own reading. Its ring lives
 * on the wrapper because the `<select>` beneath is `opacity-0` — the
 * wrapper-ring pattern, and `focus.css` names this file as the sanctioned
 * `focus-within` case (there is no second focusable child here to double-ring
 * against). So it needs no `data-focus-ring="none"`: there is no ring on the
 * select to suppress, and the box draws the only indicator.
 *
 * If this pill ever needs a second instance, it earns its own primitive rather
 * than a third kind on `AdvSelect`.
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
