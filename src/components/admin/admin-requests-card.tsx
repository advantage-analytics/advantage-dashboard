"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  SettingsCard,
  SettingsCardTitle,
} from "@/components/dashboard/settings/settings-card";
import { StatePill } from "@/components/ui/state-pill";
import {
  AdminCardNote,
  AdminCardProblem,
  AdminPersonRow,
} from "@/components/admin/admin-people-card";
import {
  RESEND_CLASS,
  RESEND_LABEL,
  REVOKE_LABEL,
  requesterName,
  resendRole,
} from "@/components/dashboard/team/roster-vocabulary";
import {
  adminInviteMember,
  adminResolveJoinRequest,
  adminRevokeInvite,
} from "@/lib/services/programs/admin-team-actions";
import type { AdminTeamJoinRequest } from "@/lib/data/admin-team-server";
import type { TeamInvite } from "@/lib/data/team-settings-server";

/**
 * Everybody half-way in: invitations this program has sent and nobody has
 * accepted, and strangers who have asked to be let in.
 *
 * Two lists in one card because they are one question — who is waiting, and
 * what do I do about them — and because the answer to a join request is an
 * invitation, which lands in the list above it. The words and the look of
 * Resend and Revoke are the Roster's, imported from `roster-vocabulary.tsx`
 * rather than retyped, so the console and the coach's own page cannot start
 * calling the same button different things.
 *
 * Resend is `adminInviteMember` on the address that is already there, exactly
 * as the Roster resends with `inviteMember`: `create_program_invite` upserts
 * on the one-open-invite index, so it refreshes the row and mints a fresh
 * token rather than leaving two live links into one program.
 *
 * One transition guards the whole card. These are few, slow, consequential
 * writes on a console page — a second Revoke pressed while the first is in
 * flight is a mistake, not a feature.
 */
export function AdminRequestsCard({
  programId,
  invites,
  joinRequests,
}: {
  programId: string;
  invites: readonly TeamInvite[];
  joinRequests: readonly AdminTeamJoinRequest[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const run = (
    work: () => Promise<
      { ok: true; warning?: string } | { ok: false; error: string }
    >,
    done: string,
  ) => {
    setError(null);
    setNote(null);
    startTransition(async () => {
      const result = await work();
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setNote(result.warning ?? done);
      router.refresh();
    });
  };

  const waiting = invites.length + joinRequests.length;

  return (
    <SettingsCard className="bg-[var(--surface-card)]">
      <SettingsCardTitle
        trailing={
          waiting > 0 ? (
            <span className="text-[11px] text-[var(--ink-500)]">
              {waiting} waiting
            </span>
          ) : undefined
        }
      >
        Invites &amp; requests
      </SettingsCardTitle>

      <div className="pt-2">
        {invites.map((invite) => (
          <AdminPersonRow key={invite.id}>
            <span
              aria-hidden="true"
              className="size-[22px] shrink-0 rounded-full border border-dashed border-[var(--ink-300)]"
            />
            <span className="min-w-0 truncate text-[12px] text-[var(--ink-500)]">
              {invite.email}
            </span>
            <span className="flex-1" />
            <span className="shrink-0 text-[11px] text-[var(--ink-500)]">
              Sent {formatDate(invite.createdAt)}
            </span>
            <StatePill outline>Invited</StatePill>
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                run(
                  () =>
                    adminInviteMember({
                      programId,
                      email: invite.email,
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
              disabled={pending}
              onClick={() =>
                run(
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

        {invites.length === 0 && (
          <p className="border-t border-[var(--border-hairline)] py-3 text-[12px] text-[var(--ink-500)]">
            No invitations are outstanding.
          </p>
        )}
      </div>

      <div className="pt-4">
        <span className="text-[11px] text-[var(--ink-600)]">Asked to join</span>
        <div className="pt-1.5">
          {joinRequests.map((request) => (
            <AdminPersonRow key={request.id}>
              <span
                aria-hidden="true"
                className="size-[22px] shrink-0 rounded-full border border-dashed border-[var(--ink-300)]"
              />
              <span className="min-w-0 truncate text-[12px] font-medium text-[var(--ink-900)]">
                {requesterName(request)}
              </span>
              <span className="min-w-0 truncate text-[12px] text-[var(--ink-500)]">
                {request.email}
              </span>
              <span className="flex-1" />
              <span className="shrink-0 text-[11px] text-[var(--ink-500)]">
                {formatDate(request.createdAt)}
              </span>
              {/* "Invite" rather than "Approve": membership is only ever
                  self-created, so this sends a player invitation that reserves
                  a seat now and mints the membership on acceptance, then
                  closes the request. */}
              <button
                type="button"
                disabled={pending}
                onClick={() =>
                  run(
                    () => adminResolveJoinRequest(request.id, "invite"),
                    `Invitation sent to ${request.email}.`,
                  )
                }
                className={`${RESEND_CLASS} shrink-0`}
              >
                Invite
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() =>
                  run(
                    () => adminResolveJoinRequest(request.id, "dismiss"),
                    `Request from ${request.email} dismissed.`,
                  )
                }
                className="shrink-0 text-[11px] text-[var(--ink-500)] transition-colors hover:text-[var(--danger)] disabled:opacity-50"
              >
                Dismiss
              </button>
            </AdminPersonRow>
          ))}

          {joinRequests.length === 0 && (
            <p className="border-t border-[var(--border-hairline)] py-3 text-[12px] text-[var(--ink-500)]">
              Nobody is waiting to join.
            </p>
          )}
        </div>
      </div>

      <AdminCardProblem message={error} />
      <AdminCardNote message={error ? null : note} />
    </SettingsCard>
  );
}

/** `2026-08-04T…` → `Aug 4` — `TeamMembersCard`'s own invite date. */
function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}
