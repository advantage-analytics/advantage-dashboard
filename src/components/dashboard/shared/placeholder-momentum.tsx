/**
 * The grey momentum line that stands where the performance tracker's line
 * will be — `PlaceholderSparkline`'s promise at the tracker's size: a chart
 * lands here. Drawn by the tracker's loading skeleton and by its empty state
 * (fewer than two tagged points). Grey, unlabelled and never derived from
 * anything, so it says that without claiming who led: a coloured line would
 * look like data; this does not.
 *
 * It is drawn the way the real one is (`performance-tracker-chart.tsx`): one
 * straight step per point, up for a point won and down for a point lost,
 * level again at the set break (one point-wide step back to the midline),
 * with the set boundary and the midline under it and the gap to the midline
 * washed. One even 1.5px stroke, as the real
 * line keeps at any slope (`non-scaling-stroke`); the wash and line are the
 * ink-400 token, as skeleton markup carries no hex.
 */

/** The plot's coordinate space — the tracker's `CHART_W` × `CHART_H`. */
const W = 1000;
const H = 96;
const MID = H / 2;
/** Vertical size of one point's step, in plot units. */
const STEP = 3.4;

/**
 * A fixed rally of won (`+`) and lost (`-`) points, one string per set: the
 * first set swings to one side and back, the second the other way. Never
 * random, so the line is the same on every render.
 */
const SETS = [
  "+-++-+++-++-+--+-++++-+-++---+-+--+-+-",
  "--+---+-+--+---+--++-+-++-+++-++-+",
];

const { path, boundaries } = (() => {
  const total = SETS.reduce((n, set) => n + set.length + 1, 0) - 1;
  // One decimal: the markup stays short and the line looks the same.
  const x = (i: number) => Math.round((i / total) * W * 10) / 10;
  const pts: [number, number][] = [];
  const bounds: number[] = [];
  let i = 0;
  SETS.forEach((set, s) => {
    if (s > 0) bounds.push(x(i));
    let level = 0;
    pts.push([x(i), MID]);
    for (const ch of set) {
      i += 1;
      level += ch === "+" ? 1 : -1;
      pts.push([x(i), MID - level * STEP]);
    }
    i += 1;
  });
  return { path: pts, boundaries: bounds };
})();

const points = path.map(([px, py]) => `${px},${py}`).join(" ");
const area = `M 0,${MID} ${path.map(([px, py]) => `L ${px},${py}`).join(" ")} L ${W},${MID} Z`;

export function PlaceholderMomentum({
  height = 104,
}: {
  /** The plot's CSS height — the tracker's `PLOT_H`. */
  height?: number;
}) {
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      className="block w-full"
      style={{ height }}
      aria-hidden="true"
    >
      {boundaries.map((bx) => (
        <line
          key={bx}
          x1={bx}
          y1={0}
          x2={bx}
          y2={H}
          stroke="var(--ink-200)"
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
        />
      ))}
      <line
        x1={0}
        y1={MID}
        x2={W}
        y2={MID}
        stroke="var(--ink-200)"
        strokeWidth={1}
        vectorEffect="non-scaling-stroke"
      />
      <path d={area} fill="var(--ink-400)" fillOpacity={0.08} />
      <polyline
        points={points}
        fill="none"
        stroke="var(--ink-400)"
        strokeOpacity={0.55}
        strokeWidth={1.5}
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
