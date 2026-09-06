import { KpiTileStrip } from "@/components/dashboard/shared/kpi-tile";
import { DEFAULT_KPI_LABELS } from "@/lib/data/performance-server";

/**
 * The KPI strip on day zero: present, shaped, and holding no numbers.
 *
 * The strip stays on the page before a match exists because the page you
 * learn on the first visit should be the page you keep using — the same rule
 * Team Home follows. Emptying it rather than removing it means every region a
 * report will fill is already labelled, so a player reads "break points saved"
 * and knows what is coming back without a single figure being invented.
 *
 * Each tile keeps the shipped anatomy exactly (`KpiTile`): 20px padding, a
 * 12px row gap, a 9px label on a 13.5px line at 2.5px tracking, a 28px value
 * row and a 16.5px trend row. Both fixed rows carry `shrink-0` because they
 * are flex items and would otherwise collapse to their content.
 *
 * Two substitutions, and only two. A short rule sits on the value's baseline
 * where the number goes. And the sparkline keeps its 80×28 box, drawn grey and
 * fading left to right, with a different shape per tile so the strip does not
 * read as one graphic repeated five times.
 */

/** Where the number's baseline falls in a 28px row of 28px type. */
const VALUE_RULE = "mb-1.5 h-0.5 w-[34px] shrink-0 rounded-[1px] bg-[var(--ink-200)]";

/**
 * One placeholder curve per tile, in the sparkline's own coordinate space
 * (80×28, 2px inset — see `Sparkline` in `shared/kpi-tile.tsx`). Shapes only:
 * grey, unlabelled and never derived from anything, so they say "a chart lands
 * here" without claiming a trend.
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

function PlaceholderSparkline({ index }: { index: number }) {
  const points = CURVES[index % CURVES.length];
  const line = `kpi-empty-line-${index}`;
  const area = `kpi-empty-area-${index}`;

  return (
    <svg width="80" height="28" viewBox="0 0 80 28" className="shrink-0" aria-hidden="true">
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

export function KpiStripEmpty({
  awaitingReport = false,
}: {
  /**
   * A match is filed but nothing has been analysed yet. "After your first
   * match" to someone who has just sent one is a page that did not notice, so
   * the trend row names what is actually being waited on.
   */
  awaitingReport?: boolean;
}) {
  const hint = awaitingReport ? "When the report lands" : "After your first match";

  return (
    <KpiTileStrip collapse>
      {DEFAULT_KPI_LABELS.map((label, index) => (
        <div
          key={label}
          className="flex min-w-0 flex-1 flex-col gap-3 overflow-hidden px-5 py-5"
        >
          {/* One line like the shipped label (see `KpiTile`): the strip drops
              tiles before a default label would need to wrap, so the tile's
              measured height holds at every width. */}
          <p className="max-w-full truncate text-[9px] font-normal uppercase leading-[13.5px] tracking-[2.5px] text-[var(--ink-400)]">
            {label}
          </p>
          <div className="flex h-7 shrink-0 items-end overflow-hidden">
            <span className={VALUE_RULE} aria-hidden="true" />
            <div className="flex-1" />
            <PlaceholderSparkline index={index} />
          </div>
          {/* `min-h`, not `h`: one line is the measured 16.5px; where the hint
              wraps in a narrow tile the row grows instead of spilling out of
              the tile's padding. */}
          <div className="flex min-h-[16.5px] shrink-0 items-center">
            <p className="text-[10px] font-normal leading-[1.4] text-[var(--ink-400)]">{hint}</p>
          </div>
        </div>
      ))}
    </KpiTileStrip>
  );
}
