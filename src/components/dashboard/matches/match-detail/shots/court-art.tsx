import { useId } from "react";
import { ZONES, type ZoneKey, type ZoneStats } from "@/lib/data/serve-zones";
import {
  SERVE_COURT,
  SERVE_BACKGROUND_PATH,
  RETURN_COURT,
  RETURN_BACKGROUND_PATH,
  projectServeDot,
  projectReturnDot,
  zoneCellX,
  zoneOpacity,
  trianglePointsFor,
  starPoints,
} from "./court-geometry";
import type { Cut, VizDot } from "./viz-model";

/**
 * The recoloured court SVG for one cut — the wall tile's art and the focused
 * view's court alike (`viz-focused.tsx` reuses this here, not a second copy).
 *
 * Geometry only, drawn straight from `court-geometry.ts`'s constants — those
 * are copied verbatim from the design handoff's own SVG markup (F4, frame
 * P1a: see `.superpowers/sdd/2026-09-19-visualizations-tab-phase-1/
 * design-court-frames.md`), padded inside a green apron rather than the
 * cropped half-courts an earlier plan drew.
 *
 * Serve draws inside the design's `<g transform="translate(260,117)
 * scale(0.85) translate(-260,-125)">`; the two return cuts share the design's
 * landscape full-court frame (`<g rotate(90) …><g scale(1.02) …>`), clipped
 * to the viewBox — `returnPlacement` additionally sets `style="transform:
 * rotate(180deg)"` on the `<svg>` itself, exactly as the design does.
 */

// Exported so `court-tile.tsx` can give the art box the same apron colour
// as its background (Defect 2 fix), rather than introducing a second
// `#86AC91` literal in a file the design-drift checker doesn't allowlist.
export const APRON_FILL = "#86AC91";
const COURT_FILL = "#6092CE";
const LINE_COLOR = "#FFFFFF";
const DOT_STROKE = "#000";
const DOT_STROKE_W = 0.4;

// Serve marks are 2.54 radius, return marks 2.4 — the design's own two
// sizes, not a shared constant (visualizations-tab-phase-1 spec).
const SERVE_DOT_R = 2.54;
const RETURN_DOT_R = 2.4;

// G2b: the ace star's fill, regardless of outcome colour (an ace is always
// won, but the star communicates "ace" first — see `ACE_STAR_FILL`'s use
// below, which skips `colorFor` entirely for star dots). Allowlisted in
// `scripts/check-design-drift.mjs` next to this file's other two court
// literals. Exported so `viz-labels.tsx`'s `legendItemsFor` can match the
// legend's Ace glyph to the court's own fill exactly, instead of a second
// `#F8C84F` literal the checker would flag again.
export const ACE_STAR_FILL = "#F8C84F";
// Chosen so the star's area is comparable to the SERVE_DOT_R=2.54 circle's:
// a regular 10-point star with inner radius R/2 has area
// 2.5·sin(36°)·R² ≈ 1.4695·R²; solving 1.4695·R² = π·2.54² gives R≈3.714 —
// 3.7 is within ~0.7% of that exact match (see `tests/court-geometry.spec.ts`).
const ACE_STAR_OUTER_R = 3.7;

function colorFor(outcome: VizDot["outcome"]): string {
  if (outcome === "won") return "var(--viz-good)";
  if (outcome === "lost") return "var(--viz-bad)";
  return "var(--ink-300)";
}

const CUT_NOUN: Record<Cut, string> = {
  serve: "serve placement",
  returnPlacement: "return placement",
  returnContact: "return contact",
};

// Re-tuned zone-cell label sizes: the old 447-wide legacy frame's cells were
// ~46.4 units wide (10.37% of the frame) drawn with no group scale, at
// fontSize 11/9. The new cell is 31.25 units wide (7.95% of the 334-wide
// frame) AND sits inside the serve `<g>`'s 0.85 scale, so a fontSize
// attribute here renders at 0.85× in the unscaled viewBox. Scaling the old
// sizes by the cell's narrower share (31.25/334 ÷ 46.4/447 ≈ 0.767) and then
// dividing by 0.85 to cancel the group scale gives the attribute values that
// read at roughly the same apparent size as before: 11 → 10, 9 → 8.
const ZONE_LABEL_COUNT_SIZE = 10;
const ZONE_LABEL_PCT_SIZE = 8;

export function CourtArt({
  cut,
  dots,
  zones,
  className,
  fill,
  labels,
}: {
  cut: Cut;
  dots: VizDot[];
  /**
   * Serve · Zones overlay (Task 5): when present, draws the six service-box
   * cells shaded by each zone's share of serves and skips the dots — the
   * cells ARE the chart, per `computeViz`'s `zoneStats`. Ignored off the
   * serve cut (Zones has no meaning there and the toolbar never offers it).
   */
  zones?: Record<ZoneKey, ZoneStats>;
  className?: string;
  /**
   * "Fill the box" sizing — `width:100%; height:100%` with no presentation
   * `width` attribute, so the svg fills whatever fixed-aspect-ratio box a
   * caller gives it (the wall tile's uniform art box) instead of sizing off
   * its own intrinsic viewBox aspect ratio. `preserveAspectRatio` still
   * letterboxes the court inside that box.
   */
  fill?: boolean;
  /**
   * Draws each zone cell's count and win% centred inside the cell
   * (visual-fix round 2, Defect B) — the focused view only. Tiles stay
   * label-free: at tile scale the figures would be illegibly small and the
   * cells already read fine as a plain shade gradient there.
   */
  labels?: boolean;
}) {
  const clipId = useId();
  const showZones = cut === "serve" && zones != null;
  const maxZonePct = zones
    ? Math.max(...ZONES.map((z) => zones[z.key].pct))
    : 0;
  const ariaLabel = showZones
    ? "Serve placement by zone: six service-box zones shaded by serve frequency"
    : `${CUT_NOUN[cut]} court, ${dots.length} point${dots.length === 1 ? "" : "s"} shown`;

  if (cut === "serve") {
    return (
      <svg
        viewBox={`${SERVE_COURT.viewBox.minX} ${SERVE_COURT.viewBox.minY} ${SERVE_COURT.viewBox.w} ${SERVE_COURT.viewBox.h}`}
        {...(fill ? { height: "100%" } : {})}
        width="100%"
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label={ariaLabel}
        className={className}
      >
        <path d={SERVE_BACKGROUND_PATH} fill={APRON_FILL} />
        <g transform={SERVE_COURT.groupTransform}>
          <rect
            x={SERVE_COURT.doublesLeft}
            y={SERVE_COURT.baselineY}
            width={SERVE_COURT.doublesRight - SERVE_COURT.doublesLeft}
            height={SERVE_COURT.netY - SERVE_COURT.baselineY}
            fill={COURT_FILL}
          />
          <rect
            x={SERVE_COURT.singlesLeft}
            y={SERVE_COURT.baselineY}
            width={SERVE_COURT.singlesRight - SERVE_COURT.singlesLeft}
            height={SERVE_COURT.netY - SERVE_COURT.baselineY}
            fill={COURT_FILL}
          />

          {/* Zone cells span the service line down to the net, same as the
              service boxes. White fill/outline (not a blue tint): the cells
              sit on the blue court fill, so a blue-on-blue overlay was
              unreadable — white at 0.06–0.42 opacity, scaled to the busiest
              zone actually drawn, reads at every share. */}
          {showZones &&
            zones &&
            ZONES.map((z, i) => {
              const zs = zones[z.key];
              const cell = zoneCellX(i);
              const cellCx = (cell.x1 + cell.x2) / 2;
              const cellCy = (SERVE_COURT.zoneTop + SERVE_COURT.zoneBottom) / 2;
              return (
                <g key={z.key}>
                  <rect
                    x={cell.x1}
                    y={SERVE_COURT.zoneTop}
                    width={cell.x2 - cell.x1}
                    height={SERVE_COURT.zoneBottom - SERVE_COURT.zoneTop}
                    fill={LINE_COLOR}
                    fillOpacity={zoneOpacity(zs.pct, maxZonePct)}
                    stroke={LINE_COLOR}
                    strokeOpacity={0.5}
                    strokeWidth={1}
                  />
                  {labels && zs.count > 0 && (
                    <>
                      <text
                        x={cellCx}
                        y={cellCy - 3}
                        textAnchor="middle"
                        fill={LINE_COLOR}
                        fontSize={ZONE_LABEL_COUNT_SIZE}
                        fontWeight={600}
                        style={{ fontVariantNumeric: "tabular-nums" }}
                      >
                        {zs.count}
                      </text>
                      {/* Win rate only, no " won" suffix (review M1) — the
                          zone card beside the court already says these are
                          win rates, and the cell can't fit "80% won" beneath
                          "38%" without the two lines' text colliding. */}
                      <text
                        x={cellCx}
                        y={cellCy + 10}
                        textAnchor="middle"
                        fill={LINE_COLOR}
                        fillOpacity={0.8}
                        fontSize={ZONE_LABEL_PCT_SIZE}
                        fontWeight={400}
                        style={{ fontVariantNumeric: "tabular-nums" }}
                      >
                        {zs.winPct}%
                      </text>
                    </>
                  )}
                </g>
              );
            })}

          <line
            x1={SERVE_COURT.doublesLeft}
            y1={SERVE_COURT.baselineY}
            x2={SERVE_COURT.doublesRight}
            y2={SERVE_COURT.baselineY}
            stroke={LINE_COLOR}
            strokeWidth={SERVE_COURT.lineWidth}
          />
          <line
            x1={SERVE_COURT.doublesLeft}
            y1={SERVE_COURT.baselineY}
            x2={SERVE_COURT.doublesLeft}
            y2={SERVE_COURT.netY}
            stroke={LINE_COLOR}
            strokeWidth={SERVE_COURT.lineWidth}
          />
          <line
            x1={SERVE_COURT.doublesRight}
            y1={SERVE_COURT.baselineY}
            x2={SERVE_COURT.doublesRight}
            y2={SERVE_COURT.netY}
            stroke={LINE_COLOR}
            strokeWidth={SERVE_COURT.lineWidth}
          />
          <line
            x1={SERVE_COURT.singlesLeft}
            y1={SERVE_COURT.baselineY}
            x2={SERVE_COURT.singlesLeft}
            y2={SERVE_COURT.netY}
            stroke={LINE_COLOR}
            strokeWidth={SERVE_COURT.lineWidth}
          />
          <line
            x1={SERVE_COURT.singlesRight}
            y1={SERVE_COURT.baselineY}
            x2={SERVE_COURT.singlesRight}
            y2={SERVE_COURT.netY}
            stroke={LINE_COLOR}
            strokeWidth={SERVE_COURT.lineWidth}
          />
          {/* Service line. */}
          <line
            x1={SERVE_COURT.singlesLeft}
            y1={SERVE_COURT.serviceLineY}
            x2={SERVE_COURT.singlesRight}
            y2={SERVE_COURT.serviceLineY}
            stroke={LINE_COLOR}
            strokeWidth={SERVE_COURT.lineWidth}
          />
          {/* Centre service line — splits the two service boxes, service
              line down to the net. */}
          <line
            x1={SERVE_COURT.centerX}
            y1={SERVE_COURT.serviceLineY}
            x2={SERVE_COURT.centerX}
            y2={SERVE_COURT.netY}
            stroke={LINE_COLOR}
            strokeWidth={SERVE_COURT.lineWidth}
          />
          {/* Centre mark on the baseline. */}
          <line
            x1={SERVE_COURT.centerX}
            y1={SERVE_COURT.centerMarkTopY}
            x2={SERVE_COURT.centerX}
            y2={SERVE_COURT.centerMarkBottomY}
            stroke={LINE_COLOR}
            strokeWidth={SERVE_COURT.lineWidth}
          />
          {/* Net — bottom of the frame, extending past the doubles
              sidelines as a physical net does. */}
          <line
            x1={SERVE_COURT.netLineLeft}
            y1={SERVE_COURT.netY}
            x2={SERVE_COURT.netLineRight}
            y2={SERVE_COURT.netY}
            stroke={LINE_COLOR}
            strokeWidth={SERVE_COURT.netStrokeWidth}
          />

          {!showZones &&
            dots.map((d) => {
              const { cx, cy } = projectServeDot(d);
              // G2b: an ace draws as a star, regardless of outcome colour —
              // it's always "won" already, but the shape carries the "ace"
              // read before the colour would.
              if (d.shape === "star") {
                return (
                  <polygon
                    key={d.id}
                    points={starPoints(cx, cy, ACE_STAR_OUTER_R)}
                    fill={ACE_STAR_FILL}
                    stroke={DOT_STROKE}
                    strokeWidth={DOT_STROKE_W}
                    vectorEffect="non-scaling-stroke"
                  />
                );
              }
              const color = colorFor(d.outcome);
              return d.shape === "triangle" ? (
                <polygon
                  key={d.id}
                  points={trianglePointsFor("serve", cx, cy, SERVE_DOT_R)}
                  fill={color}
                  stroke={DOT_STROKE}
                  strokeWidth={DOT_STROKE_W}
                  vectorEffect="non-scaling-stroke"
                />
              ) : (
                <circle
                  key={d.id}
                  cx={cx}
                  cy={cy}
                  r={SERVE_DOT_R}
                  fill={color}
                  stroke={DOT_STROKE}
                  strokeWidth={DOT_STROKE_W}
                  vectorEffect="non-scaling-stroke"
                />
              );
            })}
        </g>
      </svg>
    );
  }

  // Return cuts — one shared landscape full-court frame. `returnPlacement`
  // sets the design's own `rotate(180deg)` on the svg; `returnContact` does
  // not. `projectReturnDot` accounts for that extra flip in the lateral
  // sign it uses for each kind — see its own doc comment.
  const kind = cut === "returnPlacement" ? "placement" : "contact";
  return (
    <svg
      viewBox={`${RETURN_COURT.viewBox.minX} ${RETURN_COURT.viewBox.minY} ${RETURN_COURT.viewBox.w} ${RETURN_COURT.viewBox.h}`}
      {...(fill ? { height: "100%" } : {})}
      width="100%"
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label={ariaLabel}
      className={className}
      style={kind === "placement" ? { transform: "rotate(180deg)" } : undefined}
    >
      <path d={RETURN_BACKGROUND_PATH} fill={APRON_FILL} />
      <clipPath id={clipId}>
        <path d={RETURN_BACKGROUND_PATH} />
      </clipPath>
      <g clipPath={`url(#${clipId})`}>
        <g transform={RETURN_COURT.outerGroupTransform}>
          <g transform={RETURN_COURT.innerGroupTransform}>
            <rect
              x={RETURN_COURT.farBaselineX}
              y={RETURN_COURT.doublesTop}
              width={RETURN_COURT.nearBaselineX - RETURN_COURT.farBaselineX}
              height={RETURN_COURT.doublesBottom - RETURN_COURT.doublesTop}
              fill={COURT_FILL}
            />
            <rect
              x={RETURN_COURT.farBaselineX}
              y={RETURN_COURT.singlesTop}
              width={RETURN_COURT.nearBaselineX - RETURN_COURT.farBaselineX}
              height={RETURN_COURT.singlesBottom - RETURN_COURT.singlesTop}
              fill={COURT_FILL}
            />
            <line
              x1={RETURN_COURT.farBaselineX}
              y1={RETURN_COURT.doublesTop}
              x2={RETURN_COURT.nearBaselineX}
              y2={RETURN_COURT.doublesTop}
              stroke={LINE_COLOR}
              strokeWidth={RETURN_COURT.lineWidth}
            />
            <line
              x1={RETURN_COURT.farBaselineX}
              y1={RETURN_COURT.doublesBottom}
              x2={RETURN_COURT.nearBaselineX}
              y2={RETURN_COURT.doublesBottom}
              stroke={LINE_COLOR}
              strokeWidth={RETURN_COURT.lineWidth}
            />
            <line
              x1={RETURN_COURT.farBaselineX}
              y1={RETURN_COURT.singlesTop}
              x2={RETURN_COURT.nearBaselineX}
              y2={RETURN_COURT.singlesTop}
              stroke={LINE_COLOR}
              strokeWidth={RETURN_COURT.lineWidth}
            />
            <line
              x1={RETURN_COURT.farBaselineX}
              y1={RETURN_COURT.singlesBottom}
              x2={RETURN_COURT.nearBaselineX}
              y2={RETURN_COURT.singlesBottom}
              stroke={LINE_COLOR}
              strokeWidth={RETURN_COURT.lineWidth}
            />
            <line
              x1={RETURN_COURT.farBaselineX}
              y1={RETURN_COURT.doublesTop}
              x2={RETURN_COURT.farBaselineX}
              y2={RETURN_COURT.doublesBottom}
              stroke={LINE_COLOR}
              strokeWidth={RETURN_COURT.lineWidth}
            />
            <line
              x1={RETURN_COURT.nearBaselineX}
              y1={RETURN_COURT.doublesTop}
              x2={RETURN_COURT.nearBaselineX}
              y2={RETURN_COURT.doublesBottom}
              stroke={LINE_COLOR}
              strokeWidth={RETURN_COURT.lineWidth}
            />
            <line
              x1={RETURN_COURT.serviceLineFarX}
              y1={RETURN_COURT.singlesTop}
              x2={RETURN_COURT.serviceLineFarX}
              y2={RETURN_COURT.singlesBottom}
              stroke={LINE_COLOR}
              strokeWidth={RETURN_COURT.lineWidth}
            />
            <line
              x1={RETURN_COURT.serviceLineNearX}
              y1={RETURN_COURT.singlesTop}
              x2={RETURN_COURT.serviceLineNearX}
              y2={RETURN_COURT.singlesBottom}
              stroke={LINE_COLOR}
              strokeWidth={RETURN_COURT.lineWidth}
            />
            <line
              x1={RETURN_COURT.serviceLineFarX}
              y1={RETURN_COURT.centerY}
              x2={RETURN_COURT.serviceLineNearX}
              y2={RETURN_COURT.centerY}
              stroke={LINE_COLOR}
              strokeWidth={RETURN_COURT.lineWidth}
            />
            {/* Net. */}
            <line
              x1={RETURN_COURT.netX}
              y1={RETURN_COURT.netTopY}
              x2={RETURN_COURT.netX}
              y2={RETURN_COURT.netBottomY}
              stroke={LINE_COLOR}
              strokeWidth={RETURN_COURT.netStrokeWidth}
            />

            {dots.map((d) => {
              const color = colorFor(d.outcome);
              const { cx, cy } = projectReturnDot(kind, {
                lateralM: d.lateralM ?? 0,
                depthM: d.depthM ?? 0,
              });
              return d.shape === "triangle" ? (
                <polygon
                  key={d.id}
                  points={trianglePointsFor(kind, cx, cy, RETURN_DOT_R)}
                  fill={color}
                  stroke={DOT_STROKE}
                  strokeWidth={DOT_STROKE_W}
                  vectorEffect="non-scaling-stroke"
                />
              ) : (
                <circle
                  key={d.id}
                  cx={cx}
                  cy={cy}
                  r={RETURN_DOT_R}
                  fill={color}
                  stroke={DOT_STROKE}
                  strokeWidth={DOT_STROKE_W}
                  vectorEffect="non-scaling-stroke"
                />
              );
            })}
          </g>
        </g>
      </g>
    </svg>
  );
}
