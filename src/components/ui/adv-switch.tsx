"use client";

/**
 * The design system's switch, transcribed.
 *
 * `.adv-switch-track` is 36×20 with a 16px thumb inset 2px, `--ink-200` off and
 * Signal Blue on, the thumb travelling exactly 16px on a 200ms
 * `--ease-primary`. The shadcn `Switch` in `ui/switch.tsx` is 32×18.4 with the
 * thumb hard-coded in the primitive, so matching the DS from the outside was
 * not possible — a near-miss on the one control in a dialog is more noticeable
 * than a near-miss anywhere else, because it sits still while you read it.
 *
 * A `role="switch"` button rather than a checkbox: there is no form to submit
 * it with, and the value is applied by the dialog's own action.
 */
export function AdvSwitch({
  checked,
  onCheckedChange,
  disabled = false,
  label,
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  /** Named for screen readers; the visible label is the row this sits in. */
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      className="group relative h-5 w-9 shrink-0 cursor-pointer rounded-[var(--radius-pill)] outline-none transition-colors duration-[var(--duration-hover)] focus-visible:shadow-[var(--focus-ring)] disabled:pointer-events-none disabled:opacity-50"
      style={{
        background: checked ? "var(--blue)" : "var(--ink-200)",
      }}
    >
      <span
        aria-hidden="true"
        className="absolute left-0.5 top-0.5 size-4 rounded-full bg-white shadow-[0_1px_2px_rgba(0,0,0,0.15)] transition-transform duration-[var(--duration-hover)] ease-[var(--ease-primary)] motion-reduce:transition-none"
        style={{ transform: checked ? "translateX(16px)" : "translateX(0)" }}
      />
    </button>
  );
}
