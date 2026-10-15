import type { CSSProperties } from "react";
import Link from "next/link";
import {
  EMPTY_MATCH_FILTERS,
  type ScoreType,
  serializeMatchFilters,
} from "@/components/dashboard/matches/match-detail/match-filters/model";
import type {
  AskMomentumMark,
  AskMomentumVisual,
} from "@/lib/services/ask/events";
import { MOMENTUM_BOX, momentumGeometry } from "./visual-geometry";
import { VisualFrame, VisualKey } from "./visual-frame";

const percent = (n: number, of: number) => `${(n / of) * 100}%`;

/** A mark's name, its radius on the plot, and the Video tab's score filter for it. */
const MARKS: Record<
  AskMomentumMark,
  { label: string; radius: number; score: ScoreType }
> = {
  break: { label: "Break point", radius: 3, score: "breakpoint" },
  set: { label: "Set point", radius: 4, score: "setPoint" },
  match: { label: "Match point", radius: 5, score: "matchPoint" },
};

/** The match's Video tab on every point of that pressure. */
export function momentumMarkHref(
  matchId: string,
  mark: AskMomentumMark,
): string {
  const f = serializeMatchFilters({
    ...EMPTY_MATCH_FILTERS,
    scoreType: [MARKS[mark].score],
  });
  const query = new URLSearchParams({ tab: "film" });
  if (f !== "") query.set("f", f);
  return `/dashboard/matches/${encodeURIComponent(matchId)}?${query.toString()}`;
}

/**
 * How a match flowed: points won minus points lost, point by point, as a
 * line about a level rule — above it the subject leads, below it trails —
 * with the sets as segments and the break, set and match points marked in
 * the one colour the design system keeps for key moments.
 *
 * Nothing on the plot is a number: the line is geometry over the won/lost
 * cells, the marks are glyphs, and the axis names the sets. The words under
 * it count what is drawn, as the form strip's record does, so they cannot
 * disagree with the picture. When the points are one match's, each mark is
 * a link to that match's Video tab on every point of that pressure — laid
 * under the drawing, as the trend's point links are.
 */
export function MomentumVisual({ visual }: { visual: AskMomentumVisual }) {
  const { points, matchId } = visual;
  const geometry = momentumGeometry(points);
  const won = points.filter((point) => point.won).length;
  const lost = points.length - won;
  const marked = (["match", "set", "break"] as const).filter((mark) =>
    points.some((point) => point.mark === mark),
  );
  const counted = (mark: AskMomentumMark) =>
    points.filter((point) => point.mark === mark).length;

  return (
    <VisualFrame kind="momentum" caption={visual.caption}>
      <VisualKey
        items={[
          { label: "Ahead or behind, point by point", color: "var(--viz-you)" },
          ...marked.map((mark) => ({
            label: MARKS[mark].label,
            color: "var(--viz-key)",
          })),
        ]}
      />
      <div className="flex flex-col gap-1">
        <div data-ask-wipe="" className="relative">
          {matchId &&
            points.map((point, index) =>
              point.mark ? (
                <Link
                  key={index}
                  href={momentumMarkHref(matchId, point.mark)}
                  data-ask-momentum-mark={point.mark}
                  className="absolute z-0 size-5 -translate-x-1/2 -translate-y-1/2 rounded-full transition-colors duration-[var(--duration-hover)] outline-none hover:bg-[var(--surface-subtle)] focus-visible:shadow-[var(--focus-ring)]"
                  style={{
                    left: percent(geometry.points[index].x, MOMENTUM_BOX.width),
                    top: percent(geometry.points[index].y, MOMENTUM_BOX.height),
                  }}
                >
                  <span className="sr-only">
                    {MARKS[point.mark].label}, point {index + 1} of{" "}
                    {points.length}, open the film
                  </span>
                </Link>
              ) : null,
            )}
          <svg
            aria-hidden="true"
            viewBox={`0 0 ${MOMENTUM_BOX.width} ${MOMENTUM_BOX.height}`}
            className="pointer-events-none relative block w-full overflow-visible"
          >
            {/* Set dividers, between one set's last point and the next's first */}
            {geometry.sets.slice(0, -1).map((set) => (
              <line
                key={set.set}
                x1={set.x2}
                x2={set.x2}
                y1={MOMENTUM_BOX.top}
                y2={MOMENTUM_BOX.height - MOMENTUM_BOX.bottom}
                stroke="var(--ink-200)"
                strokeWidth={1}
                vectorEffect="non-scaling-stroke"
              />
            ))}
            {/* Level */}
            <line
              x1={MOMENTUM_BOX.left}
              x2={MOMENTUM_BOX.width - MOMENTUM_BOX.right}
              y1={geometry.zeroY}
              y2={geometry.zeroY}
              stroke="var(--ink-300)"
              strokeWidth={1}
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
            {points.map((point, index) =>
              point.mark ? (
                <circle
                  key={index}
                  data-ask-mark={point.mark}
                  cx={geometry.points[index].x}
                  cy={geometry.points[index].y}
                  r={MARKS[point.mark].radius}
                  fill="var(--viz-key)"
                  stroke="var(--surface-card)"
                  strokeWidth={1}
                  vectorEffect="non-scaling-stroke"
                />
              ) : null,
            )}
          </svg>
        </div>
        {geometry.sets.length > 0 && (
          <div
            aria-hidden="true"
            className="relative h-4 text-[10px] text-[var(--ink-500)]"
          >
            {geometry.sets.map((set) => (
              <span
                key={set.set}
                className="absolute -translate-x-1/2 whitespace-nowrap"
                style={
                  {
                    left: percent((set.x1 + set.x2) / 2, MOMENTUM_BOX.width),
                  } as CSSProperties
                }
              >
                Set {set.set}
              </span>
            ))}
          </div>
        )}
      </div>
      <p className="sr-only">
        {points.length} points, {won} won and {lost} lost
        {marked.length > 0
          ? `; ${marked
              .map(
                (mark) =>
                  `${counted(mark)} ${MARKS[mark].label.toLowerCase()}${counted(mark) === 1 ? "" : "s"}`,
              )
              .join(", ")}`
          : ""}
        .
      </p>
    </VisualFrame>
  );
}
