"use client";

import { useSearchParams } from "next/navigation";
import {
  MatchTabs,
  parseMatchTab,
  type MatchTab,
} from "@/components/dashboard/matches/match-detail/match-tabs";

/**
 * The round-46 match page frame: a 300px rail and a content pane, each with
 * its own scroll (artboard 46a–46d). Same min-h-0 flex pattern as
 * `schedule/event-shell.tsx`'s flush mode — the page fills whatever the 44px
 * dashboard header leaves, and neither pane ever scrolls the other.
 *
 * Two modes:
 * - `tabs` set → the sticky tab strip renders and the active `?tab=` panel
 *   shows (Statistics when the param is absent).
 * - `tabs` absent → `children` render alone in the pane. This is the
 *   analysing/failed state (guardrails §3.3): rail identity plus
 *   `MatchAnalysisProgress`, no tabs, no stat sections.
 */

interface MatchDetailShellProps {
  rail: React.ReactNode;
  tabs?: {
    statistics: React.ReactNode;
    shots: React.ReactNode;
    film: React.ReactNode;
  };
  /**
   * The tab row's right edge, keyed by tab. Only the active tab's entry
   * renders: a control there filters one pane's cards, so it must not outlive
   * the panel it belongs to — the Statistics set scope would otherwise sit
   * over Film room filtering nothing.
   */
  tabBarTrailing?: Partial<Record<MatchTab, React.ReactNode>>;
  children?: React.ReactNode;
}

export function MatchDetailShell({
  rail,
  tabs,
  tabBarTrailing,
  children,
}: MatchDetailShellProps) {
  const searchParams = useSearchParams();
  const active = parseMatchTab(searchParams.get("tab"));

  return (
    <div className="flex min-h-0 w-full flex-1 items-stretch">
      <aside
        aria-label="Match summary"
        className="flex min-h-0 flex-col overflow-y-auto border-r border-[var(--border-hairline)] p-0 [flex:0_0_300px]"
      >
        {rail}
      </aside>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3.5 overflow-y-auto bg-[var(--surface-card)] px-5 pb-4">
        {tabs ? (
          <>
            <MatchTabs active={active} trailing={tabBarTrailing?.[active]} />
            <div role="tabpanel" className="flex flex-col gap-4">
              {tabs[active]}
            </div>
          </>
        ) : (
          <div className="flex flex-col pt-6">{children}</div>
        )}
      </div>
    </div>
  );
}
