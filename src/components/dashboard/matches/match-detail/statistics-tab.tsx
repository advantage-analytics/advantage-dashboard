"use client";

import { HeadToHeadCard } from "@/components/dashboard/matches/match-detail/head-to-head-card";
import { MatchKpiStrip } from "@/components/dashboard/matches/match-detail/match-kpi-strip";
import { PerformanceTrackerChart } from "@/components/dashboard/matches/match-detail/performance-tracker-chart";
import { RallyLengthCard } from "@/components/dashboard/matches/match-detail/rally-length-card";
import { PointEndingsCard } from "@/components/dashboard/matches/match-detail/point-endings-card";
import { UnpublishedStatsNotice } from "@/components/dashboard/matches/match-detail/unpublished-stats-notice";

/**
 * The Statistics tab's panel (47f) — KPI strip over a two-column grid: the
 * head-to-head table beside the three point-derived charts (performance
 * tracker → rally length → how points ended), plus the unpublished-stats
 * notice the page has always shown above them.
 *
 * That notice's gating is carried over from `page.tsx` unchanged: a match with
 * a verified point timeline but no published aggregates says so rather than
 * printing zeroes — and takes the strip's place rather than sitting above a
 * row of dashes, since the strip has nothing but aggregates to show.
 *
 * The prose insight moved to the rail's own card, so this pane no longer
 * carries a summary or a matchId; the charts below the fold are unchanged.
 *
 * The derived-match caveat that used to sit beside it (`DerivedStatsNotice`)
 * is gone from this pane, not dropped: the rail's `MatchDataBlock` is its
 * redesigned home and renders on the same condition `page.tsx` computes here
 * (`isDerived && statsPublished`), so it is already on screen next to these
 * charts on every tab. Two copies of the same caveat is one too many.
 *
 * None of the charts take a player name or a points array as a prop: they read
 * `points` from `MatchDataProvider` and their you/opp orientation from
 * `useMatchSides()`, which is the only thing allowed to decide it
 * (guardrails §4). A player-order name pair passed down from here is exactly
 * the shape that silently mirrors a player-2 viewer's charts.
 */

interface StatisticsTabProps {
  /** Whether both sides have published `match_stats` rows. */
  statsPublished: boolean;
  /** Video-derived match — some statistics are approximate, some absent. */
  isDerived: boolean;
}

export function StatisticsTab({
  statsPublished,
  isDerived,
}: StatisticsTabProps) {
  return (
    <>
      {!statsPublished && <UnpublishedStatsNotice />}

      {statsPublished && <MatchKpiStrip />}

      {/*
        One column below `xl`: the v3 rail collapses at 1280px, so a two-column
        pane there is still ~916px wide — narrower viewports stack and scroll.
      */}
      <div className="grid xl:grid-cols-2 gap-3.5 flex-1 min-h-0">
        <HeadToHeadCard />

        <div className="flex flex-col gap-3.5">
          <PerformanceTrackerChart />

          <RallyLengthCard />

          <PointEndingsCard isDerived={isDerived} />
        </div>
      </div>
    </>
  );
}
