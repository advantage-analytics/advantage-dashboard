import { Filter as FilterIcon } from "lucide-react";

/**
 * The applied-filter strip under the Opponents toolbar, on either page.
 *
 * The panel closes on apply; this states the cut in words — "Left-handed ·
 * Two-handed · 3 of 10 · Clear filter". Never chips, never a badge (Data
 * Table law 6).
 */
export function OpponentsFilterStrip({
  description,
  shown,
  inView,
  onClear,
}: {
  /** `describeOpponentFilters` over the cut that is on. */
  description: string;
  /** Rows the chip and the filter leave. */
  shown: number;
  /** Rows the chip alone holds — what "N of M" reads against. */
  inView: number;
  onClear: () => void;
}) {
  return (
    <div
      className="flex flex-wrap items-center gap-2 rounded-[var(--radius-element)] px-3.5 py-2.5"
      style={{ background: "var(--surface-subtle)" }}
    >
      <FilterIcon
        className="size-[13px] shrink-0"
        strokeWidth={1.5}
        style={{ color: "var(--ink-500)" }}
        aria-hidden="true"
      />
      <span className="text-[11px]" style={{ color: "var(--ink-700)" }}>
        {description}
      </span>
      <span
        className="size-[3px] rounded-full"
        style={{ background: "var(--ink-300)" }}
        aria-hidden="true"
      />
      <span className="text-micro tabular">
        {shown} of {inView}
      </span>
      <div className="flex-1" />
      <button
        type="button"
        onClick={onClear}
        className="cursor-pointer rounded-sm text-[11px] font-medium whitespace-nowrap text-[var(--blue)] transition-colors duration-[var(--duration-hover)] hover:text-[var(--blue-hover)] focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none"
      >
        Clear filter
      </button>
    </div>
  );
}
