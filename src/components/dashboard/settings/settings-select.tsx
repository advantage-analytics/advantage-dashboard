"use client";

import { forwardRef } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface SelectOption {
  value: string;
  label: string;
}

interface SettingsSelectProps
  extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, "children"> {
  label: string;
  hint?: string;
  options: SelectOption[];
  placeholder?: string;
}

export const SettingsSelect = forwardRef<
  HTMLSelectElement,
  SettingsSelectProps
>(({ label, hint, options, placeholder, className, id, disabled, value, ...props }, ref) => {
  const hasValue = value !== undefined && value !== "";

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
      <div className="relative">
        <select
          ref={ref}
          id={id}
          disabled={disabled}
          value={value}
          className={cn(
            "w-full h-10 pl-3.5 pr-9 text-[13px] rounded-[6px] outline-none transition-all duration-200 appearance-none",
            "border bg-white",
            disabled
              ? "text-[#888888] bg-[#F7F7F7] border-[#F3F3F3] cursor-not-allowed"
              : cn(
                  "border-[#EAECF0] hover:border-[#CCCCCC] focus:border-[#3B82F6] focus-visible:ring-2 focus-visible:ring-[#3B82F6]/10",
                  hasValue ? "text-[#0D0D0D]" : "text-[#AAAAAA]"
                ),
            className
          )}
          {...props}
        >
          {placeholder && (
            <option value="" disabled>
              {placeholder}
            </option>
          )}
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <ChevronDown
          className={cn(
            "absolute right-3 top-1/2 -translate-y-1/2 size-3.5 pointer-events-none",
            disabled ? "text-[#AAAAAA]" : "text-[#888888]"
          )}
          strokeWidth={1.5}
          aria-hidden="true"
        />
      </div>
      {hint && (
        <p className="text-[11px] text-[#AAAAAA] leading-relaxed">{hint}</p>
      )}
    </div>
  );
});

SettingsSelect.displayName = "SettingsSelect";
