import { usageFraction } from "@/lib/data/usage-format";

/**
 * The program's budget, on screen from the first visit.
 *
 * At `0 of 75` it says nothing useful about this month and everything about
 * what the program has — coaches steward budgets for a living, and revealing
 * the meter only once it starts filling is the version that feels like a
 * trick.
 *
 * Hours with one decimal rather than the `H:MM` Settings › Usage uses: this
 * card sits beside a sentence that says "hours", and "3:12 of 75:00" makes a
 * reader do arithmetic to answer "roughly how much is left".
 */
function hours(seconds: number): string {
  const value = Math.max(0, seconds) / 3600;
  // A tenth of an hour is six minutes — fine enough to show movement, coarse
  // enough that the number does not change while someone is reading it.
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

export function UsageMeter({
  usedSeconds,
  capSeconds,
  /** The free-through line belongs on the empty state, where it is news. */
  showTerms = false,
}: {
  usedSeconds: number;
  capSeconds: number;
  showTerms?: boolean;
}) {
  const fraction = usageFraction(usedSeconds, capSeconds);

  return (
    <div className="flex w-full flex-col gap-2.5 rounded-[var(--radius-card)] border border-[var(--border-hairline)] px-[18px] py-4 sm:w-[260px] sm:shrink-0">
      <span className="text-[10px] font-medium uppercase tracking-[2.5px] text-[var(--ink-400)]">
        This month
      </span>

      <div className="flex items-baseline gap-1.5">
        <span className="font-mono text-[24px] leading-none tracking-[-0.4px] text-[var(--ink-900)] tabular-nums">
          {hours(usedSeconds)}
        </span>
        <span className="text-[12px] text-[var(--ink-700)]">
          of <span className="font-mono tabular-nums">{hours(capSeconds)}</span>{" "}
          hours used
        </span>
      </div>

      <div
        className="h-1 overflow-hidden rounded-[2px] bg-[var(--ink-100)]"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(fraction * 100)}
        aria-label="Program analysis hours used this month"
      >
        <div
          className="h-1 rounded-[2px] bg-[var(--blue)]"
          style={{ width: `${fraction * 100}%` }}
        />
      </div>

      <span className="text-[11px] leading-[1.4] text-[var(--ink-500)]">
        Resets on the 1st.
        {showTerms ? " Free through December 31, 2026." : ""}
      </span>
    </div>
  );
}
