"use client";

import { useState } from "react";
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
import type { ManagedPlayer } from "./invite-target-picker";
import { useClaimInvite } from "./roster-claim-invite";
import {
  JoinLinkPopover,
  type JoinLinkTriggerProps,
} from "@/components/dashboard/settings/teams/join-link-popover";
import { useWorkspace } from "@/components/dashboard/workspace-provider";
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
 * The header's ghost **Invite**, drawn as `JoinLinkPopover`'s trigger so the
 * join-link panel anchors to it.
 *
 * It still opens the Invite dialog, not the popover: Radix's trigger toggle
 * reaches `RosterHeaderButtons` as `onOpenChange(true)`, which that component
 * reads as "open Invite" (see the note at the mount). Radix hands this the
 * click handler, the popover ARIA and a `ref` (a plain prop in React 19); all
 * of them land on the one `<button>`.
 */
function InviteTrigger(props: JoinLinkTriggerProps) {
  return (
    <button type="button" {...props} className={advButton("ghost")}>
      Invite
    </button>
  );
}

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
   * `TeamJoinLink` Settings › Teams reads, so the popover opens on the rung
   * that is really live.
   */
  joinLink: TeamJoinLink | null;
}) {
  const { active } = useWorkspace();
  const [inviting, setInviting] = useState(false);
  /** The join-link popover, opened only by the Invite dialog's hand-off. */
  const [linkOpen, setLinkOpen] = useState(false);
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
        {/* Invite IS the popover's trigger, so the join-link panel anchors
            under it — but a click on it still opens the Invite dialog. The
            popover is controlled, and the only way Radix asks to OPEN it is
            the trigger's own toggle; that request is answered by opening the
            dialog instead. The panel itself opens only from the dialog's
            "Share a join link instead" (`onShareJoinLink` below). Pressing
            Invite while the panel is open asks to close it, which it does. */}
        <JoinLinkPopover
          trigger={InviteTrigger}
          open={linkOpen}
          onOpenChange={(next) => {
            if (next) setInviting(true);
            else setLinkOpen(false);
          }}
          programId={active.id}
          programName={active.name}
          joinLink={joinLink}
          role={active.role}
          playersCanUpload={playersCanUpload}
          seats={seats}
        />
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
        onShareJoinLink={() => {
          setInviting(false);
          claim.clear();
          setLinkOpen(true);
        }}
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
      />
    </>
  );
}
