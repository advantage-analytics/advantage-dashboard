"use client";

import { ScatterChart, Table2, type LucideIcon } from "lucide-react";
import {
  MatchReportFrame,
  MatchReportPane,
  MatchReportRail,
  MatchReportRailFooter,
  MatchReportSpacer,
} from "@/components/dashboard/matches/match-detail/match-report";
import {
  MatchReportTitleActions,
  MatchReportTitleRow,
} from "@/components/dashboard/matches/match-detail/report-title-row";
import { viewRowClass } from "@/components/dashboard/matches/match-detail/report-view-switcher";
import { useProfileView } from "@/components/dashboard/team/player-profile/profile-frame";
import {
  PROFILE_VIEWS,
  profileViewLabel,
  type ProfileView,
} from "@/components/dashboard/team/player-profile/profile-view";
import { cn } from "@/lib/utils";
import { InsightPending, StatisticsRowPending } from "./match-report-pending";
import { PendingBar, PendingRegion } from "./pending";

/**
 * The team player profile's skeletons (design Q — the match report's frame
 * with a player in the scoreboard's slot). Carbon's loading pattern, as the
 * report's (`match-report-pending.tsx`): the chrome the page already knows
 * renders as itself — the view names on the rail, the pane's `<h1>`, the
 * cards' eyebrows and the head-to-head group labels — and only what is
 * arriving is a bar.
 *
 * Three consumers:
 *
 *   `roster/[playerId]/loading.tsx` → `PlayerProfileSkeleton`, the whole page
 *                                     while the profile and roster reads land
 *   `roster/[playerId]/page.tsx`    → `ProfileStatisticsPanePending` and
 *                                     `ProfileVisualizationsPanePending` as
 *                                     the two bodies' Suspense fallbacks, and
 *                                     `AnalyzedCountPending` for the facts
 *                                     line's "· N analyzed"
 *
 * The Statistics pane is the report's own parts (`InsightPending`,
 * `StatisticsRowPending`), so the profile and the report cannot drift apart:
 * `profile-statistics-view.tsx` draws the report's row class for class. The
 * Visualizations pane is the redesign wall's shape (`viz-wall.tsx`'s strip
 * and 2×2 grid of `wall-card.tsx` cards).
 *
 * The rail mirrors `profile-rail.tsx`'s spacing — the player block's 18/13/20
 * padding and line heights, the switcher's 40px rows, the links' 13px lines,
 * New match's 36px button — so nothing moves when the page lands. Conditional
 * lines the skeleton cannot know about (hand and backhand, the state pill)
 * are not drawn; New match is, since most viewers can record one.
 */

const VIEW_ICONS: Record<ProfileView, LucideIcon> = {
  statistics: Table2,
  visualizations: ScatterChart,
};

/* ── Rail ──────────────────────────────────────────────────────────────── */

/**
 * `ProfilePlayerBlock`'s geometry: the 40px avatar beside the name (20px
 * line) and facts line (18px), then the Record row (the form strip's 28px
 * slot) under a 16px gap, its value on the name's edge. Plays is
 * conditional, so it is not drawn.
 */
function PlayerBlockPending() {
  return (
    <div className="px-3">
      <div
        className="flex flex-col gap-4 border-b border-[var(--border-hairline)]"
        style={{ padding: "18px 13px 20px" }}
      >
        <div className="flex items-center gap-3">
          <PendingBar className="size-10 shrink-0 rounded-full" />
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <div className="flex h-5 items-center">
              <PendingBar className="h-3 w-32" />
            </div>
            <div className="flex h-[18px] items-center">
              <PendingBar className="h-2.5 w-24" />
            </div>
          </div>
        </div>
        <div className="grid grid-cols-[52px_minmax(0,1fr)] items-center">
          <PendingBar className="h-2.5 w-10" />
          <div className="flex h-7 items-center gap-2">
            <PendingBar className="h-2.5 w-8" />
            <PendingBar className="h-3 w-16" />
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Statistics · Visualizations as plain `div`s drawn by the real
 * `viewRowClass`: real labels and icons, the incoming view washed active,
 * nothing focusable and nothing announced — the page is not interactive yet.
 */
function SwitcherPending({ active }: { active: ProfileView }) {
  return (
    <div className="flex flex-col gap-0.5 px-3 pt-2.5" aria-hidden="true">
      {PROFILE_VIEWS.map((view) => {
        const Icon = VIEW_ICONS[view.value];
        return (
          <div
            key={view.value}
            className={cn(
              viewRowClass(view.value === active),
              "cursor-default",
            )}
          >
            <span className="flex size-10 shrink-0 items-center justify-center">
              <Icon className="size-4" strokeWidth={1.5} aria-hidden="true" />
            </span>
            <span className="min-w-0 flex-1 truncate text-left">
              {view.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/** The two quiet links on one 13px line ("12 matches ›  9 opponents ›"). */
function RailLinksPending() {
  return (
    <PendingRegion
      label="player links"
      innerClassName="flex flex-wrap items-center gap-x-5 gap-y-2 px-6 pt-5"
    >
      <div className="flex h-[19.5px] items-center">
        <PendingBar className="h-2.5 w-16" />
      </div>
      <div className="flex h-[19.5px] items-center">
        <PendingBar className="h-2.5 w-20" />
      </div>
    </PendingRegion>
  );
}

/* ── Pane ──────────────────────────────────────────────────────────────── */

/**
 * The facts line's "· N analyzed" while the season loads: the separator and
 * one bar, sized to the clause it stands for so the line does not move when
 * the count lands. The page's own `<Suspense>` fallback, and drawn the same
 * way in the route skeleton.
 */
export function AnalyzedCountPending() {
  return (
    <span
      role="status"
      aria-label="Loading analyzed count"
      className="flex items-center gap-1"
    >
      <span aria-hidden="true">·</span>
      <PendingBar className="h-2.5 w-14" />
    </span>
  );
}

/**
 * The real `<h1>` — the view's name is in the URL before the player is
 * loaded — over the facts line ("N matches" a bar, then the analyzed clause),
 * with Ask, the one action every viewer has, as a 32px square.
 */
function TitleRowPending({ view }: { view: ProfileView }) {
  return (
    <MatchReportTitleRow>
      <div className="min-w-0">
        <h1
          className="text-title-lg whitespace-nowrap"
          style={{ letterSpacing: "-0.3px" }}
        >
          {profileViewLabel(view)}
        </h1>
        <div
          className="text-micro tabular mt-[9px] flex min-h-[18px] items-center gap-1"
          style={{ color: "var(--ink-700)" }}
        >
          <PendingRegion label="match count" className="flex items-center">
            <PendingBar className="h-2.5 w-14" />
          </PendingRegion>
          <AnalyzedCountPending />
        </div>
      </div>
      <MatchReportTitleActions>
        <PendingBar className="size-8 rounded-[var(--radius-button)]" />
      </MatchReportTitleActions>
    </MatchReportTitleRow>
  );
}

/**
 * `profile-statistics-view.tsx`: the insight slot — the report's
 * `INSIGHT_SURFACE` with the real engine credit and no fold toggle, as
 * `ProfileInsightEmpty` draws it — then the report's widgets row: the season
 * Head to head beside the four charts, 1:1 from 720px of pane. The season
 * tracker draws no set labels.
 */
export function ProfileStatisticsPanePending() {
  return (
    <PendingRegion
      label="statistics"
      className="shrink-0"
      innerClassName="flex flex-col gap-4"
    >
      <InsightPending toggle={false} />
      <StatisticsRowPending setLabels={false} />
    </PendingRegion>
  );
}

/**
 * `profile-visualizations-view.tsx`: the redesign wall's shape
 * (`viz-wall.tsx`, canvas W5 + card D3) — the strip's chips (`Default |
 * Saved`, `You | Opponent`, the legend's keys) as 26px pills, then the four
 * cards in the wall's 2×2 grid from 640px of pane: each a court (the card's
 * 334:216 frame) over a footer with the title and count line, the 6px split
 * bar and its key. Bars only, since every word on the loaded wall is a
 * figure or a count that has not arrived yet.
 */
export function ProfileVisualizationsPanePending() {
  return (
    <PendingRegion
      label="visualizations"
      className="shrink-0"
      innerClassName="@container flex flex-col gap-[18px]"
    >
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex gap-2">
          <PendingBar className="h-[26px] w-[66px] rounded-[var(--radius-pill)]" />
          <PendingBar className="h-[26px] w-[60px] rounded-[var(--radius-pill)]" />
        </div>
        <span
          aria-hidden="true"
          className="h-4 w-px"
          style={{ backgroundColor: "var(--border-medium)" }}
        />
        <div className="flex gap-2">
          <PendingBar className="h-[26px] w-[50px] rounded-[var(--radius-pill)]" />
          <PendingBar className="h-[26px] w-[82px] rounded-[var(--radius-pill)]" />
        </div>
        <div className="flex-1" />
        <div className="flex items-center gap-x-[14px]">
          <PendingBar className="h-2.5 w-10" />
          <PendingBar className="h-2.5 w-10" />
          <PendingBar className="h-2.5 w-10" />
          <PendingBar className="h-2.5 w-14" />
        </div>
      </div>
      <div className="grid grid-cols-1 gap-4 @min-[640px]:grid-cols-2">
        {Array.from({ length: 4 }, (_, i) => (
          <div
            key={i}
            className="flex flex-col rounded-[var(--radius-card)] border border-[var(--border-hairline)] bg-[var(--surface-card)] shadow-[var(--shadow-card)]"
          >
            <div
              className="max-h-[300px] w-full overflow-hidden rounded-t-[var(--radius-card)]"
              style={{ aspectRatio: "334 / 216" }}
            >
              <PendingBar className="h-full w-full rounded-none" />
            </div>
            <div className="flex flex-col gap-1 border-t border-[var(--border-hairline)] px-5 pt-[14px] pb-[18px]">
              <div className="flex h-5 items-center justify-between gap-3">
                <PendingBar className="h-3 w-28" />
                <PendingBar className="h-2.5 w-16" />
              </div>
              <PendingBar className="mt-[10px] h-[6px] w-full rounded-[3px]" />
              <div className="mt-[6px] flex h-4 items-center gap-x-[14px]">
                <PendingBar className="h-2.5 w-12" />
                <PendingBar className="h-2.5 w-10" />
                <PendingBar className="h-2.5 w-12" />
                <PendingBar className="h-2.5 w-10" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </PendingRegion>
  );
}

/* ── The page ──────────────────────────────────────────────────────────── */

/**
 * The whole profile, pending: the page's bounded box, the rail and the pane
 * for `view` — the Statistics pane or the Visualizations wall, each the
 * shape the loaded page draws under the title row. Pure props — what the
 * offline spec renders; `PlayerProfileSkeleton` reads the URL.
 */
export function PlayerProfilePending({ view }: { view: ProfileView }) {
  return (
    <div className="flex h-[calc(100dvh-var(--header-h))] w-full flex-col overflow-hidden bg-white">
      <MatchReportFrame>
        <MatchReportRail label="Player summary">
          <PendingRegion label="player summary">
            <PlayerBlockPending />
          </PendingRegion>
          <SwitcherPending active={view} />
          <RailLinksPending />
          <MatchReportSpacer />
          <MatchReportRailFooter>
            <PendingBar className="h-9 rounded-[var(--radius-button)]" />
          </MatchReportRailFooter>
        </MatchReportRail>
        <MatchReportPane>
          <TitleRowPending view={view} />
          <div className="flex flex-1 flex-col gap-4">
            {view === "statistics" ? (
              <ProfileStatisticsPanePending />
            ) : (
              <ProfileVisualizationsPanePending />
            )}
          </div>
        </MatchReportPane>
      </MatchReportFrame>
    </div>
  );
}

/**
 * The route skeleton: `PlayerProfilePending` for the view in `?tab=`, read
 * the way the loaded switcher and title read it (`useProfileView`), so a
 * statistics table under a "Visualizations" title is never promised.
 */
export function PlayerProfileSkeleton() {
  return <PlayerProfilePending view={useProfileView()} />;
}
