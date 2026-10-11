"use client";

import type { KeyboardEvent } from "react";
import { PlaceholderSparkline } from "@/components/dashboard/shared/placeholder-sparkline";
import { EmptyMark } from "@/components/ui/empty-mark";
import {
  formatMean,
  statisticConfig,
  statisticsTableRows,
  type StatisticFormat,
  type StatisticKey,
  type StatisticWindow,
  type StatisticsTableRow,
} from "@/lib/data/statistics";
import {
  STATISTICS_TABLE_COLUMNS,
  STATISTICS_TABLE_GROUP_HEAD,
  STATISTICS_TABLE_HEAD,
  STATISTICS_TABLE_HEAD_CELL,
  STATISTICS_TABLE_LABEL,
  STATISTICS_TABLE_ROW,
  StatisticsTableCard,
  trendDelta,
} from "./statistics-layout";
import { useStatistics } from "./statistics-provider";

/**
 * The Statistics page's All statistics table: every catalogue statistic over
 * the filtered set — its average, its rolling mean, how that moved, its last
 * eight values and what opponents did in the same matches.
 *
 * All of its arithmetic is `statisticsTableRows` (`lib/data/statistics.ts`);
 * this file rounds, prints and draws a line.
 *
 * A row is neither a record nor a container (table law 3): clicking one
 * leaves nothing and opens nothing — it chooses the statistic the Trend and
 * By opponent type cards above read. So it carries no chevron, and the wash
 * persists on the chosen row. It is an ARIA `grid` rather than a `table`
 * because that is the role under which a row may be `aria-selected`.
 *
 * Its states (widget-states):
 *   - loading — the page's own skeleton, drawn from the same layout constants
 *   - a figure nothing measured — `—`, in that cell alone. Return winners is
 *     a whole row of them: no provider publishes it per match
 *   - under two measured values — the grey placeholder curve where the
 *     sparkline goes, never a line through one point
 *   - day zero and a season filtered to nothing — every row, all dashes; the
 *     controls row or the offer above says why, once
 *   - error — the slot's `WidgetBoundary`
 */

const matchCount = (n: number) => `${n} ${n === 1 ? "match" : "matches"}`;

/** The line beside the eyebrow: what Rolling and Change compare, over how many. */
export function statisticsTableNote(
  window: StatisticWindow,
  matches: number,
): string {
  return window === null
    ? `Rolling window off · ${matchCount(matches)}`
    : `Last ${window} matches against the ${window} before · ${matchCount(matches)}`;
}

const SPARK_WIDTH = 80;
const SPARK_HEIGHT = 24;
/** Clear of the box by the stroke's round cap, and by 2px top and bottom. */
const SPARK_INSET_X = 1;
const SPARK_INSET_Y = 2;

const tenth = (value: number) => Math.round(value * 10) / 10;

/**
 * The sparkline's path: the values spread across the box, each drawn against
 * the row's own lowest and highest. A row that never moved is a level line
 * through the middle rather than a division by zero.
 */
export function sparklinePath(values: readonly number[]): string {
  const low = Math.min(...values);
  const range = Math.max(...values) - low;
  const step = (SPARK_WIDTH - 2 * SPARK_INSET_X) / (values.length - 1);
  const drop = SPARK_HEIGHT - 2 * SPARK_INSET_Y;
  return values
    .map((value, index) => {
      const share = range === 0 ? 0.5 : (value - low) / range;
      const x = tenth(SPARK_INSET_X + index * step);
      const y = tenth(SPARK_HEIGHT - SPARK_INSET_Y - share * drop);
      return `${index === 0 ? "M" : "L"}${x} ${y}`;
    })
    .join(" ");
}

/** A multiple of the placeholder's five curves, so row n still draws curve n. */
const SPARK_ID_OFFSET = 100;

const CELL = "text-right";
const FIGURE = "tabular text-[13px]";

function Figure({
  value,
  format,
  tone = "text-[var(--ink-900)]",
  missing,
}: {
  value: number | null;
  format: StatisticFormat;
  tone?: string;
  /** The absence in words, for the dash. */
  missing: string;
}) {
  return (
    <span role="gridcell" className={CELL}>
      {value === null ? (
        <EmptyMark label={missing} />
      ) : (
        <span className={`${FIGURE} ${tone}`}>{formatMean(value, format)}</span>
      )}
    </span>
  );
}

function Row({
  row,
  index,
  window,
  selected,
  onSelect,
}: {
  row: StatisticsTableRow;
  /** The row's place in the table: which placeholder curve, and its ids. */
  index: number;
  window: StatisticWindow;
  selected: boolean;
  onSelect: (key: StatisticKey) => void;
}) {
  const { format, lowerIsBetter } = statisticConfig(row.key);
  const subject = row.label.toLowerCase();
  const delta =
    row.change === null ? null : trendDelta(row.change, lowerIsBetter);
  const drawable = row.spark.length >= 2;

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onSelect(row.key);
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      // ↑↓ walk the statistics, across the group titles between them.
      const rows = [
        ...(event.currentTarget
          .closest('[role="grid"]')
          ?.querySelectorAll<HTMLElement>("[data-statistic]") ?? []),
      ];
      const next =
        rows[
          rows.indexOf(event.currentTarget) +
            (event.key === "ArrowDown" ? 1 : -1)
        ];
      if (next) {
        event.preventDefault();
        next.focus();
      }
    }
  };

  return (
    <div
      role="row"
      data-statistic={row.key}
      aria-selected={selected}
      tabIndex={0}
      onClick={() => onSelect(row.key)}
      onKeyDown={onKeyDown}
      className={`${STATISTICS_TABLE_ROW} cursor-pointer transition-colors duration-150 hover:bg-[var(--surface-muted)] ${
        selected ? "bg-[var(--surface-muted)]" : ""
      }`}
    >
      <span
        role="rowheader"
        className={`${STATISTICS_TABLE_LABEL} ${
          selected ? "text-[var(--ink-900)]" : "text-[var(--text-body)]"
        }`}
      >
        {row.label}
      </span>

      <Figure
        value={row.average}
        format={format}
        missing={`No average for ${subject} yet`}
      />

      <Figure
        value={row.rolling}
        format={format}
        missing={
          window === null
            ? "Rolling window off"
            : `No rolling average for ${subject} yet`
        }
      />

      <span role="gridcell" className={CELL}>
        {delta === null ? (
          <EmptyMark
            label={
              window === null
                ? "Rolling window off"
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

      <span role="gridcell" className="flex justify-end">
        {drawable ? (
          <>
            <svg
              viewBox={`0 0 ${SPARK_WIDTH} ${SPARK_HEIGHT}`}
              width={SPARK_WIDTH}
              height={SPARK_HEIGHT}
              aria-hidden="true"
              className="shrink-0"
            >
              <path
                d={sparklinePath(row.spark)}
                fill="none"
                stroke="var(--viz-you)"
                strokeWidth={1.5}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            </svg>
            <span className="sr-only">
              From {formatMean(row.spark[0], format)} to{" "}
              {formatMean(row.spark[row.spark.length - 1], format)} over the
              last {row.spark.length} measured
            </span>
          </>
        ) : (
          <>
            {/* Offset past the season strip's five, whose gradient ids this
                component derives from the same index. */}
            <PlaceholderSparkline index={SPARK_ID_OFFSET + index} />
            <span className="sr-only">
              Not enough matches to draw {subject} yet
            </span>
          </>
        )}
      </span>

      <Figure
        value={row.opponents}
        format={format}
        tone="text-[var(--ink-600)]"
        missing={`No opponent average for ${subject} yet`}
      />
    </div>
  );
}

export function AllStatisticsTable() {
  const { filtered, state, setState } = useStatistics();
  const { window, stat } = state;
  // No `useMemo`: the React Compiler memoizes this, and refuses a manual one.
  const groups = statisticsTableRows(filtered, window);
  const select = (key: StatisticKey) => {
    if (key !== stat) setState({ stat: key });
  };

  // Each row's place in the whole table, across the groups before it.
  const order = groups.flatMap((group) => group.rows.map((row) => row.key));

  return (
    <StatisticsTableCard
      note={
        <span className="text-micro tabular whitespace-nowrap">
          {statisticsTableNote(window, filtered.length)}
        </span>
      }
    >
      <div role="grid" aria-label="All statistics">
        <div role="rowgroup">
          <div role="row" className={STATISTICS_TABLE_HEAD}>
            {/* The sr-only text sits INSIDE the cell: `sr-only` is absolutely
                positioned, so on the cell itself it would leave the grid and
                shift every heading one track left. */}
            <span role="columnheader">
              <span className="sr-only">Statistic</span>
            </span>
            {STATISTICS_TABLE_COLUMNS.map((column) => (
              <span
                key={column}
                role="columnheader"
                className={`${STATISTICS_TABLE_HEAD_CELL} ${
                  column === "Opponents"
                    ? "text-[var(--ink-600)]"
                    : "text-[var(--ink-900)]"
                }`}
              >
                {column === "Rolling" && window !== null
                  ? `Rolling ${window}`
                  : column}
              </span>
            ))}
          </div>
        </div>
        {groups.map((group) => (
          <div key={group.title} role="rowgroup">
            <div role="row" className={STATISTICS_TABLE_GROUP_HEAD}>
              <span role="rowheader" className="eyebrow-sm">
                {group.title}
              </span>
            </div>
            {group.rows.map((row) => (
              <Row
                key={row.key}
                row={row}
                index={order.indexOf(row.key)}
                window={window}
                selected={row.key === stat}
                onSelect={select}
              />
            ))}
          </div>
        ))}
      </div>
    </StatisticsTableCard>
  );
}
