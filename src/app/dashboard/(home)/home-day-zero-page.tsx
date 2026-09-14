"use client";

import { useMemo } from "react";
import HomeContent from "./home-content";
import RecentActivity from "./recent-activity";
import { SeasonKpiStrip } from "@/components/dashboard/shared/season-kpi-strip";
import { ActivityWidget } from "@/components/dashboard/home/activity-widget";
import { FocusCard } from "@/components/dashboard/home/focus-card";
import { FocusEmpty } from "@/components/dashboard/home/focus-empty";
import { HomeWidgetFrame } from "@/components/dashboard/home/home-widget-frame";
import ServePlacementHome from "@/components/dashboard/home/serve-placement-home";
import { personalActivityFrom } from "@/lib/data/personal-activity";

const NO_EVENTS: never[] = [];
const NO_SERVES = { dots: [], matchCount: 0 };

/**
 * The personal Home with no match: the offer over every card, empty.
 *
 * Needs nothing but the viewer's id, because "no personal match" empties every
 * region the page streams — no stats, no recent rows, a blank heatmap, no
 * serves, no insight. So `page.tsx` draws it without starting a read, and the
 * route's loading fallback draws the identical page before the page has run,
 * rather than a populated skeleton (title row, footer and all) that day zero
 * never shows.
 *
 * The regions are the page's own components with empty data, not look-alikes;
 * `HomeContent` composes them exactly as it does for a populated Home.
 */
export function HomeDayZeroPage({ userId }: { userId: string }) {
  const playerIds = useMemo(() => [userId], [userId]);
  const activity = useMemo(() => personalActivityFrom([]), []);
  return (
    <div className="flex w-full flex-1 flex-col bg-white">
      <div className="mx-auto flex w-full max-w-screen-2xl flex-1 flex-col px-14 pt-5 pb-8">
        <HomeContent
          key={userId}
          hasMatches={false}
          title={null}
          footer={null}
          kpiStrip={
            <SeasonKpiStrip kpis={[]} hasStats={false} matchesPlayed={0} />
          }
          recent={
            <HomeWidgetFrame
              title="Recent matches"
              action="All matches"
              className="@container/matches"
            >
              <RecentActivity
                userId={userId}
                playerIds={playerIds}
                hasMatches={false}
                showEmptyAction={false}
                matchCount={0}
                wonCount={0}
                initialEvents={NO_EVENTS}
              />
            </HomeWidgetFrame>
          }
          activity={
            <HomeWidgetFrame
              title="Activity"
              action="Session log"
              className="@container/activity flex flex-col gap-1.5"
            >
              <ActivityWidget activity={activity} />
            </HomeWidgetFrame>
          }
          insight={
            <FocusCard
              showStatisticsLink={false}
              footer={{ left: "One thing to work on, after your first match." }}
            >
              <FocusEmpty />
            </FocusCard>
          }
          serves={
            <HomeWidgetFrame
              title="Serve placement"
              action="Placement view"
              className="flex flex-col gap-3"
            >
              <ServePlacementHome initialData={NO_SERVES} />
            </HomeWidgetFrame>
          }
        />
      </div>
    </div>
  );
}
