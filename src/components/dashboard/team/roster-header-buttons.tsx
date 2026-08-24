"use client";

import { useState } from "react";
import { advButton } from "@/lib/ui/adv-button";
import { AddPlayerDialog, type RosterPerson } from "./add-player-dialog";
import { RosterInviteDialog } from "./roster-invite-dialog";
import type { ManagedPlayer } from "./invite-target-picker";
import type { SeatUsage } from "@/lib/data/team-roster-server";

/**
 * The Roster page's two ways of growing a squad.
 *
 * Design 6a. They are not two flavours of one action, and the button weights
 * say so: **Add player** creates the row now and always works, so it is the
 * page's one blue action. **Invite** sends email and waits on somebody else, so
 * it is secondary.
 *
 * This exists so the Roster page can stay a server component and still open a
 * dialog — the same job `invite-buttons.tsx` did, which it replaces.
 */
export function RosterHeaderButtons({
  managedPlayers,
  seats,
  roster,
}: {
  /** Coach-managed rows, so an invitation can target one instead of duplicating it. */
  managedPlayers: ManagedPlayer[];
  seats: SeatUsage;
  /**
   * Everyone already on the roster, so Add player can name who holds the line
   * that was picked and who already answers to the name that was typed.
   */
  roster: RosterPerson[];
}) {
  const [inviting, setInviting] = useState(false);
  const [addingPlayer, setAddingPlayer] = useState(false);

  const remaining = Math.max(0, seats.seats - seats.used - seats.pending);
  const seatNote =
    remaining === 0
      ? `all ${seats.seats} seats are taken or reserved`
      : `${remaining} of ${seats.seats} seats free`;

  return (
    <>
      <div className="flex shrink-0 items-center gap-2">
        <button
          type="button"
          className={advButton("outline")}
          onClick={() => setInviting(true)}
        >
          Invite
        </button>
        <button
          type="button"
          className={advButton("primary")}
          onClick={() => setAddingPlayer(true)}
        >
          Add player
        </button>
      </div>

      <RosterInviteDialog
        open={inviting}
        onOpenChange={setInviting}
        managedPlayers={managedPlayers}
        seats={seats}
      />

      <AddPlayerDialog
        open={addingPlayer}
        onOpenChange={setAddingPlayer}
        seatNote={seatNote}
        roster={roster}
      />
    </>
  );
}
