"use client";

import { useMatchReport } from "@/components/dashboard/matches/match-detail/match-report-context";
import { ReportPaneEmpty } from "@/components/dashboard/matches/match-detail/report-pane-empty";

/**
 * The Statistics view on a match with no point timeline at all. Every card
 * in the widgets row is point-derived, so rather than four cards each
 * saying nothing (or, worse, the row silently collapsing to blank space),
 * the view says once what is missing and where it comes from. The one way
 * onward is the Video view, since a video analysed by Advantage Intelligence
 * is how a match gets its points.
 */
export function StatisticsEmpty() {
  const { actions } = useMatchReport();
  return (
    <ReportPaneEmpty
      testId="statistics-empty"
      heading="No point-by-point data for this match"
      body="Head to head, performance tracker, rally length and how points ended are built from the points in a match. They arrive with a video analysed by Advantage Intelligence or a SwingVision export."
      action={{
        label: "Open the Video tab",
        onClick: () => actions.selectView("film"),
      }}
    />
  );
}
