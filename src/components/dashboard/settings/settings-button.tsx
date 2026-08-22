"use client";

import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

type Variant = "primary" | "outline" | "ghost" | "danger" | "danger-solid";
type Size = "sm" | "md";

/**
 * The one button the settings pages use.
 *
 * Round 4 briefly had seven hand-written `<button className={cn(...)}>` blocks
 * — Save, Discard, Invite, Reset password, Sign out everywhere, Delete account,
 * Upgrade — each repeating the same radius, the same focus ring and the same
 * `disabled ? cursor-not-allowed : cursor-pointer hover:` ternary, and three of
 * them had already drifted to different heights. This is that recipe, once.
 *
 * Geometry, weight and states come from `Button.jsx` in the design system
 * bundle (`_ds_bundle.js`), not from eyeballing the canvas: 32/36px heights,
 * 12/16px padding, 12/13px text, weight 500 throughout, `scale(0.97)` on press,
 * and `opacity:0.5; pointer-events:none` when disabled rather than a recolour.
 *
 * The variant names are the bundle's. The design doc writes `variant="secondary"`
 * in a few frames, which the bundle has no class for — `outline` is what that
 * renders as and what it means.
 */
const VARIANTS: Record<Variant, string> = {
  primary:
    "bg-[var(--blue)] text-white shadow-[var(--shadow-cta-glow)] hover:bg-[var(--blue-hover)]",
  outline:
    // Hover is the surface wash only. Turning the border and label blue made
    // every secondary button look like a second primary — see the same fix in
    // `adv-button.ts`, and `.adv-btn-outline:hover` in the design system, which
    // is `background: var(--surface-subtle)` and nothing more.
    "bg-[var(--surface-card)] border-[var(--border-field)] text-[var(--ink-700)] hover:bg-[var(--surface-subtle)]",
  ghost:
    "bg-transparent border-[var(--border-field)] text-[var(--ink-700)] hover:bg-[var(--surface-subtle)]",
  // Destructive chrome uses `--danger`, never `--viz-bad`: colors.css fences
  // the viz ramp to "charts ONLY — never chrome".
  danger:
    "bg-transparent border-[var(--danger-tint-15)] text-[var(--danger)] hover:bg-[var(--danger-tint-15)]",
  "danger-solid":
    "bg-[var(--danger)] text-white hover:bg-[var(--danger-hover)]",
};

const SIZES: Record<Size, string> = {
  sm: "h-8 px-3 text-[12px]",
  md: "h-9 px-4 text-[13px]",
};

export function SettingsButton({
  children,
  variant = "primary",
  size = "md",
  loading = false,
  disabled,
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
}) {
  const isDisabled = disabled || loading;

  return (
    <button
      type="button"
      disabled={isDisabled}
      className={cn(
        "inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 rounded-[6px] border border-transparent font-medium transition-colors duration-200",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--blue-ring-40)]",
        "active:enabled:scale-[0.97] motion-reduce:active:enabled:scale-100",
        "disabled:pointer-events-none disabled:opacity-50",
        SIZES[size],
        VARIANTS[variant],
        className
      )}
      {...props}
    >
      {loading && (
        <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
      )}
      {children}
    </button>
  );
}

/**
 * A square icon-only button: the month stepper's chevrons and the roster's
 * remove ×. `tone="danger"` only changes the hover ink — the resting state of a
 * destructive icon should be as quiet as its neighbours.
 */
export function SettingsIconButton({
  label,
  tone = "default",
  className,
  children,
  ...props
}: Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "aria-label"> & {
  label: string;
  tone?: "default" | "danger";
}) {
  return (
    <button
      type="button"
      aria-label={label}
      className={cn(
        "flex size-5 items-center justify-center rounded-[8px] transition-colors duration-150",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--blue-ring-40)]",
        "disabled:cursor-not-allowed disabled:opacity-40",
        tone === "danger"
          ? "text-[var(--ink-300)] hover:bg-[var(--surface-subtle)] hover:text-[var(--danger)]"
          : "text-[var(--ink-400)] hover:bg-[var(--surface-subtle)] hover:text-[var(--ink-700)]",
        "enabled:cursor-pointer",
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}
