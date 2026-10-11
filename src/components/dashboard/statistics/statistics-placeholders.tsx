"use client";

import { EmptyMark } from "@/components/ui/empty-mark";
import { STATISTIC_GROUPS } from "@/lib/data/statistics";
import { capitalize } from "@/lib/utils";
import {
  RegionCard,
  STATISTICS_SPLIT_GRID,
  STATISTICS_TABLE_GRID,
} from "./statistics-layout";
import { useStatistics } from "./statistics-provider";

/**
 * The Statistics page's regions before their own components exist.
 *
 * Each is the region's real card — its eyebrow, its row and column labels,
 * its tracks — holding `—` where a value goes (empty-and-loading.md → Honest
 * zero state: the labels are the payload). None of them computes a figure,
 * so none can show a wrong one; the season strip above them is the only part
 * of the page reading numbers until each region's task replaces its
 * placeholder in `statistics-body.tsx`.
 *
 * They draw the same anatomy whether the set is full, filtered to nothing or
 * day zero. What differs between those states is said ONCE, by the controls
 * row or the day-zero offer — a sentence per card would be six cards
 * repeating one fact.
 */

const STATISTIC_LABELS = new Map(
  STATISTIC_GROUPS.flatMap((group) =>
    group.statistics.map((s) => [s.key, s.label] as const),
  ),
);

const matchCount = (n: number) => `${n} ${n === 1 ? "match" : "matches"}`;

/** A 4px bar track with nothing on it. */
function Track({ className = "h-1" }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`block rounded-[2px] bg-[var(--ink-100)] ${className}`}
    />
  );
}

/* ── Trend ────────────────────────────────────────────────────────────────── */

function Figure({ label, missing }: { label: string; missing: string }) {
  return (
    <span className="inline-flex items-baseline gap-1.5">
      <span className="text-[12px] text-[var(--ink-600)]">{label}</span>
      <EmptyMark label={missing} />
    </span>
  );
}

export function StatisticsTrendPlaceholder() {
  const { state } = useStatistics();
  return (
    <RegionCard
      title="Trend"
      aside={
        <span className="inline-flex items-baseline gap-5">
          <Figure label="Average" missing="No average yet" />
          {state.window !== null && (
            <Figure
              label={`Rolling ${state.window}`}
              missing="No rolling average yet"
            />
          )}
        </span>
      }
    >
      <p className="text-[12px] text-[var(--ink-900)]">
        {STATISTIC_LABELS.get(state.stat)}
      </p>
      {/* The chart's own 760×250 box and its grid, with no series on it. */}
      <div
        aria-hidden="true"
        className="flex aspect-[760/250] w-full flex-col justify-between"
      >
        {[0, 1, 2, 3].map((line) => (
          <span key={line} className="h-px bg-[var(--border-hairline)]" />
        ))}
      </div>
    </RegionCard>
  );
}

/* ── By opponent type ─────────────────────────────────────────────────────── */

export function StatisticsOpponentTypesPlaceholder() {
  const { all, filtered, state } = useStatistics();
  // Hand and backhand are closed lists; a court is whatever was typed, so its
  // rows are the surfaces this season was actually played on.
  const courts = [
    ...new Set(
      all
        .map((match) => match.courtType?.trim().toLowerCase())
        .filter((court): court is string => Boolean(court)),
    ),
  ].sort();
  const groups = [
    { title: "Hand", rows: ["Right-handed", "Left-handed"] },
    { title: "Backhand", rows: ["Two-handed", "One-handed"] },
    { title: "Court", rows: courts.map(capitalize) },
  ].filter((group) => group.rows.length > 0);

  return (
    <RegionCard title="By opponent type">
      {groups.map((group) => (
        <div key={group.title} className="flex flex-col gap-1.5 pt-1">
          <h3 className="eyebrow-sm">{group.title}</h3>
          {group.rows.map((row) => (
            <div key={row} className={STATISTICS_SPLIT_GRID}>
              <span className="truncate text-[12px] text-[var(--ink-700)]">
                {row}
              </span>
              <Track />
              <span className="text-right">
                <EmptyMark label={`No figure for ${row.toLowerCase()} yet`} />
              </span>
            </div>
          ))}
        </div>
      ))}
      <div className="flex items-baseline gap-2.5 border-t border-[var(--border-hairline)] pt-3">
        <span className="text-[11px] leading-[1.4] text-[var(--ink-600)]">
          {STATISTIC_LABELS.get(state.stat)}
        </span>
        <div className="flex-1" />
        <span className="tabular text-[11px] whitespace-nowrap text-[var(--ink-600)]">
          {matchCount(filtered.length)}
        </span>
      </div>
    </RegionCard>
  );
}

/* ── All statistics ───────────────────────────────────────────────────────── */

const HEAD_CELL = "text-right text-[12px] font-medium";

export function StatisticsTablePlaceholder() {
  const { filtered, state } = useStatistics();
  const { window } = state;
  const columns = [
    { label: "Average", tone: "text-[var(--ink-900)]" },
    {
      label: window === null ? "Rolling" : `Rolling ${window}`,
      tone: "text-[var(--ink-900)]",
    },
    { label: "Change", tone: "text-[var(--ink-900)]" },
    { label: "Last 8", tone: "text-[var(--ink-900)]" },
    { label: "Opponents", tone: "text-[var(--ink-600)]" },
  ];
  const note =
    window === null
      ? `Rolling window off · ${matchCount(filtered.length)}`
      : `Last ${window} matches against the ${window} before · ${matchCount(filtered.length)}`;

  return (
    <RegionCard
      title="All statistics"
      className="overflow-x-auto"
      aside={
        <span className="text-micro tabular whitespace-nowrap">{note}</span>
      }
    >
      <div role="table" aria-label="All statistics" className="min-w-[720px]">
        <div
          role="row"
          className={`${STATISTICS_TABLE_GRID} border-b border-[var(--border-hairline)] pb-[11px]`}
        >
          {/* The sr-only text sits INSIDE the cell: `sr-only` is absolutely
              positioned, so on the cell itself it would leave the grid and
              shift every heading one track left. */}
          <span role="columnheader">
            <span className="sr-only">Statistic</span>
          </span>
          {columns.map((column) => (
            <span
              key={column.label}
              role="columnheader"
              className={`${HEAD_CELL} ${column.tone}`}
            >
              {column.label}
            </span>
          ))}
        </div>
        {STATISTIC_GROUPS.map((group) => (
          <div key={group.title} role="rowgroup">
            <div role="row" className="flex items-baseline pt-3 pb-0.5">
              <span role="rowheader" className="eyebrow-sm">
                {group.title}
              </span>
            </div>
            {group.statistics.map((statistic) => (
              <div
                key={statistic.key}
                role="row"
                className={`${STATISTICS_TABLE_GRID} min-h-[30px]`}
              >
                <span
                  role="rowheader"
                  className="min-w-0 truncate text-[13px] text-[var(--text-body)]"
                >
                  {statistic.label}
                </span>
                {columns.map((column) => (
                  <span key={column.label} role="cell" className="text-right">
                    <EmptyMark label={`No ${column.label.toLowerCase()} yet`} />
                  </span>
                ))}
              </div>
            ))}
          </div>
        ))}
      </div>
    </RegionCard>
  );
}

/* ── Rally length · How points ended ──────────────────────────────────────── */

/** `points` is null when the read failed — said, never drawn as a tally. */
function PointsUnavailable() {
  return (
    <p role="status" className="text-micro">
      Point-by-point data could not be loaded. Reload to try again.
    </p>
  );
}

const RALLY_BANDS = ["Short 1–4", "Medium 5–8", "Long 9+"];

export function StatisticsRallyLengthPlaceholder() {
  const { points } = useStatistics();
  return (
    <RegionCard
      title="Rally length"
      aside={
        <span className="text-micro whitespace-nowrap">
          <EmptyMark label="No average rally length yet" className="mr-1" />
          shots
        </span>
      }
    >
      {points === null && <PointsUnavailable />}
      <Track className="h-28 rounded-[4px]" />
      <div className="grid grid-cols-3 gap-3">
        {RALLY_BANDS.map((band) => (
          <span
            key={band}
            className="flex items-baseline gap-1.5 text-[11px] text-[var(--ink-600)]"
          >
            {band}
            <EmptyMark label={`No share for ${band.toLowerCase()} yet`} />
          </span>
        ))}
      </div>
    </RegionCard>
  );
}

const POINT_ENDINGS = ["Winners", "Aces", "Unforced errors", "Double faults"];

export function StatisticsPointEndingsPlaceholder() {
  const { points } = useStatistics();
  return (
    <RegionCard
      title="How points ended"
      aside={<span className="text-micro whitespace-nowrap">Per match</span>}
    >
      {points === null && <PointsUnavailable />}
      {["You", "Opponents"].map((side) => (
        <div key={side} className="flex flex-col gap-1.5">
          <div className="flex items-baseline gap-2">
            <span className="text-[11px] text-[var(--ink-600)]">{side}</span>
            <div className="flex-1" />
            <span className="mono text-[10px] text-[var(--ink-400)]">
              <EmptyMark
                label={`No points counted for ${side.toLowerCase()} yet`}
                className="mr-1"
              />
              pts
            </span>
          </div>
          <Track className="h-2.5 rounded-[4px]" />
        </div>
      ))}
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {POINT_ENDINGS.map((ending) => (
          <span
            key={ending}
            className="flex items-baseline gap-1.5 text-[11px] text-[var(--ink-600)]"
          >
            {ending}
            <EmptyMark label={`No share for ${ending.toLowerCase()} yet`} />
          </span>
        ))}
      </div>
    </RegionCard>
  );
}
