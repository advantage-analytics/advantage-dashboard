"use client";

import { memo } from "react";

import type { BandRow } from "@/lib/data/viz-bands";
import { LINE_COLOR } from "./court-art";
import { VIEWER_COURT, viewerBandEdges } from "./court-geometry";
import type { StatRow } from "./viz-model";

/**
 * The depth/contact band overlay inside the fullscreen viewer's court
 * (Phase 2B, Task 3; spec Appendix P2k/P2o).
 *
 * Translucent white bands across the half the cut lives in, alternating
 * `fill-opacity` .11 / .04 / .11 so adjacent bands separate without any of
 * them reading as a highlight. They span the FULL viewBox width (93 → 427),
 * which is wider than the doubles court — P2k's "into the apron both sides":
 * a band is a property of the COURT's depth, not of the lines, and stopping
 * at the sideline would have made it look like a zone.
 *
 * ## Where the numbers come from
 *
 * It is INERT: `pointer-events: none` and `aria-hidden`. The bands are a
 * backdrop, and a `<title>` on each one would put a native browser tooltip
 * in competition with the viewer's own hover readout — two cards for the
 * same pixel, one of them un-styleable. The numbers are not lost to a
 * screen-reader user either: the stats card behind the viewer carries every
 * band row as `statRowAnnouncement`'s own sentence.
 *
 * `% · n` on the right of each band is looked up out of `statRows` — the
 * SAME `computeVizStats` Depth group the stats card prints, handed down by
 * the viewer. Nothing is counted a second time here: a band and its row are
 * matched by `BandRow.key`, which is what both `depthBandRows`/
 * `contactBandRows` and the stat rows are built from. (By key and not by
 * index: `computeVizStats` SORTS its rows by win rate, so the Depth group's
 * order is not band order and never was.)
 *
 * A band with no shots in it prints nothing at all rather than "0% · 0" —
 * the same rule `ServeBoxLabels` already follows for an empty service box,
 * and the guardrails' "unmeasured values are omitted, never 0".
 *
 * ## Why this is `memo`'d
 *
 * `VizFullscreenCourt` re-renders on every pan frame (its wrapper carries
 * the translate). The overlay's own props — the rows, the dividers, the stat
 * rows — do not change with the pan, so it sits still through a drag exactly
 * as `MarkLayer` does. Its coordinates are viewBox units, so neither the pan
 * nor the zoom touches them.
 */

/** P2k's own type scale, in viewBox units — SVG `font-size` attributes that
 *  scale with the art, not CSS type (see `viz-fullscreen-court.tsx`'s note on
 *  why `check-design-drift.mjs` does not police these). */
const BAND_LABEL_SIZE = 6.2;
const BAND_RATE_SIZE = 6.4;
const BAND_COUNT_SIZE = 6.2;

/** The frame's own gutters: the caps label hangs off the left edge of the
 *  viewBox, the rate off the right. */
const BAND_LABEL_X = 97;
const BAND_RATE_X = 423;

/** How far below a band's top edge its label sits, and the height below
 *  which the label centres in the band instead (a thin band would otherwise
 *  push its own label out through the bottom edge). */
const BAND_LABEL_INSET = 9.6;
const BAND_LABEL_MIN_H = 18;

/** Bands thinner than this never draw: a divider sitting all but exactly on
 *  its half's own edge would otherwise leave a hairline of wash with a label
 *  stacked on top of the next band's. */
const BAND_MIN_H = 1.5;

/** P2k: .11 / .04 / .11 — the odd bands are the quiet ones. */
function bandOpacity(index: number): number {
  return index % 2 === 0 ? 0.11 : 0.04;
}

/**
 * The caps line at a band's left edge — "DEEP · 0–13 FT".
 *
 * A CONTACT row's `label` and `rangeLabel` are the same sentence (its label
 * IS its range — "0–5 ft behind"), so printing both would read "0–5 FT
 * BEHIND · 0–5 FT BEHIND". One or the other, never both.
 */
function bandCaps(row: BandRow): string {
  if (row.rangeLabel === row.label) return row.label.toUpperCase();
  return `${row.label.toUpperCase()} · ${row.rangeLabel.toUpperCase()}`;
}

/**
 * P2m: while the editor is open a band's label reads "DEEP 0–12 ft" — the
 * caps name, then the range in lower case, so the numbers being dragged read
 * as numbers rather than as part of a heading. A contact row has no separate
 * name (its label IS its range), so it prints as written: "0–5 ft behind".
 */
function bandEditingLabel(row: BandRow): string {
  if (row.rangeLabel === row.label) return row.label;
  return `${row.label.toUpperCase()} ${row.rangeLabel}`;
}

export interface VizBandsOverlayProps {
  kind: "depth" | "contact";
  /** The scheme's dividers, ascending, feet from the baseline. */
  dividersFt: number[];
  /** `depthBandRows`/`contactBandRows` — in BAND-INDEX order. */
  rows: BandRow[];
  /** The Depth group's rows out of `computeVizStats`, in whatever order it
   *  sorted them into. `null` while there are no stats to print. */
  statRows: StatRow[] | null;
  /**
   * Phase 2B, Task 4: the band editor is open and `rows`/`dividersFt` are the
   * live DRAFT. Labels switch to the editing style, and the `% · n` on the
   * right is hidden — those numbers were counted against the SAVED bands,
   * and printing them beside a draft band would claim a rate for a slice of
   * the court nobody has counted.
   */
  editing?: boolean;
}

export const VizBandsOverlay = memo(function VizBandsOverlay({
  kind,
  dividersFt,
  rows,
  statRows,
  editing = false,
}: VizBandsOverlayProps) {
  const edges = viewerBandEdges(kind, dividersFt);
  // One rect per row, between consecutive edges. A mismatch means a caller
  // paired rows with dividers from two different `BandSettings` — draw
  // nothing rather than a band whose label belongs to a different slice.
  if (rows.length !== edges.length - 1) return null;

  const left = VIEWER_COURT.viewBox.minX;
  const width = VIEWER_COURT.viewBox.w;

  return (
    <g
      data-viz-bands={kind}
      aria-hidden="true"
      style={{ pointerEvents: "none" }}
    >
      {rows.map((row, index) => {
        const top = edges[index];
        const bottom = edges[index + 1];
        const height = bottom - top;
        if (height < BAND_MIN_H) return null;

        const labelY =
          height >= BAND_LABEL_MIN_H
            ? top + BAND_LABEL_INSET
            : (top + bottom) / 2 + 2.2;

        const stat = statRows?.find((r) => r.key === row.key) ?? null;
        const hasRate =
          !editing && stat !== null && stat.count > 0 && stat.winPct !== null;
        const caps = editing ? bandEditingLabel(row) : bandCaps(row);

        return (
          <g key={row.key}>
            <rect
              x={left}
              y={top}
              width={width}
              height={height}
              fill={LINE_COLOR}
              fillOpacity={bandOpacity(index)}
            />
            <text
              x={BAND_LABEL_X}
              y={labelY}
              fill={LINE_COLOR}
              fillOpacity={0.72}
              fontFamily="var(--font-mono)"
              fontSize={BAND_LABEL_SIZE}
              letterSpacing={0.6}
            >
              {caps}
            </text>
            {hasRate && (
              <text
                x={BAND_RATE_X}
                y={labelY}
                textAnchor="end"
                fill={LINE_COLOR}
                fillOpacity={0.8}
                fontFamily="var(--font-sans)"
                fontSize={BAND_RATE_SIZE}
              >
                {stat.winPct}%
                <tspan
                  fontFamily="var(--font-mono)"
                  fontSize={BAND_COUNT_SIZE}
                  fillOpacity={0.6}
                >
                  {` · ${stat.count}`}
                </tspan>
              </text>
            )}
          </g>
        );
      })}
    </g>
  );
});
