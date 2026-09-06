/**
 * The half court, empty, for the serve-placement card before any match exists.
 *
 * Geometry is `serve-placement-widget.tsx`'s own, unchanged: the baseline runs
 * across the top, the service line at y=155, the centre service line down to
 * the net at y=331, and the four dashed edges that divide each box into wide,
 * body and T. (The widget's constant for the net is named `BASELINE_Y`; its
 * dot mapping puts the net there, which is what this drawing follows.)
 *
 * It is the one empty state on this page that is not a placeholder. A rule
 * where a number goes stands in for data; an empty court is the object itself
 * in its empty state, the way an empty inbox shows the inbox rather than grey
 * rectangles where mail would sit.
 *
 * Lines only, no fill, no zone names: one weight for the court with the net a
 * shade stronger, because the net is the edge every serve is measured against.
 *
 * Sized by its caller. The court is the only continuous dimension on Home —
 * every other region's height is set by its content — so it is the one thing
 * that can level the two columns without stretching a card into trapped
 * surface. How it does that is the caller's decision: the default here is a
 * width cap for a card that sizes itself; the day-zero strip instead lets the
 * court fill whatever height its column leaves, because the left column's
 * height moves with the sidebar (the heatmap's cells scale with its width)
 * and no single cap levels both states.
 */
export function ServePlacementCourt({
  className = "mx-auto block h-auto w-full max-w-[270px]",
}: {
  className?: string;
}) {
  return (
    <svg
      viewBox="-2 -2 451 354"
      className={className}
      role="img"
      aria-label="Half court diagram with the six serve zones marked"
    >
      <g
        stroke="var(--ink-200)"
        strokeWidth={1.5}
        strokeLinecap="round"
        fill="none"
      >
        <line x1={37.4} y1={0} x2={410.9} y2={0} />
        <line x1={37.4} y1={0} x2={37.4} y2={331} />
        <line x1={410.9} y1={0} x2={410.9} y2={331} />
        <line x1={84.2} y1={0} x2={84.2} y2={331} />
        <line x1={362.4} y1={0} x2={362.4} y2={331} />
        <line x1={84.2} y1={155} x2={362.4} y2={155} />
        <line x1={223.3} y1={155} x2={223.3} y2={331} />
      </g>
      <g stroke="var(--ink-100)" strokeWidth={1} strokeDasharray="5,5" fill="none">
        <line x1={130.5} y1={155} x2={130.5} y2={331} />
        <line x1={176.9} y1={155} x2={176.9} y2={331} />
        <line x1={269.7} y1={155} x2={269.7} y2={331} />
        <line x1={316.1} y1={155} x2={316.1} y2={331} />
      </g>
      <line
        x1={0}
        y1={331}
        x2={447}
        y2={331}
        stroke="var(--ink-300)"
        strokeWidth={2}
        strokeLinecap="round"
      />
    </svg>
  );
}
