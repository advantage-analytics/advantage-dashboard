"use client";

import { useMemo, useOptimistic, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CircleCheck } from "lucide-react";
import { SettingsUnderlineInput } from "@/components/dashboard/settings/settings-card";
import { SettingsButton } from "@/components/dashboard/settings/settings-button";
import { AdvSwitch } from "@/components/ui/adv-switch";
import { MenuSelect } from "@/components/ui/menu-select";
import { PersonAvatar } from "@/components/ui/person-avatar";
import {
  RoleMenu,
  assignableRoles,
  type AssignableRole,
} from "@/components/dashboard/settings/teams/role-menu";
import { TransferOwnershipDialog } from "@/components/dashboard/settings/teams/transfer-ownership-dialog";
import {
  AddPlayerDialog,
  type AddPlayerActions,
  type AddPlayerRosterRow,
} from "@/components/dashboard/team/add-player-dialog";
import {
  RESEND_CLASS,
  RESEND_LABEL,
  REVOKE_LABEL,
  requesterName,
  resendInput,
} from "@/components/dashboard/team/roster-vocabulary";
import {
  noteIconCls,
  noteStripCls,
} from "@/components/dashboard/matches/new-match-wizard/styles";
import {
  adminAddProgramPlayer,
  adminInviteMember,
  adminResolveJoinRequest,
  adminRevokeInvite,
  adminSetMemberUploadEnabled,
  adminSetProgramMemberRole,
  adminTransferProgramOwnership,
} from "@/lib/services/programs/admin-team-actions";
import { claimRoleLabel } from "@/lib/services/programs/claim-roles";
import { actionRejected } from "@/lib/ui/action-rejected";
import { InertButton } from "@/components/admin/inert-button";
import {
  PendingBar,
  PendingRegion,
} from "@/components/dashboard/loading/pending";
import { advButton } from "@/lib/ui/adv-button";
import { getInitials, shortDate } from "@/lib/data/match-utils";
import {
  adminPeopleCount,
  adminPeopleRows,
} from "@/lib/data/admin-team-people";
import type {
  AdminTeamClaim,
  AdminTeamInvite,
  AdminTeamJoinRequest,
  AdminTeamMember,
} from "@/lib/data/admin-team-server";
import type { AdminTeamRosterPlayer } from "@/lib/data/admin-team-roster";
import type { TeamMember } from "@/lib/data/team-settings-server";
import type { SeatUsage } from "@/lib/data/teams-server";
import { capitalize } from "@/lib/utils";

/**
 * Who is on somebody else's program, from the admin console — the team page's
 * one People list (`TeamDetail.dc.html`, 2026-11-12).
 *
 * It replaced three cards (Requests, People, Roster) because the owner called
 * the page "too cluttered and busy". One list, quiet, in this order: join
 * requests with Approve and Decline, then everyone on the program — members
 * and roster players together, a profile an account has claimed drawn once
 * (`adminPeopleRows`) — then the invitations nobody has accepted yet. The
 * section header carries the two ways in, Add player and Invite people.
 *
 * **One account state, and only one.** A roster player whose profile no
 * account has claimed reads "No account · Invite", and Invite opens the invite
 * row bound to that profile (`playerId`), so acceptance claims it rather than
 * minting a stranger. Nothing else prints whether someone has an account, and
 * nothing prints when they were last seen: the artboard's "Active today" has
 * no data behind it (the loader reads no last-activity time).
 *
 * **The viewer identity is a fiction, on purpose.** `assignableRoles()` is the
 * rule `set_program_member_role` enforces, expressed for a UI, and it takes a
 * viewer. An admin holds no role here, so this passes `owner` plus a user id
 * that matches nobody: the owner's row stays unassignable (ownership moves by
 * transfer), no row is ever the viewer's own, and every other row offers the
 * three assignable roles — exactly what the widened RPC allows an admin.
 *
 * Every write goes through `admin-team-actions.ts`; this file adds none.
 */

/** Matches no `program_members.user_id`; see the note above. */
const NO_VIEWER = "__admin__";

const INVITE_ROLES = [
  { value: "player" as const, label: "Player" },
  { value: "staff" as const, label: "Staff" },
  { value: "coach" as const, label: "Coach" },
];

/**
 * A quiet blue word — the console's own text actions, at row scale.
 *
 * Exported so every card on this page spells its text action the same way;
 * the canvas' `.cact` is one rule, not one per card.
 */
export const TEXT_ACTION =
  "shrink-0 cursor-pointer text-[11px] font-medium text-[var(--blue)] transition-colors hover:text-[var(--blue-hover)] focus-visible:outline-none disabled:opacity-50";

/** The refusal a surface shows in place of a toast. */
export function AdminCardProblem({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <span
      role="alert"
      className="text-[11px] leading-[1.5] text-[var(--danger)]"
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
      className="text-[11px] leading-[1.5] text-[var(--ink-500)]"
    >
      {message}
    </span>
  );
}

/**
 * The team page's list tracks — face · name · role or status · trailing — the
 * People list and Latest matches both draw, so their columns line up down the
 * page. The name grows to a 360px cap and the role (or a match's status)
 * follows it at once in a fixed track, so the two read as one fact rather
 * than as the two ends of the row; the trailing cell takes what is left and
 * sits flush right. Latest matches has no face: its name spans the first two
 * tracks.
 */
export const TEAM_LIST_GRID =
  "grid grid-cols-[26px_minmax(0,360px)_180px_1fr] items-center gap-x-3.5";

/** One row of the People list, on the shared tracks. */
const ROW = `${TEAM_LIST_GRID} min-h-11 border-t border-[var(--border-hairline)] px-4 py-1.5 first:border-t-0`;

const NAME = "truncate text-[13px] font-medium text-[var(--ink-900)]";
const SUB = "truncate text-[11px] text-[var(--ink-500)]";
const ROLE = "truncate text-[12px] text-[var(--ink-500)]";
const ACTIONS = "flex items-center justify-end gap-3";

function Face({ name, photoUrl }: { name: string; photoUrl?: string | null }) {
  return (
    <PersonAvatar
      initials={getInitials(name)}
      photoUrl={photoUrl ?? null}
      className="size-[26px] text-[9px]"
    />
  );
}

/** "Wants to join", or "Wants to join as a coach" when the form said so. */
function wantsLine(role: string | null): string {
  if (!role || role === "other") return "Wants to join";
  const label = claimRoleLabel(role).toLowerCase();
  const article = /^[aeiou]/.test(label) ? "an" : "a";
  return `Wants to join as ${article} ${label}`;
}

/** `“…their note…” · address`, or the address alone when they wrote nothing. */
function requestMeta(request: AdminTeamJoinRequest): string {
  const said = request.note?.trim();
  return said ? `“${said}” · ${request.email}` : request.email;
}

/**
 * "Invited Sep 10 by Avery Lin · expires Sep 17". The sender clause is dropped
 * rather than guessed when `invited_by` resolves to nobody, and an expired
 * link says so: `expired` is decided by the loader, on the server.
 */
function inviteMeta(invite: AdminTeamInvite): string {
  const by = invite.invitedByName ? ` by ${invite.invitedByName}` : "";
  const expiry = invite.expired ? "expired" : "expires";
  return `Invited ${shortDate(invite.createdAt)}${by} · ${expiry} ${shortDate(invite.expiresAt)}`;
}

/**
 * The one sentence under the list: how this program's owner got in.
 *
 * Only for an approved claim — every other status is still moving, and the
 * Requests console is where those are worked. The three sentences are three
 * different facts: a contact match approved itself, a human approved a
 * reviewed claim, and a domain match is recorded evidence, never an approval.
 * When nothing on the row says who approved it, the sentence says so rather
 * than inventing a reason.
 */
function claimStrip(claim: AdminTeamClaim | null): string | null {
  if (!claim || claim.status !== "approved") return null;

  const who = claim.claimantName?.trim() || claim.claimedEmail;
  const when = shortDate(claim.updatedAt ?? claim.createdAt);

  if (claim.contactMatched) {
    return `${who}'s claim approved itself ${when} — the address is on the recorded staff list.`;
  }
  if (claim.reviewedBy) {
    return `${who}'s claim was approved by an admin ${when} after review.`;
  }
  if (claim.domainMatched) {
    return `${who}'s claim was approved ${when}; the address is on the school's domain, which is recorded evidence and not an approval on its own.`;
  }
  return `${who}'s claim was approved ${when}. Nothing on the record says who approved it.`;
}

/** Whom the open invite row is for: anyone, or one roster profile. */
type Compose = { for: null } | { for: AdminTeamRosterPlayer };

export function AdminPeopleList({
  programId,
  programName,
  joinRequests,
  members,
  roster,
  invites,
  seats,
  claim,
}: {
  programId: string;
  /** The name the transfer dialog asks an admin to type. */
  programName: string;
  joinRequests: readonly AdminTeamJoinRequest[];
  members: readonly AdminTeamMember[];
  /** The live squad, in lineup order with null spots last. */
  roster: readonly AdminTeamRosterPlayer[];
  /** Outstanding invitations, listed after the people. */
  invites: readonly AdminTeamInvite[];
  seats: SeatUsage;
  /** The program's latest claim, or null for one nobody has ever claimed. */
  claim: AdminTeamClaim | null;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const [transferTarget, setTransferTarget] = useState<TeamMember | null>(null);
  const [transferOpen, setTransferOpen] = useState(false);
  // Bumped on every open so the dialog remounts with fresh state: it has no
  // reset effect of its own.
  const [transferSession, setTransferSession] = useState(0);

  const [adding, setAdding] = useState(false);

  const [compose, setCompose] = useState<Compose | null>(null);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<AssignableRole>("player");
  const [isInviting, startInvite] = useTransition();

  // One transition guards every row write. These are few, slow,
  // consequential writes on a console page: a second press while the first is
  // in flight is a mistake, not a feature.
  const [isSaving, startRowAction] = useTransition();

  /**
   * The upload switches, flipped before the server has agreed. The override
   * holds while the write and the refresh are in flight and drops when the
   * transition ends — on failure nothing was written, so dropping it IS the
   * revert, and the error line says why.
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

  const rows = useMemo(
    () =>
      adminPeopleRows({ joinRequests, members: shownMembers, roster, invites }),
    [joinRequests, shownMembers, roster, invites],
  );
  const owner = shownMembers.find((member) => member.role === "owner") ?? null;
  const strip = claimStrip(claim);

  const clearOutcome = () => {
    setError(null);
    setNote(null);
  };

  /** Every row write: clear the last outcome, write, then re-read. */
  const runRowAction = (
    work: () => Promise<
      { ok: true; warning?: string } | { ok: false; error: string }
    >,
    done: string,
    optimistic?: () => void,
  ) => {
    if (isSaving) return;
    clearOutcome();
    startRowAction(async () => {
      optimistic?.();
      const result = await work().catch(actionRejected);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setNote(result.warning ?? done);
      router.refresh();
    });
  };

  const openCompose = (next: Compose) => {
    clearOutcome();
    setCompose(next);
    setEmail(next.for?.email ?? "");
    setRole("player");
  };

  const invite = () => {
    const address = email.trim();
    if (!address || isInviting || !compose) return;
    const player = compose.for;
    clearOutcome();
    startInvite(async () => {
      const result = await adminInviteMember({
        programId,
        email: address,
        // A profile's invitation is a player's, by what the profile is.
        role: player ? "player" : role,
        playerId: player?.id ?? null,
      }).catch(actionRejected);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setEmail("");
      setCompose(null);
      setNote(result.warning ?? `Invitation sent to ${address}.`);
      router.refresh();
    });
  };

  /**
   * Add player is the dashboard's own dialog, with the program id bound.
   * `restore` is null: there is no admin wrapper for `restore_program_player`,
   * and the dialog suppresses the whole offer for null.
   */
  const addActions: AddPlayerActions = {
    add: (fields) => adminAddProgramPlayer({ programId, ...fields }),
    invite: (input) => adminInviteMember({ programId, ...input }),
    restore: null,
  };
  const dialogRoster: AddPlayerRosterRow[] = roster.map((player) => ({
    profileId: player.id,
    name: player.name,
    email: player.email,
    role: "player",
    lineupSpot: player.lineupSpot,
  }));

  const peopleCount = adminPeopleCount(rows);
  const waiting = joinRequests.length;

  return (
    <section aria-labelledby="team-people" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2.5">
        <h2
          id="team-people"
          className="text-[14px] font-medium text-[var(--ink-900)]"
        >
          People{" "}
          {/* The loader's own seat ledger, printed rather than re-derived:
              `seats.seats` is `programs.seats`. */}
          <span className="font-normal text-[var(--ink-500)]">
            {peopleCount} · {seats.used} of {seats.seats} seats
            {waiting > 0 && ` · ${waiting} waiting to join`}
          </span>
        </h2>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => {
              clearOutcome();
              setAdding(true);
            }}
            className={advButton("outline", "sm")}
          >
            Add player
          </button>
          <button
            type="button"
            aria-expanded={compose?.for === null}
            onClick={() =>
              compose?.for === null
                ? setCompose(null)
                : openCompose({ for: null })
            }
            className={advButton("outline", "sm")}
          >
            Invite people
          </button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-[var(--radius-card)] border border-[var(--border-card)] bg-[var(--surface-card)] shadow-[var(--shadow-card)]">
        <ul className="flex min-w-[560px] flex-col">
          {rows.map((row) => {
            switch (row.kind) {
              case "request": {
                const { request } = row;
                const name = requesterName(request);
                return (
                  <li key={row.key} className={ROW}>
                    <Face name={name} />
                    <span className="flex min-w-0 flex-col">
                      <span className={NAME}>{name}</span>
                      <span className={SUB}>{requestMeta(request)}</span>
                    </span>
                    <span className={ROLE}>{wantsLine(request.role)}</span>
                    <span className={ACTIONS}>
                      {/* Approve sends an invitation — coach for a coach
                          request, player otherwise — that reserves a seat now
                          and mints the membership on acceptance, then closes
                          the request: membership is only ever self-created. */}
                      <button
                        type="button"
                        disabled={isSaving}
                        onClick={() =>
                          runRowAction(
                            () => adminResolveJoinRequest(request.id, "invite"),
                            `Invitation sent to ${request.email}.`,
                          )
                        }
                        className={advButton("primary", "sm")}
                      >
                        Approve
                      </button>
                      <button
                        type="button"
                        disabled={isSaving}
                        onClick={() =>
                          runRowAction(
                            () =>
                              adminResolveJoinRequest(request.id, "dismiss"),
                            `Request from ${request.email} declined.`,
                          )
                        }
                        className={advButton("outline", "sm")}
                      >
                        Decline
                      </button>
                    </span>
                  </li>
                );
              }

              case "member": {
                const { member } = row;
                const options = assignableRoles("owner", NO_VIEWER, member);
                // Ownership moves to a coach or staff member, never to a
                // player and never to whoever already holds it.
                const canReceive =
                  member.role === "coach" || member.role === "staff";
                return (
                  <li key={row.key} className={ROW}>
                    <Face name={member.name} photoUrl={member.avatarUrl} />
                    {/* The address under the name, as a request's and an
                        invitation's sit under theirs: it is what a support
                        case is usually asked about. */}
                    <span className="flex min-w-0 flex-col">
                      <span className={NAME}>{member.name}</span>
                      <span className={SUB}>{member.email}</span>
                    </span>
                    {options.length > 0 ? (
                      <span className="flex min-w-0">
                        <RoleMenu
                          programId={programId}
                          userId={member.userId}
                          role={member.role}
                          options={options}
                          onError={setError}
                          action={adminSetProgramMemberRole}
                        />
                      </span>
                    ) : (
                      <span className={ROLE}>{capitalize(member.role)}</span>
                    )}
                    <span className={ACTIONS}>
                      {canReceive && (
                        <button
                          type="button"
                          onClick={() => {
                            clearOutcome();
                            setTransferTarget(member);
                            setTransferSession((session) => session + 1);
                            setTransferOpen(true);
                          }}
                          className={TEXT_ACTION}
                        >
                          Transfer ownership
                        </button>
                      )}
                      {/* The owner's own permission is not a switch: they
                          are the program. */}
                      {member.role !== "owner" && (
                        <span className="flex shrink-0 items-center gap-1.5">
                          <span className="text-[11px] text-[var(--ink-500)]">
                            Uploads
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
                                  overrideUpload({
                                    userId: member.userId,
                                    enabled,
                                  }),
                              )
                            }
                          />
                        </span>
                      )}
                    </span>
                  </li>
                );
              }

              case "player": {
                const { player } = row;
                return (
                  <li key={row.key} className={ROW}>
                    <Face name={player.name} />
                    <span className={NAME}>{player.name}</span>
                    <span className={ROLE}>Player</span>
                    <span className={ACTIONS}>
                      {!player.hasAccount && (
                        <span className="text-[12px] font-medium whitespace-nowrap text-[var(--ink-700)]">
                          No account ·{" "}
                          <button
                            type="button"
                            aria-label={`Invite ${player.name}`}
                            onClick={() => openCompose({ for: player })}
                            className="cursor-pointer text-[var(--blue)] transition-colors hover:text-[var(--blue-hover)] focus-visible:outline-none"
                          >
                            Invite
                          </button>
                        </span>
                      )}
                    </span>
                  </li>
                );
              }

              case "invite": {
                const { invite: pending } = row;
                return (
                  <li key={row.key} className={ROW}>
                    {/* An invitation is a row one step early: a dashed ring
                        where the face will be, the address where the name
                        will be. */}
                    <span
                      aria-hidden="true"
                      className="size-[26px] shrink-0 rounded-full border border-dashed border-[var(--ink-300)]"
                    />
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate text-[13px] text-[var(--ink-900)]">
                        {pending.email}
                      </span>
                      <span className={SUB}>{inviteMeta(pending)}</span>
                    </span>
                    <span className={ROLE}>{capitalize(pending.role)}</span>
                    <span className={ACTIONS}>
                      <button
                        type="button"
                        disabled={isSaving}
                        onClick={() =>
                          runRowAction(
                            () =>
                              adminInviteMember({
                                programId,
                                // `create_program_invite` upserts on the
                                // one-open-invite index, so this mints a fresh
                                // token on the same row. Carries the roster row
                                // it claims — see `resendInput`.
                                ...resendInput(pending),
                              }),
                            `Invitation to ${pending.email} sent again.`,
                          )
                        }
                        className={RESEND_CLASS}
                      >
                        {RESEND_LABEL}
                      </button>
                      <button
                        type="button"
                        disabled={isSaving}
                        onClick={() =>
                          runRowAction(
                            () => adminRevokeInvite(pending.id),
                            `Invitation to ${pending.email} revoked.`,
                          )
                        }
                        className="shrink-0 cursor-pointer text-[11px] text-[var(--ink-500)] transition-colors hover:text-[var(--danger)] disabled:opacity-50"
                      >
                        {REVOKE_LABEL}
                      </button>
                    </span>
                  </li>
                );
              }
            }
          })}

          {rows.length === 0 && (
            <li className="px-4 py-3 text-[12px] text-[var(--ink-500)]">
              Nobody is on this program yet, and nobody is waiting to join.
            </li>
          )}
        </ul>

        {/* The invite row, at the list's foot: the header (or a profile's
            Invite) is the way in, this is the form it opens. */}
        {compose && (
          <div className="flex min-w-[560px] items-end gap-3 border-t border-[var(--border-hairline)] px-4 pt-3 pb-3.5">
            <label className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="text-[11px] text-[var(--ink-600)]">
                {compose.for
                  ? `Email address for ${compose.for.name}`
                  : "Email address"}
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
                  if (event.key === "Escape") setCompose(null);
                }}
              />
            </label>
            {compose.for === null && (
              <MenuSelect
                label="Role for the invitation"
                value={role}
                options={INVITE_ROLES}
                onChange={setRole}
                disabled={isInviting}
                className="mb-0.5 h-8 w-[104px] px-2.5"
              />
            )}
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
      </div>

      {strip && (
        <div className={noteStripCls}>
          <CircleCheck
            className={`${noteIconCls} text-[var(--ink-400)]`}
            strokeWidth={1.5}
            aria-hidden="true"
          />
          <span>{strip}</span>
        </div>
      )}

      <AdminCardProblem message={error} />
      <AdminCardNote message={error ? null : note} />

      <AddPlayerDialog
        open={adding}
        onOpenChange={setAdding}
        seats={seats}
        roster={dialogRoster}
        former={[]}
        actions={addActions}
      />

      <TransferOwnershipDialog
        key={transferSession}
        open={transferOpen}
        onOpenChange={setTransferOpen}
        programId={programId}
        programName={programName}
        target={transferTarget}
        // The Done step names the person who STOPS being the owner —
        // `admin_transfer_program_ownership` demotes the holder, and an admin
        // holds nothing. A program with no owner row says so.
        viewerName={owner?.name ?? "No current owner"}
        action={adminTransferProgramOwnership}
      />
    </section>
  );
}

/**
 * The People list while the team page loads: the real heading and its two
 * actions (inert until the page lands), the count and seat ledger as a bar,
 * and rows of bars on the list's own tracks.
 */
export function AdminPeopleListSkeleton() {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2.5">
        <h2 className="flex items-center gap-1.5 text-[14px] font-medium text-[var(--ink-900)]">
          People <PendingBar className="h-3 w-36" />
        </h2>
        <div className="flex gap-2">
          <InertButton>Add player</InertButton>
          <InertButton>Invite people</InertButton>
        </div>
      </div>
      <PendingRegion label="people">
        <div className="overflow-hidden rounded-[var(--radius-card)] border border-[var(--border-card)] bg-[var(--surface-card)] shadow-[var(--shadow-card)]">
          <ul className="flex flex-col">
            {[0, 1, 2, 3, 4].map((row) => (
              <li key={row} className={ROW}>
                <PendingBar className="size-[26px] rounded-full" />
                <span className="flex min-w-0 flex-col gap-1.5">
                  <PendingBar className="h-3 w-40" />
                  <PendingBar className="h-2.5 w-52" />
                </span>
                <PendingBar className="h-3 w-16" />
                <span />
              </li>
            ))}
          </ul>
        </div>
      </PendingRegion>
    </section>
  );
}
