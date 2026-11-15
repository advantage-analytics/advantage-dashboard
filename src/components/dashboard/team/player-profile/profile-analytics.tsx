"use client";

import { useEffect } from "react";
import { track } from "@/lib/analytics";
import { useVizFilterAnalytics } from "@/components/dashboard/matches/match-detail/shots/use-viz-filter-analytics";
import { useProfileView } from "@/components/dashboard/team/player-profile/profile-frame";

/**
 * The player profile's analytics, and nothing on screen.
 *
 * A coach reads a match's numbers here as often as on the match report, and
 * `match_viewed` never sees it: `player_profile_viewed` is one event per
 * player and tab shown, and the Visualizations controls report through
 * `filter_changed` as they do on the report. `playerId` is the roster row's
 * id — an id, never a name (src/lib/analytics.ts).
 *
 * Its own component, mounted by the page beside the rail, so the switcher and
 * the title stay what they are: readers of `?tab=` with no side effects.
 */
export function ProfileAnalytics({ playerId }: { playerId: string }) {
  const view = useProfileView();
  useEffect(() => {
    track("player_profile_viewed", { player_id: playerId, tab: view });
  }, [playerId, view]);
  useVizFilterAnalytics("player_profile", playerId);
  return null;
}
