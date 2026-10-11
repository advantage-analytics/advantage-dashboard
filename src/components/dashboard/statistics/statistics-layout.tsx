import { useId, type ReactNode } from "react";

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

/** The split rows of By opponent type: label, track, value. */
export const STATISTICS_SPLIT_GRID =
  "grid grid-cols-[minmax(0,1fr)_88px_36px] items-center gap-3";

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
  aside,
  className = "",
  children,
}: {
  title: string;
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
        <div className="flex-1" />
        {aside}
      </div>
      {children}
    </section>
  );
}
