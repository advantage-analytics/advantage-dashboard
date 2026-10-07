"use client";

import { squadLabel, type GenderedSquad, type Squad } from "@/lib/data/squad";
import { cn } from "@/lib/utils";

const COLLEGE_SQUADS: readonly GenderedSquad[] = ["mens", "womens"];

/**
 * The squad as pills — Men's / Women's, and Co-ed where the caller offers it.
 *
 * Half-width buttons read as a segmented control, which implies a setting
 * with a default. These are an answer to a question — the same pill the rest of
 * the product uses for a chosen filter — so an unanswered row looks unanswered
 * rather than looking like "Men's" was already picked for you. `value` may be
 * null for exactly that: the custom-team setup starts with nothing chosen.
 *
 * The distinction matters more here than anywhere else in the flow: men's and
 * women's are separate programs with separate budgets, and picking the wrong
 * one sets up the wrong workspace.
 *
 * `options` defaults to the college pair. A club, high school or academy
 * passes `squadsFor(orgType)`, which adds Co-ed.
 */
export function TeamPills<T extends Squad = GenderedSquad>({
  value,
  onChange,
  options = COLLEGE_SQUADS as readonly Squad[] as readonly T[],
}: {
  value: T | null;
  onChange: (value: T) => void;
  options?: readonly T[];
}) {
  return (
    <div role="radiogroup" aria-label="Team" className="flex gap-1.5">
      {options.map((option) => {
        const selected = value === option;
        return (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(option)}
            className={cn(
              // The transparent border on the selected pill is load-bearing:
              // without it the row reflows by 1px each time the answer
              // changes.
              "cursor-pointer rounded-[var(--radius-pill)] border px-3 py-1.5 text-[12px] transition-colors duration-150",
              "focus-visible:outline-none",
              selected
                ? "border-transparent bg-[var(--blue-soft)] text-[var(--blue)]"
                : "border-[var(--border-field)] text-[var(--ink-700)] hover:bg-[var(--surface-subtle)]",
            )}
          >
            {squadLabel(option)}
          </button>
        );
      })}
    </div>
  );
}
