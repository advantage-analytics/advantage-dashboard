"use client";

import { AppliedFilterStrip } from "@/components/dashboard/shared/applied-filter-strip";
import { draftCountLine } from "../match-filters/panel-draft";

/* ── Applied strip ─────────────────────────────────────────────────────── */

/**
 * The applied strip under the court's control row (DS Data Table rule 6, the
 * dashboard's one `AppliedFilterStrip`): the filter glyph, the cut as one
 * sentence of capitalised phrases joined by middots ("Aces · To the T"),
 * "N of M points", and one quiet action — "Back to all points" when a
 * Statistics row is the only cut, "Clear filter" otherwise. Never chips.
 *
 * It unfolds into the court column and folds away like every list strip; the
 * column's 12px gap is the one it folds. The stage below is `flex-1`, so it
 * shrinks on every frame of the unfold and the court re-fits with it
 * (`usePanZoom`'s resize path) rather than jumping 49px in one frame.
 */
interface FilterStripProps {
  phrases: string[];
  /** "N of M points" — omitted by a host with no points to count. */
  shown?: number;
  total?: number;
  statOnly: boolean;
  onClear: () => void;
}

export function LightboxFilterStrip({
  phrases,
  shown,
  total,
  statOnly,
  onClear,
}: FilterStripProps) {
  return (
    <AppliedFilterStrip
      kind="viz"
      gap={12}
      sentence={
        phrases.length > 0
          ? phrases
              .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
              .join(" · ")
          : null
      }
      count={
        shown !== undefined && total !== undefined
          ? draftCountLine(shown, total)
          : null
      }
      action={statOnly ? "Back to all points" : "Clear filter"}
      onClear={onClear}
    />
  );
}
