"use client";

import { forwardRef } from "react";
import { cn } from "@/lib/utils";
import { SettingsFieldSkeleton } from "@/components/dashboard/settings/settings-field-skeleton";

interface SettingsInputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  hint?: React.ReactNode;
  skeleton?: boolean;
  skeletonWidth?: "sm" | "md" | "lg";
  skeletonIndex?: number;
  tone?: "default" | "danger";
}

/**
 * Underline-style input — mirrors the auth form-field.tsx vocabulary
 * (eyebrow label · transparent input · 1px → 2px blue focus rule).
 *
 * `skeleton` renders a hairline pulse in place of the underline while data
 * is loading, so the field reserves its layout slot without flashing empty.
 */
export const SettingsInput = forwardRef<HTMLInputElement, SettingsInputProps>(
  ({ label, hint, skeleton, skeletonWidth, skeletonIndex, className, id, disabled, required, tone = "default", ...props }, ref) => {
    if (skeleton) {
      return (
        <SettingsFieldSkeleton
          label={label}
          width={skeletonWidth}
          index={skeletonIndex}
          required={required}
        />
      );
    }
    const isDanger = tone === "danger";
    return (
      <div className="group flex flex-col gap-[6px]">
        <label
          htmlFor={id}
          className={cn(
            "text-[10px] font-medium uppercase tracking-[2.5px]",
            disabled
              ? "text-[var(--color-ink-300)]"
              : isDanger
                ? "text-[var(--color-danger-tint-70)]"
                : "text-[var(--color-ink-400)]"
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
        <div className="flex w-full items-center pb-[10px]">
          <input
            ref={ref}
            id={id}
            disabled={disabled}
            required={required}
            className={cn(
              "w-full bg-transparent text-[14px] outline-none transition-colors duration-150",
              disabled
                ? "text-[var(--color-ink-500)] cursor-not-allowed placeholder:text-[var(--color-ink-300)]"
                : "text-[var(--color-ink-900)] placeholder:text-[var(--color-ink-400)]",
              className
            )}
            {...props}
          />
        </div>
        <div
          aria-hidden="true"
          className={cn(
            "h-[1px] w-full transition-all duration-300",
            disabled
              ? "bg-[var(--color-ink-100)]"
              : isDanger
                ? "bg-[var(--color-danger-tint-15)] group-focus-within:h-[2px] group-focus-within:bg-[var(--color-error-strong)]"
                : "bg-[var(--color-ink-100)] group-hover:bg-[var(--color-ink-200)] group-focus-within:h-[2px] group-focus-within:bg-[var(--color-blue)]"
          )}
        />
        {hint && (
          <div className="text-[11px] text-[var(--color-ink-400)] leading-relaxed mt-1">
            {hint}
          </div>
        )}
      </div>
    );
  }
);

SettingsInput.displayName = "SettingsInput";
