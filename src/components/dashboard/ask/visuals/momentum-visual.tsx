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
import { useSvgId, VisualFrame, VisualKey } from "./visual-frame";

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
 * the one colour the design system keeps for key moments. The report's
 * performance tracker grammar: the line and its wash are `--viz-you` above
 * the rule and `--viz-opp` below it, so who was ahead reads at a glance.
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
  const above = useSvgId("ask-momentum-above");
  const below = useSvgId("ask-momentum-below");
  const first = geometry.points[0];
  const lastPoint = geometry.points[geometry.points.length - 1];
  // The line closed to the level rule: washed blue above it, slate below.
  const areaPath =
    first && lastPoint && geometry.path
      ? `${geometry.path} L ${lastPoint.x} ${geometry.zeroY} L ${first.x} ${geometry.zeroY} Z`
      : null;
  const plotRight = MOMENTUM_BOX.width - MOMENTUM_BOX.right;

  return (
    <VisualFrame kind="momentum" caption={visual.caption}>
      <VisualKey
        items={[
          { label: "Ahead", color: "var(--viz-you)" },
          { label: "Behind", color: "var(--viz-opp)" },
          ...(marked.length > 0
            ? [
                {
                  label: marksLabel(marked),
                  color: "var(--viz-key)",
                  swatch: <MarkSizes marks={marked} />,
                },
              ]
            : []),
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
              x2={plotRight}
              y1={geometry.zeroY}
              y2={geometry.zeroY}
              stroke="var(--ink-300)"
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
            />
            <defs>
              <clipPath id={above}>
                <rect
                  x={0}
                  y={-MOMENTUM_BOX.height}
                  width={MOMENTUM_BOX.width}
                  height={geometry.zeroY + MOMENTUM_BOX.height}
                />
              </clipPath>
              <clipPath id={below}>
                <rect
                  x={0}
                  y={geometry.zeroY}
                  width={MOMENTUM_BOX.width}
                  height={MOMENTUM_BOX.height * 2}
                />
              </clipPath>
            </defs>
            {areaPath && (
              <>
                <path
                  d={areaPath}
                  fill="var(--viz-you)"
                  fillOpacity={0.12}
                  clipPath={`url(#${above})`}
                />
                <path
                  d={areaPath}
                  fill="var(--viz-opp)"
                  fillOpacity={0.14}
                  clipPath={`url(#${below})`}
                />
              </>
            )}
            {(
              [
                [above, "var(--viz-you)"],
                [below, "var(--viz-opp)"],
              ] as const
            ).map(([clip, stroke]) => (
              <path
                key={clip}
                data-ask-momentum-line=""
                d={geometry.path}
                fill="none"
                stroke={stroke}
                strokeWidth={1.5}
                strokeLinejoin="round"
                strokeLinecap="round"
                clipPath={`url(#${clip})`}
                vectorEffect="non-scaling-stroke"
              />
            ))}
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

/** The key's one entry for the marks present: "Break point", "Break and set points". */
function marksLabel(marks: readonly AskMomentumMark[]): string {
  const present = (["break", "set", "match"] as const).filter((mark) =>
    marks.includes(mark),
  );
  if (present.length === 1) return MARKS[present[0]].label;
  const names = present.map((mark) =>
    MARKS[mark].label.replace(/ point$/, "").toLowerCase(),
  );
  const list = `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
  return `${list[0].toUpperCase()}${list.slice(1)} points`;
}

/** The marks' own sizes, smallest first, as the key's swatch. */
function MarkSizes({ marks }: { marks: readonly AskMomentumMark[] }) {
  const sizes = (["break", "set", "match"] as const)
    .filter((mark) => marks.includes(mark))
    .map((mark) => MARKS[mark].radius);
  let x = 0;
  const circles = sizes.map((r) => {
    const cx = x + r;
    x += r * 2 + 2;
    return { cx, r };
  });
  return (
    <svg
      aria-hidden="true"
      width={Math.max(x - 2, 1)}
      height={10}
      viewBox={`0 0 ${Math.max(x - 2, 1)} 10`}
      className="shrink-0"
    >
      {circles.map(({ cx, r }) => (
        <circle key={cx} cx={cx} cy={5} r={r} fill="var(--viz-key)" />
      ))}
    </svg>
  );
}
