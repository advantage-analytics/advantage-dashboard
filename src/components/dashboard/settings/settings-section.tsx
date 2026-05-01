"use client";

import { cn } from "@/lib/utils";

interface SettingsSectionProps {
  title: string;
  description?: string;
  number?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  titleClassName?: string;
  tone?: "default" | "danger";
}

/**
 * Editorial section — numbered eyebrow + hairline rule + content well.
 * The number ("01", "02") reads as a magazine TOC and reinforces the
 * scoreboard / training-notebook voice from DESIGN.md.
 */
export function SettingsSection({
  title,
  description,
  number,
  action,
  children,
  className,
  titleClassName,
  tone = "default",
}: SettingsSectionProps): React.ReactElement {
  const isDanger = tone === "danger";

  return (
    <section className={cn("flex flex-col gap-5", className)}>
      <header className="flex items-end justify-between gap-4">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          {number && (
            <span
              className={cn(
                "text-[10px] font-medium tracking-[1px] tabular-nums whitespace-nowrap",
                isDanger ? "text-[var(--color-error-strong)]/40" : "text-[var(--color-ink-300)]"
              )}
              aria-hidden="true"
            >
              {number}
            </span>
          )}
          <p
            className={cn(
              "text-[10px] font-medium uppercase tracking-[2.5px] whitespace-nowrap",
              titleClassName ||
                (isDanger ? "text-[var(--color-error-strong)]/70" : "text-[var(--color-ink-400)]")
            )}
          >
            {title}
          </p>
          <div
            aria-hidden="true"
            className={cn(
              "flex-1 h-px",
              isDanger ? "bg-[var(--color-error-strong)]/15" : "bg-[var(--color-ink-100)]"
            )}
          />
        </div>
        {action && <div className="flex-shrink-0 pb-1">{action}</div>}
      </header>

      {description && (
        <p className="text-[12px] text-[var(--color-ink-500)] leading-[1.55] -mt-2 max-w-prose">
          {description}
        </p>
      )}

      <div className="flex flex-col gap-5">{children}</div>
    </section>
  );
}
