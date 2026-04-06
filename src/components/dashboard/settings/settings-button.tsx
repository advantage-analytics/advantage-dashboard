"use client";

import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";

type ButtonVariant = "primary" | "secondary" | "outline" | "blue";

interface SettingsButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  loading?: boolean;
  fullWidth?: boolean;
}

const variantStyles: Record<ButtonVariant, { enabled: string; disabled: string }> = {
  primary: {
    enabled: "bg-[#0D0D0D] text-white hover:bg-[#1a1a1a] active:scale-[0.97]",
    disabled: "bg-[#E5E5E5] text-[#999] cursor-not-allowed",
  },
  secondary: {
    enabled: "bg-[#F2F2F2] text-[#0D0D0D] hover:bg-[#E8E8E8] active:scale-[0.97]",
    disabled: "bg-[#F5F5F5] text-[#999] cursor-not-allowed",
  },
  outline: {
    enabled: "border border-[#E5E5E5] text-[#0D0D0D] hover:border-[#3B82F6] hover:text-[#3B82F6] active:scale-[0.97]",
    disabled: "border border-[#E5E5E5] text-[#999] cursor-not-allowed",
  },
  blue: {
    enabled: "bg-[#3B82F6] text-white hover:bg-[#2a75e0] active:scale-[0.97] shadow-[0_2px_8px_rgba(57,134,243,0.25)]",
    disabled: "bg-[#E5E5E5] text-[#999] cursor-not-allowed",
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
        "h-10 px-5 text-xs font-medium rounded-lg transition-all duration-200 inline-flex items-center justify-center gap-2",
        fullWidth && "w-full",
        isDisabled ? styles.disabled : styles.enabled,
        className
      )}
      {...props}
    >
      {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
      {children}
    </button>
  );
}
