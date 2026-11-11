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
import { MatchReportMoreMenu } from "@/components/dashboard/matches/match-detail/report-more-menu";
import { MatchReportInsight } from "@/components/dashboard/matches/match-detail/report-insight-card";
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
 * `h-[calc(100dvh-var(--header-h))] overflow-hidden` box, and only while every
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
  return (
    <div className="relative flex min-h-0 flex-1 items-stretch">{children}</div>
  );
}

/**
 * `label` names the landmark: "Match summary" on the report, "Player summary"
 * on the team player profile, which borrows this frame (design Q).
 */
export function MatchReportRail({
  label = "Match summary",
  children,
}: {
  label?: string;
  children: ReactNode;
}) {
  return (
    <aside
      aria-label={label}
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
 *
 * `id="match-report-pane"`: this is the ONE scrollable ancestor for every
 * report view, and the filters drawer (`filter-rail.tsx`) reaches it by this
 * id. A `ref` can't cross this boundary cleanly since the views mount
 * several DOM levels below this div with no shared context carrying a ref
 * down; the id is the simplest correct handle, matching this codebase's
 * existing `document.getElementById(...)`
 * pattern for cross-tree DOM reach (e.g. `matches-page-content.tsx`,
 * `static-schedule.tsx`).
 */
export function MatchReportPane({ children }: { children: ReactNode }) {
  return (
    <div
      id="match-report-pane"
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
 * The Video view is no exception, though its point list scrolls inside its
 * own card: side by side that list is out of flow and takes the row's height,
 * so the panel's content is the player and "This point", which fit a normal
 * window. On one too short for them the panel grows like any other and the
 * pane scrolls, bottom padding included.
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
    <div role="tabpanel" className="flex flex-1 flex-col gap-4">
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
  MoreMenu: MatchReportMoreMenu,
  // Rendered inside the Statistics view's `When`, not beside it (spec ›
  // Decisions 5); it follows the title row in reading order either way.
  Insight: MatchReportInsight,
  When: MatchReportWhen,
};
