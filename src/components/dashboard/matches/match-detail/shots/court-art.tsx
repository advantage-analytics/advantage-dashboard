import {
  SERVICE_Y,
  BASELINE_Y,
  CENTER_X,
  FULL_SVG_NET_Y,
  FULL_SVG_NEAR_BASELINE,
  FULL_SVG_PAD_TOP,
  FULL_SVG_PAD_BOTTOM,
} from "@/components/dashboard/matches/visuals/half-court-svg";
import { ZONES, type ZoneKey, type ZoneStats } from "@/lib/data/serve-zones";
import {
  SERVE_COURT,
  NET_LEFT,
  NET_RIGHT,
  COURT_W,
  COURT_H,
  DOUBLES_LEFT,
  DOUBLES_RIGHT,
  SINGLES_LEFT,
  SINGLES_RIGHT,
  projectServeDot,
  zoneOpacity,
} from "./court-geometry";
import type { Cut, VizDot } from "./viz-model";

/**
 * The recoloured court SVG for one cut — the wall tile's art and the focused
 * view's court alike (`viz-focused.tsx` reuses this here, not a second copy).
 * Deliberately NOT `HalfCourtSVG`/`FullCourtSVG` from `visuals/half-court-svg.tsx`:
 * this is the redesign's own palette (green apron, blue court), while those
 * keep the legacy pastel court for other surfaces still on the old model.
 *
 * Geometry only. Return-cut dots arrive from `computeViz` already in this
 * SVG's `FULL_SVG_*` coordinate space. Serve-cut dots do not: `computeViz`
 * passes the underlying `ServeDot`'s x/y straight through, and those are a
 * 0..1 fraction of the service box, not a canvas position — `projectServeDot`
 * below does the same projection the retired zones-court component used to.
 */

// Exported so `court-tile.tsx` can give the art box the same apron colour
// as its background (Defect 2 fix), rather than introducing a second
// `#86AC91` literal in a file the design-drift checker doesn't allowlist.
export const APRON_FILL = "#86AC91";
const COURT_FILL = "#6092CE";
const LINE_COLOR = "#FFFFFF";
const LINE_W = 1.5;
const NET_W = 2.5;
const DOT_R = 2.5;
const DOT_STROKE = "#000";
const DOT_STROKE_W = 0.4;

// Area-match a triangle to a circle of the same nominal radius — see
// `visuals/half-court-svg.tsx`'s `trianglePoints` for the derivation; kept as
// a local copy since that helper is not exported.
const TRIANGLE_AREA_SCALE = 1.33;

function trianglePoints(cx: number, cy: number, size: number): string {
  const s = size * TRIANGLE_AREA_SCALE;
  const apexY = cy - s * 1.1883;
  const baseY = cy + s * 0.5942;
  return `${cx},${apexY} ${cx - s},${baseY} ${cx + s},${baseY}`;
}

function colorFor(outcome: VizDot["outcome"]): string {
  if (outcome === "won") return "var(--viz-good)";
  if (outcome === "lost") return "var(--viz-bad)";
  return "var(--ink-300)";
}

interface ViewBox {
  minY: number;
  h: number;
}

// Serve draws the half court as-is; the two return cuts share the
// `FullCourtSVG` frame and differ only in which half of it the viewBox shows —
// far half (+ top pad) for placement, near half (+ bottom pad) for contact.
function viewBoxFor(cut: Cut): ViewBox {
  if (cut === "serve") {
    return { minY: 0, h: COURT_H };
  }
  if (cut === "returnPlacement") {
    return { minY: -FULL_SVG_PAD_TOP, h: FULL_SVG_NET_Y + FULL_SVG_PAD_TOP };
  }
  return {
    minY: FULL_SVG_NET_Y,
    h: FULL_SVG_NEAR_BASELINE + FULL_SVG_PAD_BOTTOM - FULL_SVG_NET_Y,
  };
}

const CUT_NOUN: Record<Cut, string> = {
  serve: "serve placement",
  returnPlacement: "return placement",
  returnContact: "return contact",
};

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
  const box = viewBoxFor(cut);
  const showZones = cut === "serve" && zones != null;
  const maxZonePct = zones
    ? Math.max(...ZONES.map((z) => zones[z.key].pct))
    : 0;
  const ariaLabel = showZones
    ? "Serve placement by zone: six service-box zones shaded by serve frequency"
    : `${CUT_NOUN[cut]} court, ${dots.length} point${dots.length === 1 ? "" : "s"} shown`;

  return (
    <svg
      viewBox={`0 ${box.minY} ${COURT_W} ${box.h}`}
      {...(fill ? { height: "100%" } : {})}
      width="100%"
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label={ariaLabel}
      className={className}
    >
      <rect
        x={0}
        y={box.minY}
        width={COURT_W}
        height={box.h}
        fill={APRON_FILL}
      />

      {cut === "serve" ? (
        <>
          {/* Court fill: far baseline (top, y=0) down to the net (bottom,
              y=`netY`) — the far half-court, matching the legacy court this
              redesign replaced. */}
          <rect
            x={DOUBLES_LEFT}
            y={SERVE_COURT.baselineY}
            width={DOUBLES_RIGHT - DOUBLES_LEFT}
            height={SERVE_COURT.netY - SERVE_COURT.baselineY}
            fill={COURT_FILL}
          />
          {/* Zone cells span the service line down to the net, same as the
              service boxes below — not the baseline down to the service
              line. White fill/outline (not a blue tint): the cells sit on
              the blue court fill, so a blue-on-blue overlay was unreadable —
              white at 0.06–0.42 opacity, scaled to the busiest zone actually
              drawn, reads at every share. */}
          {showZones &&
            zones &&
            ZONES.map((z) => {
              const zs = zones[z.key];
              const cellCx = (z.x1 + z.x2) / 2;
              const cellCy = (SERVE_COURT.zoneTop + SERVE_COURT.zoneBottom) / 2;
              return (
                <g key={z.key}>
                  <rect
                    x={z.x1}
                    y={SERVE_COURT.zoneTop}
                    width={z.x2 - z.x1}
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
                        fontSize={11}
                        fontWeight={600}
                        style={{ fontVariantNumeric: "tabular-nums" }}
                      >
                        {zs.count}
                      </text>
                      {/* Win rate only, no " won" suffix (review M1) — the
                          zone card beside the court already says these are
                          win rates, and the ~46-unit-wide cell can't fit
                          "80% won" beneath "38%" without the two lines'
                          text colliding. */}
                      <text
                        x={cellCx}
                        y={cellCy + 10}
                        textAnchor="middle"
                        fill={LINE_COLOR}
                        fillOpacity={0.8}
                        fontSize={9}
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
            x1={DOUBLES_LEFT}
            y1={SERVE_COURT.baselineY}
            x2={DOUBLES_LEFT}
            y2={SERVE_COURT.netY}
            stroke={LINE_COLOR}
            strokeWidth={LINE_W}
          />
          <line
            x1={DOUBLES_RIGHT}
            y1={SERVE_COURT.baselineY}
            x2={DOUBLES_RIGHT}
            y2={SERVE_COURT.netY}
            stroke={LINE_COLOR}
            strokeWidth={LINE_W}
          />
          <line
            x1={SINGLES_LEFT}
            y1={SERVE_COURT.baselineY}
            x2={SINGLES_LEFT}
            y2={SERVE_COURT.netY}
            stroke={LINE_COLOR}
            strokeWidth={LINE_W}
          />
          <line
            x1={SINGLES_RIGHT}
            y1={SERVE_COURT.baselineY}
            x2={SINGLES_RIGHT}
            y2={SERVE_COURT.netY}
            stroke={LINE_COLOR}
            strokeWidth={LINE_W}
          />
          {/* Baseline — far court boundary, top of the frame. */}
          <line
            x1={DOUBLES_LEFT}
            y1={SERVE_COURT.baselineY}
            x2={DOUBLES_RIGHT}
            y2={SERVE_COURT.baselineY}
            stroke={LINE_COLOR}
            strokeWidth={LINE_W}
          />
          {/* Service line. */}
          <line
            x1={SINGLES_LEFT}
            y1={SERVE_COURT.serviceY}
            x2={SINGLES_RIGHT}
            y2={SERVE_COURT.serviceY}
            stroke={LINE_COLOR}
            strokeWidth={LINE_W}
          />
          {/* Centre service line — splits the two service boxes, service
              line down to the net. */}
          <line
            x1={CENTER_X}
            y1={SERVE_COURT.serviceY}
            x2={CENTER_X}
            y2={SERVE_COURT.netY}
            stroke={LINE_COLOR}
            strokeWidth={LINE_W}
          />
          {/* Net — bottom of the frame, extending slightly past the doubles
              sidelines as a physical net does. */}
          <line
            x1={NET_LEFT}
            y1={SERVE_COURT.netY}
            x2={NET_RIGHT}
            y2={SERVE_COURT.netY}
            stroke={LINE_COLOR}
            strokeWidth={NET_W}
          />
        </>
      ) : (
        <>
          <rect
            x={DOUBLES_LEFT}
            y={0}
            width={DOUBLES_RIGHT - DOUBLES_LEFT}
            height={FULL_SVG_NEAR_BASELINE}
            fill={COURT_FILL}
          />
          <line
            x1={DOUBLES_LEFT}
            y1={0}
            x2={DOUBLES_LEFT}
            y2={FULL_SVG_NEAR_BASELINE}
            stroke={LINE_COLOR}
            strokeWidth={LINE_W}
          />
          <line
            x1={DOUBLES_RIGHT}
            y1={0}
            x2={DOUBLES_RIGHT}
            y2={FULL_SVG_NEAR_BASELINE}
            stroke={LINE_COLOR}
            strokeWidth={LINE_W}
          />
          <line
            x1={SINGLES_LEFT}
            y1={0}
            x2={SINGLES_LEFT}
            y2={FULL_SVG_NEAR_BASELINE}
            stroke={LINE_COLOR}
            strokeWidth={LINE_W}
          />
          <line
            x1={SINGLES_RIGHT}
            y1={0}
            x2={SINGLES_RIGHT}
            y2={FULL_SVG_NEAR_BASELINE}
            stroke={LINE_COLOR}
            strokeWidth={LINE_W}
          />
          {/* Far baseline */}
          <line
            x1={DOUBLES_LEFT}
            y1={0}
            x2={DOUBLES_RIGHT}
            y2={0}
            stroke={LINE_COLOR}
            strokeWidth={LINE_W}
          />
          {/* Far service line + centre */}
          <line
            x1={SINGLES_LEFT}
            y1={BASELINE_Y - SERVICE_Y}
            x2={SINGLES_RIGHT}
            y2={BASELINE_Y - SERVICE_Y}
            stroke={LINE_COLOR}
            strokeWidth={LINE_W}
          />
          <line
            x1={CENTER_X}
            y1={BASELINE_Y - SERVICE_Y}
            x2={CENTER_X}
            y2={FULL_SVG_NET_Y}
            stroke={LINE_COLOR}
            strokeWidth={LINE_W}
          />
          {/* Near service line + centre */}
          <line
            x1={SINGLES_LEFT}
            y1={FULL_SVG_NET_Y + SERVICE_Y}
            x2={SINGLES_RIGHT}
            y2={FULL_SVG_NET_Y + SERVICE_Y}
            stroke={LINE_COLOR}
            strokeWidth={LINE_W}
          />
          <line
            x1={CENTER_X}
            y1={FULL_SVG_NET_Y}
            x2={CENTER_X}
            y2={FULL_SVG_NET_Y + SERVICE_Y}
            stroke={LINE_COLOR}
            strokeWidth={LINE_W}
          />
          {/* Near baseline */}
          <line
            x1={DOUBLES_LEFT}
            y1={FULL_SVG_NEAR_BASELINE}
            x2={DOUBLES_RIGHT}
            y2={FULL_SVG_NEAR_BASELINE}
            stroke={LINE_COLOR}
            strokeWidth={LINE_W}
          />
          {/* Net */}
          <line
            x1={0}
            y1={FULL_SVG_NET_Y}
            x2={COURT_W}
            y2={FULL_SVG_NET_Y}
            stroke={LINE_COLOR}
            strokeWidth={NET_W}
          />
        </>
      )}

      {!showZones &&
        dots.map((d) => {
          const color = colorFor(d.outcome);
          const { x, y } = cut === "serve" ? projectServeDot(d) : d;
          return d.shape === "triangle" ? (
            <polygon
              key={d.id}
              points={trianglePoints(x, y, DOT_R)}
              fill={color}
              stroke={DOT_STROKE}
              strokeWidth={DOT_STROKE_W}
              vectorEffect="non-scaling-stroke"
            />
          ) : (
            <circle
              key={d.id}
              cx={x}
              cy={y}
              r={DOT_R}
              fill={color}
              stroke={DOT_STROKE}
              strokeWidth={DOT_STROKE_W}
              vectorEffect="non-scaling-stroke"
            />
          );
        })}
    </svg>
  );
}
