"use client";

import type { ReactNode } from "react";
import {
  MatchReportProvider,
  useMatchReport,
} from "@/components/dashboard/matches/match-detail/match-report-context";
import type { ReportView } from "@/components/dashboard/matches/match-detail/report-view";
import { MatchReportScoreboard } from "@/components/dashboard/matches/match-detail/report-scoreboard";
import { MatchReportViewSwitcher } from "@/components/dashboard/matches/match-detail/report-view-switcher";
import {
  MatchReportTitle,
  MatchReportTitleActions,
  MatchReportTitleRow,
} from "@/components/dashboard/matches/match-detail/report-title-row";
import { MatchReportFacts } from "@/components/dashboard/matches/match-detail/report-facts";
import { MatchReportCompareButton } from "@/components/dashboard/matches/match-detail/report-compare-button";
import { MatchReportMoreMenu } from "@/components/dashboard/matches/match-detail/report-more-menu";
import { MatchReportInsight } from "@/components/dashboard/matches/match-detail/report-insight-card";
import { cn } from "@/lib/utils";
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
 * flex link carries `min-h-0` — Frame → Rail / Pane. Drop one and that pane
 * grows to its content and the page scrolls as a whole instead. `When` is the
 * one link that must not: it sits inside the scroller (see its note).
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

/**
 * `@container` makes the pane the size container the Statistics view's widgets
 * row queries (`@min-[720px]:` in `statistics-view.tsx`): the row answers to
 * the pane's own content width, which the sidebar and the rail both take from,
 * not to the window. It is the only unnamed container inside the pane; name it
 * (`@container/report`) if a nested one ever appears.
 */
export function MatchReportPane({ children }: { children: ReactNode }) {
  return (
    <div
      className="@container flex min-h-0 min-w-0 flex-1 flex-col gap-4 overflow-y-auto"
      // White, per design-system principle 6 ("the dashboard is white" — the
      // report and its rail are `--surface-card`, and the cards separate by
      // their hairline and shadow). F1 draws this pane on the grey page
      // ground; that was overruled after the build (spec › Decisions 1).
      style={{
        padding: "20px 56px 24px",
        background: "var(--surface-card)",
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
 *
 * `flex-1` without `min-h-0`: a short view (the Video empty state) still fills
 * the pane, and a long one grows the panel to its content, so the pane's 24px
 * bottom padding lands under the last card. With `min-h-0` the panel stayed
 * pane-height, its content overflowed it, and the scroll ended flush against
 * the last card (measured 0px on an overflowing Statistics view, 24px without).
 *
 * `scrollsInside` is the one exception, for a view that owns its own
 * scroller: the Video view's point list scrolls inside its card, so the panel
 * takes `min-h-0` and stays pane-height — that is what hands the list a
 * height to scroll within. Nothing in that view overflows the panel, so the
 * pane's bottom padding still lands where it should.
 */
export function MatchReportWhen({
  view,
  scrollsInside = false,
  children,
}: {
  view: ReportView;
  scrollsInside?: boolean;
  children: ReactNode;
}) {
  const { state } = useMatchReport();
  if (state.view !== view) return null;
  return (
    <div
      role="tabpanel"
      className={cn("flex flex-1 flex-col gap-4", scrollsInside && "min-h-0")}
    >
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
  TitleRow: MatchReportTitleRow,
  Title: MatchReportTitle,
  Facts: MatchReportFacts,
  TitleActions: MatchReportTitleActions,
  CompareButton: MatchReportCompareButton,
  MoreMenu: MatchReportMoreMenu,
  // Rendered inside the Statistics view's `When`, not beside it (spec ›
  // Decisions 5); it follows the title row in reading order either way.
  Insight: MatchReportInsight,
  When: MatchReportWhen,
};
