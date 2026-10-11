"use client";

import { EmptyMark } from "@/components/ui/empty-mark";
import {
  averageOf,
  formatMean,
  opponentSplits,
  statisticConfig,
  type OpponentSplitRow,
  type StatisticFormat,
} from "@/lib/data/statistics";
import {
  RegionCard,
  STATISTICS_SPLIT_ANATOMY,
  SplitFooter,
  SplitGroup,
  SplitRow,
} from "./statistics-layout";
import { useStatistics } from "./statistics-provider";

/**
 * The Statistics page's By opponent type card: the chosen statistic averaged
 * against each kind of opponent and on each court.
 *
 * All of its arithmetic is `opponentSplits` (`lib/data/statistics.ts`); this
 * file rounds, prints and sizes a bar. The statistic is the provider's `stat`,
 * the one the Trend card beside it charts.
 *
 * The frame heads this card with an Advantage Intelligence eyebrow, an "Ask
 * why" action and a generated sentence. None of the three is here by
 * decision: the card states what was measured and claims nothing about it.
 *
 * Its states (widget-states):
 *   - loading — the page's own skeleton (`statistics-skeleton.tsx`), which
 *     draws this card from the same `SplitGroup` / `SplitRow`
 *   - no group to show — the card's anatomy, a `—` per value, one sentence
 *     saying why. Day zero and a season filtered to nothing land here too
 *   - error — the slot's `WidgetBoundary`
 */

const matchCount = (n: number) => `${n} ${n === 1 ? "match" : "matches"}`;

/**
 * How much of the 88px track a row fills.
 *
 * A percentage is its own width. A count has no ceiling to be a share of, so
 * it is drawn against the largest row in the card — `scale`.
 */
export function splitBarWidth(
  value: number,
  format: StatisticFormat,
  scale: number,
): number {
  const share = format === "percent" ? value : (value / scale) * 100;
  return Number.isFinite(share) ? Math.min(100, Math.max(0, share)) : 0;
}

function Track({ width, leader }: { width?: number; leader?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className="flex h-1 rounded-[2px] bg-[var(--ink-100)]"
    >
      {width !== undefined && (
        <span
          className="rounded-[2px]"
          style={{
            width: `${width}%`,
            background: leader ? "var(--viz-you)" : "var(--player-1-bar-tint)",
          }}
        />
      )}
    </span>
  );
}

function Row({
  row,
  format,
  scale,
}: {
  row: OpponentSplitRow;
  format: StatisticFormat;
  scale: number;
}) {
  // `opponentSplits` omits a row nothing measured, so this is a guard, not a
  // state: were one to arrive, it reads as a dash rather than as zero.
  if (row.value === null) {
    return (
      <SplitRow
        label={row.label}
        track={<Track />}
        value={<EmptyMark label={`No figure for ${row.label.toLowerCase()}`} />}
      />
    );
  }
  return (
    <SplitRow
      label={row.label}
      count={row.n}
      track={
        <Track
          width={splitBarWidth(row.value, format, scale)}
          leader={row.leader}
        />
      }
      value={
        <span className="tabular text-[13px] text-[var(--ink-900)]">
          {formatMean(row.value, format)}
        </span>
      }
    />
  );
}

export function OpponentSplitCard() {
  const { filtered, state } = useStatistics();
  const statistic = statisticConfig(state.stat);
  // No `useMemo`: the React Compiler memoizes this, and refuses a manual one.
  const groups = opponentSplits(filtered, state.stat);
  const scale = Math.max(
    0,
    ...groups.flatMap((group) => group.rows.map((row) => row.value ?? 0)),
  );
  const measured = filtered.filter(
    (match) => averageOf([match.values[state.stat]]) !== null,
  ).length;
  // Why there is nothing to split, which is one of two different facts: no
  // match here says who it was against or where, or they do and none of them
  // measured this statistic. The first sentence would be false for the second.
  const recorded = filtered.some(
    (match) => match.opponentHand || match.opponentBackhand || match.courtType,
  );

  return (
    <RegionCard title="By opponent type">
      {groups.length === 0 ? (
        <>
          <p className="text-[12px] leading-[1.7] text-[var(--ink-600)]">
            {recorded
              ? `No match here has measured ${statistic.label.toLowerCase()} yet`
              : "Opponent hand, backhand and court haven’t been recorded yet"}
          </p>
          {STATISTICS_SPLIT_ANATOMY.map((group) => (
            <SplitGroup key={group.title} title={group.title}>
              {group.rows.map((label) => (
                <SplitRow
                  key={label}
                  label={label}
                  track={<Track />}
                  value={
                    <EmptyMark
                      label={`No figure for ${label.toLowerCase()} yet`}
                    />
                  }
                />
              ))}
            </SplitGroup>
          ))}
        </>
      ) : (
        groups.map((group) => (
          <SplitGroup key={group.title} title={group.title}>
            {group.rows.map((row) => (
              <Row
                key={row.label}
                row={row}
                format={statistic.format}
                scale={scale}
              />
            ))}
          </SplitGroup>
        ))
      )}
      <SplitFooter>
        <span className="tabular text-[11px] leading-[1.4] text-[var(--ink-600)]">
          {statistic.label} · {matchCount(measured)}
        </span>
      </SplitFooter>
    </RegionCard>
  );
}
