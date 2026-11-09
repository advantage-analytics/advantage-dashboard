"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { ProfileStatisticsPanePending } from "@/components/dashboard/loading/player-profile-pending";
import { ProfileViewWhen } from "./profile-frame";

/**
 * The Statistics body's stand-in on a Visualizations request.
 *
 * `?tab=visualizations` renders the Visualizations body alone (`page.tsx`,
 * "What a Visualizations request skips"): the Statistics fold, its insight
 * evidence and the ball-paths downloads it needs are not run for a viz
 * click that cannot show them. The tab switch itself stays client-side
 * (`ProfileViewSwitcher` writes `?tab=` with native history), so when the
 * reader does switch to Statistics there is no body under it — this is what
 * sits in its slot. It shows nothing while Visualizations is the view, and
 * the moment Statistics is, it draws the Statistics skeleton (the same one
 * the first load draws) and asks the server for the page again
 * (`router.refresh()`): the URL now reads Statistics, so that render carries
 * both bodies, and the real one streams in where the skeleton was. Client
 * state elsewhere on the page — the wall's player, the store — survives the
 * refresh, as it does every viz click.
 *
 * A promise, not a blank: the skeleton stands for a request that is in
 * flight (`empty-and-loading.md`). The refresh is asked once per mount, and
 * this only mounts while Statistics is the view on a page that skipped it,
 * so a Visualizations request never refreshes itself.
 */
export function ProfileStatisticsDeferred() {
  return (
    <ProfileViewWhen view="statistics">
      <ProfileStatisticsPanePending />
      <RefreshOnMount />
    </ProfileViewWhen>
  );
}

function RefreshOnMount() {
  const router = useRouter();
  useEffect(() => {
    router.refresh();
  }, [router]);
  return null;
}
