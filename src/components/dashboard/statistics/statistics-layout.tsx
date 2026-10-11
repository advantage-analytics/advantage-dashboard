import { useId, type ReactNode } from "react";
import { changeTone, type ChangeTone } from "@/lib/data/statistics";

/**
 * The personal Statistics page's geometry, in one place.
 *
 * Read by the page, its skeleton, its day zero and every region, so the
 * loading frame mirrors the loaded one by construction rather than by a
 * second copy of the same classes. Layout is the design frame's
 * (`project/Statistics.dc.html`): a 20/56/32 padded column capped at 1536px
 * with 24px between regions; colours and type are this codebase's tokens.
 *
 * No hooks beyond `useId` and no `"use client"`: a Server Component (the
 * route's `loading.tsx`) renders these as readily as a client one.
 */

/** The page's white ground — what a `PendingFrame` stands in for while loading. */
export function StatisticsGround({ children }: { children: ReactNode }) {
  return (
    <div className="flex w-full flex-1 flex-col bg-[var(--surface-card)]">
      {children}
    </div>
  );
}

/** The padded column every state of the page sits in. */
export function StatisticsColumn({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto flex w-full max-w-screen-2xl flex-1 flex-col gap-6 px-14 pt-5 pb-8">
      {children}
    </div>
  );
}

/** The stack of regions under the title row. */
export const STATISTICS_STACK = "flex flex-col gap-6";

/** Trend beside By opponent type; the second wraps under below ~900px. */
export const STATISTICS_TREND_ROW = "flex flex-wrap items-start gap-6";
export const STATISTICS_TREND_SLOT = "min-w-0 flex-[999_1_520px]";
export const STATISTICS_OPPONENT_SLOT =
  "max-w-[400px] min-w-0 flex-[1_1_340px]";

/** Rally length, How points ended, and whatever joins them. */
export const STATISTICS_TAIL_GRID =
  "grid grid-cols-[repeat(auto-fit,minmax(300px,1fr))] items-start gap-6";

/** All statistics: the label, then Average · Rolling · Change · Last 8 · Opponents. */
export const STATISTICS_TABLE_GRID =
  "grid grid-cols-[minmax(200px,1fr)_72px_72px_64px_96px_88px] items-center gap-x-4";

/** The table's column, which the card scrolls sideways under ~760px. */
export const STATISTICS_TABLE_COLUMN = "flex min-w-[720px] flex-col";

/** The column-label row: the grid, a hairline under it and nothing between rows. */
export const STATISTICS_TABLE_HEAD = `${STATISTICS_TABLE_GRID} border-b border-[var(--border-hairline)] pb-[11px]`;

/** One column label. Opponents is the quiet one, as its figures are. */
export const STATISTICS_TABLE_HEAD_CELL = "text-right text-[12px] font-medium";

/** A group's title row, off the grid: it heads the rows, not a column. */
export const STATISTICS_TABLE_GROUP_HEAD = "flex items-baseline pt-3 pb-0.5";

/**
 * One statistic's row. The 8px it reaches past the grid on either side is the
 * hover and selected wash's inset — the cells stay on the header's tracks.
 */
export const STATISTICS_TABLE_ROW = `${STATISTICS_TABLE_GRID} -mx-2 min-h-[30px] rounded-[var(--radius-element)] px-2`;

export const STATISTICS_TABLE_LABEL = "min-w-0 truncate text-[13px]";

/** The five measures, in column order. `Rolling` gains its window once known. */
export const STATISTICS_TABLE_COLUMNS = [
  "Average",
  "Rolling",
  "Change",
  "Last 8",
  "Opponents",
] as const;

/**
 * The All statistics card. Not a `RegionCard`: the frame scrolls the eyebrow
 * and the note WITH the table, so both sit inside the 720px column, 14px
 * above the column labels.
 */
export function StatisticsTableCard({
  note,
  children,
}: {
  /** The "Last 5 matches against the 5 before · 22 matches" line, or its bar. */
  note: ReactNode;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <section
      aria-labelledby={id}
      className="surface-card overflow-x-auto p-[var(--pad-card)]"
    >
      <div className={STATISTICS_TABLE_COLUMN}>
        <div className="flex items-baseline gap-3 pb-3.5">
          <h2 id={id} className="eyebrow">
            All statistics
          </h2>
          <div className="flex-1" />
          {note}
        </div>
        {children}
      </div>
    </section>
  );
}

const TONE_COLOR: Record<ChangeTone, string> = {
  good: "var(--viz-good)",
  bad: "var(--viz-bad)",
  flat: "var(--ink-500)",
};

/**
 * The change between this window and the one before, as the DS `Delta`:
 * a Unicode arrow that travels with its colour. The arrow is the direction
 * the number moved; the colour is whether that is good (`changeTone`), which
 * flips for a statistic where lower is better.
 *
 * One delta for the page: the Trend card's readout and the table's Change
 * column both print this.
 */
export function trendDelta(
  change: number,
  lowerIsBetter: boolean,
): { text: string; spoken: string; color: string } {
  const size = `${Math.abs(change)}`;
  const color = TONE_COLOR[changeTone(change, lowerIsBetter)];
  if (change === 0) return { text: "→ 0", spoken: "No change", color };
  const up = change > 0;
  return {
    text: `${up ? "↑" : "↓"} ${size}`,
    spoken: `${up ? "Up" : "Down"} ${size}`,
    color,
  };
}

/** The split rows of By opponent type: label, track, value. */
export const STATISTICS_SPLIT_GRID =
  "grid grid-cols-[minmax(0,1fr)_88px_36px] items-center gap-3";

/**
 * The rows By opponent type holds before it has a figure: the two closed
 * lists. A court is free text, so it has no row until a match names one.
 */
export const STATISTICS_SPLIT_ANATOMY = [
  { title: "Hand", rows: ["Right-handed", "Left-handed"] },
  { title: "Backhand", rows: ["Two-handed", "One-handed"] },
];

/**
 * The title row: the 30px page title over one line of facts.
 *
 * No primary beside it — this page reads matches, it does not start one.
 */
export function StatisticsTitleFrame({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col items-start">
      <h1 className="text-display">Statistics</h1>
      <div className="mt-[9px] flex h-[18px] items-baseline gap-3">
        {children}
      </div>
    </div>
  );
}

/** The card every region sits in: `surface-card`, 20px, a 12px column. */
export function RegionCard({
  title,
  subject,
  aside,
  className = "",
  children,
}: {
  title: string;
  /** What the card is about, beside its title — the Trend card's statistic. */
  subject?: ReactNode;
  /** What sits at the right of the header row. */
  aside?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <section
      aria-labelledby={id}
      className={`surface-card flex min-w-0 flex-col gap-3 p-[var(--pad-card)] ${className}`}
    >
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-2">
        <h2 id={id} className="eyebrow">
          {title}
        </h2>
        {subject}
        <div className="flex-1" />
        {aside}
      </div>
      {children}
    </section>
  );
}

/* ── Trend ────────────────────────────────────────────────────────────────── */

/** The Trend plot's box: the frame's 760×250, as wide as the card. */
export const STATISTICS_TREND_PLOT = "aspect-[760/250] w-full";

function LegendKey({ swatch, children }: { swatch: string; children: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        aria-hidden="true"
        className="size-1.5 rounded-[2px]"
        style={{ background: swatch }}
      />
      <span className="text-micro" style={{ color: "var(--ink-600)" }}>
        {children}
      </span>
    </span>
  );
}

/**
 * The hairline row under the Trend plot: what each mark is, then how many
 * matches are drawn. Shared with the skeleton, which knows the marks and not
 * yet the window or the count.
 *
 * The swatches are the CSS twins of the hues `KpiDetailChart` draws with
 * (`VIZ_BLUE`, `VIZ_BLUE_DEEP`, `VIZ_SLATE_LIGHT` in `data-viz.ts`).
 */
export function TrendLegend({
  rolling,
  caption,
}: {
  /** "Rolling 5"; omitted when the window is Off and no such line is drawn. */
  rolling?: string;
  /** The "N matches" caption, or the skeleton's bar for it. */
  caption: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1 border-t border-[var(--border-hairline)] pt-3">
      <LegendKey swatch="var(--viz-you)">Each match</LegendKey>
      {rolling && <LegendKey swatch="var(--viz-you-deep)">{rolling}</LegendKey>}
      <LegendKey swatch="var(--viz-opp-mid)">Average</LegendKey>
      <div className="flex-1" />
      {caption}
    </div>
  );
}

/* ── By opponent type ─────────────────────────────────────────────────────── */

/** One titled run of split rows. Shared with the skeleton. */
export function SplitGroup({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5 pt-1">
      <h3 className="eyebrow-sm">{title}</h3>
      {children}
    </div>
  );
}

/**
 * One split row on `STATISTICS_SPLIT_GRID`: the label, a 4px track, the value.
 * `track` and `value` are the caller's — a fill and a figure, a bar each
 * while loading, or nothing and a dash.
 */
export function SplitRow({
  label,
  count,
  track,
  value,
}: {
  label: string;
  /** How many matches the row averages, printed after the label. */
  count?: number;
  track: ReactNode;
  value: ReactNode;
}) {
  return (
    <div className={STATISTICS_SPLIT_GRID}>
      <span className="truncate text-[12px] text-[var(--ink-700)]">
        {label}
        {count !== undefined && (
          <>
            {" "}
            <span className="mono tabular text-[10px] text-[var(--ink-400)]">
              {count}
            </span>
            <span className="sr-only">
              {count === 1 ? " match" : " matches"}
            </span>
          </>
        )}
      </span>
      {track}
      <span className="text-right">{value}</span>
    </div>
  );
}

/** The hairline row that closes the card: which statistic, over how many. */
export function SplitFooter({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-baseline border-t border-[var(--border-hairline)] pt-3">
      {children}
    </div>
  );
}
