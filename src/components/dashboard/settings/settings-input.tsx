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
            "block text-[12px] font-medium transition-colors",
            disabled ? "text-[#888888]" : "text-[#0D0D0D]"
          )}
        >
          {label}
          {props.required && (
            <span className="text-[#3B82F6] ml-0.5" aria-hidden="true">*</span>
          )}
        </label>
        <input
          ref={ref}
          id={id}
          disabled={disabled}
          className={cn(
            "w-full h-10 px-3.5 text-[13px] rounded-[6px] outline-none transition-all duration-200",
            "border bg-white",
            disabled
              ? "text-[#888888] bg-[#F7F7F7] border-[#F3F3F3] cursor-not-allowed"
              : "text-[#0D0D0D] border-[#EAECF0] hover:border-[#CCCCCC] focus:border-[#3B82F6] focus-visible:ring-2 focus-visible:ring-[#3B82F6]/10 placeholder:text-[#AAAAAA]",
            className
          )}
          {...props}
        />
        {hint && (
          <p className="text-[11px] text-[#AAAAAA] leading-relaxed">{hint}</p>
        )}
      </div>
    );
  }
);

SettingsInput.displayName = "SettingsInput";
