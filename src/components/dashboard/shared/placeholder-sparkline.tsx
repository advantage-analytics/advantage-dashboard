/**
 * The grey curve that stands where a sparkline will be.
 *
 * Drawn on the day-zero strip in every tile, and on a live tile that holds
 * its first value but not yet a second — "1 more match for a trend". Both
 * make the same promise: a chart lands here. Grey, unlabelled and never
 * derived from anything, so it says that without claiming a direction. A
 * coloured line through one point would look like data; this does not.
 *
 * Shapes are in the sparkline's own coordinate space (80×28, 2px inset — see
 * `Sparkline` in `kpi-tile.tsx`), one per tile index so a strip of five does
 * not read as one graphic repeated.
 */
const CURVES: readonly string[] = [
  "2,22 17.2,10 32.4,26 47.6,2 62.8,14 78,10",
  "2,26 17.2,14 32.4,2 47.6,18 62.8,6 78,14",
  "2,2 17.2,18 32.4,10 47.6,26 62.8,14 78,14",
  "2,26 17.2,12.3 32.4,19.1 47.6,2 62.8,15.7 78,12.3",
  "2,20 17.2,8 32.4,14 47.6,26 62.8,2 78,8",
];

function areaPath(points: string): string {
  const pts = points.split(" ");
  const first = pts[0].split(",")[0];
  const last = pts[pts.length - 1].split(",")[0];
  return `M ${first},28 ${pts.map((p) => `L ${p}`).join(" ")} L ${last},28 Z`;
}

export function PlaceholderSparkline({
  index,
  className = "shrink-0",
}: {
  index: number;
  className?: string;
}) {
  const points = CURVES[index % CURVES.length];
  const line = `kpi-empty-line-${index}`;
  const area = `kpi-empty-area-${index}`;

  return (
    <svg
      width="80"
      height="28"
      viewBox="0 0 80 28"
      className={className}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={line} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#AAAAAA" stopOpacity={0.18} />
          <stop offset="100%" stopColor="#AAAAAA" stopOpacity={0.7} />
        </linearGradient>
        <linearGradient id={area} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#AAAAAA" stopOpacity={0.1} />
          <stop offset="100%" stopColor="#AAAAAA" stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={areaPath(points)} fill={`url(#${area})`} />
      <polyline
        points={points}
        fill="none"
        stroke={`url(#${line})`}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
