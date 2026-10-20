"use client";

import { HomePageSkeleton } from "@/components/dashboard/loading/page-skeletons";
import { PresenceGate } from "@/components/dashboard/presence-provider";
import { useWorkspace } from "@/components/dashboard/workspace-provider";
import { HomeDayZeroPage } from "./home-day-zero-page";

/**
 * Home's route fallback. With no personal match there is nothing to load, so
 * it draws the day-zero page itself instead of a populated skeleton.
 */
export function HomePagePending() {
  const { active, viewer } = useWorkspace();
  // A team workspace is redirected to Team Home; never offer it personal copy.
  return (
    <PresenceGate
      surface="home"
      dayZero={
        active.kind === "personal" ? (
          <HomeDayZeroPage userId={viewer.id} />
        ) : null
      }
      skeleton={<HomePageSkeleton />}
    />
  );
}
