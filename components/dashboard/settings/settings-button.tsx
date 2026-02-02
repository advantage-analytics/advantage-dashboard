"use client";

import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";

type ButtonVariant = "primary" | "secondary" | "outline";

interface SettingsButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  loading?: boolean;
  fullWidth?: boolean;
}

const variantStyles: Record<ButtonVariant, { enabled: string; disabled: string }> = {
  primary: {
    enabled: "bg-[#0D0D0D] text-white hover:bg-[#1a1a1a] active:scale-[0.98]",
    disabled: "bg-[#E5E5E5] text-[#999] cursor-not-allowed",
  },
  secondary: {
    enabled: "bg-[#F2F2F2] text-[#0D0D0D] hover:bg-[#E8E8E8] active:scale-[0.98]",
    disabled: "bg-[#F5F5F5] text-[#999] cursor-not-allowed",
  },
  outline: {
    enabled: "border border-[#0D0D0D] text-[#0D0D0D] hover:bg-[#0D0D0D] hover:text-white active:scale-[0.98]",
    disabled: "border border-[#E5E5E5] text-[#999] cursor-not-allowed",
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
