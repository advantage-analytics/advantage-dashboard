"use client";

import { type ReactNode } from "react";
import { Check, X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * A step's progress state: done, running now, not started yet, or failed.
 *
 * Extracted from `UploadMatchSuccess.tsx` (T7) so a second vertical stepper
 * (e.g. an admin flow) can reuse the exact same geometry without re-deriving
 * it. The upload wizard's own `StepView`/`StepKey`/`successView` — the
 * mapping from match + upload state to a list of steps — stays file-local
 * there; it is specific to that screen. Only the generic row and its dot are
 * shared here.
 */
export type StepState = "done" | "now" | "later" | "fail";

/** Inline colour: DS type classes are unlayered and beat Tailwind utilities. */
const LABEL_INK: Record<StepState, string> = {
  done: "var(--ink-600)",
  now: "var(--ink-900)",
  later: "var(--ink-400)",
  fail: "var(--ink-900)",
};

/**
 * One row of a vertical progress stepper — a dot/spinner/check mark, a label
 * with an optional right-aligned value, a connecting rule down to the next
 * step, and an optional body underneath (progress bars, notes, retry
 * actions). Render a list of these inside an `<ol aria-label="Progress">`.
 */
export function VerticalStep({
  label,
  state,
  value,
  last,
  children,
}: {
  label: string;
  state: StepState;
  /** Right-aligned reading on the label row — a percentage, a size. */
  value?: string;
  /** The final step in the list: no connecting rule, and tighter spacing. */
  last: boolean;
  children?: ReactNode;
}) {
  const hasBody = Boolean(children);
  return (
    <li
      className="flex gap-3.5"
      aria-current={state === "now" ? "step" : undefined}
    >
      <div className="flex w-4 shrink-0 flex-col items-center pt-0.5">
        <StepMark state={state} />
        {!last && (
          <div
            aria-hidden="true"
            className={cn(
              "my-1.5 w-px flex-1",
              state === "done"
                ? "bg-[var(--ink-200)]"
                : "bg-[var(--border-hairline)]",
            )}
          />
        )}
      </div>
      <div
        className={cn(
          "flex min-w-0 flex-1 flex-col gap-2.5",
          last ? "" : hasBody ? "pb-7" : "pb-5",
        )}
      >
        <div className="flex items-center justify-between gap-4">
          <span
            className="text-[13px] leading-5"
            style={{ color: LABEL_INK[state] }}
          >
            {label}
          </span>
          {value && (
            <span className="text-[13px] text-[var(--ink-700)] tabular-nums">
              {value}
            </span>
          )}
        </div>
        {children}
      </div>
    </li>
  );
}

export function StepMark({ state }: { state: StepState }) {
  switch (state) {
    case "done":
      return (
        <span className="flex size-4 items-center justify-center rounded-full bg-[var(--ink-100)]">
          <Check
            className="size-2.5 text-[var(--ink-600)]"
            strokeWidth={2.25}
            aria-hidden="true"
          />
          <span className="sr-only">Done:</span>
        </span>
      );
    case "now":
      // Ink, not blue: blue stays on the bar and the one button.
      return (
        <span
          className="size-4 animate-spin rounded-full border-[1.5px] border-[var(--ink-200)] border-t-[var(--ink-900)] motion-reduce:animate-none"
          role="status"
        >
          <span className="sr-only">In progress:</span>
        </span>
      );
    case "fail":
      return (
        <span className="flex size-4 items-center justify-center rounded-full bg-[rgba(229,24,55,0.08)]">
          <X
            className="size-2.5 text-[var(--danger)]"
            strokeWidth={2.25}
            aria-hidden="true"
          />
          <span className="sr-only">Failed:</span>
        </span>
      );
    case "later":
      // Dashed means waiting for something real.
      return (
        <span className="size-4 rounded-full border-[1.5px] border-dashed border-[var(--ink-300)]">
          <span className="sr-only">Not started:</span>
        </span>
      );
  }
}
