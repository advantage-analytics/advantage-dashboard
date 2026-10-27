import { useId, useState, type CSSProperties } from "react";
import Link from "next/link";
import { useFingerTap, useTouchReadout } from "@/hooks/use-touch-readout";
import type { AskTrendVisual } from "@/lib/services/ask/events";
import { TREND_BOX, trendGeometry } from "./visual-geometry";
import { VisualFrame, VisualKey, VisualReadout } from "./visual-frame";

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
 * Every point has a hit area laid over it, under the drawing: a hovered
 * point names its date and figure in a dark readout — only the last value
 * is printed on the plot — and a point that is a match (`matchId`) is a
 * link to that match's page. The readout is drawn outside the wipe wrapper
 * (`[data-ask-wipe]`), whose clip would cut it. The drawing itself is
 * hidden from assistive technology; the words are the anchors' when the
 * points link, else a list under it.
 *
 * On touch a tap selects a point and its readout stays until a tap lands
 * outside the plot; a linked point follows its link on a second tap.
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
    `${points[index].label}: ${visual.label ? `${visual.label} ` : ""}${points[index].value.text}${
      baseline ? `; ${baseline.label} ${baseline.values[index].text}` : ""
    }`;
  const [hovered, setHovered] = useState<number | null>(null);
  const areaId = `ask-trend-area-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  // The sparkline's wash: the line closed down to the plot's floor.
  const floor = TREND_BOX.height - TREND_BOX.bottom;
  const first = geometry.points[0];
  const areaPath =
    first && lastAt && geometry.path
      ? `${geometry.path} L ${lastAt.x} ${floor} L ${first.x} ${floor} Z`
      : null;
  const plotRef = useTouchReadout<HTMLDivElement>(hovered !== null, () =>
    setHovered(null),
  );
  const fingerTap = useFingerTap();
  const hoverAt = (index: number) => ({
    onMouseEnter: () => setHovered(index),
    onMouseLeave: () => setHovered(null),
    onFocus: () => setHovered(index),
    onBlur: () => setHovered(null),
    onPointerDown: (e: React.PointerEvent) => {
      if (fingerTap.press(e, hovered === index)) setHovered(index);
    },
  });
  const at = (index: number): CSSProperties => ({
    left: percent(geometry.points[index].x, TREND_BOX.width),
    top: percent(geometry.points[index].y, TREND_BOX.height),
  });

  return (
    <VisualFrame kind="trend" caption={visual.caption}>
      <VisualKey
        items={[
          { label: visual.label ?? "Each match", color: "var(--viz-you)" },
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
        <div ref={plotRef} className="relative">
          {/* The wipe is the wrapper's, not the SVG's: an HTML box is what gets
              clipped, and the drawing inside it is never itself the animated
              element. The last value's label is inside the same box, so the
              wipe's end state has to clear it (`ask-wipe` in `globals.css`). */}
          <div data-ask-wipe="" className="relative">
            {points.map((point, index) =>
              !geometry.points[index] ? null : point.matchId !== undefined ? (
                <Link
                  key={index}
                  href={trendPointHref(point.matchId)}
                  data-ask-trend-point=""
                  className="absolute z-0 size-5 -translate-x-1/2 -translate-y-1/2 rounded-full transition-colors duration-[var(--duration-hover)] outline-none hover:bg-[var(--surface-subtle)] focus-visible:shadow-[var(--focus-ring)]"
                  style={at(index)}
                  {...hoverAt(index)}
                  onClick={(e) => {
                    if (!fingerTap.shouldFollow()) e.preventDefault();
                  }}
                >
                  <span className="sr-only">{words(index)}, open match</span>
                </Link>
              ) : (
                // Not a match: a hit area for the readout alone. Its words
                // are in the list under the drawing — or, when other points
                // link and there is no list, beside it.
                <span key={index}>
                  <span
                    aria-hidden="true"
                    data-ask-trend-hover=""
                    className="absolute z-0 size-5 -translate-x-1/2 -translate-y-1/2 rounded-full"
                    style={at(index)}
                    {...hoverAt(index)}
                    onClick={() =>
                      fingerTap.click(undefined, () => setHovered(null))
                    }
                  />
                  {linked && <span className="sr-only">{words(index)}</span>}
                </span>
              ),
            )}

            <svg
              aria-hidden="true"
              viewBox={`0 0 ${TREND_BOX.width} ${TREND_BOX.height}`}
              className="pointer-events-none relative block w-full overflow-visible"
            >
              <defs>
                <linearGradient id={areaId} x1="0" y1="0" x2="0" y2="1">
                  <stop
                    offset="0%"
                    stopColor="var(--viz-you)"
                    stopOpacity={0.1}
                  />
                  <stop
                    offset="100%"
                    stopColor="var(--viz-you)"
                    stopOpacity={0}
                  />
                </linearGradient>
              </defs>
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
              {areaPath && (
                <path
                  data-ask-trend-area=""
                  d={areaPath}
                  fill={`url(#${areaId})`}
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
              {/* A dot on the last point, and on the hovered one: the KPI
                  sparkline's grammar, not a ring on every match. */}
              {lastAt && (
                <circle
                  cx={lastAt.x}
                  cy={lastAt.y}
                  r={3.5}
                  fill="var(--viz-you)"
                  vectorEffect="non-scaling-stroke"
                />
              )}
              {hovered !== null &&
                hovered !== last &&
                geometry.points[hovered] && (
                  <circle
                    data-ask-trend-hovered=""
                    cx={geometry.points[hovered].x}
                    cy={geometry.points[hovered].y}
                    r={3}
                    fill="var(--viz-you)"
                    stroke="var(--surface-card)"
                    strokeWidth={1.5}
                    vectorEffect="non-scaling-stroke"
                  />
                )}
            </svg>
            {lastAt && (
              <span
                aria-hidden="true"
                data-ask-trend-last=""
                data-ask-after=""
                className="pointer-events-none absolute -translate-y-1/2 pl-2.5 text-[11px] font-medium whitespace-nowrap text-[var(--ink-900)] tabular-nums"
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
          {/* The readout for the hovered point, outside the wipe's clip. */}
          {hovered !== null && geometry.points[hovered] && (
            <VisualReadout
              open
              className="-translate-x-1/2 -translate-y-full"
              style={{
                left: at(hovered).left,
                top: `calc(${at(hovered).top} - 12px)`,
              }}
            >
              {words(hovered)}
            </VisualReadout>
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
