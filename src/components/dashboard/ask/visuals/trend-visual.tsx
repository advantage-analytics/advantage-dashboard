import type { CSSProperties } from "react";
import Link from "next/link";
import type { AskTrendVisual } from "@/lib/services/ask/events";
import { TREND_BOX, trendGeometry } from "./visual-geometry";
import { VisualFrame, VisualKey } from "./visual-frame";

const percent = (n: number, of: number) => `${(n / of) * 100}%`;

/** A point's match page, when the point is a match. */
export function trendPointHref(matchId: string): string {
  return `/dashboard/matches/${encodeURIComponent(matchId)}`;
}

/**
 * Trend line: one value per match in date order, with a dashed second line
 * so a point reads as above or below something — the block's own `baseline`
 * series when it carries one (the same measure across all matches, or a
 * per-match average), else the mean of the drawn values.
 *
 * The mean is geometry and is never printed as a number: it is not a cell
 * of the query result, so the key names it and stops there. A baseline
 * series IS cells of the result, and still prints nothing on the plot: the
 * one figure there is the last point's, in the server's own text.
 *
 * A point that is a match (`matchId`) is a link to that match's page: an
 * anchor laid over the point, under the drawing so its hover wash sits
 * behind the dot. The drawing itself is hidden from assistive technology;
 * the words are the anchors' when the points link, else a list under it.
 */
export function TrendVisual({
  visual,
  averageLabel = "Your average",
}: {
  visual: AskTrendVisual;
  /** The key's name for the dashed mean. The team page says "Average". */
  averageLabel?: string;
}) {
  const { points, baseline } = visual;
  const geometry = trendGeometry(
    points.map((point) => point.value.value),
    TREND_BOX,
    baseline?.values.map((value) => value.value),
  );
  const last = points.length - 1;
  const lastAt = geometry.points[last];
  const linked = points.some((point) => point.matchId !== undefined);
  const words = (index: number) =>
    `${points[index].label}: ${points[index].value.text}${
      baseline ? `; ${baseline.label} ${baseline.values[index].text}` : ""
    }`;

  return (
    <VisualFrame kind="trend" caption={visual.caption}>
      <VisualKey
        items={[
          { label: "Each match", color: "var(--viz-you)" },
          {
            label: baseline?.label ?? averageLabel,
            color: "var(--viz-opp-mid)",
            dashed: true,
          },
        ]}
      />
      {/* `pr-12`: a fixed gutter for the last value's label (about 46px at
          11px), whatever the column's width. */}
      <div className="flex flex-col gap-1 pr-12">
        {/* The wipe is the wrapper's, not the SVG's: an HTML box is what gets
            clipped, and the drawing inside it is never itself the animated
            element. The last value's label is inside the same box, so the
            wipe's end state has to clear it (`ask-wipe` in `globals.css`). */}
        <div data-ask-wipe="" className="relative">
          {linked &&
            points.map((point, index) =>
              point.matchId !== undefined && geometry.points[index] ? (
                <Link
                  key={index}
                  href={trendPointHref(point.matchId)}
                  data-ask-trend-point=""
                  className="absolute z-0 size-5 -translate-x-1/2 -translate-y-1/2 rounded-full transition-colors duration-[var(--duration-hover)] outline-none hover:bg-[var(--surface-subtle)] focus-visible:shadow-[var(--focus-ring)]"
                  style={{
                    left: percent(geometry.points[index].x, TREND_BOX.width),
                    top: percent(geometry.points[index].y, TREND_BOX.height),
                  }}
                >
                  <span className="sr-only">{words(index)}, open match</span>
                </Link>
              ) : (
                <span key={index} className="sr-only">
                  {words(index)}
                </span>
              ),
            )}
          <svg
            aria-hidden="true"
            viewBox={`0 0 ${TREND_BOX.width} ${TREND_BOX.height}`}
            className="pointer-events-none relative block w-full overflow-visible"
          >
            {geometry.baseline ? (
              <path
                d={geometry.baseline.path}
                fill="none"
                stroke="var(--viz-opp-mid)"
                strokeWidth={1}
                strokeDasharray="3 4"
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
              />
            ) : (
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
            )}
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
              aria-hidden="true"
              data-ask-trend-last=""
              data-ask-after=""
              className="pointer-events-none absolute -translate-y-1/2 pl-2.5 text-[11px] whitespace-nowrap text-[var(--ink-900)] tabular-nums"
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
      {!linked && (
        <ol className="sr-only">
          {points.map((_, index) => (
            <li key={index}>{words(index)}</li>
          ))}
        </ol>
      )}
    </VisualFrame>
  );
}
