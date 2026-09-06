"use client";

import { useState } from "react";
import { advButton } from "@/lib/ui/adv-button";
import { AddPlayerDialog, type AddPlayerInitial } from "./add-player-dialog";
import { RosterInviteDialog } from "./roster-invite-dialog";
import type { ManagedPlayer } from "./invite-target-picker";
import type { RosterMember, SeatUsage } from "@/lib/data/team-roster-server";

/**
 * The Roster page's two ways of growing a squad.
 *
 * Design 9a. They are not two flavours of one action, and the button weights
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
  playersCanUpload,
}: {
  /** Coach-managed rows, so an invitation can target one instead of duplicating it. */
  managedPlayers: ManagedPlayer[];
  seats: SeatUsage;
  /**
   * The program's upload permission — the rule the invitations arrive under,
   * which the invite dialog both states and lets a coach change on the spot.
   */
  playersCanUpload: boolean;
  /**
   * Everyone already on the roster, so Add player can name who holds the line
   * that was picked and who already answers to the name that was typed.
   */
  roster: RosterMember[];
}) {
  const [inviting, setInviting] = useState(false);
  const [addingPlayer, setAddingPlayer] = useState(false);
  /**
   * What Add player should open holding.
   *
   * Held here rather than inside the dialog because the hand-off comes from a
   * sibling: Invite is where a coach discovers the athlete has no account yet,
   * and this is the one place that can see both dialogs. Nothing sets it today
   * — the dialog's prefill path exists first so the hand-off has somewhere to
   * land.
   */
  const [addInitial, setAddInitial] = useState<AddPlayerInitial | undefined>(
    undefined
  );

  const remaining = Math.max(0, seats.seats - seats.used - seats.pending);
  const seatNote =
    remaining === 0
      ? `all ${seats.seats} seats are taken or reserved`
      : `${remaining} of ${seats.seats} seats free`;

  return (
    <>
      {/* 10px between the pair, and Invite is the DS `ghost` — Platform Audit
          `Tb4c`: "ghost Invite beside primary Add player". It was `outline`,
          which the v3 readme rules out beside a primary on a grey page. */}
      <div className="flex shrink-0 items-center gap-2.5">
        <button
          type="button"
          className={advButton("ghost")}
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
        playersCanUpload={playersCanUpload}
      />

      <AddPlayerDialog
        open={addingPlayer}
        onOpenChange={setAddingPlayer}
        seatNote={seatNote}
        roster={roster}
        initial={addInitial}
      />
    </>
  );
}
