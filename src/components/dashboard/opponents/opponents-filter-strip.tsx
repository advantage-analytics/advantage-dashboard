import { AppliedFilterStrip } from "@/components/dashboard/shared/applied-filter-strip";

/**
 * The applied-filter strip under the Opponents toolbar, on either page.
 *
 * The panel closes on apply; this states the cut in words — "Left-handed ·
 * Two-handed · 3 of 10 · Clear filter". Never chips, never a badge (Data
 * Table law 6). Always mounted: a null `description` folds it away, so the
 * table eases up rather than jumping (`AppliedFilterStrip`). It sits in the
 * page column's 18px gap (`OPPONENTS_PAGE_GAP`).
 */
export function OpponentsFilterStrip({
  description,
  shown,
  inView,
  onClear,
}: {
  /** `describeOpponentFilters` over the cut that is on, or null with none. */
  description: string | null;
  /** Rows the chip and the filter leave. */
  shown: number;
  /** Rows the chip alone holds — what "N of M" reads against. */
  inView: number;
  onClear: () => void;
}) {
  return (
    <AppliedFilterStrip
      kind="opponents"
      gap={18}
      sentence={description}
      count={`${shown} of ${inView}`}
      action="Clear filter"
      onClear={onClear}
    />
  );
}
