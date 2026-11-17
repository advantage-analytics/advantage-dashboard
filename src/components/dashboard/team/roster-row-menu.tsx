"use client";

import { useState, useTransition } from "react";
import { MoreHorizontal, Pencil, Trash2, Upload, UserPlus } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { AdvSwitch } from "@/components/ui/adv-switch";
import { ChromeTooltip } from "@/components/dashboard/shared/chrome-tooltip";
import { useWorkspace } from "@/components/dashboard/workspace-provider";
import { PROGRAM_ROLE_LABEL } from "@/lib/workspace/types";
import { ICON_BUTTON } from "@/components/dashboard/matches/match-drawer";
import { MENU_ROW_ICON } from "@/components/dashboard/matches/match-actions/menu-row-classes";
import { mayRemoveStaffProfile } from "./add-self-dialog";
import {
  archiveProgramPlayer,
  setMemberUploadEnabled,
} from "@/components/dashboard/team/roster-actions";
import {
  removeMember,
  type InviteResult,
} from "@/components/dashboard/settings/team-actions";
import type { ActionResult } from "@/components/dashboard/settings/actions";
import { useClaimInvite } from "@/components/dashboard/team/roster-claim-invite";
import type { RosterMember } from "@/lib/data/team-roster-server";

/**
 * The permission, the correction, and the way off the roster.
 *
 * Owners are absent from the removal case: ownership moves by transfer, and a
 * roster screen is not where a program should be able to lose the only person
 * who runs it.
 *
 * It sits at the end of the player's row, before the chevron. The row opens
 * the player page, so these writes need a place on the list itself: a coach
 * granting video to six players should not visit six pages to do it. The
 * wrapper stops clicks, because React events bubble through the popover's
 * portal and would otherwise reach the row and travel.
 */
export function RosterRowMenu({
  member,
  isViewer,
  onEdit,
  onError,
  run,
  pending,
}: {
  member: RosterMember;
  isViewer: boolean;
  onEdit: () => void;
  onError: (message: string | null) => void;
  run: (action: () => Promise<ActionResult | InviteResult>) => void;
  pending: boolean;
}) {
  const [enabled, setEnabled] = useState(member.uploadEnabled);
  const [sending, startSend] = useTransition();
  /**
   * Controlled so Edit can close the menu itself. Both the popover and the
   * dialog trap focus, so the two must not overlap: setting this false in the
   * same event as `onEdit` puts both in one commit — the popover unmounts and
   * returns focus, then the dialog mounts and takes it.
   */
  const [menuOpen, setMenuOpen] = useState(false);

  // Players only, and not merely the owner. `canUploadForProgram()` answers
  // for owner, coach and staff before it reads `upload_enabled`, so on a staff
  // row this switch would move, write, and change nothing anyone could
  // observe. A coach-managed player has no account to grant it to.
  // Nor on a player row held by somebody who is ALSO staff: their sending is
  // decided by the upload policy, exactly as on their staff row.
  const playerOnly = member.role === "player" && member.staffRole === null;
  const canToggleSend = member.userId !== null && playerOnly;
  // Nobody removes themselves from the team here — except from a player row
  // that sits beside a staff seat. Removing that one only takes them off the
  // roster (`archive_program_player` keeps a staff member's membership), so it
  // is offered on the viewer's own row too: it is how "add yourself as a
  // player" is undone.
  //
  // Who may remove a staff-held profile mirrors `archive_program_player`: the
  // person themselves, the owner, or a coach acting on a staff member's.
  // Presentation only — the function refuses the rest.
  const { active } = useWorkspace();
  const canRemove =
    member.staffRole !== null
      ? mayRemoveStaffProfile(active.role, member.staffRole, isViewer)
      : member.role !== "owner" && !isViewer;
  // Gated on there being a profile row to write. A coach and a claimed player
  // both have one; staff seats do not.
  const canEdit = member.profileId !== null;
  const grantSlotFilled = playerOnly;
  // `profileId` is what an invitation targets; a coach-managed row always has
  // one.
  const claimInvite = useClaimInvite();
  const claimProfileId =
    member.role === "player" && member.managedBy === "coach"
      ? member.profileId
      : null;

  if (!canToggleSend && !canRemove && !canEdit && !claimProfileId) return null;

  return (
    <span
      className="inline-flex shrink-0"
      onClick={(event) => event.stopPropagation()}
    >
      <Popover open={menuOpen} onOpenChange={setMenuOpen}>
        <ChromeTooltip label="Options" hidden={menuOpen}>
          <PopoverTrigger
            aria-label={`Options for ${member.name}`}
            className={ICON_BUTTON}
          >
            <MoreHorizontal
              className="size-3.5"
              strokeWidth={1.5}
              aria-hidden
            />
          </PopoverTrigger>
        </ChromeTooltip>
        <PopoverContent
          align="end"
          sideOffset={6}
          className="w-[248px] rounded-[var(--radius-dropdown)] p-2"
        >
          {canToggleSend ? (
            <div className="flex items-start gap-3 rounded-[var(--radius-element)] px-2 py-2">
              <span className="flex min-w-0 flex-1 items-start gap-2.5">
                <Upload
                  className={`mt-0.5 ${MENU_ROW_ICON}`}
                  strokeWidth={1.5}
                  aria-hidden
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-[12px] font-medium text-[var(--ink-900)]">
                    Can send video
                  </span>
                  <span className="block text-[11px] leading-[1.5] text-[var(--ink-500)]">
                    Spends the program&apos;s analysis time
                  </span>
                </span>
              </span>
              <AdvSwitch
                checked={enabled}
                disabled={sending}
                label={`Let ${member.name} send video`}
                onCheckedChange={(next) => {
                  // Moved before the await so the switch answers the press
                  // immediately, and put back if the server refuses.
                  setEnabled(next);
                  onError(null);
                  startSend(async () => {
                    const result = await setMemberUploadEnabled(
                      member.userId as string,
                      next,
                    );
                    if (!result.ok) {
                      setEnabled(!next);
                      onError(result.error);
                    }
                  });
                }}
              />
            </div>
          ) : (
            playerOnly && (
              <p className="px-2 py-2 text-[11px] leading-[1.5] text-[var(--ink-500)]">
                No login yet, so there is no analysis time to grant.
              </p>
            )
          )}

          {grantSlotFilled && (canEdit || canRemove) && (
            <span className="my-1 block h-px bg-[var(--border-hairline)]" />
          )}

          {claimProfileId && (
            <button
              type="button"
              onClick={() => {
                setMenuOpen(false);
                onError(null);
                claimInvite.request(claimProfileId);
              }}
              className="flex w-full items-start gap-2.5 rounded-[var(--radius-element)] px-2 py-2 text-left transition-colors hover:bg-[var(--surface-subtle)] focus-visible:bg-[var(--surface-subtle)] focus-visible:outline-none"
            >
              <UserPlus
                className={`mt-0.5 ${MENU_ROW_ICON}`}
                strokeWidth={1.5}
                aria-hidden
              />
              <span className="min-w-0 flex-1">
                <span className="block text-[12px] text-[var(--ink-700)]">
                  Invite to claim
                </span>
                <span className="block text-[11px] leading-[1.5] text-[var(--ink-500)]">
                  Every match stays, and no new seat is used.
                </span>
              </span>
            </button>
          )}

          {canEdit && (
            <button
              type="button"
              onClick={() => {
                setMenuOpen(false);
                onError(null);
                onEdit();
              }}
              className="flex w-full items-center gap-2.5 rounded-[var(--radius-element)] px-2 py-2 text-left text-[12px] text-[var(--ink-700)] transition-colors hover:bg-[var(--surface-subtle)] hover:text-[var(--ink-900)]"
            >
              <Pencil className={MENU_ROW_ICON} strokeWidth={1.5} aria-hidden />
              Edit player
            </button>
          )}

          {canRemove && (
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                run(() =>
                  // A coach-managed player has no membership row to remove, so
                  // the profile is archived instead — which also keeps their
                  // matches attributable.
                  member.profileId
                    ? archiveProgramPlayer(member.profileId)
                    : removeMember(member.userId as string),
                )
              }
              className="group flex w-full items-start gap-2.5 rounded-[var(--radius-element)] px-2 py-2 text-left transition-colors hover:bg-[var(--surface-subtle)] focus-visible:bg-[var(--surface-subtle)] focus-visible:outline-none disabled:opacity-50"
            >
              <Trash2
                className={`mt-0.5 ${MENU_ROW_ICON} transition-colors group-hover:text-[var(--danger)] group-focus-visible:text-[var(--danger)]`}
                strokeWidth={1.5}
                aria-hidden
              />
              <span className="min-w-0 flex-1">
                <span className="block text-[12px] text-[var(--ink-700)] group-hover:text-[var(--danger)] group-focus-visible:text-[var(--danger)]">
                  Remove from roster
                </span>
                {member.profileId && (
                  <span className="block text-[11px] leading-[1.5] text-[var(--ink-500)]">
                    {member.staffRole !== null
                      ? `Only ${isViewer ? "your" : "the"} player profile goes. ${isViewer ? "Your" : "Their"} ${PROGRAM_ROLE_LABEL[member.staffRole].toLowerCase()} role and ${isViewer ? "your" : "their"} matches stay.`
                      : "Their matches stay. Adding them again offers to restore this profile."}
                  </span>
                )}
              </span>
            </button>
          )}
        </PopoverContent>
      </Popover>
    </span>
  );
}
