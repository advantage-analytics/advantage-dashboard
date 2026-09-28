"use client";

import { HeadToHeadCard } from "@/components/dashboard/matches/match-detail/head-to-head-card";
import { MatchReport } from "@/components/dashboard/matches/match-detail/match-report";
import { useMatchReport } from "@/components/dashboard/matches/match-detail/match-report-context";
import { PerformanceTrackerChart } from "@/components/dashboard/matches/match-detail/performance-tracker-chart";
import { PointEndingsCard } from "@/components/dashboard/matches/match-detail/point-endings-card";
import { RallyLengthCard } from "@/components/dashboard/matches/match-detail/rally-length-card";
import {
  FilteredPointsEmpty,
  MatchFiltersBar,
} from "@/components/dashboard/matches/match-detail/match-filters/applied-filters";
import { useMatchFilters } from "@/components/dashboard/matches/match-detail/match-filters/provider";
import { StatisticsEmpty } from "@/components/dashboard/matches/match-detail/statistics-empty";
import { UnpublishedStatsNotice } from "@/components/dashboard/matches/match-detail/unpublished-stats-notice";
import { useMatchData } from "@/components/dashboard/matches/match-data-provider";
import { cn } from "@/lib/utils";

/**
 * The Statistics view (design 04 F1), inside `MatchReport.When view="statistics"`:
 * the unpublished-stats notice when there is one, the Advantage Intelligence
 * insight, then the widgets row — the head-to-head table beside a 416px
 * column of the three point-derived charts (performance tracker → rally
 * length → how points ended). Successor to the round-47f Statistics tab
 * panel; the KPI strip and the set-scope chips it drew are gone from the
 * settled design. The "Match data" caveats block that sat under the row on a
 * video-derived match was removed on 2026-09-27: it only ever said "Coming
 * soon" over a disabled button, and nothing used it.
 *
 * No data props (`canFilter` is the only one): `statsPublished` and `isDerived` are `meta` on
 * `useMatchReport()`, decided once in `page.tsx`, so this view cannot be
 * handed a different answer than the rail or the title row got.
 *
 * One state the frames do not draw but the data has (spec › Decisions 8):
 * the notice, for a match with a verified point timeline and no published
 * aggregates — the head-to-head returns null then, so the chart column takes
 * the full width instead of sitting as a lone 416px strip.
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
 *
 * ── Filters (T6) ─────────────────────────────────────────────────────────
 * `MatchFiltersBar` sits between the insight and the widgets row: directly
 * above the cards it scopes, and below the insight, which is whole-match
 * prose the filters do not touch. It holds the one Filter button (which opens
 * the filters rail at the frame's right edge — `filter-rail.tsx`) and, while
 * a cut is applied, "N of M points" plus a removable chip per value. The
 * title row's facts line stays whole-match: it describes the match, not the
 * cut, and sits above every view.
 *
 * A cut that keeps no point replaces the widgets row with
 * `FilteredPointsEmpty` — one statement and a Clear all — rather than four
 * cards each drawing nothing. The bar stays, so one chip can go instead.
 *
 * `canFilter` is the page's call: the public `/m/[token]` report passes
 * `false`, which drops the Filter button and the chips' remove; an incoming
 * `?f=` is still honoured there, read-only.
 */
export function StatisticsView({ canFilter = true }: { canFilter?: boolean }) {
  const { meta } = useMatchReport();
  const { points } = useMatchData();
  const { filteredPoints, filtersActive } = useMatchFilters();
  const hasPoints = points.length > 0;
  const noPointsInCut = filtersActive && filteredPoints.length === 0;

  return (
    <>
      {!meta.statsPublished && hasPoints && (
        <div className="shrink-0">
          <UnpublishedStatsNotice />
        </div>
      )}

      {hasPoints ? <MatchReport.Insight /> : <StatisticsEmpty />}

      {hasPoints && <MatchFiltersBar canFilter={canFilter} />}

      {hasPoints && noPointsInCut && (
        <FilteredPointsEmpty canFilter={canFilter} />
      )}

      {/* F1: 436px + 416px in the 868px pane. The head-to-head's slot takes
          what the fixed column leaves. Under 720px of pane (the `@container`
          on `MatchReport.Pane`) the row stacks: head-to-head first, the
          charts under it, both full width.

          Side by side, the two columns end on one line. The row stretches
          (flex's default), and the chart column hands its slack to Rally
          length, whose bars fill whatever height the card gets (the
          landing page mockup's `.mb-chart .bands`). The height goes to the
          chart, never to a card's empty surface: a stretched card with
          top-aligned content reads worse than uneven columns. The
          head-to-head card keeps its natural height; its slot stretches,
          invisibly. */}
      {hasPoints && !noPointsInCut && (
        <div className="flex shrink-0 flex-col gap-4 @min-[720px]:flex-row">
          {meta.statsPublished && (
            <div className="min-w-0 flex-1">
              <HeadToHeadCard />
            </div>
          )}

          <div
            className={cn(
              // `*:shrink-0`: the column only ever gains height from the row,
              // never gives it up — a card squeezed below its content clips.
              "flex flex-col gap-4 *:shrink-0",
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
    </>
  );
}
