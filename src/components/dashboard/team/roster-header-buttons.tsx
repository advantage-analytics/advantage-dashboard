"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { advButton } from "@/lib/ui/adv-button";
import {
  AddPlayerDialog,
  type AddPlayerActions,
  type AddPlayerInitial,
} from "./add-player-dialog";
import {
  addProgramPlayer,
  restoreProgramPlayer,
} from "@/components/dashboard/team/roster-actions";
import { inviteMember } from "@/components/dashboard/settings/team-actions";
import { RosterInviteDialog } from "./roster-invite-dialog";
import {
  AddSelfDialog,
  mayAddSelf,
  type OwnAddressOffer,
} from "./add-self-dialog";
import type { ManagedPlayer } from "./invite-target-picker";
import { useWorkspace } from "@/components/dashboard/workspace-provider";
import { useClaimInvite } from "./roster-claim-invite";
import type {
  FormerPlayer,
  RosterMember,
  SeatUsage,
} from "@/lib/data/team-roster-server";
import type { TeamJoinLink } from "@/lib/data/team-settings-server";

/**
 * The coach's own three writes, which is what this dialog has always called.
 *
 * They became a prop when the admin console started opening the same dialog
 * against somebody else's program (see `AddPlayerActions`); every one of them
 * resolves the program from the caller's active workspace, which is exactly
 * why an admin needs different ones and a coach needs these. Hoisted to module
 * scope because it is a constant, not per-render state.
 */
const MEMBER_ACTIONS: AddPlayerActions = {
  add: addProgramPlayer,
  invite: inviteMember,
  restore: restoreProgramPlayer,
};

/**
 * `RosterHeaderButtons` before the page has the seat count its dialogs open
 * with: the same pair, disabled in place. Drawn by the roster skeleton and by
 * the day-zero screen while the route fallback renders it.
 */
export function RosterHeaderButtonsPending() {
  return (
    <div className="flex shrink-0 items-center gap-2.5">
      <button type="button" disabled className={advButton("ghost")}>
        Invite
      </button>
      <button type="button" disabled className={advButton("primary")}>
        Add player
      </button>
    </div>
  );
}

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
  openInviteEmails,
  roster,
  playersCanUpload,
  former,
  joinLink,
}: {
  /** Coach-managed rows, so an invitation can target one instead of duplicating it. */
  managedPlayers: ManagedPlayer[];
  seats: SeatUsage;
  /** Open invitations' addresses, so the dialog can tell a resend from a new seat. */
  openInviteEmails: readonly string[];
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
  /**
   * Everyone archived off the roster, so Add player can offer to restore a
   * name it recognizes instead of quietly minting a second, historyless
   * profile beside their old one.
   */
  former: FormerPlayer[];
  /**
   * The program's live join link, or null — `getRosterJoinLink`, the same
   * `TeamJoinLink` Settings › Teams reads, so the Invite dialog's "Join link"
   * half opens on the rung that is really live.
   */
  joinLink: TeamJoinLink | null;
}) {
  const { active, viewer } = useWorkspace();
  const [inviting, setInviting] = useState(false);
  /**
   * "Add yourself as a player" — reached by typing your own address into
   * either dialog. Offered to staff this roster does not carry as a player;
   * for anybody else their own address is an ordinary duplicate.
   */
  const [addingSelf, setAddingSelf] = useState(false);
  const self: OwnAddressOffer = mayAddSelf(
    active.role,
    roster.some(
      (member) => member.role === "player" && member.userId === viewer.id,
    ),
  )
    ? {
        email: viewer.email,
        onAddSelf: () => {
          // Invite is held open by a claim target as well as by `inviting`
          // (the drawer's "Invite to claim →"); clearing only one left it
          // open underneath the dialog this hands off to.
          setInviting(false);
          claim.clear();
          setAddingPlayer(false);
          setAddingSelf(true);
        },
      }
    : null;
  const [addingPlayer, setAddingPlayer] = useState(false);
  /**
   * `?add=player` lands with Add player already open — Team Home's day-zero
   * "Add players" button, which names this dialog and should not need a second
   * click to reach it. Consumed once, during render (the arrival is the event,
   * so there is no frame with the dialog still closed), then taken off the URL
   * so a reload or the back button does not reopen a dialog somebody closed.
   */
  const openOnArrival = useSearchParams().get("add") === "player";
  const [arrival, setArrival] = useState(openOnArrival);
  if (arrival) {
    setArrival(false);
    setAddingPlayer(true);
  }
  useEffect(() => {
    if (!openOnArrival) return;
    const url = new URL(window.location.href);
    url.searchParams.delete("add");
    window.history.replaceState(window.history.state, "", url);
  }, [openOnArrival]);
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

  // The drawer's "Invite to claim →". Resolved against the rows this component
  // already holds, so an id that is no longer coach-managed names nobody.
  const claim = useClaimInvite();
  const claimTarget =
    managedPlayers.find((p) => p.profileId === claim.profileId) ?? null;

  return (
    <>
      {/* 10px between the pair, and Invite is the DS `ghost` — Platform Audit
          `Tb4c`: "ghost Invite beside primary Add player". It was `outline`,
          which the v3 readme rules out beside a primary on a grey page. */}
      <div className="flex shrink-0 items-center gap-2.5">
        {/* One way in. The join link used to open as a popover anchored
            here, after the dialog closed to make room for it; it is now the
            dialog's own second half ("Join link" beside "Email invite"). */}
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
        /* Keyed on the target: the dialog seeds its state from
           `initialTarget` once, so a request from the drawer has to mount a
           fresh one rather than reopen whatever the last session left. */
        key={claimTarget?.profileId ?? "plain"}
        open={inviting || claimTarget !== null}
        onOpenChange={(next) => {
          setInviting(next);
          if (!next) claim.clear();
        }}
        initialTarget={claimTarget}
        managedPlayers={managedPlayers}
        seats={seats}
        openInviteEmails={openInviteEmails}
        playersCanUpload={playersCanUpload}
        onHandOffToAddPlayer={handOffToAddPlayer}
        self={self}
        joinLink={joinLink}
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
        seats={seats}
        roster={roster}
        former={former}
        initial={addInitial}
        actions={MEMBER_ACTIONS}
        self={self}
      />

      {/* Mounted only while it can be opened, or is open: the roster refresh
          after a success withdraws the offer before the dialog has closed. */}
      {(self || addingSelf) && (
        <AddSelfDialog
          open={addingSelf}
          onOpenChange={setAddingSelf}
          programId={active.id}
          viewerName={viewer.name}
          teamName={active.name}
          seats={seats}
        />
      )}
    </>
  );
}
