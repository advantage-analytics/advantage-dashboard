"use client";

import { starPoints, trianglePointsFor } from "./court-geometry";
import type { LegendItem } from "./viz-labels";

// The ace remains distinct without dominating the 8px ordinary legend keys.
const LEGEND_GLYPH_R = 3.6;
const LEGEND_TRIANGLE_SIZE = 2.2;
const LEGEND_STAR_OUTER_R = 4.2;

/**
 * One legend key — circle, triangle or star, reusing `court-art.tsx`'s own
 * point maths (`trianglePointsFor`/`starPoints`) so a glyph here is drawn
 * exactly the way the court draws it, not a hand-rolled near-miss.
 * `item.outline` (Forehand/Backhand) skips the fill and draws a neutral ink
 * stroke instead of the court's 0.4px black hairline — these encode STROKE,
 * not an outcome colour, so they shouldn't look like a fourth outcome dot.
 */
export function LegendMark({ item }: { item: LegendItem }) {
  const fill = item.outline ? "none" : item.color;
  const stroke = item.outline ? item.color : "#000";
  const strokeWidth = item.outline ? 1 : 0.4;
  const isStar = item.glyph === "star";
  const glyphSize = isStar ? 10 : 8;
  const glyphCenter = glyphSize / 2;
  return (
    <span className="inline-flex items-center gap-[6px]">
      <svg
        aria-hidden="true"
        width={glyphSize}
        height={glyphSize}
        viewBox={`0 0 ${glyphSize} ${glyphSize}`}
        className="shrink-0"
      >
        {item.glyph === "circle" && (
          <circle
            cx={glyphCenter}
            cy={glyphCenter}
            r={LEGEND_GLYPH_R}
            fill={fill}
            stroke={stroke}
            strokeWidth={strokeWidth}
          />
        )}
        {item.glyph === "triangle" && (
          <polygon
            points={trianglePointsFor(
              "serve",
              glyphCenter,
              glyphCenter,
              LEGEND_TRIANGLE_SIZE,
            )}
            fill={fill}
            stroke={stroke}
            strokeWidth={strokeWidth}
          />
        )}
        {item.glyph === "star" && (
          <polygon
            points={starPoints(glyphCenter, glyphCenter, LEGEND_STAR_OUTER_R)}
            fill={item.color}
            stroke="#000"
            strokeWidth={0.4}
          />
        )}
      </svg>
      <span className="text-micro" style={{ color: "var(--ink-500)" }}>
        {item.label}
      </span>
    </span>
  );
}
