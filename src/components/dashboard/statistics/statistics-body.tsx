"use client";

import { useMemo, type ReactNode } from "react";
import { WidgetBoundary } from "@/components/dashboard/loading/widget-boundary";
import { SeasonKpiStrip } from "@/components/dashboard/shared/season-kpi-strip";
import { seasonStrip } from "@/lib/data/player-profile";
import { OpponentSplitCard } from "./opponent-split-card";
import {
  STATISTICS_OPPONENT_SLOT,
  STATISTICS_STACK,
  STATISTICS_TAIL_GRID,
  STATISTICS_TREND_ROW,
  STATISTICS_TREND_SLOT,
} from "./statistics-layout";
import { StatisticsControls } from "./statistics-controls";
import {
  StatisticsPointEndingsPlaceholder,
  StatisticsRallyLengthPlaceholder,
  StatisticsTablePlaceholder,
} from "./statistics-placeholders";
import { useStatistics } from "./statistics-provider";
import { TrendCard } from "./trend-card";

/**
 * Everything under the Statistics title row: the controls, the season strip
 * and one slot per region, in the frame's order and geometry.
 *
 * ── The slots ───────────────────────────────────────────────────────────────
 * Each `<Slot>` below owns its place in the layout and its `WidgetBoundary`;
 * the component inside it owns nothing but its own card. So a region's task
 * replaces ONE child — `<StatisticsTablePlaceholder />` with its real
 * component — and touches no layout. Every region reads `useStatistics()`,
 * so none takes props.
 *
 * Rendered by the populated page and, inside an `inert` grade with an empty
 * provider, by the day zero — the same components, so the shape a new player
 * is shown is the shape they get.
 */

function Slot({
  label,
  className,
  children,
}: {
  /** Names the region in its boundary's "Couldn't load …" line. */
  label: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={className}>
      <WidgetBoundary label={label}>{children}</WidgetBoundary>
    </div>
  );
}

/**
 * The season strip over the filtered set.
 *
 * Its own honest zero is `KpiStripEmpty` — the viewer's chosen tiles,
 * labelled, a rule where each number goes. The hint under the rule is the
 * one thing this page must correct: the strip's default says "After your
 * first match", which is false for a season that merely filtered to nothing.
 */
function StatisticsSeasonStrip({
  awaitingReport,
}: {
  awaitingReport?: boolean;
}) {
  const { all, filtered } = useStatistics();
  const strip = useMemo(
    () => seasonStrip(filtered.map((match) => match.profile)),
    [filtered],
  );
  const filteredOut = filtered.length === 0 && all.length > 0;
  return (
    <SeasonKpiStrip
      kpis={strip.kpis}
      hasStats={strip.hasStats}
      matchesPlayed={strip.matchesPlayed}
      awaitingReport={awaitingReport}
      emptyHint={filteredOut ? "No matches fit these filters" : undefined}
      ariaLabel="Season averages"
    />
  );
}

export function StatisticsBody({
  awaitingReport,
}: {
  /**
   * Day zero only: a match is filed and no report is back, so the empty
   * strip says "When the report lands". Omitted on the populated page.
   */
  awaitingReport?: boolean;
}) {
  return (
    <div className={STATISTICS_STACK}>
      {/* slot: controls — Opponent · Opponent type · Matches · Rolling window */}
      <Slot label="Filters">
        <StatisticsControls />
      </Slot>

      <Slot label="Season averages">
        <StatisticsSeasonStrip awaitingReport={awaitingReport} />
      </Slot>

      <div className={STATISTICS_TREND_ROW}>
        {/* slot: Trend */}
        <Slot label="Trend" className={STATISTICS_TREND_SLOT}>
          <TrendCard />
        </Slot>
        {/* slot: By opponent type */}
        <Slot label="By opponent type" className={STATISTICS_OPPONENT_SLOT}>
          <OpponentSplitCard />
        </Slot>
      </div>

      {/* slot: All statistics */}
      <Slot label="All statistics">
        <StatisticsTablePlaceholder />
      </Slot>

      <div className={STATISTICS_TAIL_GRID}>
        {/* slot: Rally length */}
        <Slot label="Rally length" className="min-w-0">
          <StatisticsRallyLengthPlaceholder />
        </Slot>
        {/* slot: How points ended */}
        <Slot label="How points ended" className="min-w-0">
          <StatisticsPointEndingsPlaceholder />
        </Slot>
      </div>
    </div>
  );
}
