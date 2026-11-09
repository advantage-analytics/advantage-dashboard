"use client";

import type { ReactNode } from "react";
import { ScatterChart, Table2, type LucideIcon } from "lucide-react";
import { usePathname, useSearchParams } from "next/navigation";
import { viewRowClass } from "@/components/dashboard/matches/match-detail/report-view-switcher";
import {
  PROFILE_VIEWS,
  PROFILE_VIEW_PARAM,
  parseProfileView,
  profileViewLabel,
  profileViewQuery,
  type ProfileView,
} from "@/components/dashboard/team/player-profile/profile-view";

/**
 * The player profile's client half of the report frame (design Q): the rail's
 * two-row view switcher and the pane title that names the active view.
 *
 * The frame itself — `MatchReportFrame` / `Rail` / `Pane` — is the match
 * report's, composed by the page; only what has to know the active view lives
 * here. Both read it from the URL (`?tab=`, `profile-view.ts`) and nothing
 * else, so the rail row and the title can never disagree, and no provider is
 * needed to keep them in step.
 */

const VIEW_ICONS: Record<ProfileView, LucideIcon> = {
  statistics: Table2,
  visualizations: ScatterChart,
};

/** The active profile view, from `?tab=`. */
export function useProfileView(): ProfileView {
  const searchParams = useSearchParams();
  return parseProfileView(searchParams.get(PROFILE_VIEW_PARAM));
}

/**
 * Statistics · Visualizations, one 40px row each — the report switcher's
 * markup (`report-view-switcher.tsx`): a vertical tablist of `<button
 * role="tab">` rows drawn by `viewRowClass`, the neutral wash on the active
 * one.
 *
 * Native history rather than `router.push`, as the report does: Next keeps
 * `useSearchParams` in step with it without rendering the page again on the
 * server, and each switch is its own Back entry.
 */
export function ProfileViewSwitcher() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const active = parseProfileView(searchParams.get(PROFILE_VIEW_PARAM));

  function select(view: ProfileView) {
    if (view === active) return;
    const query = profileViewQuery(
      new URLSearchParams(searchParams.toString()),
      view,
    );
    window.history.pushState(
      null,
      "",
      query ? `${pathname}?${query}` : pathname,
    );
  }

  return (
    <div
      role="tablist"
      aria-orientation="vertical"
      aria-label="Player profile views"
      className="flex flex-col gap-0.5 px-3 pt-2.5"
    >
      {PROFILE_VIEWS.map((view) => {
        const Icon = VIEW_ICONS[view.value];
        const isActive = view.value === active;
        return (
          <button
            key={view.value}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => select(view.value)}
            className={viewRowClass(isActive)}
          >
            <span className="flex size-10 shrink-0 items-center justify-center">
              <Icon className="size-4" strokeWidth={1.5} aria-hidden="true" />
            </span>
            <span className="min-w-0 flex-1 truncate text-left">
              {view.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/**
 * The pane's first heading, naming the active view — `MatchReportTitle`'s
 * type (`.text-title-lg`, tracking −0.3px inline because the class is
 * unlayered).
 */
export function ProfileTitle() {
  const view = useProfileView();
  return (
    <h1
      className="text-title-lg whitespace-nowrap"
      style={{ letterSpacing: "-0.3px" }}
    >
      {profileViewLabel(view)}
    </h1>
  );
}

/**
 * Renders its children only while `view` is the active one — the profile's
 * `MatchReportWhen`, read from `?tab=` like the switcher and the title, and
 * with its panel classes (`flex-1` without `min-h-0`, so a long view grows
 * the panel and the pane's bottom padding lands under the last card). An
 * inactive view unmounts rather than hides, so a chart's hover state never
 * outlives the switch away from it.
 *
 * The switch is client-side (native history, no server render), and this
 * decides which rendered body shows. A Statistics request renders both
 * bodies, so the switch to Visualizations costs nothing; a Visualizations
 * request (`?tab=visualizations`, every viz click) renders only its own and
 * puts `ProfileStatisticsDeferred` in the Statistics slot, which asks the
 * server for the rest the moment it shows — `page.tsx`, "What a
 * Visualizations request skips".
 */
export function ProfileViewWhen({
  view,
  children,
}: {
  view: ProfileView;
  children: ReactNode;
}) {
  const active = useProfileView();
  if (active !== view) return null;
  return (
    <div role="tabpanel" className="flex flex-1 flex-col gap-4">
      {children}
    </div>
  );
}
