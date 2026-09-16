"use client";

import { createContext, use, useMemo, useState, type ReactNode } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { useInsightDismissal } from "@/components/dashboard/matches/match-detail/insight-dismissal";
import {
  parseReportView,
  reportViewQuery,
  type ReportView,
} from "@/components/dashboard/matches/match-detail/report-view";

/**
 * The match report's one context: state, actions and meta (settled Statistics
 * page, design 04 F1–F8). Same shape as `new-match-wizard/UploadWizardProvider.tsx`
 * — React 19 `createContext` read with `use()`, rendered as `<Context value>`.
 *
 * This provider is the only thing that knows where the report's state lives:
 * the active view in the URL (`?tab=`, through `report-view.ts`), the insight's
 * dismissal in localStorage (`insight-dismissal.ts`, key unchanged), and its
 * collapse in component state. Every `MatchReport` part reads the interface,
 * so none of them can drift from another about which view is showing.
 *
 * `meta` is what `page.tsx` already decided on the server and passes in as
 * props — it never changes on the client. `summary` is the viewer's own
 * insight, already `sides.pick`ed (guardrails §4); nothing below re-picks it.
 */

export type InsightStatus = "expanded" | "collapsed" | "dismissed";

export interface MatchReportState {
  view: ReportView;
  insight: InsightStatus;
}

export interface MatchReportActions {
  /** One history entry per view, exactly as `match-tabs.tsx`'s `select`. */
  selectView(view: ReportView): void;
  collapseInsight(): void;
  expandInsight(): void;
  /** Permanent for this match — `advantage-ai-insight-dismissed:${matchId}`. */
  dismissInsight(): void;
}

export interface MatchReportMeta {
  matchId: string;
  /** The viewer's insight, already `sides.pick`ed in `page.tsx`. */
  summary: string | null;
  /** `hasComparisonBaseline(kpiHistory)` — computed on the server. */
  canCompare: boolean;
  /** `sourceProvider === "splitstep"`. */
  isDerived: boolean;
  /** Both `match_stats` rows present. */
  statsPublished: boolean;
}

export interface MatchReportContextValue {
  state: MatchReportState;
  actions: MatchReportActions;
  meta: MatchReportMeta;
}

const MatchReportContext = createContext<MatchReportContextValue | null>(null);

export function useMatchReport(): MatchReportContextValue {
  const value = use(MatchReportContext);
  if (!value) {
    throw new Error("useMatchReport must be used inside MatchReportProvider");
  }
  return value;
}

export interface MatchReportProviderProps extends MatchReportMeta {
  children: ReactNode;
}

export function MatchReportProvider({
  matchId,
  summary,
  canCompare,
  isDerived,
  statsPublished,
  children,
}: MatchReportProviderProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  // Anything that is not a known view reads as Statistics, never an error.
  const view = parseReportView(searchParams.get("tab"));

  // Dismissal is the stored, cross-tab flag; collapse is only this visit's
  // state. The dismissal hook's server snapshot says "dismissed", so the
  // server markup and the hydration render agree and the insight card mounts
  // just after hydration — never flashing in and back out for a player who
  // already dismissed it. Accepted, not a bug.
  const { dismissed, dismiss } = useInsightDismissal(matchId);
  const [expansion, setExpansion] = useState<"expanded" | "collapsed">(
    "expanded",
  );
  const insight: InsightStatus = dismissed ? "dismissed" : expansion;

  const actions = useMemo<MatchReportActions>(
    () => ({
      selectView(next) {
        if (next === view) return;
        // Native history rather than `router.push`: Next keeps
        // `useSearchParams`/`usePathname` in sync with it without fetching the
        // report again, and each push is its own entry, so Back restores the
        // previous view. `reportViewQuery` carries `?set=` and anything else
        // through.
        const query = reportViewQuery(searchParams, next);
        window.history.pushState(
          null,
          "",
          query ? `${pathname}?${query}` : pathname,
        );
      },
      collapseInsight() {
        setExpansion("collapsed");
      },
      expandInsight() {
        setExpansion("expanded");
      },
      dismissInsight() {
        dismiss();
      },
    }),
    [view, searchParams, pathname, dismiss],
  );

  const meta = useMemo<MatchReportMeta>(
    () => ({ matchId, summary, canCompare, isDerived, statsPublished }),
    [matchId, summary, canCompare, isDerived, statsPublished],
  );

  const value = useMemo<MatchReportContextValue>(
    () => ({ state: { view, insight }, actions, meta }),
    [view, insight, actions, meta],
  );

  return <MatchReportContext value={value}>{children}</MatchReportContext>;
}
