"use client";

import { HomePageSkeleton } from "@/components/dashboard/loading/page-skeletons";
import { useIsDayZero } from "@/components/dashboard/presence-provider";
import { useWorkspace } from "@/components/dashboard/workspace-provider";
import { HomeDayZeroPage } from "./home-day-zero-page";

/**
 * Home's route fallback. With no personal match there is nothing to load, so
 * it draws the day-zero page itself instead of a populated skeleton.
 */
export function HomePagePending() {
  const { active, viewer } = useWorkspace();
  const dayZero = useIsDayZero("home");
  // A team workspace is redirected to Team Home; never offer it personal copy.
  if (dayZero && active.kind === "personal")
    return <HomeDayZeroPage userId={viewer.id} />;
  return <HomePageSkeleton />;
}
