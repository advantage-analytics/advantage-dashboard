"use client";

import { forwardRef } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { SettingsFieldSkeleton } from "@/components/dashboard/settings/settings-field-skeleton";

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
  skeleton?: boolean;
  skeletonWidth?: "sm" | "md" | "lg";
  skeletonIndex?: number;
}

/**
 * Underline-style select — matches SettingsInput / auth form-field.tsx.
 */
export const SettingsSelect = forwardRef<
  HTMLSelectElement,
  SettingsSelectProps
>(
  (
    { label, hint, options, placeholder, skeleton, skeletonWidth, skeletonIndex, className, id, disabled, required, value, ...props },
    ref
  ) => {
    const hasValue = value !== undefined && value !== "";

    if (skeleton) {
      return (
        <SettingsFieldSkeleton
          label={label}
          variant="select"
          width={skeletonWidth}
          index={skeletonIndex}
          required={required}
        />
      );
    }

    return (
      <div className="group flex flex-col gap-[6px]">
        <label
          htmlFor={id}
          className={cn(
            "text-[10px] font-medium uppercase tracking-[2.5px]",
            disabled ? "text-[var(--color-ink-300)]" : "text-[var(--color-ink-400)]"
          )}
        >
          {label}
          {required && (
            <>
              <span className="text-[var(--color-blue)] ml-1" aria-hidden="true">
                *
              </span>
              <span className="sr-only">(required)</span>
            </>
          )}
        </label>
        <div className="relative flex w-full items-center pb-[10px]">
          <select
            ref={ref}
            id={id}
            disabled={disabled}
            required={required}
            value={value}
            className={cn(
              "w-full appearance-none bg-transparent text-[14px] outline-none transition-colors duration-150 pr-6 cursor-pointer",
              disabled
                ? "text-[var(--color-ink-500)] cursor-not-allowed"
                : hasValue
                  ? "text-[var(--color-ink-900)] hover:[&:not(:focus)]:text-[var(--color-ink-700)]"
                  : "text-[var(--color-ink-400)] hover:[&:not(:focus)]:text-[var(--color-ink-700)]",
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
              "absolute right-0 top-1/2 -translate-y-[60%] size-3.5 pointer-events-none transition-colors",
              disabled ? "text-[var(--color-ink-300)]" : "text-[var(--color-ink-400)] group-focus-within:text-[var(--color-blue)]"
            )}
            strokeWidth={1.5}
            aria-hidden="true"
          />
        </div>
        <div
          aria-hidden="true"
          className={cn(
            "h-[1px] w-full transition-all duration-300",
            disabled
              ? "bg-[var(--color-ink-100)]"
              : "bg-[var(--color-ink-100)] group-hover:bg-[var(--color-ink-200)] group-focus-within:h-[2px] group-focus-within:bg-[var(--color-blue)]"
          )}
        />
        {hint && (
          <p className="text-[11px] text-[var(--color-ink-400)] leading-relaxed mt-1">
            {hint}
          </p>
        )}
      </div>
    );
  }
);

SettingsSelect.displayName = "SettingsSelect";
