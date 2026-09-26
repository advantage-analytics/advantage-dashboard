"use client";

import { useOptimistic, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  SettingsCard,
  SettingsCardTitle,
  SettingsUnderlineInput,
} from "@/components/dashboard/settings/settings-card";
import { SettingsButton } from "@/components/dashboard/settings/settings-button";
import { AdvSwitch } from "@/components/ui/adv-switch";
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
  RESEND_CLASS,
  RESEND_LABEL,
  REVOKE_LABEL,
  resendRole,
} from "@/components/dashboard/team/roster-vocabulary";
import {
  adminInviteMember,
  adminRevokeInvite,
  adminSetMemberUploadEnabled,
  adminSetProgramMemberRole,
  adminTransferProgramOwnership,
} from "@/lib/services/programs/admin-team-actions";
import { getInitials, shortDate } from "@/lib/data/match-utils";
import type {
  AdminTeamInvite,
  AdminTeamMember,
} from "@/lib/data/admin-team-server";
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
 *
 * **Invitations are rows in this list, not a separate card.** `TeamPage`'s
 * People card draws a member and an invitation as the same row with the same
 * actions column — "who is on this program" is one question, and an address
 * nobody has accepted yet is an answer to it. The dashed ring, the outlined
 * `Invited` pill and the words on Resend and Revoke are the Roster's own,
 * imported from `roster-vocabulary.tsx` so the console and the coach's page
 * cannot start calling the same button different things.
 */

/** Matches no `program_members.user_id`; see the note above. */
const NO_VIEWER = "__admin__";

const INVITE_ROLES = [
  { value: "player" as const, label: "Player" },
  { value: "staff" as const, label: "Staff" },
  { value: "coach" as const, label: "Coach" },
];

/** A quiet blue word — the card's own text actions, at row scale. */
const TEXT_ACTION =
  "shrink-0 cursor-pointer text-[11px] font-medium text-[var(--blue)] transition-colors hover:text-[var(--blue-hover)] focus-visible:outline-none disabled:opacity-50";

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

/**
 * "Staff · invited Sep 10 by Avery Lin · expires Sep 17" — the canvas's meta
 * line, verbatim. The sender clause is dropped rather than guessed when
 * `invited_by` resolves to nobody; see `AdminTeamInvite.invitedByName`.
 */
function inviteMeta(invite: AdminTeamInvite): string {
  const by = invite.invitedByName ? ` by ${invite.invitedByName}` : "";
  return `${capitalize(invite.role)} · invited ${shortDate(invite.createdAt)}${by} · expires ${shortDate(invite.expiresAt)}`;
}

export function AdminPeopleCard({
  programId,
  programName,
  members,
  invites,
  seats,
}: {
  programId: string;
  /** The name the transfer dialog asks an admin to type. */
  programName: string;
  members: readonly AdminTeamMember[];
  /** Outstanding invitations, drawn as rows of this same list. */
  invites: readonly AdminTeamInvite[];
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

  const [composing, setComposing] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<AssignableRole>("player");
  const [isInviting, startInvite] = useTransition();

  // One transition guards every row action — the upload switches and both
  // invitation buttons. These are few, slow, consequential writes on a console
  // page, exactly as `AdminRequestsCard` argues: a second press while the
  // first is in flight is a mistake, not a feature.
  const [isSaving, startRowAction] = useTransition();

  /**
   * The upload switches, flipped before the server has agreed.
   *
   * `useOptimistic` rather than a `useState` copy of `members`, because the
   * props here are re-fetched: every one of these actions calls
   * `revalidatePath`, so a state seeded once from the prop would go on
   * showing a stale value after the server sent a newer one. An optimistic
   * override is scoped to the transition that made it — it holds while the
   * write and the `router.refresh()` are in flight, and is dropped the moment
   * the transition ends. On success the fresh props have already landed by
   * then, so there is no flicker; on failure nothing was written, so dropping
   * the override *is* the revert, and the error line below says why.
   */
  const [shownMembers, overrideUpload] = useOptimistic(
    members,
    (
      current: readonly AdminTeamMember[],
      change: { userId: string; enabled: boolean },
    ) =>
      current.map((member) =>
        member.userId === change.userId
          ? { ...member, uploadEnabled: change.enabled }
          : member,
      ),
  );

  const owner = shownMembers.find((member) => member.role === "owner") ?? null;

  /** Every row action: clear the last outcome, write, then re-read. */
  const runRowAction = (
    work: () => Promise<
      { ok: true; warning?: string } | { ok: false; error: string }
    >,
    done: string,
    optimistic?: () => void,
  ) => {
    if (isSaving) return;
    setError(null);
    setNote(null);
    startRowAction(async () => {
      optimistic?.();
      const result = await work();
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setNote(result.warning ?? done);
      router.refresh();
    });
  };

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
      setComposing(false);
      setNote(result.warning ?? `Invitation sent to ${address}.`);
      router.refresh();
    });
  };

  return (
    <SettingsCard className="bg-[var(--surface-card)]">
      <SettingsCardTitle
        trailing={
          <>
            {/* The loader's own ledger, printed. `seats.seats` is
                `programs.seats`; re-deriving the denominator from used +
                pending would quietly disagree with `program_seat_usage` — and
                seat counting has moved twice on this branch. */}
            <span className="text-[11px] text-[var(--ink-500)]">
              {seats.used} of {seats.seats} seats
              {seats.pending > 0 && ` · ${seats.pending} held`}
            </span>
            <button
              type="button"
              onClick={() => {
                setError(null);
                setNote(null);
                setComposing((open) => !open);
              }}
              aria-expanded={composing}
              className={TEXT_ACTION}
            >
              Invite someone
            </button>
          </>
        }
      >
        People
      </SettingsCardTitle>

      <div className="pt-2">
        {shownMembers.map((member) => {
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
                  className={TEXT_ACTION}
                >
                  Transfer ownership
                </button>
              )}
              {/* The owner's own permission is not a switch: they are the
                  program, and `set_member_upload_enabled` has nothing to say
                  about them. */}
              {member.role !== "owner" && (
                <span className="flex shrink-0 items-center gap-1.5">
                  <span className="text-[11px] text-[var(--ink-500)]">
                    Uploads on
                  </span>
                  <AdvSwitch
                    checked={member.uploadEnabled}
                    disabled={isSaving}
                    label={`Uploads on for ${member.name}`}
                    onCheckedChange={(enabled) =>
                      runRowAction(
                        () =>
                          adminSetMemberUploadEnabled({
                            programId,
                            userId: member.userId,
                            enabled,
                          }),
                        enabled
                          ? `${member.name} can upload for this team.`
                          : `${member.name} can no longer upload for this team.`,
                        () =>
                          overrideUpload({ userId: member.userId, enabled }),
                      )
                    }
                  />
                </span>
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

        {/* An invitation is the same row, one step earlier: a dashed ring
            where the face will be, the address where the name will be, and
            the outlined pill that matches that dash everywhere else. */}
        {invites.map((invite) => (
          <AdminPersonRow key={invite.id}>
            <span
              aria-hidden="true"
              className="size-[22px] shrink-0 rounded-full border border-dashed border-[var(--ink-300)]"
            />
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-[12px] text-[var(--ink-900)]">
                {invite.email}
              </span>
              <span className="truncate text-[11px] text-[var(--ink-500)]">
                {inviteMeta(invite)}
              </span>
            </span>
            <StatePill outline>Invited</StatePill>
            <button
              type="button"
              disabled={isSaving}
              onClick={() =>
                runRowAction(
                  () =>
                    adminInviteMember({
                      programId,
                      email: invite.email,
                      // `create_program_invite` upserts on the one-open-invite
                      // index, so this refreshes the row and mints a fresh
                      // token rather than leaving two live links into one
                      // program — exactly as the Roster resends.
                      role: resendRole(invite.role),
                    }),
                  `Invitation to ${invite.email} sent again.`,
                )
              }
              className={`${RESEND_CLASS} shrink-0`}
            >
              {RESEND_LABEL}
            </button>
            {/* Revoke hovers to `--danger`, the Roster's own treatment: it is
                the destructive half of the pair, and the tint is all that
                separates it from Resend. */}
            <button
              type="button"
              disabled={isSaving}
              onClick={() =>
                runRowAction(
                  () => adminRevokeInvite(invite.id),
                  `Invitation to ${invite.email} revoked.`,
                )
              }
              className="shrink-0 text-[11px] text-[var(--ink-500)] transition-colors hover:text-[var(--danger)] disabled:opacity-50"
            >
              {REVOKE_LABEL}
            </button>
          </AdminPersonRow>
        ))}

        {shownMembers.length === 0 && invites.length === 0 && (
          <p className="border-t border-[var(--border-hairline)] py-3 text-[12px] text-[var(--ink-500)]">
            Nobody has joined this program yet, and no invitation is
            outstanding.
          </p>
        )}
      </div>

      {/* The compose row, at the card's foot rather than in its header: the
          header carries the way in, this is the form it opens, and it sits
          under the list because it is the thing you do after reading it. */}
      {composing && (
        <div className="flex items-end gap-3 border-t border-[var(--border-hairline)] pt-3">
          <label className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="text-[11px] text-[var(--ink-600)]">
              Email address
            </span>
            <SettingsUnderlineInput
              type="email"
              autoFocus
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
      )}

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
