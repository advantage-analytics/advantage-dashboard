"use client";

import { HeadToHeadCard } from "@/components/dashboard/matches/match-detail/head-to-head-card";
import { MatchDataBlock } from "@/components/dashboard/matches/match-detail/match-data-block";
import { MatchReport } from "@/components/dashboard/matches/match-detail/match-report";
import { useMatchReport } from "@/components/dashboard/matches/match-detail/match-report-context";
import { PerformanceTrackerChart } from "@/components/dashboard/matches/match-detail/performance-tracker-chart";
import { PointEndingsCard } from "@/components/dashboard/matches/match-detail/point-endings-card";
import { RallyLengthCard } from "@/components/dashboard/matches/match-detail/rally-length-card";
import { StatisticsEmpty } from "@/components/dashboard/matches/match-detail/statistics-empty";
import { UnpublishedStatsNotice } from "@/components/dashboard/matches/match-detail/unpublished-stats-notice";
import { useMatchData } from "@/components/dashboard/matches/match-data-provider";
import { cn } from "@/lib/utils";

/**
 * The Statistics view (design 04 F1), inside `MatchReport.When view="statistics"`:
 * the unpublished-stats notice when there is one, the Advantage Intelligence
 * insight, then the widgets row — the head-to-head table beside a 416px
 * column of the three point-derived charts (performance tracker → rally
 * length → how points ended) — and, on a video-derived match, the `MatchDataBlock`
 * caveats under it. Successor to the round-47f Statistics tab panel; the KPI
 * strip and the set-scope chips it drew are gone from the settled design.
 *
 * Takes no props: `statsPublished` and `isDerived` are `meta` on
 * `useMatchReport()`, decided once in `page.tsx`, so this view cannot be
 * handed a different answer than the rail or the title row got.
 *
 * Two states the frames do not draw but the data has (spec › Decisions 8):
 * the notice, for a match with a verified point timeline and no published
 * aggregates — the head-to-head returns null then, so the chart column takes
 * the full width instead of sitting as a lone 416px strip — and the data
 * block, for a derived match whose stats have published and so has the
 * winners/errors figures the caveats are about (`isDerived && statsPublished`,
 * the same gate the old rail used).
 *
 * `shrink-0` on the notice's slot and the widgets row: this view renders in a
 * flex column, and a flex item whose minimum height is not its content — the
 * notice's `overflow-hidden` card, a fixed-height row — gets squeezed the
 * moment that column is ever shorter than what it holds (a 44px row measured
 * 21.5px when `When` still carried `min-h-0`). F1 gives the row
 * `flex: 0 0 auto` for the same reason. The insight card carries its own.
 *
 * None of the cards take a player name or a points array: each reads
 * `points` from `MatchDataProvider` and its you/opp orientation from
 * `useMatchSides()`, the only thing allowed to decide it (guardrails §4).
 *
 * A match with NO points at all gets one honest zero (`StatisticsEmpty`) in
 * place of the row: every card in it is point-derived and each would
 * otherwise return null, leaving a title over blank space — and the notice
 * above, which promises "point-by-point analysis is ready", would be false.
 * The insight card is withheld too: with points it draws its own empty when
 * there is no summary, but a view with nothing says so once, not per card.
 * A match still analysing never gets here: `page.tsx` shows progress instead.
 */
export function StatisticsView() {
  const { meta } = useMatchReport();
  const { points } = useMatchData();
  const hasPoints = points.length > 0;

  return (
    <>
      {!meta.statsPublished && hasPoints && (
        <div className="shrink-0">
          <UnpublishedStatsNotice />
        </div>
      )}

      {hasPoints ? <MatchReport.Insight /> : <StatisticsEmpty />}

      {/* F1: 436px + 416px in the 868px pane. The head-to-head's slot takes
          what the fixed column leaves. Under 720px of pane (the `@container`
          on `MatchReport.Pane`) the row stacks: head-to-head first, the
          charts under it, both full width — `items-start` only applies side
          by side, since in a column it would shrink each child to its
          content's width. */}
      {hasPoints && (
        <div className="flex shrink-0 flex-col gap-4 @min-[720px]:flex-row @min-[720px]:items-start">
          {meta.statsPublished && (
            <div className="min-w-0 flex-1">
              <HeadToHeadCard />
            </div>
          )}

          <div
            className={cn(
              "flex flex-col gap-4",
              meta.statsPublished
                ? "w-full shrink-0 @min-[720px]:w-[416px]"
                : "min-w-0 flex-1",
            )}
          >
            <PerformanceTrackerChart />
            <RallyLengthCard />
            <PointEndingsCard isDerived={meta.isDerived} />
          </div>
        </div>
      )}

      {meta.isDerived && meta.statsPublished && <MatchDataBlock />}
    </>
  );
}
