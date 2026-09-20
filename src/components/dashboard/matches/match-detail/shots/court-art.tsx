import {
  COURT_W,
  COURT_H,
  DOUBLES_LEFT,
  DOUBLES_RIGHT,
  SINGLES_LEFT,
  SINGLES_RIGHT,
  SERVICE_Y,
  BASELINE_Y,
  CENTER_X,
  FULL_SVG_NET_Y,
  FULL_SVG_NEAR_BASELINE,
  FULL_SVG_PAD_TOP,
  FULL_SVG_PAD_BOTTOM,
} from "@/components/dashboard/matches/visuals/half-court-svg";
import type { Cut, VizDot } from "./viz-model";

/**
 * The recoloured court SVG for one cut — the wall tile's art and the focused
 * view's court alike (Task 9 reuses this here, not a second copy). Deliberately
 * NOT `HalfCourtSVG`/`FullCourtSVG` from `visuals/half-court-svg.tsx`: this is
 * the redesign's own palette (green apron, blue court), while those keep the
 * legacy pastel court for `LegacyShots` until it is retired.
 *
 * Geometry only. Return-cut dots arrive from `computeViz` already in this
 * SVG's `FULL_SVG_*` coordinate space. Serve-cut dots do not: `computeViz`
 * passes the underlying `ServeDot`'s x/y straight through, and those are a
 * 0..1 fraction of the service box, not a canvas position — `projectServeDot`
 * below does the same projection `serve-zones-court.tsx` does for the same
 * reason.
 */

const APRON_FILL = "#86AC91";
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

// `computeViz`'s serve-cut dots carry the underlying `ServeDot`'s x/y
// verbatim — a 0..1 fraction of the service box, not a canvas position (see
// `serve-zones.ts`'s `mapRealCoordsToServeDot`). Every other serve-court
// reader (`serve-zones-court.tsx`) projects through this same
// `SINGLES_LEFT/RIGHT` × `SERVICE_Y`/`BASELINE_Y` frame before drawing a
// dot; the return cuts need no such step because `pointToReturnDots`
// already returns an absolute `FULL_SVG_*` position.
function projectServeDot(d: VizDot): { x: number; y: number } {
  return {
    x: SINGLES_LEFT + d.x * (SINGLES_RIGHT - SINGLES_LEFT),
    y: SERVICE_Y + d.y * (BASELINE_Y - SERVICE_Y),
  };
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
  className,
}: {
  cut: Cut;
  dots: VizDot[];
  className?: string;
}) {
  const box = viewBoxFor(cut);
  const ariaLabel = `${CUT_NOUN[cut]} court, ${dots.length} point${dots.length === 1 ? "" : "s"} shown`;

  return (
    <svg
      viewBox={`0 ${box.minY} ${COURT_W} ${box.h}`}
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
          <rect
            x={DOUBLES_LEFT}
            y={0}
            width={DOUBLES_RIGHT - DOUBLES_LEFT}
            height={BASELINE_Y}
            fill={COURT_FILL}
          />
          <line
            x1={DOUBLES_LEFT}
            y1={0}
            x2={DOUBLES_LEFT}
            y2={BASELINE_Y}
            stroke={LINE_COLOR}
            strokeWidth={LINE_W}
          />
          <line
            x1={DOUBLES_RIGHT}
            y1={0}
            x2={DOUBLES_RIGHT}
            y2={BASELINE_Y}
            stroke={LINE_COLOR}
            strokeWidth={LINE_W}
          />
          <line
            x1={SINGLES_LEFT}
            y1={0}
            x2={SINGLES_LEFT}
            y2={BASELINE_Y}
            stroke={LINE_COLOR}
            strokeWidth={LINE_W}
          />
          <line
            x1={SINGLES_RIGHT}
            y1={0}
            x2={SINGLES_RIGHT}
            y2={BASELINE_Y}
            stroke={LINE_COLOR}
            strokeWidth={LINE_W}
          />
          <line
            x1={DOUBLES_LEFT}
            y1={BASELINE_Y}
            x2={DOUBLES_RIGHT}
            y2={BASELINE_Y}
            stroke={LINE_COLOR}
            strokeWidth={LINE_W}
          />
          <line
            x1={SINGLES_LEFT}
            y1={SERVICE_Y}
            x2={SINGLES_RIGHT}
            y2={SERVICE_Y}
            stroke={LINE_COLOR}
            strokeWidth={LINE_W}
          />
          <line
            x1={CENTER_X}
            y1={0}
            x2={CENTER_X}
            y2={SERVICE_Y}
            stroke={LINE_COLOR}
            strokeWidth={LINE_W}
          />
          <line
            x1={0}
            y1={0}
            x2={COURT_W}
            y2={0}
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

      {dots.map((d) => {
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
