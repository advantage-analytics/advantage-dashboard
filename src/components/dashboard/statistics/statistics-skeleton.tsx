import type { ReactNode } from "react";
import { HomeKpisPending } from "@/components/dashboard/loading/home-skeleton";
import {
  PendingBar,
  PendingFrame,
  PendingRegion,
} from "@/components/dashboard/loading/pending";
import { STATISTIC_GROUPS } from "@/lib/data/statistics";
import {
  RegionCard,
  STATISTICS_OPPONENT_SLOT,
  STATISTICS_SPLIT_GRID,
  STATISTICS_STACK,
  STATISTICS_TABLE_GRID,
  STATISTICS_TAIL_GRID,
  STATISTICS_TREND_PLOT,
  STATISTICS_TREND_ROW,
  STATISTICS_TREND_SLOT,
  StatisticsColumn,
  StatisticsTitleFrame,
  TrendLegend,
} from "./statistics-layout";

/**
 * The Statistics page while its season is read.
 *
 * One body, two wrappers. `StatisticsSkeleton` is the route's `loading.tsx`:
 * a `PendingFrame` on the page's white ground. `StatisticsPending` is the
 * page's own Suspense fallback: the same body in a `PendingRegion`, because
 * by then the page has drawn the ground and the column itself.
 *
 * Everything the page knows before the read is real text — the title, every
 * card's eyebrow, the table's fifteen row labels and its column heads, the
 * control labels — and only what is arriving is a bar (Carbon: show what you
 * already know). The geometry is `statistics-layout.tsx`'s, the same
 * constants the loaded page lays out with, so nothing moves when it lands.
 */

/** The three selects, at the widths their triggers hold at rest. */
const CONTROLS = [
  { label: "Opponent", box: "w-[168px]" },
  { label: "Opponent type", box: "w-[200px]" },
  { label: "Matches", box: "w-[168px]" },
];

/** Off · 3 · 5 · 10. */
const WINDOW_PILLS = 4;

const TABLE_COLUMNS = ["Average", "Rolling", "Change", "Last 8", "Opponents"];

const SPLITS = [
  { title: "Hand", rows: ["Right-handed", "Left-handed"] },
  { title: "Backhand", rows: ["Two-handed", "One-handed"] },
];

function ControlPending({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[11px] leading-[1.4] text-[var(--ink-600)]">
        {label}
      </span>
      {children}
    </div>
  );
}

function StatisticsPendingBody() {
  return (
    <>
      <StatisticsTitleFrame>
        <PendingBar className="h-3 w-72 rounded" />
      </StatisticsTitleFrame>

      <div className={STATISTICS_STACK}>
        {/* `StatisticsControls`' row: a 30px box per select, four pills. */}
        <div className="flex flex-wrap items-end gap-x-4 gap-y-3">
          {CONTROLS.map((control) => (
            <ControlPending key={control.label} label={control.label}>
              <PendingBar className={`h-[30px] rounded-[6px] ${control.box}`} />
            </ControlPending>
          ))}
          <div className="flex-1" />
          <ControlPending label="Rolling window, in matches">
            <span className="flex h-[30px] w-[200px] items-center gap-1">
              {Array.from({ length: WINDOW_PILLS }, (_, i) => (
                <PendingBar key={i} className="h-[26px] flex-1 rounded-full" />
              ))}
            </span>
          </ControlPending>
        </div>

        <HomeKpisPending />

        <div className={STATISTICS_TREND_ROW}>
          <div className={STATISTICS_TREND_SLOT}>
            <RegionCard
              title="Trend"
              subject={<PendingBar className="h-3 w-36" />}
              aside={<PendingBar className="h-4 w-48" />}
            >
              <PendingBar
                className={`${STATISTICS_TREND_PLOT} h-auto rounded-[4px]`}
              />
              <TrendLegend caption={<PendingBar className="h-[11px] w-16" />} />
            </RegionCard>
          </div>
          <div className={STATISTICS_OPPONENT_SLOT}>
            <RegionCard title="By opponent type">
              {SPLITS.map((split) => (
                <div key={split.title} className="flex flex-col gap-1.5 pt-1">
                  <span className="eyebrow-sm">{split.title}</span>
                  {split.rows.map((row) => (
                    <div key={row} className={STATISTICS_SPLIT_GRID}>
                      <span className="truncate text-[12px] text-[var(--ink-700)]">
                        {row}
                      </span>
                      <PendingBar className="h-1" />
                      <PendingBar className="ml-auto w-7" />
                    </div>
                  ))}
                </div>
              ))}
              <div className="flex items-baseline gap-2.5 border-t border-[var(--border-hairline)] pt-3">
                <PendingBar className="h-[11px] w-32" />
                <div className="flex-1" />
                <PendingBar className="h-[11px] w-16" />
              </div>
            </RegionCard>
          </div>
        </div>

        <RegionCard
          title="All statistics"
          className="overflow-x-auto"
          aside={<PendingBar className="h-[11px] w-56" />}
        >
          <div className="min-w-[720px]">
            <div
              className={`${STATISTICS_TABLE_GRID} border-b border-[var(--border-hairline)] pb-[11px]`}
            >
              <span />
              {TABLE_COLUMNS.map((column) => (
                <span
                  key={column}
                  className="text-right text-[12px] font-medium text-[var(--ink-900)]"
                >
                  {column}
                </span>
              ))}
            </div>
            {STATISTIC_GROUPS.map((group) => (
              <div key={group.title}>
                <div className="flex items-baseline pt-3 pb-0.5">
                  <span className="eyebrow-sm">{group.title}</span>
                </div>
                {group.statistics.map((statistic) => (
                  <div
                    key={statistic.key}
                    className={`${STATISTICS_TABLE_GRID} min-h-[30px]`}
                  >
                    <span className="min-w-0 truncate text-[13px] text-[var(--text-body)]">
                      {statistic.label}
                    </span>
                    {TABLE_COLUMNS.map((column) => (
                      <PendingBar key={column} className="ml-auto w-8" />
                    ))}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </RegionCard>

        <div className={STATISTICS_TAIL_GRID}>
          <RegionCard
            title="Rally length"
            aside={<PendingBar className="h-[11px] w-14" />}
          >
            <PendingBar className="h-28 rounded-[4px]" />
            <div className="grid grid-cols-3 gap-3">
              {[0, 1, 2].map((band) => (
                <PendingBar key={band} className="h-[11px] w-20" />
              ))}
            </div>
          </RegionCard>
          <RegionCard
            title="How points ended"
            aside={
              <span className="text-micro whitespace-nowrap">Per match</span>
            }
          >
            {["You", "Opponents"].map((side) => (
              <div key={side} className="flex flex-col gap-1.5">
                <div className="flex items-baseline gap-2">
                  <span className="text-[11px] text-[var(--ink-600)]">
                    {side}
                  </span>
                  <div className="flex-1" />
                  <PendingBar className="h-2.5 w-10" />
                </div>
                <PendingBar className="h-2.5 rounded-[4px]" />
              </div>
            ))}
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              {[0, 1, 2, 3].map((ending) => (
                <PendingBar key={ending} className="h-[11px] w-20" />
              ))}
            </div>
          </RegionCard>
        </div>
      </div>
    </>
  );
}

/** The page's Suspense fallback, inside the column the page already drew. */
export function StatisticsPending() {
  return (
    <PendingRegion
      label="statistics"
      className="flex flex-1 flex-col"
      innerClassName="flex flex-col gap-6"
    >
      <StatisticsPendingBody />
    </PendingRegion>
  );
}

/** The route's `loading.tsx`: the same body on the page's white ground. */
export function StatisticsSkeleton() {
  return (
    // `pulse={false}`: the frame holds real text, which must render still.
    <PendingFrame label="statistics" pulse={false}>
      <StatisticsColumn>
        <StatisticsPendingBody />
      </StatisticsColumn>
    </PendingFrame>
  );
}
