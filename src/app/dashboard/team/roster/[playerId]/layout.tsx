import type { ReactNode } from "react";
import { ProfileBodyCache } from "@/components/dashboard/team/player-profile/profile-body-deferred";

/**
 * Holds the player profile's tab bodies across `?tab=` switches
 * (`ProfileBodyCache`, `profile-body-deferred.tsx`). It has to be a layout:
 * the page segment is keyed by its search params, so the refresh that brings
 * the other tab's body mounts a fresh page tree, while this segment is keyed
 * by `[playerId]` alone and lives until the reader leaves the player.
 */
export default function PlayerProfileLayout({
  children,
}: {
  children: ReactNode;
}) {
  return <ProfileBodyCache>{children}</ProfileBodyCache>;
}
