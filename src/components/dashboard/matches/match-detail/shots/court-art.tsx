import { useId, useMemo, type ReactNode } from "react";
import { ZONES, type ZoneKey, type ZoneStats } from "@/lib/data/serve-zones";
import {
  SERVE_COURT,
  SERVE_BACKGROUND_PATH,
  RETURN_COURT,
  RETURN_BACKGROUND_PATH,
  heatDotRadiusFor,
  heatFilterRegionFor,
  HEAT_RAMP_R_TABLE,
  HEAT_RAMP_G_TABLE,
  HEAT_RAMP_B_TABLE,
  HEAT_ALPHA_TABLE,
  projectServeDot,
  projectReturnDot,
  zoneCellX,
  zoneOpacity,
  trianglePointsFor,
  starPoints,
} from "./court-geometry";
import type { Chart, Cut, VizDot } from "./viz-model";

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

// G3b (P2i): while a heat chart is showing, the court desaturates — the
// design's own two literals, allowlisted alongside this file's other three
// (`scripts/check-design-drift.mjs`). Lines stay white regardless.
// Exported so `viz-focused.tsx` can give the art box wrapper the same
// desaturated colour as the court itself under `chart === "heat"` (the
// letterbox-strip defect fix), rather than a second `#9FB3A5` literal the
// design-drift checker doesn't allowlist there.
export const HEAT_APRON_FILL = "#9FB3A5";
const HEAT_COURT_FILL = "#9DB4CE";

// User decision (heat-blob rewrite): "just blobs/blurs like a regular
// [heatmap]" — one white circle per dot, blurred and colourized by a single
// SVG filter (`heatFilter` below), rather than a binned grid of `<rect>`s.
// `HEAT_DOT_FILL_OPACITY` is the "sensitivity" knob: how much each
// individual dot's circle contributes before the filter's own alpha ramp
// (`HEAT_ALPHA_TABLE`, `court-geometry.ts`) takes over — higher means fewer
// overlapping dots are needed to read as "hot". `HEAT_BLUR_RADIUS_RATIO`
// sets the Gaussian blur's `stdDeviation` as a fraction of the dot radius
// (`heatDotRadiusFor`), so the blur scales with the same per-frame radius
// that already equalises the two frames' apparent blob size.
const HEAT_DOT_FILL_OPACITY = 0.4;
const HEAT_BLUR_RADIUS_RATIO = 0.5;
const HEAT_DOT_FILL = "#FFFFFF";

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
  rallyPosition: "rally position",
};

// Heat mode's aria-label reads "Serve placement heat map, 63 serves" — a
// capitalised cut name (this file doesn't import `viz-labels.tsx`'s
// `CUT_LABEL`: that module already imports `ACE_STAR_FILL` from here, and a
// second import back would reopen the circular-import trap that file's own
// doc comment warns about) plus the same noun `VizResult.noun` uses.
const HEAT_CUT_LABEL: Record<Cut, string> = {
  serve: "Serve placement",
  returnPlacement: "Return placement",
  returnContact: "Return contact",
  rallyPosition: "Rally position",
};
const HEAT_NOUN: Record<Cut, "serves" | "returns" | "shots"> = {
  serve: "serves",
  returnPlacement: "returns",
  returnContact: "returns",
  rallyPosition: "shots",
};

/**
 * One `<circle>` per dot — plain white, fixed `HEAT_DOT_FILL_OPACITY` — fed
 * into `heatFilter`'s blur+colourize chain as `SourceGraphic`. Overlapping
 * circles accumulate alpha (that's what turns a cluster into a hot spot);
 * a lone dot's opacity alone is enough to read once the filter's own alpha
 * ramp (`HEAT_ALPHA_TABLE`) lifts it, per the "more sensitive" feedback.
 */
function heatDotCircle(
  key: string,
  cx: number,
  cy: number,
  r: number,
): ReactNode {
  return (
    <circle
      key={key}
      cx={cx}
      cy={cy}
      r={r}
      fill={HEAT_DOT_FILL}
      fillOpacity={HEAT_DOT_FILL_OPACITY}
    />
  );
}

/**
 * The blur→colourize→ramp filter every heat chart now uses, in place of the
 * old rect-grid (P2i/P2j). `feGaussianBlur` spreads each dot's alpha into a
 * blob; `feColorMatrix` copies the resulting alpha into R/G/B so the next
 * step reads a plain grayscale "how much heat here" signal; `feComponentTransfer`
 * colourizes that signal through the ramp (`HEAT_RAMP_*_TABLE`) and lifts its
 * alpha through the floor-to-ceiling curve (`HEAT_ALPHA_TABLE`) — since a
 * `type="table"` lookup runs over the WHOLE filter region regardless of
 * whether `SourceGraphic` painted anything there, every pixel in that region
 * gets at least the floor tint (`HEAT_ALPHA_TABLE`'s own first value), which
 * is what makes the tint cover the entire view with no hard rectangular edge
 * — the filter region (`heatFilterRegionFor`, `court-geometry.ts`) IS the
 * frame's whole visible view (`heatBoundsFor`) padded by margin, so "the
 * whole filter region" and "the whole visible court" are the same rectangle.
 * `color-interpolation-filters="sRGB"` keeps the maths in the same colour
 * space the ramp's own 0..1 numbers were derived in (SVG's filter default,
 * linearRGB, would shift every colour).
 */
function HeatFilterDef({ id, cut }: { id: string; cut: Cut }) {
  const region = heatFilterRegionFor(cut);
  const stdDeviation = heatDotRadiusFor(cut) * HEAT_BLUR_RADIUS_RATIO;
  return (
    <filter
      id={id}
      filterUnits="userSpaceOnUse"
      x={region.x}
      y={region.y}
      width={region.width}
      height={region.height}
      colorInterpolationFilters="sRGB"
    >
      <feGaussianBlur in="SourceGraphic" stdDeviation={stdDeviation} />
      <feColorMatrix
        type="matrix"
        values="0 0 0 1 0  0 0 0 1 0  0 0 0 1 0  0 0 0 1 0"
      />
      <feComponentTransfer>
        <feFuncR type="table" tableValues={HEAT_RAMP_R_TABLE} />
        <feFuncG type="table" tableValues={HEAT_RAMP_G_TABLE} />
        <feFuncB type="table" tableValues={HEAT_RAMP_B_TABLE} />
        <feFuncA type="table" tableValues={HEAT_ALPHA_TABLE} />
      </feComponentTransfer>
    </filter>
  );
}

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
  chart = "scatter",
  className,
  fill,
  labels,
  draft = false,
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
  /**
   * `"heat"` draws a density blob per dot (`heatDotCircle`/`HeatFilterDef`)
   * instead of the usual outcome-coloured marks, and desaturates the court.
   * Reads straight off the SAME `dots` prop every other chart draws — no
   * separate binned-grid prop needed (the P2i/P2j cell grid this replaced
   * did need one; the density rewrite doesn't).
   */
  chart?: Chart;
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
  /**
   * G4: the "Create view" draft prompt — `dots` is already emptied by the
   * caller (`viz-focused.tsx`), but the default aria-label would still read
   * "… court, 0 points shown" off that empty array, which reads as "no data
   * yet found" rather than "nothing chosen yet". This only swaps the
   * announced label to reflect the actual state.
   */
  draft?: boolean;
}) {
  const clipId = useId();
  const heatFilterId = useId();
  const showHeat = chart === "heat";
  const showZones = !showHeat && cut === "serve" && zones != null;
  const maxZonePct = zones
    ? Math.max(...ZONES.map((z) => zones[z.key].pct))
    : 0;
  const apronFill = showHeat ? HEAT_APRON_FILL : APRON_FILL;
  const courtFillColor = showHeat ? HEAT_COURT_FILL : COURT_FILL;
  const ariaLabel = draft
    ? "Empty court — pick what to plot"
    : showHeat
      ? `${HEAT_CUT_LABEL[cut]} heat map, ${dots.length} ${HEAT_NOUN[cut]}`
      : showZones
        ? "Serve placement by zone: six service-box zones shaded by serve frequency"
        : `${CUT_NOUN[cut]} court, ${dots.length} point${dots.length === 1 ? "" : "s"} shown`;
  // Zero dots ⇒ drawing the filter would still paint the floor tint over
  // the whole view (every pixel of the filter region gets touched, dots or
  // not — see `HeatFilterDef`'s doc comment), which would wash an empty
  // result in colour instead of leaving it for the caller's own empty-state
  // overlay (`result.count === 0`) to cover, so no heat layer draws at all
  // here when there's nothing to plot.
  const drawHeat = showHeat && dots.length > 0;
  const dotRadius = heatDotRadiusFor(cut);
  // Memoised per instance (a wall/saved-views tile renders its own
  // `CourtArt`) — one `<circle>` per dot is cheap even for a busy match, but
  // there's no reason to recompute the array on every render either.
  const heatCirclesMemo = useMemo<ReactNode[] | null>(() => {
    if (!drawHeat) return null;
    if (cut === "serve") {
      return dots.map((d) => {
        const { cx, cy } = projectServeDot(d);
        return heatDotCircle(d.id, cx, cy, dotRadius);
      });
    }
    const kind = cut === "returnPlacement" ? "placement" : "contact";
    return dots.map((d) => {
      const { cx, cy } = projectReturnDot(kind, {
        lateralM: d.lateralM ?? 0,
        depthM: d.depthM ?? 0,
      });
      return heatDotCircle(d.id, cx, cy, dotRadius);
    });
  }, [drawHeat, dots, cut, dotRadius]);

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
        <path d={SERVE_BACKGROUND_PATH} fill={apronFill} />
        <clipPath id={clipId}>
          <path d={SERVE_BACKGROUND_PATH} />
        </clipPath>
        {drawHeat && <HeatFilterDef id={heatFilterId} cut={cut} />}
        {/* Clipped to the background path — the heat filter's own margin
            (`heatFilterRegionFor`) would otherwise bleed past the rounded
            corners `SERVE_BACKGROUND_PATH` cuts into the frame. */}
        <g clipPath={`url(#${clipId})`}>
          <g transform={SERVE_COURT.groupTransform}>
            <rect
              x={SERVE_COURT.doublesLeft}
              y={SERVE_COURT.baselineY}
              width={SERVE_COURT.doublesRight - SERVE_COURT.doublesLeft}
              height={SERVE_COURT.netY - SERVE_COURT.baselineY}
              fill={courtFillColor}
            />
            <rect
              x={SERVE_COURT.singlesLeft}
              y={SERVE_COURT.baselineY}
              width={SERVE_COURT.singlesRight - SERVE_COURT.singlesLeft}
              height={SERVE_COURT.netY - SERVE_COURT.baselineY}
              fill={courtFillColor}
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
                const cellCy =
                  (SERVE_COURT.zoneTop + SERVE_COURT.zoneBottom) / 2;
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

            {heatCirclesMemo && (
              <g filter={`url(#${heatFilterId})`}>{heatCirclesMemo}</g>
            )}

            {!showHeat &&
              !showZones &&
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
      <path d={RETURN_BACKGROUND_PATH} fill={apronFill} />
      <clipPath id={clipId}>
        <path d={RETURN_BACKGROUND_PATH} />
      </clipPath>
      {drawHeat && <HeatFilterDef id={heatFilterId} cut={cut} />}
      <g clipPath={`url(#${clipId})`}>
        <g transform={RETURN_COURT.outerGroupTransform}>
          <g transform={RETURN_COURT.innerGroupTransform}>
            <rect
              x={RETURN_COURT.farBaselineX}
              y={RETURN_COURT.doublesTop}
              width={RETURN_COURT.nearBaselineX - RETURN_COURT.farBaselineX}
              height={RETURN_COURT.doublesBottom - RETURN_COURT.doublesTop}
              fill={courtFillColor}
            />
            <rect
              x={RETURN_COURT.farBaselineX}
              y={RETURN_COURT.singlesTop}
              width={RETURN_COURT.nearBaselineX - RETURN_COURT.farBaselineX}
              height={RETURN_COURT.singlesBottom - RETURN_COURT.singlesTop}
              fill={courtFillColor}
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

            {/* Every return-frame cut's blobs draw through the same blur +
                colourize filter — still inside the same clipPath, still in
                the same logical coordinates the dots below use. */}
            {heatCirclesMemo && (
              <g filter={`url(#${heatFilterId})`}>{heatCirclesMemo}</g>
            )}

            {!showHeat &&
              dots.map((d) => {
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
