"use client";

import { useMatchReport } from "@/components/dashboard/matches/match-detail/match-report-context";
import { ReportPaneEmpty } from "@/components/dashboard/matches/match-detail/report-pane-empty";

/**
 * The Visualizations view on a match with no points. Gated in `shots-tab.tsx`
 * BEFORE the wall/focused branch, so a pasted `?cut=` link cannot draw an
 * empty court over a stats card saying "No points match these filters" —
 * the filters are not what is missing. With points, the wall's own
 * per-player `EmptySubjectRow` still handles the one-player case.
 */
export function VizEmpty() {
  const { actions } = useMatchReport();
  return (
    <ReportPaneEmpty
      testId="viz-empty"
      heading="Nothing to plot yet"
      body="Serve and return placement is drawn from the points in a match. They arrive with a video analysed by Advantage Intelligence or a SwingVision export."
      action={{
        label: "Open the Video tab",
        onClick: () => actions.selectView("film"),
      }}
    />
  );
}
