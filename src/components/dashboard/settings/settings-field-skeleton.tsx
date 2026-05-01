"use client";

import { cn } from "@/lib/utils";

type SkeletonWidth = "sm" | "md" | "lg";

interface SettingsFieldSkeletonProps {
  label: string;
  variant?: "input" | "select";
  width?: SkeletonWidth;
  /** Stagger index — drives the shimmer wave down the form (~80ms per field). */
  index?: number;
  required?: boolean;
}

const WIDTH_CLASS: Record<SkeletonWidth, string> = {
  sm: "w-[38%]",
  md: "w-[58%]",
  lg: "w-[74%]",
};

/**
 * Hairline skeleton — reserves the exact layout slot of SettingsInput /
 * SettingsSelect (label · 22px content row · 1px underline) and renders a
 * dim shimmer bar where the value will land. Per-field width and stagger
 * index create rhythm so the form reads as loading content, not dead boxes.
 */
export function SettingsFieldSkeleton({
  label,
  variant = "input",
  width = "md",
  index = 0,
  required,
}: SettingsFieldSkeletonProps) {
  const delay = `${Math.min(index, 8) * 80}ms`;

  return (
    <div
      className="group flex flex-col gap-[6px]"
      role="status"
      aria-busy="true"
      aria-label={`Loading ${label}`}
    >
      <span className="text-[10px] font-medium uppercase tracking-[2.5px] text-[var(--color-ink-300)]">
        {label}
        {required && (
          <span className="ml-1 text-[var(--color-ink-200)]" aria-hidden="true">
            *
          </span>
        )}
      </span>
      <div className="flex w-full items-center pb-[10px]">
        <div
          aria-hidden="true"
          className={cn(
            "h-[10px] rounded-[2px] settings-skeleton-bar",
            WIDTH_CLASS[width]
          )}
          style={{ "--shimmer-delay": delay } as React.CSSProperties}
        />
        {variant === "select" && (
          <span
            aria-hidden="true"
            className="ml-auto h-[6px] w-[6px] rotate-45 border-r border-b border-[var(--color-ink-200)]"
          />
        )}
      </div>
      <div aria-hidden="true" className="h-[1px] w-full bg-[var(--color-ink-100)]" />
    </div>
  );
}
