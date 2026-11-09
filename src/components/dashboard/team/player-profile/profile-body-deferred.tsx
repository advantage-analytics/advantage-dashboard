"use client";

import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";

import {
  ProfileStatisticsPanePending,
  ProfileVisualizationsPanePending,
} from "@/components/dashboard/loading/player-profile-pending";
import type { ProfileView } from "./profile-view";
import { ProfileViewWhen } from "./profile-frame";

/**
 * The stand-in for the body a request did not render.
 *
 * The profile renders ONE body per request (`page.tsx`, "One body per
 * request"): the Statistics body on a Statistics request (the default URL),
 * the Visualizations body on `?tab=visualizations` (every viz click). The
 * other view's slot holds one of these. The tab switch itself stays
 * client-side (`ProfileViewSwitcher` writes `?tab=` with native history),
 * so when the reader switches to the view that was not rendered there is
 * no body under it — this shows nothing while the other view is up, and
 * the moment its own view is, it draws that view's skeleton (the same one
 * the first load draws) and asks the server for the page again
 * (`router.refresh()`): the URL now names this view, so that render carries
 * its body, which streams in where the skeleton was. Client state on the
 * page — the wall's player, the store — survives the refresh, as it does
 * every viz click.
 *
 * The two cannot ping-pong: a request renders the body of the view its URL
 * names and the stand-in of the other, each stand-in is shown only while
 * ITS view is the URL's (`ProfileViewWhen`, the same `?tab=` the server
 * read), and the refresh it asks for renders that view's body. So the
 * stand-in a request renders is never shown by that request, and a
 * refresh always lands the body that was missing.
 *
 * A promise, not a blank: the skeleton stands for a request that is in
 * flight (`empty-and-loading.md`). The refresh is asked once per mount.
 */
export function ProfileStatisticsDeferred() {
  return (
    <ProfileBodyDeferred view="statistics">
      <ProfileStatisticsPanePending />
    </ProfileBodyDeferred>
  );
}

export function ProfileVisualizationsDeferred() {
  return (
    <ProfileBodyDeferred view="visualizations">
      <ProfileVisualizationsPanePending />
    </ProfileBodyDeferred>
  );
}

function ProfileBodyDeferred({
  view,
  children,
}: {
  view: ProfileView;
  children: ReactNode;
}) {
  return (
    <ProfileViewWhen view={view}>
      {children}
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
