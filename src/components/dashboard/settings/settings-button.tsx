"use client";

import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";

type ButtonVariant = "primary" | "secondary" | "outline" | "blue" | "danger";

interface SettingsButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  loading?: boolean;
  fullWidth?: boolean;
}

const variantStyles: Record<
  ButtonVariant,
  { enabled: string; disabled: string }
> = {
  primary: {
    enabled:
      "bg-[var(--color-ink-900)] text-white hover:bg-[var(--color-ink-900)] active:scale-[0.97] shadow-none",
    disabled: "bg-[var(--color-ink-100)] text-[var(--color-ink-400)] cursor-not-allowed",
  },
  secondary: {
    enabled:
      "bg-[var(--color-ink-100)] text-[var(--color-ink-700)] hover:bg-[var(--color-ink-200)] active:scale-[0.97]",
    disabled: "bg-[var(--color-ink-100)] text-[var(--color-ink-400)] cursor-not-allowed",
  },
  outline: {
    enabled:
      "border border-[var(--color-ink-border)] text-[var(--color-ink-700)] hover:border-[var(--color-blue)] hover:text-[var(--color-blue)] active:scale-[0.97]",
    disabled: "border border-[var(--color-ink-100)] text-[var(--color-ink-400)] cursor-not-allowed",
  },
  blue: {
    enabled:
      "bg-[var(--color-blue)] text-white hover:bg-[var(--color-blue-hover)] active:scale-[0.97]",
    disabled: "bg-[var(--color-ink-100)] text-[var(--color-ink-400)] cursor-not-allowed",
  },
  danger: {
    enabled:
      "border border-[var(--color-error-strong)]/20 text-[var(--color-error-strong)] hover:bg-[rgba(229,24,55,0.05)] active:scale-[0.97]",
    disabled:
      "border border-[var(--color-ink-100)] text-[var(--color-ink-400)] cursor-not-allowed",
  },
};

export function SettingsButton({
  children,
  variant = "primary",
  loading = false,
  fullWidth = false,
  disabled,
  className,
  ...props
}: SettingsButtonProps): React.ReactElement {
  const isDisabled = disabled || loading;
  const styles = variantStyles[variant];

  return (
    <button
      disabled={isDisabled}
      className={cn(
        "h-10 px-5 text-[10px] font-medium uppercase tracking-[1.5px] rounded-[6px] transition-all duration-200 inline-flex items-center justify-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-blue)]/40",
        fullWidth && "w-full",
        isDisabled ? styles.disabled : styles.enabled,
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
