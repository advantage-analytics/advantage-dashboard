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
   * and this is the one place that can see both dialogs.
   */
  const [addInitial, setAddInitial] = useState<AddPlayerInitial | undefined>(
    undefined,
  );

  /**
   * Invite's offer, taken: close Invite, and open Add player holding the
   * address that was typed there.
   *
   * Only the address. Invite collects one, never a name, so nothing else is
   * carried and nothing is invented to fill the other two fields.
   *
   * Nothing is sent, and nothing about the invitation path changes — a coach
   * who does not take the offer still picks "Someone new" and presses Send.
   *
   * The no-op guard is for the case where Add player is already open behind
   * this: stealing the form out from under a coach mid-typing, to prefill it
   * with an address from a dialog they are no longer looking at, is worse than
   * doing nothing.
   */
  function handOffToAddPlayer(email: string) {
    if (addingPlayer) return;
    setAddInitial({ email });
    setInviting(false);
    setAddingPlayer(true);
  }

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
        onHandOffToAddPlayer={handOffToAddPlayer}
      />

      <AddPlayerDialog
        open={addingPlayer}
        /**
         * Clear the hand-off when Add player closes.
         *
         * `addInitial` describes ONE opening — "the coach came here from Invite
         * holding this address" — and that stops being true the moment the
         * dialog closes. Left standing, it would be re-applied by the dialog's
         * open-edge effect on the next plain "Add player" click, prefilling an
         * address from a conversation that ended, possibly days earlier.
         *
         * Cleared here rather than on the header button because closing is the
         * one event both openings pass through: the button is not the only way
         * in any more, and a guard on it would still leave the stale value
         * alive in between.
         */
        onOpenChange={(next) => {
          setAddingPlayer(next);
          if (!next) setAddInitial(undefined);
        }}
        seatNote={seatNote}
        roster={roster}
        initial={addInitial}
      />
    </>
  );
}
