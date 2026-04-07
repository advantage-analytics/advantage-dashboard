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
      "bg-[#0D0D0D] text-white hover:bg-[#1a1a1a] active:scale-[0.97] shadow-none",
    disabled: "bg-[#F3F3F3] text-[#AAAAAA] cursor-not-allowed",
  },
  secondary: {
    enabled:
      "bg-[#F5F5F5] text-[#525252] hover:bg-[#EBEBEB] active:scale-[0.97]",
    disabled: "bg-[#F7F7F7] text-[#AAAAAA] cursor-not-allowed",
  },
  outline: {
    enabled:
      "border border-[#EAECF0] text-[#525252] hover:border-[#3B82F6] hover:text-[#3B82F6] active:scale-[0.97]",
    disabled: "border border-[#F3F3F3] text-[#AAAAAA] cursor-not-allowed",
  },
  blue: {
    enabled:
      "bg-[#3B82F6] text-white hover:bg-[#2563EB] active:scale-[0.97]",
    disabled: "bg-[#F3F3F3] text-[#AAAAAA] cursor-not-allowed",
  },
  danger: {
    enabled:
      "border border-[#E51837]/20 text-[#E51837] hover:bg-[rgba(229,24,55,0.05)] active:scale-[0.97]",
    disabled:
      "border border-[#F3F3F3] text-[#AAAAAA] cursor-not-allowed",
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
        "h-10 px-5 text-[10px] font-medium uppercase tracking-[1.5px] rounded-full transition-all duration-200 inline-flex items-center justify-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3B82F6]/40",
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
