"use client";

import type { ReactNode } from "react";
import {
  MatchReportProvider,
  useMatchReport,
} from "@/components/dashboard/matches/match-detail/match-report-context";
import type { ReportView } from "@/components/dashboard/matches/match-detail/report-view";
import { MatchReportScoreboard } from "@/components/dashboard/matches/match-detail/report-scoreboard";
import { MatchReportViewSwitcher } from "@/components/dashboard/matches/match-detail/report-view-switcher";
// Parts that live in their own files: one import line here and one entry in
// the `MatchReport` object at the bottom. Those files read `useMatchReport`
// from `match-report-context.tsx`, never from this file, so adding one cannot
// create an import cycle.

export { MatchReportProvider };

/**
 * The settled match report's frame (design 04 F1): a 300px rail and a
 * scrolling pane, composed from parts rather than configured by props.
 *
 *   <MatchReport.Provider …>
 *     <MatchReport.Frame>
 *       <MatchReport.Rail> <MatchReport.Scoreboard /> <MatchReport.ViewSwitcher /> <MatchReport.Spacer /> <MatchReport.RailFooter>…</MatchReport.RailFooter> </MatchReport.Rail>
 *       <MatchReport.Pane> … <MatchReport.When view="statistics">…</MatchReport.When> </MatchReport.Pane>
 *     </MatchReport.Frame>
 *   </MatchReport.Provider>
 *
 * The rail and the pane scroll independently only inside `layout.tsx`'s
 * `h-[calc(100vh-var(--header-h))] overflow-hidden` box, and only while every
 * flex link carries `min-h-0` — Frame → Rail / Pane → When. Drop one and that
 * pane grows to its content and the page scrolls as a whole instead.
 *
 * Every part is also exported by name. A Server Component that imports this
 * `"use client"` module receives client references, and dotting into one
 * (`MatchReport.Frame`) throws on the server — `page.tsx` has to import
 * `MatchReportFrame` and friends; client components can use either.
 */

export function MatchReportFrame({ children }: { children: ReactNode }) {
  return <div className="flex min-h-0 flex-1 items-stretch">{children}</div>;
}

export function MatchReportRail({ children }: { children: ReactNode }) {
  return (
    <aside
      aria-label="Match summary"
      className="flex min-h-0 [flex:0_0_300px] flex-col overflow-y-auto border-r border-[var(--border-hairline)] bg-[var(--surface-card)]"
    >
      {children}
    </aside>
  );
}

/** Pushes the rail footer to the bottom, and keeps 16px above it when the rail is full. */
export function MatchReportSpacer() {
  return <div className="min-h-4 flex-1" />;
}

export function MatchReportRailFooter({ children }: { children: ReactNode }) {
  return <div className="p-3">{children}</div>;
}

export function MatchReportPane({ children }: { children: ReactNode }) {
  return (
    <div
      className="flex min-h-0 min-w-0 flex-1 flex-col gap-4 overflow-y-auto"
      // F1 draws the pane on the grey page ground with white cards on it. That
      // conflicts with design-system principle 6 ("the dashboard is white" —
      // the report and its rail are `--surface-card`, separation comes from
      // the hairline). The frame wins here by decision (spec › Decisions 1);
      // this is the one place the page token is referenced, so reverting to
      // white is this one line.
      style={{
        padding: "20px 56px 24px",
        background: "var(--surface-page)",
      }}
    >
      {children}
    </div>
  );
}

/**
 * Renders its children only while `view` is the active one. An inactive view
 * unmounts rather than hides, so nothing in it (the Video view's player, a
 * chart's hover state) outlives the switch away from it.
 */
export function MatchReportWhen({
  view,
  children,
}: {
  view: ReportView;
  children: ReactNode;
}) {
  const { state } = useMatchReport();
  if (state.view !== view) return null;
  return (
    <div role="tabpanel" className="flex min-h-0 flex-1 flex-col gap-4">
      {children}
    </div>
  );
}

/**
 * The namespace client components compose with. Entries follow the page's
 * reading order — rail top to bottom, then pane top to bottom — and a part
 * added from its own file goes in at its slot below.
 */
export const MatchReport = {
  Provider: MatchReportProvider,
  Frame: MatchReportFrame,
  Rail: MatchReportRail,
  Scoreboard: MatchReportScoreboard,
  ViewSwitcher: MatchReportViewSwitcher,
  Spacer: MatchReportSpacer,
  RailFooter: MatchReportRailFooter,
  Pane: MatchReportPane,
  // Pane parts still to come: TitleRow, Title, Facts, TitleActions,
  // CompareButton, MoreMenu (T4); Insight (T5).
  When: MatchReportWhen,
};
