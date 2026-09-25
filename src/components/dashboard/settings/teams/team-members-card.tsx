"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Lock, Plus } from "lucide-react";
import { SettingsCard } from "@/components/dashboard/settings/settings-card";
import { SettingsButton } from "@/components/dashboard/settings/settings-button";
import { StatePill } from "@/components/ui/state-pill";
import { YouPill } from "@/components/ui/you-pill";
import { getInitials } from "@/lib/data/match-utils";
import {
  RoleMenu,
  assignableRoles,
} from "@/components/dashboard/settings/teams/role-menu";
import type {
  MemberRole,
  TeamInvite,
  TeamMember,
} from "@/lib/data/team-settings-server";
import type { SeatUsage } from "@/lib/data/teams-server";
import { SeatBoxes } from "@/components/dashboard/team/dialog-shell";
import { setActiveWorkspaceThen } from "@/lib/workspace/actions";
import { capitalize } from "@/lib/utils";
import { PersonAvatar } from "@/components/ui/person-avatar";
import { useWorkspace } from "@/components/dashboard/workspace-provider";
import { StaffInviteDialog } from "@/components/dashboard/settings/teams/staff-invite-dialog";

const ROSTER_PATH = "/dashboard/team/roster";
const ROSTER_LINK_CLASS =
  "inline-flex cursor-pointer items-center gap-0.5 font-medium text-[var(--blue)] transition-colors duration-200 hover:text-[var(--blue-hover)] focus-visible:outline-none";

/**
 * Who is on the program, and how many more there is room for.
 *
 * One list, one action (design B, 2026-09-24): the header's only button
 * invites staff, and the note under the list is the way to the Roster.
 *
 * Staff and coaches are invited from here; players are not. The roster's
 * dialog can bind a player's invitation to a row already listed so their
 * matches stay put, and a thinner control here would mint orphan logins beside
 * those rows — but staff are never roster rows, so nothing is lost inviting
 * them where their standing is managed. Players and removals stay on the
 * Roster. What someone IS is decided here, on
 * their row: the role is a menu for the rows the viewer may change (an owner
 * sees three options, a coach two), a pill with a lock for staff who may not,
 * and a plain pill for a player, who may change nothing. Ownership starts from
 * the same row and commits in its own dialog.
 *
 * Seats are countable and few, so they are boxes rather than a bar: filled =
 * taken, outlined = held by an open invite, grey = free. A seat is a PLAYER on
 * the roster, login or not (2026-09-20) — staff listed below hold none, which
 * is why the caption says "players" and the boxes need not match this list. The outlined box and
 * the outlined `Invited` pill are the same fact drawn twice on purpose.
 */
export function TeamMembersCard({
  programId,
  programName,
  isActiveWorkspace,
  members,
  invites,
  seats,
  viewerId,
  viewerRole,
  onMakeOwner,
  onError,
}: {
  programId: string;
  programName: string;
  isActiveWorkspace: boolean;
  members: readonly TeamMember[];
  invites: readonly TeamInvite[];
  seats: SeatUsage;
  viewerId: string;
  viewerRole: MemberRole;
  onMakeOwner: (member: TeamMember) => void;
  onError: (message: string | null) => void;
}) {
  const { viewer } = useWorkspace();
  const isOwner = viewerRole === "owner";
  const isStaff = viewerRole !== "player";
  const goToRoster = setActiveWorkspaceThen.bind(null, programId, ROSTER_PATH);
  const [inviteOpen, setInviteOpen] = useState(false);
  // Players are invited and removed on the Roster; the note says so and is
  // the way there. Outside the active workspace the link has to switch
  // workspaces first, which only a server action can do.
  const rosterLink = isActiveWorkspace ? (
    <Link href={ROSTER_PATH} className={ROSTER_LINK_CLASS}>
      Roster
      <ArrowUpRight className="size-3" strokeWidth={1.5} aria-hidden="true" />
    </Link>
  ) : (
    <form action={goToRoster} className="inline">
      <button type="submit" className={ROSTER_LINK_CLASS}>
        Roster
        <ArrowUpRight className="size-3" strokeWidth={1.5} aria-hidden="true" />
      </button>
    </form>
  );

  return (
    <SettingsCard>
      <div className="flex items-center gap-2.5">
        <span className="flex-1 text-[13px] font-medium text-[var(--ink-900)]">
          Members
        </span>
        {isStaff && (
          <SettingsButton
            variant="outline"
            size="sm"
            onClick={() => setInviteOpen(true)}
          >
            <Plus className="size-3" strokeWidth={1.75} aria-hidden="true" />
            Invite staff
          </SettingsButton>
        )}
      </div>

      <SeatPips seats={seats} />

      <div className="pt-2">
        {members.map((member) => {
          const canReceive =
            isOwner &&
            member.userId !== viewerId &&
            (member.role === "coach" || member.role === "staff");
          const options = assignableRoles(viewerRole, viewerId, member);
          // Staff looking at a row that is not theirs to change — the owner's,
          // a coach's, their own — see the lock; a player sees only the pill,
          // because for them nothing on the row was ever a control.
          const locked =
            isStaff && options.length === 0 && member.userId !== viewerId;
          return (
            <PersonRow key={member.userId}>
              <PersonAvatar
                initials={
                  member.userId === viewerId
                    ? viewer.initials
                    : getInitials(member.name)
                }
                // The viewer's own from the workspace, so a photo changed a
                // moment ago in Profile shows here without a refetch.
                photoUrl={
                  member.userId === viewerId
                    ? viewer.avatarUrl
                    : member.avatarUrl
                }
                className="size-[22px] text-[9px]"
              />
              <span className="truncate text-[12px] font-medium text-[var(--ink-900)]">
                {member.name}
              </span>
              {member.userId === viewerId && <YouPill />}
              <span className="flex-1" />
              {canReceive && (
                <button
                  type="button"
                  onClick={() => onMakeOwner(member)}
                  className="cursor-pointer text-[11px] font-medium text-[var(--blue)] hover:text-[var(--blue-hover)] focus-visible:outline-none"
                >
                  Make owner
                </button>
              )}
              {options.length > 0 ? (
                <RoleMenu
                  programId={programId}
                  userId={member.userId}
                  role={member.role}
                  options={options}
                  onError={onError}
                />
              ) : (
                <span className="flex items-center gap-1.5">
                  {locked && (
                    <Lock
                      className="size-[11px] text-[var(--ink-300)]"
                      strokeWidth={1.75}
                      aria-hidden="true"
                    />
                  )}
                  <StatePill>{capitalize(member.role)}</StatePill>
                </span>
              )}
            </PersonRow>
          );
        })}

        {invites.map((invite) => (
          <PersonRow key={invite.id}>
            <span
              aria-hidden="true"
              className="size-[22px] shrink-0 rounded-full border border-dashed border-[var(--ink-300)]"
            />
            <span className="min-w-0 truncate text-[12px] text-[var(--ink-500)]">
              {invite.email}
            </span>
            <span className="flex-1" />
            {/* The role is the one thing an invitation row cannot show in
                the pill column — that says Invited — so it leads the meta. */}
            <span className="shrink-0 text-[11px] text-[var(--ink-500)]">
              {capitalize(invite.role)} · sent{" "}
              {formatInviteDate(invite.createdAt)}
            </span>
            <StatePill outline>Invited</StatePill>
          </PersonRow>
        ))}

        {members.length === 0 && invites.length === 0 && (
          <p className="border-t border-[var(--border-hairline)] py-3 text-[12px] text-[var(--ink-500)]">
            Nobody on the roster yet.
          </p>
        )}
      </div>

      {/* No rule above the note: the last row already drew one. */}
      {/* A div, not a <p>: the Roster link can be a <form>. */}
      <div className="mt-3.5 text-[11px] leading-[1.5] text-[var(--ink-500)]">
        {isOwner ? (
          <>
            A role change takes effect at once. Players are invited and removed
            on the {rosterLink}. Ownership moves by transfer from a
            member&rsquo;s row.
          </>
        ) : viewerRole === "coach" ? (
          <>
            You can move people between staff and player; coaches and the owner
            are the owner&rsquo;s to change. Players are invited and removed on
            the {rosterLink}.
          </>
        ) : isStaff ? (
          <>
            Role changes are for the owner and coaches. Players are invited and
            removed on the {rosterLink}.
          </>
        ) : (
          "Only the coaching staff can invite people or change roles on this team."
        )}
      </div>

      {isStaff && (
        <StaffInviteDialog
          open={inviteOpen}
          onOpenChange={setInviteOpen}
          programId={programId}
          programName={programName}
          canInviteCoach={isOwner}
        />
      )}
    </SettingsCard>
  );
}

/** 8px boxes on a 2px radius — the DS keeps circles for people. */
function SeatPips({ seats }: { seats: SeatUsage }) {
  const total = Math.max(seats.seats, seats.used + seats.pending);
  const held = Math.min(seats.pending, Math.max(0, total - seats.used));
  const free = Math.max(0, total - seats.used - held);

  return (
    <div className="flex items-center gap-3 pt-3">
      <span
        role="img"
        aria-label={`${seats.used} of ${total} seats taken by players, ${held} held by open invites`}
      >
        <SeatBoxes seats={seats} />
      </span>
      <span className="text-[11px] text-[var(--ink-500)]">
        {seats.used} of {total} player seats
        {held > 0 && ` · ${held} held`}
        {free === 0 && held === 0 && " · full"}
      </span>
    </div>
  );
}

function PersonRow({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2.5 border-t border-[var(--border-hairline)] py-[9px]">
      {children}
    </div>
  );
}

/** `2026-08-04T…` → `Aug 4`. */
function formatInviteDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}
