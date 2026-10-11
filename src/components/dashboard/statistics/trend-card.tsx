"use client";

import dynamic from "next/dynamic";
import { PendingBar } from "@/components/dashboard/loading/pending";
import { EmptyMark } from "@/components/ui/empty-mark";
import {
  formatMean,
  statisticConfig,
  trendSeries,
  type StatisticConfig,
  type StatisticWindow,
} from "@/lib/data/statistics";
import {
  RegionCard,
  STATISTICS_TREND_PLOT,
  TrendLegend,
  trendDelta,
} from "./statistics-layout";
import { useStatistics } from "./statistics-provider";

/**
 * The Statistics page's Trend card: the chosen statistic in every match that
 * measured it, its average, and its rolling mean.
 *
 * All of its arithmetic is `trendSeries` (`lib/data/statistics.ts`); this
 * file rounds and prints. The plot is the Home KPI popover's chart, asked for
 * its plot alone — one Recharts composition and one dark readout for both.
 *
 * Its states (widget-states):
 *   - loading — the page's own skeleton; only the chart's chunk loads here,
 *     behind a bar the size of the plot
 *   - fewer than two measured matches — the card's anatomy, a `—` per figure,
 *     one sentence where the plot goes. Day zero and a season filtered to
 *     nothing land here too
 *   - error — the slot's `WidgetBoundary`
 */

// Lazy for the reason `kpi-tile.tsx` gives: Recharts stays out of the page's
// first load. The fallback holds the plot's box so the legend does not jump.
const KpiDetailChart = dynamic(
  () => import("@/components/dashboard/shared/kpi-detail-chart"),
  {
    ssr: false,
    loading: () => (
      <PendingBar className={`${STATISTICS_TREND_PLOT} h-auto rounded-[4px]`} />
    ),
  },
);

const matchCount = (n: number) => `${n} ${n === 1 ? "match" : "matches"}`;

const READOUT = "inline-flex items-baseline gap-1.5";
const READOUT_LABEL = "text-[12px] text-[var(--ink-600)]";
const READOUT_VALUE = "tabular text-[16px] text-[var(--ink-900)]";

function WindowReadout({
  window,
  latest,
  change,
  statistic,
}: {
  window: StatisticWindow;
  latest: number | null;
  change: number | null;
  statistic: StatisticConfig;
}) {
  const legend = window === null ? "Rolling" : `Rolling ${window}`;
  const delta =
    change === null ? null : trendDelta(change, statistic.lowerIsBetter);
  return (
    <span className={READOUT}>
      <span className={READOUT_LABEL}>{legend}</span>
      {latest === null ? (
        <EmptyMark
          label={
            window === null ? "Rolling window off" : "No rolling average yet"
          }
        />
      ) : (
        <span className={READOUT_VALUE}>
          {formatMean(latest, statistic.format)}
        </span>
      )}
      {delta === null ? (
        <EmptyMark
          label={
            window === null
              ? undefined
              : `Not enough matches to compare ${window} against the ${window} before`
          }
        />
      ) : (
        <span
          className="tabular text-[11px] font-medium"
          style={{ color: delta.color }}
        >
          <span aria-hidden="true">{delta.text}</span>
          <span className="sr-only">
            {delta.spoken} on the {window} matches before
          </span>
        </span>
      )}
    </span>
  );
}

/** The plot's box and grid with nothing on it, and the one sentence why. */
function TrendEmpty() {
  return (
    <div className={`${STATISTICS_TREND_PLOT} relative`}>
      <div
        aria-hidden="true"
        className="absolute inset-0 flex flex-col justify-between"
      >
        {[0, 1, 2, 3].map((line) => (
          <span key={line} className="h-px bg-[var(--border-hairline)]" />
        ))}
      </div>
      <p className="absolute inset-0 flex items-center justify-center">
        <span className="text-body-sm bg-[var(--surface-card)] px-3 text-center">
          Not enough matches to draw a trend yet
        </span>
      </p>
    </div>
  );
}

export function TrendCard() {
  const { filtered, state } = useStatistics();
  const { stat, window } = state;
  const statistic = statisticConfig(stat);
  // No `useMemo`: the React Compiler memoizes this, and refuses a manual one.
  const { points, average, rolling, latest, change } = trendSeries(
    filtered,
    stat,
    window,
  );
  const drawable = points.length >= 2;

  const plotLabel =
    `${statistic.label} in each of ${matchCount(points.length)}` +
    (average === null
      ? ""
      : `, averaging ${formatMean(average, statistic.format)}`) +
    (latest === null || window === null
      ? ""
      : `; ${formatMean(latest, statistic.format)} over the last ${window}`);

  return (
    <RegionCard
      title="Trend"
      subject={
        <span className="text-[12px] text-[var(--ink-900)]">
          {statistic.label}
        </span>
      }
      aside={
        <span className="inline-flex flex-wrap items-baseline gap-x-5 gap-y-1">
          <span className={READOUT}>
            <span className={READOUT_LABEL}>Average</span>
            {average === null ? (
              <EmptyMark label="No average yet" />
            ) : (
              <span className={READOUT_VALUE}>
                {formatMean(average, statistic.format)}
              </span>
            )}
          </span>
          <WindowReadout
            window={window}
            latest={latest}
            change={change}
            statistic={statistic}
          />
        </span>
      }
    >
      {drawable ? (
        <KpiDetailChart
          plotOnly
          label={plotLabel}
          points={points}
          format={statistic.format}
          average={average}
          rolling={rolling}
          rollingWindow={window}
        />
      ) : (
        <TrendEmpty />
      )}
      <TrendLegend
        rolling={window === null ? undefined : `Rolling ${window}`}
        caption={
          <span className="tabular text-[11px] whitespace-nowrap text-[var(--ink-600)]">
            {points.length === filtered.length
              ? matchCount(filtered.length)
              : `${points.length} of ${matchCount(filtered.length)}`}
          </span>
        }
      />
    </RegionCard>
  );
}
