"use client";

import type { AskStarter } from "@/lib/services/ask/starters";
import { cn } from "@/lib/utils";

/**
 * A row of questions to ask with one click: the starters under an empty
 * composer, and the follow-ups under the newest answer. Each is a pill the
 * composer's tag chips are already drawn as — same height, same surface —
 * because they are the same thing: a question with its tags, ready to send.
 * Disabled while an answer is arriving, since the thread takes one question
 * at a time.
 */
export function AskStarters({
  label,
  starters,
  onPick,
  disabled = false,
  className,
}: {
  /** The accessible name of the row, e.g. "Questions to start with". */
  label: string;
  starters: readonly AskStarter[];
  onPick: (starter: AskStarter) => void;
  disabled?: boolean;
  className?: string;
}) {
  if (starters.length === 0) return null;
  return (
    <ul
      aria-label={label}
      className={cn("m-0 flex list-none flex-wrap gap-1.5 p-0", className)}
    >
      {starters.map((starter) => (
        <li key={starter.text}>
          <button
            type="button"
            disabled={disabled}
            onClick={() => onPick(starter)}
            className={cn(
              "flex h-[26px] cursor-pointer items-center rounded-full border border-[var(--border-field)] bg-[var(--surface-card)] px-3 text-[12px] text-[var(--ink-700)]",
              "transition-colors duration-[var(--duration-hover)] hover:border-[var(--ink-300)] hover:text-[var(--ink-900)]",
              "focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none",
              "disabled:cursor-default disabled:opacity-60",
            )}
          >
            {starter.text}
          </button>
        </li>
      ))}
    </ul>
  );
}
