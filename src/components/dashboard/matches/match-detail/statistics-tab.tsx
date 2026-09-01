"use client";

import { InsightStrip } from "@/components/dashboard/matches/match-detail/insight-strip";
import { HeadToHeadCard } from "@/components/dashboard/matches/match-detail/head-to-head-card";
import { PerformanceTrackerChart } from "@/components/dashboard/matches/match-detail/performance-tracker-chart";
import { RallyLengthCard } from "@/components/dashboard/matches/match-detail/rally-length-card";
import { PointEndingsCard } from "@/components/dashboard/matches/match-detail/point-endings-card";
import { UnpublishedStatsNotice } from "@/components/dashboard/matches/match-detail/unpublished-stats-notice";

/**
 * The Statistics tab's panel (artboard 46a) — insight strip, head-to-head
 * card, then the three point-derived charts in the artboard's order
 * (performance tracker → rally length → how points ended), plus the
 * unpublished-stats notice the page has always shown above them.
 *
 * That notice's gating is carried over from `page.tsx` unchanged: a match with
 * a verified point timeline but no published aggregates says so rather than
 * printing zeroes.
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
  matchId: string;
  /** The viewer's insight summary, already picked by side in `page.tsx`. */
  summary: string | null;
  /** Whether both sides have published `match_stats` rows. */
  statsPublished: boolean;
  /** Video-derived match — some statistics are approximate, some absent. */
  isDerived: boolean;
}

export function StatisticsTab({
  matchId,
  summary,
  statsPublished,
  isDerived,
}: StatisticsTabProps) {
  return (
    <>
      <InsightStrip summary={summary} matchId={matchId} />

      {!statsPublished && <UnpublishedStatsNotice />}

      <HeadToHeadCard />

      <PerformanceTrackerChart />

      <RallyLengthCard />

      <PointEndingsCard isDerived={isDerived} />
    </>
  );
}
