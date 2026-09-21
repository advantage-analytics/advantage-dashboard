"use client";

import { createContext, useContext } from "react";

/**
 * "Invite this player to claim their profile", asked from the drawer and
 * answered by the header's Invite dialog.
 *
 * The two live in different subtrees — the drawer inside `RosterView`, the
 * dialog inside `RosterHeaderButtons`, which the server page hands to
 * `RosterView` as its `actions` node. `RosterView` renders that node, so a
 * provider there reaches both without a second copy of the dialog or its
 * seat, tripwire and upload-rule logic.
 */
export interface ClaimInviteRequest {
  /** The `program_players.id` to invite, or null when nothing is asked. */
  profileId: string | null;
  request: (profileId: string) => void;
  clear: () => void;
}

export const ClaimInviteContext = createContext<ClaimInviteRequest>({
  profileId: null,
  request: () => {},
  clear: () => {},
});

export function useClaimInvite(): ClaimInviteRequest {
  return useContext(ClaimInviteContext);
}
