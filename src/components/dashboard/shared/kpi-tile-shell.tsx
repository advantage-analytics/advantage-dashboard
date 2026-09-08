/**
 * The KPI strip's server-safe half: the box, the geometry, and what a tile
 * draws before it has a number.
 *
 * Split out of `kpi-tile.tsx` because that file is `"use client"` and these
 * are not components a browser needs. Two things forced it:
 *
 * - **A string constant may not cross the client boundary.** Every export of
 *   a `"use client"` module is replaced on the server by a client reference,
 *   so a server component writing `className={KPI_VALUE_RULE}` was
 *   serialising a module reference where a Tailwind class belonged. Both
 *   day-zero strips did exactly that.
 * - **Day zero should cost no JavaScript.** A page showing the empty strip
 *   needs no motion runtime and no popover; with these here it loads neither.
 *
 * `kpi-tile.tsx` imports the geometry from here and re-exports only
 * `KpiTileStrip`; server code imports the rest from this file directly, so a
 * constant can never be reached through the client module by mistake.
 */

/** The sparkline's box. One source, so the real line and the ghost agree. */
export const SPARK_WIDTH = 80;
export const SPARK_HEIGHT = 28;
/** Keeps the stroke's round cap off the viewBox edge at either extreme. */
export const SPARK_PADDING = 2;

/**
 * Where the number's baseline falls in a 28px row of 28px type — the rule a
 * tile draws instead of a value before it has one.
 */
export const KPI_VALUE_RULE =
  "mb-1.5 h-0.5 w-[34px] shrink-0 rounded-[1px] bg-[var(--ink-200)]";

/**
 * The row under the value, at one height in every state.
 *
 * A trend line is 11px type and a hint is 10px, so a slot sized to its
 * contents grows by ~1.5px the moment a tile earns its trend — and with the
 * line now opening at two matches, that reflow runs through the strip tile by
 * tile over a single weekend, shifting everything below it on the page. The
 * floor holds it still; `min-h` rather than `h` so a hint that wraps in a
 * narrow tile grows the row instead of spilling out of the padding.
 */
export const KPI_NOTE_ROW = "flex min-h-[16.5px] shrink-0 items-center";

/** The label, in the one register every tile and every stand-in shares. */
export const KPI_LABEL =
  "max-w-full truncate text-[9px] font-normal uppercase leading-[13.5px] tracking-[2.5px] text-[var(--ink-400)]";

/**
 * One placeholder curve per tile, as y-values in 0..1 (0 is the top of the
 * box). Shapes only: grey, unlabelled and never derived from anything, so
 * they say "a chart lands here" without claiming a trend. Different per tile
 * so a strip of them does not read as one graphic repeated.
 */
const PLACEHOLDER_CURVES: readonly number[][] = [
  [0.83, 0.33, 1, 0, 0.5, 0.33],
  [1, 0.5, 0, 0.67, 0.17, 0.5],
  [0, 0.67, 0.33, 1, 0.5, 0.5],
  [1, 0.43, 0.71, 0, 0.57, 0.43],
  [0.75, 0.25, 0.5, 1, 0, 0.25],
];

/** The x/y mapping the real `Sparkline` uses, so both sit in the same box. */
function placeholderPoints(curve: readonly number[]): string {
  return curve
    .map((y, index) => {
      const x =
        SPARK_PADDING +
        (index / (curve.length - 1)) * (SPARK_WIDTH - SPARK_PADDING * 2);
      const yPx =
        SPARK_PADDING + y * (SPARK_HEIGHT - SPARK_PADDING * 2);
      return `${x.toFixed(2)},${yPx.toFixed(2)}`;
    })
    .join(" ");
}

function placeholderArea(points: string): string {
  const pts = points.split(" ");
  const first = pts[0].split(",")[0];
  const last = pts[pts.length - 1].split(",")[0];
  return `M ${first},${SPARK_HEIGHT} ${pts
    .map((p) => `L ${p}`)
    .join(" ")} L ${last},${SPARK_HEIGHT} Z`;
}

/**
 * The sparkline's box, drawn grey, for a tile with nothing to plot yet.
 *
 * `--ink-400` rather than the `#AAAAAA` it used to be spelled as: that hex is
 * the light value of the same token, and the token is what carries a legible
 * grey onto the dark surface. A hardcoded light hex was tolerable while this
 * lived in one day-zero-only file; it is drawn on the populated strip now.
 *
 * Gradient ids are index-derived rather than `useId`, which is what keeps this
 * a server component. Two strips sharing an index share one gradient def, and
 * the def is identical, so there is nothing to collide.
 */
export function PlaceholderSparkline({
  index,
  className = "",
}: {
  index: number;
  className?: string;
}) {
  const points = placeholderPoints(
    PLACEHOLDER_CURVES[index % PLACEHOLDER_CURVES.length]
  );
  const line = `kpi-ghost-line-${index}`;
  const area = `kpi-ghost-area-${index}`;

  return (
    <svg
      width={SPARK_WIDTH}
      height={SPARK_HEIGHT}
      viewBox={`0 0 ${SPARK_WIDTH} ${SPARK_HEIGHT}`}
      className={`shrink-0 ${className}`}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={line} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="var(--ink-400)" stopOpacity={0.18} />
          <stop offset="100%" stopColor="var(--ink-400)" stopOpacity={0.7} />
        </linearGradient>
        <linearGradient id={area} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--ink-400)" stopOpacity={0.1} />
          <stop offset="100%" stopColor="var(--ink-400)" stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={placeholderArea(points)} fill={`url(#${area})`} />
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

/** Card container for a row of KPI tiles. */
export function KpiTileStrip({
  children,
  collapse = false,
}: {
  children: React.ReactNode;
  /**
   * Show fewer tiles rather than narrower ones as the strip loses width.
   *
   * A tile needs 184px to hold "BREAK POINTS SAVED", Home's longest label, on
   * one line inside its 20px padding. With this on, the fifth tile goes below
   * 920px of strip and the fourth below 736px — so every tile keeps the same
   * height at every width, which is the point: a label that wrapped made the
   * whole strip a row taller on a tablet and nowhere else.
   *
   * A container query, not a media query, because the sidebar takes either
   * 64px or 232px of the window: the same 1280px window holds five tiles with
   * the rail and four with the panel open. Hidden tiles stay mounted, so a
   * customised selection survives a resize; the strip only decides what fits.
   *
   * Off by default, and off for match detail — a strip of four whose labels
   * run to "First serve points won" would start dropping statistics from the
   * page a player opened to read them. There the label ellipsizes instead.
   *
   * The rule itself is `.adv-kpi-strip` in globals.css: it needs a container
   * query over `nth-child`, which is one composition Tailwind's variants drop
   * on the floor.
   */
  collapse?: boolean;
}) {
  return (
    <div
      className={`${collapse ? "adv-kpi-strip " : ""}overflow-hidden rounded-[14px] border border-[var(--border-card)] bg-white shadow-card`}
    >
      <div className="flex flex-wrap sm:flex-nowrap">{children}</div>
    </div>
  );
}

/**
 * The strip before any figure exists: every region labelled, none of them
 * filled — a rule where the value goes and a grey curve where the line will.
 *
 * One component for both Homes. They were written twice and had already
 * drifted apart on the note row's height and on which grey the label used,
 * which is the whole failure the shared tile exists to prevent. The tile
 * anatomy here is `KpiTile`'s, through the same constants it renders from.
 */
export function EmptyKpiStrip({
  labels,
  awaitingReport = false,
  hint: hintOverride,
  collapse = false,
  ariaLabel,
}: {
  labels: readonly string[];
  /**
   * A match is filed but nothing has been analysed yet. "After your first
   * match" to someone who has just sent one is a page that did not notice, so
   * the trend row names what is actually being waited on. Both strings are the
   * ones SKILL.md's day-zero section ratifies, and they live here once — the
   * two Homes used to each carry the same ternary in a wrapper of their own.
   */
  awaitingReport?: boolean;
  /**
   * A sentence the page owns, for a state the boolean cannot name — Team
   * Home's "reports back, none on a dual lineup". Wins over both defaults.
   */
  hint?: string;
  collapse?: boolean;
  ariaLabel?: string;
}) {
  const hint = hintOverride ?? (awaitingReport ? "When the report lands" : "After your first match");
  return (
    <div aria-label={ariaLabel} role={ariaLabel ? "group" : undefined}>
      <p className="sr-only">No figures yet. {hint}.</p>
      <KpiTileStrip collapse={collapse}>
        {labels.map((label, index) => (
          <div
            key={label}
            className="flex min-w-0 flex-1 flex-col gap-3 overflow-hidden px-5 py-5"
          >
            {/* One line like the shipped label: the strip drops tiles before a
                default label would need to wrap, so the tile's measured height
                holds at every width. */}
            <p className={KPI_LABEL}>{label}</p>
            <div className="flex h-7 shrink-0 items-end overflow-hidden">
              <span className={KPI_VALUE_RULE} aria-hidden="true" />
              <div className="flex-1" />
              <PlaceholderSparkline index={index} />
            </div>
            <div className={KPI_NOTE_ROW}>
              <p className="text-[10px] font-normal leading-[1.4] text-[var(--ink-400)]">
                {hint}
              </p>
            </div>
          </div>
        ))}
      </KpiTileStrip>
    </div>
  );
}
