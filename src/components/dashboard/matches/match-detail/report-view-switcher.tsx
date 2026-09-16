"use client";

import { ScatterChart, Table2, Video, type LucideIcon } from "lucide-react";
import { useMatchReport } from "@/components/dashboard/matches/match-detail/match-report-context";
import {
  REPORT_VIEWS,
  type ReportView,
} from "@/components/dashboard/matches/match-detail/report-view";
import { cn } from "@/lib/utils";

const VIEW_ICONS: Record<ReportView, LucideIcon> = {
  statistics: Table2,
  shots: ScatterChart,
  film: Video,
};

/**
 * The rail's view switcher (design 04 F1): Statistics · Visualizations · Video,
 * one 40px row each, under the scoreboard. It replaces the old top tab strip
 * (`match-tabs.tsx`) and keeps its semantics — a vertical tablist whose rows
 * are tabs — while the labels, the order and the `?tab=` rule come from
 * `REPORT_VIEWS`, and the active view and the history push from
 * `useMatchReport()`. Nothing here knows the view lives in the URL.
 *
 * No focus classes: every row is a `<button>`, and `focus.css` rings buttons.
 */
export function MatchReportViewSwitcher() {
  const { state, actions } = useMatchReport();

  return (
    <div
      role="tablist"
      aria-orientation="vertical"
      aria-label="Match report views"
      className="flex flex-col gap-0.5 px-3 pt-0.5"
    >
      {REPORT_VIEWS.map((view) => {
        const Icon = VIEW_ICONS[view.value];
        const isActive = view.value === state.view;
        return (
          <button
            key={view.value}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => actions.selectView(view.value)}
            className={cn(
              "flex h-10 cursor-pointer items-center rounded-[var(--radius-element)] text-[13px]",
              "transition-colors duration-200 ease-[var(--ease-primary)]",
              isActive
                ? "bg-[var(--surface-subtle)] font-medium text-[var(--ink-900)]"
                : "text-[var(--nav-fg)] hover:bg-[var(--surface-subtle)] hover:text-[var(--ink-900)]",
            )}
          >
            <span className="flex size-10 shrink-0 items-center justify-center">
              <Icon className="size-4" strokeWidth={1.5} aria-hidden="true" />
            </span>
            {/* `text-left`: a button centres its label by default, and this
                one fills the row. */}
            <span className="min-w-0 flex-1 truncate text-left">
              {view.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
