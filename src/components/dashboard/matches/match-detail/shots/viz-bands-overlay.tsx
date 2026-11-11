"use client";

import { memo } from "react";

import type { BandRow } from "@/lib/data/viz-bands";
import { LINE_COLOR } from "./court-art";
import {
  VIEWER_COURT,
  viewerBandEdges,
  RETURN_COURT,
  projectReturnDot,
  heatBoundsFor,
  zoneOpacity,
} from "./court-geometry";
import type { StatRow, VizBandZones } from "./viz-model";

/**
 * The depth/contact band overlay inside the fullscreen viewer's court
 * (Phase 2B, Task 3; spec Appendix P2k/P2o).
 *
 * Translucent white bands across the half the cut lives in, alternating
 * `fill-opacity` .11 / .04 / .11 so adjacent bands separate without any of
 * them reading as a highlight. They run past the art on both sides
 * (`BAND_BLEED`, the court's `<svg>` draws `overflow: visible`) to the
 * stage's own edges — P2k's "into the apron both sides": a band is a
 * property of the COURT's depth, not of the lines, and stopping at the
 * sideline, or at the art's edge, would have made it look like a zone.
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
const BAND_LABEL_SIZE = 5.6;
const BAND_LABEL_TRACKING = 0.4;
const BAND_RATE_SIZE = 6.4;
const BAND_COUNT_SIZE = 6.2;

/**
 * The labels live on the green, never on the court, and on one line: the
 * caps label ends just outside the left doubles sideline and runs leftward
 * across the apron (and past the art, which draws `overflow: visible`); the
 * rate starts just outside the right one. A label used to start at the
 * viewBox's left gutter and run on, so "DEEP · 0–4 M" crossed the alley
 * onto the blue.
 */
const BAND_LABEL_GAP = 4;
const BAND_LABEL_X = VIEWER_COURT.doubles.x - BAND_LABEL_GAP;
const BAND_RATE_X =
  VIEWER_COURT.doubles.x + VIEWER_COURT.doubles.w + BAND_LABEL_GAP;

/** How far the wash runs past the art on each side: the stage shows apron
 *  beyond the art's own box whenever it is wider than the court, and a wash
 *  that stopped there read as a box drawn on the green. */
const BAND_BLEED = 600;

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
 * The caps line at a band's left edge — "DEEP · 0–13 FT", never wrapped.
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
  zones?: boolean;
}

export const VizBandsOverlay = memo(function VizBandsOverlay({
  kind,
  dividersFt,
  rows,
  statRows,
  editing = false,
  zones = false,
}: VizBandsOverlayProps) {
  const edges = viewerBandEdges(kind, dividersFt);
  // One rect per row, between consecutive edges. A mismatch means a caller
  // paired rows with dividers from two different `BandSettings` — draw
  // nothing rather than a band whose label belongs to a different slice.
  if (rows.length !== edges.length - 1) return null;

  const maxCount = Math.max(0, ...(statRows ?? []).map((row) => row.count));
  const left = VIEWER_COURT.viewBox.minX - BAND_BLEED;
  const width = VIEWER_COURT.viewBox.w + 2 * BAND_BLEED;

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

        const caps = editing ? bandEditingLabel(row) : bandCaps(row);
        const labelY =
          height >= BAND_LABEL_MIN_H
            ? top + BAND_LABEL_INSET
            : (top + bottom) / 2 + 2.2;

        const stat = statRows?.find((r) => r.key === row.key) ?? null;
        const hasRate =
          !editing && stat !== null && stat.count > 0 && stat.winPct !== null;

        return (
          <g
            key={row.key}
            data-viz-band={row.key}
            data-count={stat?.count ?? 0}
            data-win-pct={stat?.winPct ?? ""}
          >
            <rect
              x={left}
              y={top}
              width={width}
              height={height}
              fill={LINE_COLOR}
              fillOpacity={
                zones && !editing
                  ? zoneOpacity(stat?.count ?? 0, maxCount)
                  : bandOpacity(index)
              }
            />
            <text
              x={BAND_LABEL_X}
              y={labelY}
              textAnchor="end"
              fill={LINE_COLOR}
              fillOpacity={0.72}
              fontFamily="var(--font-mono)"
              fontSize={BAND_LABEL_SIZE}
              letterSpacing={BAND_LABEL_TRACKING}
            >
              {caps}
            </text>
            {hasRate && (
              <text
                x={BAND_RATE_X}
                y={labelY}
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

/** The same bands in the compact court's logical depth-x coordinates.
 * Labels counter-rotate the court so both placement and contact stay upright. */
export function CourtBandZones({
  zones,
  labels = false,
}: {
  zones: VizBandZones;
  labels?: boolean;
}) {
  const placement = zones.kind === "depth";
  const bounds = heatBoundsFor(placement ? "returnPlacement" : "returnContact");
  const origin = RETURN_COURT.nearBaselineX;
  const end = placement ? RETURN_COURT.netX : bounds.xMax;
  const start = placement ? origin : RETURN_COURT.serviceLineNearX;
  const edges = [
    start,
    ...zones.dividersFt.map(
      (ft) =>
        projectReturnDot("contact", {
          lateralM: 0,
          depthM: ft * 0.3048 * (placement ? -1 : 1),
        }).cx,
    ),
    end,
  ];
  const maxCount = Math.max(
    0,
    ...(zones.statRows ?? []).map((row) => row.count),
  );
  return (
    <g
      data-viz-bands={zones.kind}
      aria-hidden="true"
      style={{ pointerEvents: "none" }}
    >
      {zones.rows.map((row, index) => {
        const a = Math.max(
          Math.min(start, end),
          Math.min(Math.max(start, end), edges[index]),
        );
        const b = Math.max(
          Math.min(start, end),
          Math.min(Math.max(start, end), edges[index + 1]),
        );
        const stat = zones.statRows?.find((r) => r.key === row.key);
        const cx = (a + b) / 2;
        const cy = RETURN_COURT.centerY;
        return (
          <g
            key={row.key}
            data-viz-band={row.key}
            data-count={stat?.count ?? 0}
            data-win-pct={stat?.winPct ?? ""}
          >
            <rect
              x={Math.min(a, b)}
              y={bounds.yMin}
              width={Math.abs(b - a)}
              height={bounds.yMax - bounds.yMin}
              fill={LINE_COLOR}
              fillOpacity={zoneOpacity(stat?.count ?? 0, maxCount)}
            />
            {labels && Math.abs(b - a) > 8 && (
              <g transform={`rotate(${placement ? 90 : -90} ${cx} ${cy})`}>
                <text
                  x={cx}
                  y={cy + 2.5}
                  textAnchor="middle"
                  fill={LINE_COLOR}
                  fontFamily="var(--font-sans)"
                  fontSize={8}
                >
                  {row.label}
                  {stat && stat.count > 0
                    ? ` · ${stat.count} · ${stat.winPct}% won`
                    : ""}
                </text>
              </g>
            )}
          </g>
        );
      })}
    </g>
  );
}
