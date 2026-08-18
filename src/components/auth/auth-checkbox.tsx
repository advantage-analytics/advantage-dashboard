"use client";

/**
 * The DS v2 16px checkbox: 4px radius, hairline border at rest, Signal Blue
 * fill with a white Lucide check when set.
 *
 * Deliberately label-less. The consent copy it sits beside contains Terms and
 * Privacy links, and wrapping that text in the control's own `<label>` would
 * make every click on those links toggle the box on the way out. The text is a
 * sibling instead, bound with `aria-describedby`.
 */
export default function AuthCheckbox({
  id,
  checked,
  onChange,
  "aria-label": ariaLabel,
  "aria-describedby": describedBy,
  "aria-invalid": invalid,
}: {
  id: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  "aria-label": string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean;
}) {
  return (
    <span className="relative inline-flex shrink-0">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        aria-label={ariaLabel}
        aria-describedby={describedBy}
        aria-invalid={invalid}
        className="peer absolute h-0 w-0 opacity-0"
      />
      <label
        htmlFor={id}
        className="inline-flex h-[16px] w-[16px] cursor-pointer items-center justify-center rounded-[var(--radius-cell)] border border-[var(--border-field)] bg-[var(--surface-card)] transition-[background-color,border-color] duration-[var(--duration-fast)] peer-checked:border-[var(--blue)] peer-checked:bg-[var(--blue)] peer-checked:[&>svg]:opacity-100 peer-focus-visible:shadow-[var(--focus-ring)]"
      >
        <svg
          width="11"
          height="11"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#fff"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          className="opacity-0 transition-opacity duration-[var(--duration-fast)]"
        >
          <path d="M20 6 9 17l-5-5" />
        </svg>
      </label>
    </span>
  );
}
