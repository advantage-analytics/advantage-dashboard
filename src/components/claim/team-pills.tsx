"use client";

import { cn } from "@/lib/utils";

/**
 * Men's / Women's as two pills.
 *
 * Two half-width buttons read as a segmented control, which implies a setting
 * with a default. These are an answer to a question — the same pill the rest of
 * the product uses for a chosen filter — so an unanswered pair looks unanswered
 * rather than looking like "Men's" was already picked for you.
 *
 * The distinction matters more here than anywhere else in the flow: men's and
 * women's are separate programs with separate budgets, and picking the wrong
 * one sets up the wrong workspace.
 */
export function TeamPills({
  value,
  onChange,
}: {
  value: "mens" | "womens";
  onChange: (value: "mens" | "womens") => void;
}) {
  return (
    <div role="radiogroup" aria-label="Team" className="flex gap-1.5">
      {(["mens", "womens"] as const).map((option) => {
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
              // without it the pair reflows by 1px each time the answer
              // changes.
              "cursor-pointer rounded-[var(--radius-pill)] border px-3 py-1.5 text-[12px] transition-colors duration-150",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--blue-ring-40)]",
              selected
                ? "border-transparent bg-[var(--blue-soft)] text-[var(--blue)]"
                : "border-[var(--border-field)] text-[var(--ink-700)] hover:bg-[var(--surface-subtle)]"
            )}
          >
            {option === "mens" ? "Men's" : "Women's"}
          </button>
        );
      })}
    </div>
  );
}
