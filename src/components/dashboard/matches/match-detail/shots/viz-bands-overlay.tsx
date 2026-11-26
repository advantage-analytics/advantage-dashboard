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
 * ## Names only — the Statistics panel owns the numbers
 *
 * It is INERT: `pointer-events: none` and `aria-hidden`. The bands are a
 * backdrop, and a `<title>` on each one would put a native browser tooltip
 * in competition with the viewer's own hover readout — two cards for the
 * same pixel, one of them un-styleable. The numbers are not lost to a
 * screen-reader user either: the stats card behind the viewer carries every
 * band row as `statRowAnnouncement`'s own sentence.
 *
 * A band still pins on a click (plan §8), but not here: `lightbox-court.tsx`
 * lays its own transparent hit areas (`BandHitAreas`) over the court lines
 * and under the marks, and leaves them out while the band editor is open.
 *
 * Plan 2026-11-25 §5 (boards Court-labels-11/-12/-8): a band prints its
 * NAME and, on its own line beneath, its RANGE ("DEEP" / "0–9 FT") — no
 * `% · n`. The Statistics panel beside the court prints every band's rate,
 * and its row hover outlines the band here. `statRows` still feeds the
 * Zones wash and the `data-count`/`data-win-pct` attributes, matched by
 * `BandRow.key` (never by index — the Depth group was sorted by win rate
 * until 2026-11-14, and a pairing by order would break silently).
 *
 * ## Why this is `memo`'d
 *
 * `VizFullscreenCourt` re-renders on every pan frame (its wrapper carries
 * the translate). The overlay's own props — the rows, the dividers, the stat
 * rows — do not change with the pan, so it sits still through a drag exactly
 * as `MarkLayer` does. Its coordinates are viewBox units, so neither the pan
 * nor the zoom touches them.
 */

/* ── The lightbox court's type ("Today, refined", plan §5) ──────────────── */
// SVG `font-size`/`letter-spacing` ATTRIBUTES in viewBox units — they scale
// with the art, so they are part of the drawing's geometry, not CSS type
// (`check-design-drift.mjs` does not police them). The art is drawn at
// `VIEWER_COURT.artPx.w` px across `VIEWER_COURT.viewBox.w` units at 100%
// zoom (652 / 366 ≈ 1.78 px a unit), so each value below is the board's px
// figure divided through by that. Shared by `ServeBoxLabels`,
// `ApproachApronLabels` (`lightbox-court.tsx`) and the band labels here.
const COURT_PX_PER_UNIT = VIEWER_COURT.artPx.w / VIEWER_COURT.viewBox.w;
/** Every court name: mono caps at the 11px equivalent (≈ 6.18 units). */
export const COURT_LABEL_SIZE = 11 / COURT_PX_PER_UNIT;
/** Even 1.4px tracking (≈ 0.79 units). */
export const COURT_LABEL_TRACKING = 1.4 / COURT_PX_PER_UNIT;
/** A name — a zone, a band, an approach wing — in white at 86%. */
export const COURT_LABEL_OPACITY = 0.86;
/** The quieter words: a side's title ("DEUCE COURT", "Placement") and a
 *  band's range line, at 78% — still inside the 78–90% the boards set. */
export const COURT_SIDE_LABEL_OPACITY = 0.78;

/**
 * The labels live on the green, never on the court: each line ends just
 * outside the left doubles sideline and runs leftward across the apron (and
 * past the art, which draws `overflow: visible`). A label used to start at
 * the viewBox's left gutter and run on, so "DEEP · 0–4 M" crossed the alley
 * onto the blue.
 */
const BAND_LABEL_GAP = 4;
const BAND_LABEL_X = VIEWER_COURT.doubles.x - BAND_LABEL_GAP;

/** How far the wash runs past the art on each side: the stage shows apron
 *  beyond the art's own box whenever it is wider than the court, and a wash
 *  that stopped there read as a box drawn on the green. */
export const BAND_BLEED = 600;

/** `--font-mono`'s ascent and descent as fractions of the size (rounded
 *  up), and the range line's baseline below the name's, in sizes. */
const BAND_FONT_ASCENT = 1.05;
const BAND_FONT_DESCENT = 0.3;
const BAND_LINE_STEP = 1.25;
/** Clear space between a band's top edge and its name's box — the 3.7 units
 *  the one-line 5.6-unit label had (9.6 inset − its ascent). */
const BAND_LABEL_PAD = 3.7;

/**
 * The name's baseline in a band from `top` to `bottom`, for a label of
 * `lines` lines at `scale`: `BAND_LABEL_PAD` under the band's top edge, or —
 * when the band is too thin to hold the block that way — centred in it (a
 * thin band would otherwise push its own label out through the bottom edge).
 */
function bandLabelBaseline(
  top: number,
  bottom: number,
  lines: 1 | 2,
  scale: number,
): number {
  const size = COURT_LABEL_SIZE * scale;
  const ascent = BAND_FONT_ASCENT * size;
  const block =
    ascent + (lines - 1) * BAND_LINE_STEP * size + BAND_FONT_DESCENT * size;
  const pad = BAND_LABEL_PAD * scale;
  if (bottom - top >= block + 2 * pad) return top + pad + ascent;
  return (top + bottom) / 2 - block / 2 + ascent;
}

/** Bands thinner than this never draw: a divider sitting all but exactly on
 *  its half's own edge would otherwise leave a hairline of wash with a label
 *  stacked on top of the next band's. */
const BAND_MIN_H = 1.5;

/** P2k: .11 / .04 / .11 — the odd bands are the quiet ones. */
function bandOpacity(index: number): number {
  return index % 2 === 0 ? 0.11 : 0.04;
}

/**
 * A band's two lines at its left edge: the caps name ("DEEP"), then its
 * range on its own line beneath ("0–13 FT").
 *
 * A CONTACT row's `label` and `rangeLabel` are the same sentence (its label
 * IS its range — "0–5 ft behind"), so it prints one line, never the same
 * words twice.
 *
 * P2m: while the editor is open the range stays in lower case ("0–12 ft"),
 * so the numbers being dragged read as numbers rather than as part of a
 * heading, and a contact row prints as written.
 */
function bandLines(
  row: BandRow,
  editing: boolean,
): { name: string; range: string | null } {
  if (row.rangeLabel === row.label)
    return {
      name: editing ? row.label : row.label.toUpperCase(),
      range: null,
    };
  return {
    name: row.label.toUpperCase(),
    range: editing ? row.rangeLabel : row.rangeLabel.toUpperCase(),
  };
}

/** A band's wash eases to its new weight (Zones) with the counts beside it,
 *  rather than snapping — `--duration-reveal` on `--ease-chart`. An opacity
 *  change, so reduced motion keeps it. */
const BAND_WASH_TRANSITION = {
  transition: "fill-opacity var(--duration-reveal) var(--ease-chart)",
} as const;

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
   * live DRAFT. Labels switch to the editing style, and the Zones wash falls
   * back to the alternating bands — its weights were counted against the
   * SAVED bands, not the draft.
   */
  editing?: boolean;
  zones?: boolean;
  /**
   * Multiplies the labels' type (and the inset that keeps a label inside
   * its band) — the Approaches court opens on the whole length, at about
   * half the zoom of a landing cut, and passes
   * `viewerApproachLabelScale(stage)` so its labels open at the size every
   * other cut's do. Omitted: 1, every other cut's own sizes.
   */
  labelScale?: number;
}

export const VizBandsOverlay = memo(function VizBandsOverlay({
  kind,
  dividersFt,
  rows,
  statRows,
  editing = false,
  zones = false,
  labelScale = 1,
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

        const lines = bandLines(row, editing);
        const size = COURT_LABEL_SIZE * labelScale;
        const nameY = bandLabelBaseline(
          top,
          bottom,
          lines.range === null ? 1 : 2,
          labelScale,
        );

        const stat = statRows?.find((r) => r.key === row.key) ?? null;

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
              style={BAND_WASH_TRANSITION}
            />
            <g
              textAnchor="end"
              fill={LINE_COLOR}
              fontFamily="var(--font-mono)"
              fontSize={size}
              letterSpacing={COURT_LABEL_TRACKING * labelScale}
            >
              <text
                data-viz-band-label=""
                x={BAND_LABEL_X}
                y={nameY}
                fillOpacity={COURT_LABEL_OPACITY}
              >
                {lines.name}
              </text>
              {lines.range !== null && (
                <text
                  data-viz-band-range=""
                  x={BAND_LABEL_X}
                  y={nameY + BAND_LINE_STEP * size}
                  fillOpacity={COURT_SIDE_LABEL_OPACITY}
                >
                  {lines.range}
                </text>
              )}
            </g>
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
              style={BAND_WASH_TRANSITION}
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
