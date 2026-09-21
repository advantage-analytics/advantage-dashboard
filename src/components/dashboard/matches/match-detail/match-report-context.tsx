"use client";

import { createContext, use, useMemo, useState, type ReactNode } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import {
  parseReportView,
  reportViewQuery,
  type ReportView,
} from "@/components/dashboard/matches/match-detail/report-view";
import { FilmHeadProvider } from "@/components/dashboard/matches/match-detail/film-head-context";

/**
 * The match report's one context: state, actions and meta (settled Statistics
 * page, design 04 F1–F8). Same shape as `new-match-wizard/UploadWizardProvider.tsx`
 * — React 19 `createContext` read with `use()`, rendered as `<Context value>`.
 *
 * This provider is the only thing that knows where the report's state lives:
 * the active view in the URL (`?tab=`, through `report-view.ts`) and the
 * insight's collapse in component state. The insight has no dismiss: it is the
 * report's own summary, so it can be folded away but not thrown out. Every `MatchReport` part reads the interface,
 * so none of them can drift from another about which view is showing.
 *
 * `meta` is what `page.tsx` already decided on the server and passes in as
 * props — it never changes on the client. `summary` is the viewer's own
 * insight, already `sides.pick`ed (guardrails §4); nothing below re-picks it.
 */

export type InsightStatus = "expanded" | "collapsed";

export interface MatchReportState {
  view: ReportView;
  insight: InsightStatus;
}

export interface MatchReportActions {
  /** One history entry per view, exactly as `match-tabs.tsx`'s `select`. */
  selectView(view: ReportView): void;
  collapseInsight(): void;
  expandInsight(): void;
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

  // Collapse is only this visit's state; every visit opens expanded.
  const [insight, setInsight] = useState<InsightStatus>("expanded");

  const actions = useMemo<MatchReportActions>(
    () => ({
      selectView(next) {
        if (next === view) return;
        // Native history rather than `router.push`: Next keeps
        // `useSearchParams`/`usePathname` in sync with it without fetching the
        // report again, and each push is its own entry, so Back restores the
        // previous view. `reportViewQuery` carries every other parameter
        // through.
        const query = reportViewQuery(searchParams, next);
        window.history.pushState(
          null,
          "",
          query ? `${pathname}?${query}` : pathname,
        );
      },
      collapseInsight() {
        setInsight("collapsed");
      },
      expandInsight() {
        setInsight("expanded");
      },
    }),
    [view, searchParams, pathname],
  );

  const meta = useMemo<MatchReportMeta>(
    () => ({ matchId, summary, canCompare, isDerived, statsPublished }),
    [matchId, summary, canCompare, isDerived, statsPublished],
  );

  const value = useMemo<MatchReportContextValue>(
    () => ({ state: { view, insight }, actions, meta }),
    [view, insight, actions, meta],
  );

  // The film head rides alongside, in its own context: it moves several times
  // a second and only the rail scoreboard reads it (`film-head-context.tsx`).
  return (
    <MatchReportContext value={value}>
      <FilmHeadProvider>{children}</FilmHeadProvider>
    </MatchReportContext>
  );
}
