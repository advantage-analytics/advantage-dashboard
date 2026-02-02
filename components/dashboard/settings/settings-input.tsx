"use client";

import { forwardRef } from "react";
import { cn } from "@/lib/utils";

interface SettingsInputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  hint?: string;
}

export const SettingsInput = forwardRef<HTMLInputElement, SettingsInputProps>(
  ({ label, hint, className, id, disabled, ...props }, ref) => {
    return (
      <div className="space-y-1.5">
        <label
          htmlFor={id}
          className={cn(
            "block text-xs font-medium transition-colors",
            disabled ? "text-[#999]" : "text-[#0D0D0D]"
          )}
        >
          {label}
        </label>
        <input
          ref={ref}
          id={id}
          disabled={disabled}
          className={cn(
            "w-full h-10 px-3 text-xs rounded-lg outline-none transition-all duration-200",
            "border bg-[#FAFAFA]",
            disabled
              ? "text-[#999] border-[#E5E5E5] cursor-not-allowed"
              : "text-[#0D0D0D] border-[#E5E5E5] hover:border-[#CCCCCC] focus:border-[#0D0D0D] focus:bg-white placeholder:text-[#999]",
            className
          )}
          {...props}
        />
        {hint && (
          <p className="text-xs text-[#999] leading-relaxed">{hint}</p>
        )}
      </div>
    );
  }
);

SettingsInput.displayName = "SettingsInput";
