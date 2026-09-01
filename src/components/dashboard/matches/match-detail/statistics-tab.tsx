"use client";

import { useMatchData } from "@/components/dashboard/matches/match-data-provider";
import { InsightStrip } from "@/components/dashboard/matches/match-detail/insight-strip";
import { HeadToHeadCard } from "@/components/dashboard/matches/match-detail/head-to-head-card";
import { PerformanceTrackerCard } from "@/components/dashboard/matches/match-detail/performance-tracker-card";
import { UnpublishedStatsNotice } from "@/components/dashboard/matches/match-detail/unpublished-stats-notice";
import { DerivedStatsNotice } from "@/components/dashboard/matches/match-detail/derived-stats-notice";

/**
 * The Statistics tab's panel (artboard 46a) — insight strip, head-to-head
 * card, and the performance tracker, plus the two provenance notices the page
 * has always shown above them.
 *
 * The notice gating is carried over from `page.tsx` unchanged: a match with a
 * verified point timeline but no published aggregates says so rather than
 * printing zeroes, and a video-derived match keeps its caveat above numbers
 * that are approximate per statistic.
 */

interface StatisticsTabProps {
  matchId: string;
  /** The viewer's insight summary, already picked by side in `page.tsx`. */
  summary: string | null;
  /** Whether both sides have published `match_stats` rows. */
  statsPublished: boolean;
  /** Video-derived match — some statistics are approximate, some absent. */
  isDerived: boolean;
  /**
   * Player-order (not you/opp) short names for the momentum chart, which draws
   * player1 and player2 series and labels them in that order.
   */
  p1Name: string;
  p2Name: string;
  matchDurationSec: number | null;
}

export function StatisticsTab({
  matchId,
  summary,
  statsPublished,
  isDerived,
  p1Name,
  p2Name,
  matchDurationSec,
}: StatisticsTabProps) {
  const { points } = useMatchData();

  return (
    <>
      <InsightStrip summary={summary} matchId={matchId} />

      {!statsPublished && <UnpublishedStatsNotice />}
      {statsPublished && isDerived && <DerivedStatsNotice />}

      <HeadToHeadCard />

      <PerformanceTrackerCard
        points={points}
        p1Name={p1Name}
        p2Name={p2Name}
        matchDurationSec={matchDurationSec}
      />
    </>
  );
}
