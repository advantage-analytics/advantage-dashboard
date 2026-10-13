import type { CSSProperties } from "react";
import type { AskTrendVisual } from "@/lib/services/ask/events";
import { TREND_BOX, trendGeometry } from "./visual-geometry";
import { VisualFrame, VisualKey } from "./visual-frame";

const percent = (n: number, of: number) => `${(n / of) * 100}%`;

/**
 * Trend line: one value per match in date order, with the mean of the drawn
 * values as a dashed rule so a point reads as above or below the player's own
 * level.
 *
 * The rule is geometry and is never printed as a number: the average is not a
 * cell of the query result, so the key names it and stops there. The one
 * figure on the plot is the last point's, in the server's own text.
 *
 * The drawing is hidden from assistive technology; the list under it carries
 * every point in words.
 */
export function TrendVisual({
  visual,
  averageLabel = "Your average",
}: {
  visual: AskTrendVisual;
  /** The key's name for the dashed rule. The team page says "Average". */
  averageLabel?: string;
}) {
  const { points } = visual;
  const geometry = trendGeometry(points.map((point) => point.value.value));
  const last = points.length - 1;
  const lastAt = geometry.points[last];

  return (
    <VisualFrame kind="trend" caption={visual.caption}>
      <VisualKey
        items={[
          { label: "Each match", color: "var(--viz-you)" },
          { label: averageLabel, color: "var(--viz-opp-mid)", dashed: true },
        ]}
      />
      <div className="flex flex-col gap-1">
        {/* The wipe is the wrapper's, not the SVG's: an HTML box is what gets
            clipped, and the drawing inside it is never itself the animated
            element. The last value's label is inside the same box, so the
            wipe's end state has to clear it (`ask-wipe` in `globals.css`). */}
        <div aria-hidden="true" data-ask-wipe="" className="relative">
          <svg
            viewBox={`0 0 ${TREND_BOX.width} ${TREND_BOX.height}`}
            className="block w-full overflow-visible"
          >
            <line
              x1={TREND_BOX.left}
              x2={TREND_BOX.width - TREND_BOX.right}
              y1={geometry.averageY}
              y2={geometry.averageY}
              stroke="var(--viz-opp-mid)"
              strokeWidth={1}
              strokeDasharray="3 4"
              vectorEffect="non-scaling-stroke"
            />
            <path
              d={geometry.path}
              fill="none"
              stroke="var(--viz-you)"
              strokeWidth={1.5}
              strokeLinejoin="round"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
            {geometry.points.map((point, index) => (
              <circle
                key={index}
                cx={point.x}
                cy={point.y}
                r={index === last ? 3.5 : 2.5}
                fill={index === last ? "var(--viz-you)" : "var(--surface-card)"}
                stroke="var(--viz-you)"
                strokeWidth={1.5}
                vectorEffect="non-scaling-stroke"
              />
            ))}
          </svg>
          {lastAt && (
            <span
              data-ask-trend-last=""
              data-ask-after=""
              className="absolute -translate-y-1/2 pl-2.5 text-[11px] whitespace-nowrap text-[var(--ink-900)] tabular-nums"
              style={
                {
                  left: percent(lastAt.x, TREND_BOX.width),
                  top: percent(lastAt.y, TREND_BOX.height),
                  // After the line has reached it: the wipe has passed
                  // this far by the time the fade starts, so the label
                  // fades whole and is never cut by the wipe's edge.
                  "--ask-row": 8,
                } as CSSProperties
              }
            >
              {points[last].value.text}
            </span>
          )}
        </div>
        <div
          aria-hidden="true"
          className="flex justify-between gap-4 text-[10px] text-[var(--ink-500)] tabular-nums"
          style={{
            paddingLeft: percent(TREND_BOX.left, TREND_BOX.width),
            paddingRight: percent(TREND_BOX.right, TREND_BOX.width),
          }}
        >
          <span>{points[0].label}</span>
          <span>{points[last].label}</span>
        </div>
      </div>
      <ol className="sr-only">
        {points.map((point, index) => (
          <li key={index}>
            {point.label}: {point.value.text}
          </li>
        ))}
      </ol>
    </VisualFrame>
  );
}
