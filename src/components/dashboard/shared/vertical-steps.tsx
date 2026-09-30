"use client";

import { type ReactNode } from "react";
import { Check, X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * A step's progress state: done, running now, the current step but waiting on
 * someone else, not started yet, failed, or stopped on purpose — plus
 * `none`, for a list row that was never analysed at all.
 *
 * `stopped` is a step the player ended — an analysis cancelled while it waited
 * in the queue. The Failed chip's shape in grey: nothing went wrong, so it
 * must not borrow the danger red.
 *
 * `none` is not a step in a running job: a match with no analysis (manual
 * entry, cancelled, stats unavailable). A thin solid ring — nothing is coming.
 *
 * `wait` is the queued step: it IS where the job is (dark label, like `now`),
 * but nothing is running, so it must not spin. It wears the dashed "waiting
 * for something real" ring, a shade darker than `later`'s so a current wait
 * still stands apart from the steps after it. The Matches and Roster tables
 * draw the same mark for Queued, so the spinner means one thing everywhere:
 * work is running right now.
 *
 * Extracted from `UploadMatchSuccess.tsx` (T7) so a second vertical stepper
 * (e.g. an admin flow) can reuse the exact same geometry without re-deriving
 * it. The upload wizard's own `StepView`/`StepKey`/`successView` — the
 * mapping from match + upload state to a list of steps — stays file-local
 * there; it is specific to that screen. Only the generic row and its dot are
 * shared here.
 */
export type StepState =
  "done" | "now" | "wait" | "later" | "fail" | "stopped" | "none";

/**
 * Inline colour: DS type classes are unlayered and beat Tailwind utilities.
 * Exported so the drawers' compact rows (`DrawerAnalysisSteps`) ink their
 * labels from the same table.
 */
export const LABEL_INK: Record<StepState, string> = {
  done: "var(--ink-600)",
  now: "var(--ink-900)",
  wait: "var(--ink-900)",
  later: "var(--ink-400)",
  fail: "var(--ink-900)",
  stopped: "var(--ink-900)",
  none: "var(--ink-400)",
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
      aria-current={state === "now" || state === "wait" ? "step" : undefined}
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

/**
 * The mark's two sizes. `default` is the 16px stepper mark every existing
 * caller draws; `compact` is 14px, for a row whose leading column is 14px —
 * the activity tray's `Lead` — with the glyph scaled to match (10px → 9px).
 * Only the box and the glyph change; colours, borders and the screen-reader
 * words are the same mark. Template strings, not `cn`, so the default size's
 * class strings stay byte-for-byte what every existing caller already drew.
 */
export type StepMarkSize = "default" | "compact";

const MARK_BOX: Record<StepMarkSize, string> = {
  default: "size-4",
  compact: "size-[14px]",
};

const MARK_GLYPH: Record<StepMarkSize, string> = {
  default: "size-2.5",
  compact: "size-[9px]",
};

export function StepMark({
  state,
  size = "default",
}: {
  state: StepState;
  size?: StepMarkSize;
}) {
  const box = MARK_BOX[size];
  const glyph = MARK_GLYPH[size];
  switch (state) {
    case "done":
      return (
        <span
          className={`flex ${box} items-center justify-center rounded-full bg-[var(--ink-100)]`}
        >
          <Check
            className={`${glyph} text-[var(--ink-600)]`}
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
          className={`${box} animate-spin rounded-full border-[1.5px] border-[var(--ink-200)] border-t-[var(--ink-900)] motion-reduce:animate-none`}
          role="status"
        >
          <span className="sr-only">In progress:</span>
        </span>
      );
    case "fail":
      return (
        <span
          className={`flex ${box} items-center justify-center rounded-full bg-[rgba(229,24,55,0.08)]`}
        >
          <X
            className={`${glyph} text-[var(--danger)]`}
            strokeWidth={2.25}
            aria-hidden="true"
          />
          <span className="sr-only">Failed:</span>
        </span>
      );
    case "stopped":
      return (
        <span
          className={`flex ${box} items-center justify-center rounded-full bg-[var(--ink-100)]`}
        >
          <X
            className={`${glyph} text-[var(--ink-600)]`}
            strokeWidth={2.25}
            aria-hidden="true"
          />
          <span className="sr-only">Cancelled:</span>
        </span>
      );
    case "wait":
      return (
        <span
          className={`${box} rounded-full border-[1.5px] border-dashed border-[var(--ink-400)]`}
          role="status"
        >
          <span className="sr-only">Waiting:</span>
        </span>
      );
    case "later":
      // Dashed means waiting for something real.
      return (
        <span
          className={`${box} rounded-full border-[1.5px] border-dashed border-[var(--ink-300)]`}
        >
          <span className="sr-only">Not started:</span>
        </span>
      );
    case "none":
      // Solid, not dashed: nothing is coming. `later`'s box, one ink lighter.
      return (
        <span
          className={`${box} rounded-full border-[1.5px] border-[var(--ink-200)]`}
        >
          <span className="sr-only">Not analyzed:</span>
        </span>
      );
  }
}
