"use client";

import { cn } from "@/lib/utils";

interface ProfileIdentityCardProps {
  displayName: string;
  isPlaceholderName?: boolean;
  email: string;
  roleLabel?: string;
  completedCount: number;
  totalCount: number;
  /** When false, hide the completion meter — used when the welcome banner
   *  is visible and already communicates progress. Defaults to true. */
  showCompletion?: boolean;
}

/**
 * Identity block — scoreboard voice. Eyebrow + name + role + email,
 * with a tabular completion score and hairline tick row below.
 * Reads like a tennis match-day notebook header.
 */
export function ProfileIdentityCard({
  displayName,
  isPlaceholderName = false,
  email,
  roleLabel,
  completedCount,
  totalCount,
  showCompletion = true,
}: ProfileIdentityCardProps): React.ReactElement {
  const isComplete = completedCount === totalCount;
  const pad = (n: number) => n.toString().padStart(2, "0");

  return (
    <section className="flex flex-col gap-7 pb-8 border-b border-[var(--color-ink-100)]">
      {/* Identity */}
      <div className="flex flex-col gap-1.5 min-w-0">
        <p className="text-[10px] font-medium text-[var(--color-ink-400)] uppercase tracking-[2.5px]">
          Signed in as
        </p>
        <div className="flex items-center gap-2 flex-wrap">
          <h2
            className={cn(
              "font-light text-[22px] tracking-[-0.4px] leading-[1.15]",
              isPlaceholderName
                ? "italic text-[var(--color-ink-400)]"
                : "text-[var(--color-ink-900)]"
            )}
          >
            {displayName}
          </h2>
          {roleLabel && (
            <span className="inline-flex items-center px-2 py-0.5 text-[10px] font-medium uppercase tracking-[1.5px] rounded-full bg-[var(--color-blue-tint-08)] text-[var(--color-blue)]">
              {roleLabel}
            </span>
          )}
        </div>
        {email ? (
          <p className="text-[12px] text-[var(--color-ink-500)] truncate">
            {email}
          </p>
        ) : (
          <div
            role="status"
            aria-busy="true"
            aria-label="Loading email"
            className="h-[12px] w-44 rounded-[2px] settings-skeleton-bar"
          />
        )}
      </div>

      {/* Completion score — tabular numerics + hairline tick row.
          Hidden when the welcome banner already owns this signal. */}
      {showCompletion && (
        <div className="flex items-end justify-between gap-6">
          <div className="flex flex-col gap-2 min-w-0 flex-1">
            <p className="text-[10px] font-medium text-[var(--color-ink-400)] uppercase tracking-[2.5px]">
              Profile completion
            </p>
            <div
              className="flex gap-[3px]"
              role="progressbar"
              aria-valuenow={completedCount}
              aria-valuemin={0}
              aria-valuemax={totalCount}
              aria-label={`Profile completion: ${completedCount} of ${totalCount} fields`}
            >
              {Array.from({ length: totalCount }, (_, i) => {
                const filled = i < completedCount;
                return (
                  <span
                    key={i}
                    aria-hidden="true"
                    className={cn(
                      "h-[3px] flex-1 rounded-full transition-colors duration-300",
                      filled
                        ? isComplete
                          ? "bg-[var(--color-success)]"
                          : "bg-[var(--color-blue)]"
                        : "bg-[var(--color-ink-100)]"
                    )}
                  />
                );
              })}
            </div>
          </div>

          <p
            className={cn(
              "font-light text-[22px] tracking-[-0.4px] tabular-nums leading-none whitespace-nowrap",
              isComplete
                ? "text-[var(--color-success)]"
                : "text-[var(--color-ink-900)]"
            )}
          >
            {pad(completedCount)}
            <span className="text-[var(--color-ink-300)]">
              {" "}/ {pad(totalCount)}
            </span>
          </p>
        </div>
      )}
    </section>
  );
}
