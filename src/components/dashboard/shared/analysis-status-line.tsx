import { cn } from "@/lib/utils";
import { StepMark, type StepState } from "./vertical-steps";

/**
 * A job's analysis state as one table cell draws it: the upload stepper's own
 * mark at its compact size, then the word. Shared by the Matches list's
 * Analysis cell and the Roster's Last-match cell so one job never reads two
 * ways across two screens — the same mark the stepper and the activity tray
 * already draw, rather than a third dialect.
 *
 * The mark carries the state (spinner working, dashed `wait` ring, check
 * done, cross failed); the word names the step. Blue stays off both: it
 * belongs to the upload bar, the one thing here that measures.
 *
 * `mark={null}` keeps the 14px slot empty, so a markless word ("Not
 * analyzed") still starts at the same x as every other row's word.
 */

const INK: Record<StepState, string> = {
  now: "var(--ink-900)",
  wait: "var(--ink-600)",
  later: "var(--ink-600)",
  done: "var(--ink-500)",
  fail: "var(--ink-900)",
  stopped: "var(--ink-500)",
};

export function AnalysisStatusLine({
  mark,
  children,
  value,
  className,
}: {
  mark: StepState | null;
  children: React.ReactNode;
  /** Right-aligned reading on the same line — the upload percentage. */
  value?: string;
  className?: string;
}): React.JSX.Element {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 text-[11px] leading-none whitespace-nowrap",
        className,
      )}
      style={{ color: mark ? INK[mark] : "var(--ink-500)" }}
    >
      {mark ? (
        <StepMark state={mark} size="compact" />
      ) : (
        <span aria-hidden className="size-[14px] shrink-0" />
      )}
      {children}
      {value && (
        <span className="tabular ml-auto pl-2 text-[var(--ink-700)]">
          {value}
        </span>
      )}
    </span>
  );
}

/** Mark + word gap: the 14px mark plus `gap-2`, for anything hung beneath. */
export const STATUS_LINE_INDENT = "ml-[22px]";
