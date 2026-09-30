import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The dashboard's checkbox — multi-select and yes/no, the square half of the
 * "one glyph means chosen" pair (single choice is the check-dot `Radio`).
 *
 * 14px, `--radius-cell` (4px) corners. At rest a 1px `--ink-300` ring with no
 * fill — so a row's hover wash shows through, as it always did; checked, solid
 * Signal Blue with a white Lucide `Check` at 10px, stroke 3. The geometry the
 * Matches filter menu's checklist rows have always drawn — lifted here so
 * every checkbox on the dashboard is that one, not the browser's native box
 * tinted with `accent-color`, which renders at the OS's size, radius and check
 * weight and differs per platform.
 *
 * Two shapes, one mark:
 *
 * - **`CheckboxMark`** — the box alone, `aria-hidden`. For a row that is
 *   itself the control (`<button role="checkbox" aria-checked>`), like the
 *   filter menu's checklist, where the whole row toggles and a nested input
 *   would be a second focus stop.
 * - **`Checkbox`** — a real `<input type="checkbox">`, visually hidden, drawn
 *   by the mark. For form rows: put it inside the `<label>` that carries the
 *   sentence, so the text toggles it and the form keeps native semantics
 *   (Space, form reset, `checked` in devtools). Focus rings the mark, since
 *   the input itself is invisible.
 *
 * No `"use client"`: there is no state or hook here, so `CheckboxMark` renders
 * on the server too, and `Checkbox` joins whichever client component hands it
 * an `onChange`.
 */

export function CheckboxMark({
  checked,
  disabled,
  className,
}: {
  checked: boolean;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex size-3.5 shrink-0 items-center justify-center rounded-[var(--radius-cell)] border transition-colors duration-150",
        checked
          ? "border-[var(--blue)] bg-[var(--blue)]"
          : "border-[var(--ink-300)]",
        disabled && "opacity-50",
        className,
      )}
    >
      {checked && (
        <Check className="size-2.5 text-white" strokeWidth={3} aria-hidden />
      )}
    </span>
  );
}

export function Checkbox({
  checked,
  onChange,
  disabled,
  className,
  "aria-label": ariaLabel,
  "aria-describedby": describedBy,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  /** Placement only — margin to sit on a text baseline, say. */
  className?: string;
  /** Only when no wrapping `<label>` names it. */
  "aria-label"?: string;
  "aria-describedby"?: string;
}) {
  return (
    <span className={cn("relative inline-flex shrink-0", className)}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        aria-label={ariaLabel}
        aria-describedby={describedBy}
        className="peer absolute inset-0 m-0 cursor-pointer opacity-0 disabled:cursor-not-allowed"
      />
      <CheckboxMark
        checked={checked}
        disabled={disabled}
        className="peer-focus-visible:shadow-[var(--focus-ring)]"
      />
    </span>
  );
}
