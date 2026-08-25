"use client";

import { cn } from "@/lib/utils";

/**
 * The 36×20 switch the preferences and policy rows use.
 *
 * Geometry from `Switch.jsx` in the design system bundle — track 36×20, thumb
 * 16px, travel 16px. The round-4 canvas draws these inline at 30×18 rather than
 * importing the component; the shipping component is the one to match.
 *
 * A real `<button role="switch">` rather than a styled checkbox: it is never
 * submitted with a form — every one of these saves on change — so the input's
 * only contribution would be a name/value pair nothing reads, and `aria-checked`
 * says the same thing to a screen reader with none of the label plumbing.
 */
export function SettingsToggle({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  /** Accessible name — the visible copy lives in the row beside it. */
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative h-5 w-9 shrink-0 rounded-full transition-colors duration-200",
        "focus-visible:outline-none",
        disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer",
        checked ? "bg-[var(--blue)]" : "bg-[var(--ink-200)]"
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "absolute left-[2px] top-[2px] size-4 rounded-full bg-white shadow-[0_1px_2px_rgba(0,0,0,0.15)] transition-transform duration-200",
          checked ? "translate-x-4" : "translate-x-0"
        )}
      />
    </button>
  );
}

/**
 * The radio pair the Team policies use — two choices, stacked, no card of
 * their own.
 */
export function SettingsRadioGroup<T extends string>({
  value,
  options,
  onChange,
  label,
  disabled,
}: {
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (next: T) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="flex shrink-0 flex-col gap-1.5"
    >
      {options.map((option) => {
        const isSelected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={isSelected}
            disabled={disabled}
            onClick={() => onChange(option.value)}
            className={cn(
              "flex items-center gap-2 rounded-[6px] text-left text-[12px] text-[var(--ink-900)]",
              "focus-visible:outline-none",
              disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer"
            )}
          >
            <span
              aria-hidden="true"
              className={cn(
                "inline-flex size-[13px] shrink-0 items-center justify-center rounded-full border transition-colors duration-150",
                isSelected
                  ? "border-[var(--blue)]"
                  : "border-[var(--ink-300)]"
              )}
            >
              <span
                className={cn(
                  "size-[6px] rounded-full transition-colors duration-150",
                  isSelected ? "bg-[var(--blue)]" : "bg-transparent"
                )}
              />
            </span>
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
