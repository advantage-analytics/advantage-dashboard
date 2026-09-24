import { FocusCard } from "@/components/dashboard/home/focus-card";
import { HomeWidgetFrame } from "@/components/dashboard/home/home-widget-frame";
import { SeasonTitleFrame } from "@/components/dashboard/home/season-title";
import { KpiTileStrip } from "@/components/dashboard/shared/kpi-tile";
import { SEASON_KPI_LABELS } from "@/lib/data/player-profile";
import {
  PendingBar,
  PendingRegion,
} from "@/components/dashboard/loading/pending";

function Footer() {
  return (
    <div className="flex justify-between border-t border-[var(--border-hairline)] pt-3">
      <PendingBar className="h-3 w-24" />
      <PendingBar className="h-3 w-28" />
    </div>
  );
}

/** Also used while the recent-matches browser query is pending. */
export function RecentMatchesSkeletonContent({
  animate = true,
}: {
  animate?: boolean;
}) {
  return (
    <div
      aria-hidden="true"
      className={animate ? undefined : "[&_[data-pending-bar]]:animate-none"}
    >
      {[0, 1].map((i) => (
        <div key={i} className="pt-3">
          <PendingBar className="h-[14px] w-44" />
          <PendingBar className="mt-2 h-3 w-20" />
          <div className="flex h-[62px] items-center gap-4">
            <PendingBar className="size-3.5 shrink-0 rounded-full" />
            <PendingBar className="w-40" />
            <PendingBar className="w-24" />
            <div className="ml-auto hidden gap-4 @2xl/matches:flex">
              {[0, 1, 2].map((j) => (
                <div key={j} className="flex flex-col items-end gap-2">
                  <PendingBar className="h-2 w-12" />
                  <PendingBar className="w-7" />
                </div>
              ))}
            </div>
          </div>
        </div>
      ))}
      <div className="mt-2.5">
        <Footer />
      </div>
    </div>
  );
}

/** Matches the two horizontal zone bars in ServePlacementQuietStrip. */
export function HomeServesPending() {
  return (
    <PendingRegion label="serve placement" innerClassName="flex flex-col gap-3">
      <PendingBar className="my-1 h-[17px] w-56" />
      {[0, 1].map((i) => (
        <div key={i} className="flex flex-col gap-2">
          <div className="flex justify-between">
            <PendingBar className="w-20" />
            <PendingBar className="w-14" />
          </div>
          <PendingBar className="h-3.5" />
          <PendingBar className="h-3 w-44" />
        </div>
      ))}
      <div className="mt-3 flex justify-between">
        <PendingBar className="w-32" />
        <PendingBar className="w-24" />
      </div>
      <PendingBar />
      <PendingBar className="w-4/5" />
    </PendingRegion>
  );
}
export function ServePlacementSkeleton() {
  return (
    <HomeWidgetFrame title="Serve placement" className="flex flex-col gap-3">
      <HomeServesPending />
    </HomeWidgetFrame>
  );
}
export function HomeTitlePending() {
  return (
    <SeasonTitleFrame>
      <PendingRegion label="season summary">
        <PendingBar className="h-3 w-56 rounded" />
      </PendingRegion>
    </SeasonTitleFrame>
  );
}
export function HomeKpisPending() {
  return (
    <KpiTileStrip collapse ariaLabel="Loading season statistics">
      {SEASON_KPI_LABELS.map((label) => (
        <div
          key={label}
          className="adv-kpi flex min-w-0 flex-1 flex-col gap-3 px-5 py-5"
        >
          <span className="truncate text-[9px] tracking-[2.5px] text-[var(--ink-400)] uppercase">
            {label}
          </span>
          <div aria-hidden="true" className="flex flex-col gap-3">
            <PendingBar className="h-7 w-16" />
            <PendingBar className="h-[15px] w-20" />
          </div>
        </div>
      ))}
    </KpiTileStrip>
  );
}
export function HomeRecentBodyPending() {
  return (
    <PendingRegion label="recent matches">
      <RecentMatchesSkeletonContent />
    </PendingRegion>
  );
}
export function HomeRecentPending() {
  return (
    <HomeWidgetFrame
      title="Recent matches"
      href="/dashboard/matches"
      action="All matches"
      className="@container/matches"
    >
      <HomeRecentBodyPending />
    </HomeWidgetFrame>
  );
}
export function HomeActivityBodyPending() {
  return (
    <PendingRegion label="activity">
      <div className="mt-3 flex justify-between">
        {Array.from({ length: 12 }, (_, i) => (
          <PendingBar key={i} className="h-3 w-5" />
        ))}
      </div>
      <div className="mt-1.5 grid grid-cols-[repeat(52,minmax(0,1fr))] gap-[2px]">
        {Array.from({ length: 364 }, (_, i) => (
          <PendingBar key={i} className="aspect-square h-auto rounded-[1px]" />
        ))}
      </div>
      <PendingBar className="mt-3 h-3 w-32" />
    </PendingRegion>
  );
}
export function HomeActivityPending() {
  return (
    <HomeWidgetFrame
      title="Activity"
      href="/dashboard/matches"
      action="Session log"
      className="@container/activity flex flex-col gap-1.5"
    >
      <HomeActivityBodyPending />
    </HomeWidgetFrame>
  );
}
/**
 * The Advantage Intelligence card while its evidence is still being computed.
 * The real chrome (mark, engine name) renders immediately so the column keeps
 * its shape; only the claim, evidence run and footer pulse. Shared by Home and
 * Team Home — a `null` fallback here made the card pop in after its siblings.
 */
export function FocusCardPending() {
  return (
    <FocusCard showStatisticsLink={false}>
      <PendingRegion
        label="Advantage Intelligence"
        innerClassName="flex flex-col gap-3"
      >
        <PendingBar className="h-[14px] w-[72%]" />
        <div className="flex flex-col gap-2">
          <PendingBar className="h-2.5" />
          <PendingBar className="h-2.5 w-[86%]" />
        </div>
        <Footer />
      </PendingRegion>
    </FocusCard>
  );
}
export function HomeFooterPending() {
  return (
    <div aria-hidden="true">
      <Footer />
    </div>
  );
}
export function HomePageSkeleton() {
  return (
    <div className="w-full flex-1 bg-white">
      <div className="mx-auto flex min-h-[calc(100vh-var(--header-h))] max-w-screen-2xl flex-col gap-4 px-14 pt-5 pb-8">
        <HomeTitlePending />
        <HomeKpisPending />
        <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_400px]">
          <div className="flex min-w-0 flex-col gap-5">
            <HomeRecentPending />
            <HomeActivityPending />
          </div>
          <ServePlacementSkeleton />
        </div>
        <div className="mt-auto pt-1">
          <HomeFooterPending />
        </div>
      </div>
    </div>
  );
}
