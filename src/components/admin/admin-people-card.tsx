"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  SettingsCard,
  SettingsCardTitle,
  SettingsUnderlineInput,
} from "@/components/dashboard/settings/settings-card";
import { SettingsButton } from "@/components/dashboard/settings/settings-button";
import { MenuSelect } from "@/components/ui/menu-select";
import { PersonAvatar } from "@/components/ui/person-avatar";
import { StatePill } from "@/components/ui/state-pill";
import {
  RoleMenu,
  assignableRoles,
  type AssignableRole,
} from "@/components/dashboard/settings/teams/role-menu";
import { TransferOwnershipDialog } from "@/components/dashboard/settings/teams/transfer-ownership-dialog";
import {
  adminInviteMember,
  adminSetProgramMemberRole,
  adminTransferProgramOwnership,
} from "@/lib/services/programs/admin-team-actions";
import { getInitials } from "@/lib/data/match-utils";
import type { TeamMember } from "@/lib/data/team-settings-server";
import type { SeatUsage } from "@/lib/data/teams-server";
import { capitalize } from "@/lib/utils";

/**
 * Who is on somebody else's program, from the admin console.
 *
 * The row grammar is `TeamMembersCard`'s, imported piece by piece rather than
 * re-drawn: `PersonAvatar` at 22px, the name at 12px/500, the role as a
 * `RoleMenu` on rows that are the viewer's to change and a `StatePill`
 * otherwise, and the same hairline-topped row. What differs is only who is
 * looking — an admin is not a member, so there is no `You` pill, no
 * `useWorkspace()` and no "Manage on Roster" (that tab is the console's own).
 *
 * **The viewer identity is a fiction, on purpose.** `assignableRoles()` is the
 * rule `set_program_member_role` enforces, expressed for a UI, and it takes a
 * viewer. An admin holds no role here, so this passes `owner` plus a user id
 * that matches nobody: the owner's row stays unassignable (ownership moves by
 * transfer), no row is ever the viewer's own, and every other row offers the
 * three assignable roles. That is exactly what the widened RPC allows an
 * admin to do, so the menu never opens on a refusal. Reusing the function
 * rather than writing a second rule is the point — one of them would drift.
 */

/** Matches no `program_members.user_id`; see the note above. */
const NO_VIEWER = "__admin__";

const INVITE_ROLES = [
  { value: "player" as const, label: "Player" },
  { value: "staff" as const, label: "Staff" },
  { value: "coach" as const, label: "Coach" },
];

/**
 * One person's line, shared with `AdminRequestsCard` so a member row and the
 * invitation that will become one are visibly the same row.
 */
export function AdminPersonRow({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2.5 border-t border-[var(--border-hairline)] py-[9px]">
      {children}
    </div>
  );
}

/** The refusal a card shows in place of a toast. */
export function AdminCardProblem({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <span
      role="alert"
      className="mt-3 text-[11px] leading-[1.5] text-[var(--danger)]"
    >
      {message}
    </span>
  );
}

/** The same line for an outcome that went through. */
export function AdminCardNote({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <span
      role="status"
      className="mt-3 text-[11px] leading-[1.5] text-[var(--ink-500)]"
    >
      {message}
    </span>
  );
}

export function AdminPeopleCard({
  programId,
  programName,
  members,
  seats,
}: {
  programId: string;
  /** The name the transfer dialog asks an admin to type. */
  programName: string;
  members: readonly TeamMember[];
  seats: SeatUsage;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const [transferTarget, setTransferTarget] = useState<TeamMember | null>(null);
  const [transferOpen, setTransferOpen] = useState(false);
  // Bumped on every open so the dialog remounts with fresh state — the same
  // pattern `team-detail.tsx` uses, and for the reason the dialog's own
  // comment gives: it has no reset effect.
  const [transferSession, setTransferSession] = useState(0);

  const [email, setEmail] = useState("");
  const [role, setRole] = useState<AssignableRole>("player");
  const [isInviting, startInvite] = useTransition();

  const owner = members.find((member) => member.role === "owner") ?? null;
  const total = Math.max(seats.seats, seats.used + seats.pending);

  const invite = () => {
    const address = email.trim();
    if (!address || isInviting) return;
    setError(null);
    setNote(null);
    startInvite(async () => {
      const result = await adminInviteMember({
        programId,
        email: address,
        role,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setEmail("");
      setNote(result.warning ?? `Invitation sent to ${address}.`);
      router.refresh();
    });
  };

  return (
    <SettingsCard className="bg-[var(--surface-card)]">
      <SettingsCardTitle
        trailing={
          <span className="text-[11px] text-[var(--ink-500)]">
            {seats.used} of {total} seats
            {seats.pending > 0 && ` · ${seats.pending} held`}
          </span>
        }
      >
        People
      </SettingsCardTitle>

      <div className="pt-2">
        {members.map((member) => {
          const options = assignableRoles("owner", NO_VIEWER, member);
          // Ownership moves to a coach or staff member, never to a player and
          // never to whoever already holds it — `TeamMembersCard`'s own test,
          // minus its "not me" clause, which an admin can never fail.
          const canReceive = member.role === "coach" || member.role === "staff";

          return (
            <AdminPersonRow key={member.userId}>
              <PersonAvatar
                initials={getInitials(member.name)}
                photoUrl={member.avatarUrl}
                className="size-[22px] text-[9px]"
              />
              <span className="min-w-0 truncate text-[12px] font-medium text-[var(--ink-900)]">
                {member.name}
              </span>
              <span className="min-w-0 truncate text-[12px] text-[var(--ink-500)]">
                {member.email}
              </span>
              <span className="flex-1" />
              {canReceive && (
                <button
                  type="button"
                  onClick={() => {
                    setError(null);
                    setNote(null);
                    setTransferTarget(member);
                    setTransferSession((session) => session + 1);
                    setTransferOpen(true);
                  }}
                  className="shrink-0 cursor-pointer text-[11px] font-medium text-[var(--blue)] hover:text-[var(--blue-hover)] focus-visible:outline-none"
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
                  onError={setError}
                  action={adminSetProgramMemberRole}
                />
              ) : (
                <StatePill>{capitalize(member.role)}</StatePill>
              )}
            </AdminPersonRow>
          );
        })}

        {members.length === 0 && (
          <p className="border-t border-[var(--border-hairline)] py-3 text-[12px] text-[var(--ink-500)]">
            Nobody has joined this program yet.
          </p>
        )}
      </div>

      {/* The invite row, at the card's foot rather than in its header: it is
          the thing you do after reading the list, not before. */}
      <div className="flex items-end gap-3 border-t border-[var(--border-hairline)] pt-3">
        <label className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="text-[11px] text-[var(--ink-600)]">
            Invite someone
          </span>
          <SettingsUnderlineInput
            type="email"
            value={email}
            placeholder="name@school.edu"
            disabled={isInviting}
            onChange={(event) => setEmail(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") invite();
            }}
          />
        </label>
        <MenuSelect
          label="Role for the invitation"
          value={role}
          options={INVITE_ROLES}
          onChange={setRole}
          disabled={isInviting}
          className="mb-0.5 h-8 w-[104px] px-2.5"
        />
        <SettingsButton
          size="sm"
          className="mb-0.5"
          loading={isInviting}
          disabled={email.trim() === ""}
          onClick={invite}
        >
          Invite
        </SettingsButton>
      </div>

      <AdminCardProblem message={error} />
      <AdminCardNote message={error ? null : note} />

      <TransferOwnershipDialog
        key={transferSession}
        open={transferOpen}
        onOpenChange={setTransferOpen}
        programId={programId}
        programName={programName}
        target={transferTarget}
        // The dialog's Done step names the person who STOPS being the owner —
        // `admin_transfer_program_ownership` demotes the holder, not the
        // caller, and an admin holds nothing. A program with no owner row is
        // the state this console exists to repair, so it says so.
        viewerName={owner?.name ?? "No current owner"}
        action={adminTransferProgramOwnership}
      />
    </SettingsCard>
  );
}
