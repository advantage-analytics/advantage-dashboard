import { formatDelta } from "@/lib/data/match-utils";
import { sampleNote, type TeamKpiTile } from "@/lib/data/team-kpi";

/**
 * 45d / 44a — the program's figures, up to four of them, and the honesty
 * around them.
 *
 * **It renders or it does not.** An empty `tiles` array mounts nothing at all:
 * no skeleton, no dashed placeholder, no strip of em dashes waiting to be
 * filled. That is round 45's rule for this page in general — the same reason
 * the dual sheet above is absent most weeks — and the round states it about
 * this strip specifically: *never a skeleton strip on day zero*. A coach whose
 * first morning shows `0–0`, `—%`, `—%`, `0` has been taught that the product
 * is broken, and nothing later un-teaches it.
 *
 * **Between one and four tiles.** The loader drops any figure with no rows
 * behind it rather than printing a zero for it: a program that has never
 * decided a dual arrives without `dual-record`, one that has never uploaded
 * video without `first-serve`, and a program whose matches cannot be
 * attributed to it without `sets-won`. Only `matches-analyzed` is always
 * there, because it is the count the day-zero gate is drawn from. The full
 * table of which tile is absent when lives on `teamKpis()` in
 * `lib/data/team-home-server.ts`. This file lays out however many arrive, in
 * whatever order they come, and asks no questions about the set.
 *
 * **This file draws; it does not decide.** Which figures exist, what counts as
 * a small sample and whether a trend has been earned are all resolved in
 * `lib/data/team-kpi.ts`, beside the thresholds themselves — the wording of
 * the caveat included, because the wording IS the threshold made visible.
 *
 * The tile vocabulary is the personal dashboard's
 * (`components/dashboard/shared/kpi-tile.tsx`): a 9px letter-spaced label, a
 * 28px light value in tabular figures, an 80×28 sparkline sharing the value's
 * baseline, and one signed line beneath. What is deliberately NOT carried over
 * is that file's hardcoded palette, its customizer, its Recharts popover and
 * its Framer entrance — this page is built on v2 tokens and is server-rendered
 * throughout, and none of the interactive parts have anything to do on a card
 * whose whole job is at most four read-only numbers.
 */

/** How wide a sparkline is, and how tall. Shared by the geometry below. */
const SPARK_WIDTH = 80;
const SPARK_HEIGHT = 28;
/** Keeps the stroke's round cap off the viewBox edge at either extreme. */
const SPARK_PADDING = 2;

/**
 * The series, drawn.
 *
 * Colour comes from `formatDelta` — the same green/red/neutral the roster's
 * serve column uses for the same kind of fact — so the line and the number
 * under it can never disagree about which way things went. Gradient ids are
 * built from the tile key rather than a `useId`, which is what keeps this a
 * server component; keys are unique within a strip by construction.
 */
function Sparkline({
  points,
  color,
  id,
}: {
  points: number[];
  color: string;
  id: string;
}) {
  // Two points are a line segment, not a trend. The loader's gates already
  // prevent this; the guard is here so the component cannot be made to lie by
  // a future caller either.
  if (points.length < 2) return null;

  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;

  const coords = points.map((value, index) => ({
    x:
      SPARK_PADDING +
      (index / (points.length - 1)) * (SPARK_WIDTH - SPARK_PADDING * 2),
    y:
      SPARK_HEIGHT -
      SPARK_PADDING -
      ((value - min) / range) * (SPARK_HEIGHT - SPARK_PADDING * 2),
  }));

  const line = coords.map((point) => `${point.x},${point.y}`).join(" ");
  const area = `M ${coords[0].x},${SPARK_HEIGHT} ${coords
    .map((point) => `L ${point.x},${point.y}`)
    .join(" ")} L ${coords[coords.length - 1].x},${SPARK_HEIGHT} Z`;

  return (
    <svg
      width={SPARK_WIDTH}
      height={SPARK_HEIGHT}
      viewBox={`0 0 ${SPARK_WIDTH} ${SPARK_HEIGHT}`}
      /* Hidden below `sm`: at two tiles across a phone the line would sit on
         top of the value it belongs to. The value and the signed change are
         the information; the shape is the supplement. */
      className="kpi-spark hidden shrink-0 sm:block"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={`${id}-line`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor={color} stopOpacity={0.3} />
          <stop offset="100%" stopColor={color} stopOpacity={1} />
        </linearGradient>
        <linearGradient id={`${id}-area`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.1} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${id}-area)`} />
      <polyline
        points={line}
        fill="none"
        stroke={`url(#${id}-line)`}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function Tile({ tile }: { tile: TeamKpiTile }) {
  const note = sampleNote(tile);
  const delta = tile.change === null ? null : formatDelta(tile.change);

  return (
    /* `min-w-[50%]` against `flex-1` is what puts two tiles on a phone row and
       four on a desktop one: below `sm` no tile may be narrower than half the
       card, so the third wraps. Above it the floor lifts and the four share the
       width evenly. */
    <div className="flex min-w-[50%] flex-1 flex-col gap-3 px-5 py-5 sm:min-w-0 sm:px-6">
      {/* Wraps rather than overflows on the narrowest phones — the row's tiles
          stretch together, so a two-line label costs alignment nothing. Held to
          one line from `sm` up, which is the strip's real shape. */}
      <p className="eyebrow-sm sm:whitespace-nowrap">{tile.label}</p>

      <div className="flex items-end justify-between gap-3 overflow-hidden">
        <span className="tabular text-[28px] leading-none font-light tracking-[-0.5px] text-[var(--ink-900)]">
          {tile.value}
        </span>
        {delta ? (
          <Sparkline
            points={tile.sparkline}
            color={delta.color}
            id={`spark-${tile.key}`}
          />
        ) : null}
      </div>

      {/* One slot, three occupants, one height — a strip whose tiles are
          different heights because one of them earned a trend is a strip that
          reflows as the season goes on. It holds its height while empty, which
          is what a tally past the threshold leaves it — no trend to draw and
          no caveat left to state. */}
      <div className="flex min-h-[16px] items-center gap-1.5">
        {delta ? (
          <>
            <span className="tabular text-[11px]" style={{ color: delta.color }}>
              {delta.label}
            </span>
            <span className="text-[11px] text-[var(--ink-600)]">vs earlier</span>
          </>
        ) : note ? (
          /* --ink-600, not --ink-500. This line is the point of the tile when
             it appears — the sample the figure above rests on — and the ramp's
             own rule is that a grey which must be READ is 600 or darker. */
          <span className="text-[11px] text-[var(--ink-600)]">{note}</span>
        ) : null}
      </div>
    </div>
  );
}

export function KpiStrip({ tiles }: { tiles: TeamKpiTile[] }) {
  if (tiles.length === 0) return null;

  return (
    <section
      aria-label="Program summary"
      /* Nothing is ruled between the tiles — round 44's rule for every card on
         this page. The card's own border is the only line it draws, and the
         padding inside each tile is what separates them. */
      className="flex flex-wrap rounded-[var(--radius-card)] border border-[var(--border-medium)] sm:flex-nowrap"
    >
      {tiles.map((tile) => (
        <Tile key={tile.key} tile={tile} />
      ))}
    </section>
  );
}
