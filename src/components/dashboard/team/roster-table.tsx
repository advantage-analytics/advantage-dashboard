"use client";

import { useState, useTransition } from "react";
import { Check, Minus } from "lucide-react";
import { formatAnalysisTime } from "@/lib/data/usage-format";
import { setMemberUploadEnabled } from "@/components/dashboard/team/roster-actions";
import {
  inviteMember,
  removeMember,
  revokeInvite,
} from "@/components/dashboard/settings/team-actions";
import type {
  RosterInvite,
  RosterMember,
} from "@/lib/data/team-roster-server";

/**
 * Everyone on the program, and what each of them may do.
 *
 * Two audiences on one component, because they are looking at the same list.
 * Staff get the controls; a player gets the list, and the database has already
 * decided they only see their own line — `program_roster` returns one row for
 * them. So the player case is not a smaller version of this table, it is this
 * table with one row and no buttons, and it needs no separate rendering path.
 *
 * The columns answer the three questions a coach actually opens this page with:
 * who is here, who can spend the program's analysis time, and where the month's
 * hours went.
 */

const ROW =
  "grid gap-3 px-[18px] py-3.5 sm:grid-cols-[minmax(0,1.6fr)_96px_minmax(0,110px)_128px] sm:items-center sm:gap-4";

const ROLE_LABEL: Record<string, string> = {
  owner: "Owner",
  coach: "Coach",
  staff: "Staff",
  player: "Player",
};

function Problem({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="text-[12px] leading-[18px] text-[var(--danger)]">
      {message}
    </p>
  );
}

/**
 * The upload permission, as a control for staff and a fact for everyone else.
 *
 * Rendered as a check or a dash rather than a disabled switch when the viewer
 * cannot change it. A greyed-out toggle invites a click that does nothing and
 * says nothing; a mark just states where things stand.
 */
function UploadCell({
  member,
  canManage,
  onError,
}: {
  member: RosterMember;
  canManage: boolean;
  onError: (message: string | null) => void;
}) {
  const [enabled, setEnabled] = useState(member.uploadEnabled);
  const [pending, start] = useTransition();

  if (!canManage) {
    return enabled ? (
      <span className="flex items-center gap-1.5 text-[12px] text-[var(--ink-700)]">
        <Check className="size-3.5" strokeWidth={1.5} aria-hidden />
        Yes
      </span>
    ) : (
      <span className="flex items-center gap-1.5 text-[12px] text-[var(--ink-400)]">
        <Minus className="size-3.5" strokeWidth={1.5} aria-hidden />
        No
      </span>
    );
  }

  // The owner always may. Offering a switch that the RPC would honour but that
  // would lock a program's only owner out of its own budget is a control with
  // one useful position.
  if (member.role === "owner") {
    return (
      <span className="flex items-center gap-1.5 text-[12px] text-[var(--ink-700)]">
        <Check className="size-3.5" strokeWidth={1.5} aria-hidden />
        Yes
      </span>
    );
  }

  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      aria-label={`Let ${member.name} send video`}
      disabled={pending}
      onClick={() => {
        const next = !enabled;
        // Moved before the await so the switch answers the press immediately,
        // and put back if the server refuses. A permission toggle that waits
        // on a round trip reads as broken on a slow connection.
        setEnabled(next);
        onError(null);
        start(async () => {
          const result = await setMemberUploadEnabled(member.userId, next);
          if (!result.ok) {
            setEnabled(!next);
            onError(result.error);
          }
        });
      }}
      className={`relative inline-flex h-[18px] w-[32px] shrink-0 cursor-pointer items-center rounded-full transition-colors duration-150 focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none disabled:opacity-50 ${
        enabled ? "bg-[var(--blue)]" : "bg-[var(--ink-200)]"
      }`}
    >
      <span
        className={`absolute size-[14px] rounded-full bg-white transition-transform duration-150 ${
          enabled ? "translate-x-[16px]" : "translate-x-[2px]"
        }`}
      />
    </button>
  );
}

export function RosterTable({
  members,
  invites,
  canManage,
  viewerId,
}: {
  members: RosterMember[];
  invites: RosterInvite[];
  canManage: boolean;
  /** So the viewer's own row cannot offer to remove itself. */
  viewerId: string;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <div className="flex flex-col gap-4">
      <Problem message={error} />

      <div className="overflow-hidden rounded-[var(--radius-card)] border border-[var(--border-medium)]">
        <div
          className={`${ROW} border-b border-[var(--border-hairline)] bg-[var(--surface-page)]`}
        >
          <span className="text-[11px] tracking-[0.08em] text-[var(--ink-500)] uppercase">
            Member
          </span>
          <span className="text-[11px] tracking-[0.08em] text-[var(--ink-500)] uppercase">
            Role
          </span>
          <span className="text-[11px] tracking-[0.08em] text-[var(--ink-500)] uppercase">
            Can send
          </span>
          <span className="text-[11px] tracking-[0.08em] text-[var(--ink-500)] uppercase">
            This month
          </span>
        </div>

        <ul>
          {members.map((member, index) => (
            <li
              key={member.userId}
              className={
                index === 0 ? "" : "border-t border-[var(--border-hairline)]"
              }
            >
              <div className={ROW}>
                <span className="min-w-0">
                  <span className="block truncate text-[13px] text-[var(--ink-900)]">
                    {member.name}
                    {member.userId === viewerId && (
                      <span className="ml-1.5 text-[11px] text-[var(--ink-400)]">
                        you
                      </span>
                    )}
                  </span>
                  <span className="block truncate text-[11px] text-[var(--ink-500)]">
                    {member.email}
                  </span>
                </span>

                <span className="text-[12px] text-[var(--ink-700)]">
                  {ROLE_LABEL[member.role] ?? member.role}
                </span>

                <UploadCell
                  member={member}
                  canManage={canManage}
                  onError={setError}
                />

                <span className="flex items-center justify-between gap-2">
                  <span className="text-[12px] tabular-nums text-[var(--ink-700)]">
                    {member.usedSeconds > 0
                      ? formatAnalysisTime(member.usedSeconds)
                      : "—"}
                  </span>
                  {/* Owners are never removable here. Ownership moves by
                      transfer, and a roster screen is not where a program
                      should be able to lose the only person who runs it. */}
                  {canManage &&
                    member.role !== "owner" &&
                    member.userId !== viewerId && (
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() =>
                          start(async () => {
                            setError(null);
                            const result = await removeMember(member.userId);
                            if (!result.ok) setError(result.error);
                          })
                        }
                        className="text-[11px] text-[var(--ink-500)] transition-colors hover:text-[var(--danger)] disabled:opacity-50"
                      >
                        Remove
                      </button>
                    )}
                </span>
              </div>
            </li>
          ))}
        </ul>
      </div>

      {canManage && invites.length > 0 && (
        <div className="flex flex-col gap-2">
          <span className="text-[11px] tracking-[0.08em] text-[var(--ink-500)] uppercase">
            Invited, not yet joined
          </span>
          <ul className="overflow-hidden rounded-[var(--radius-card)] border border-[var(--border-medium)]">
            {invites.map((invite, index) => (
              <li
                key={invite.id}
                className={
                  index === 0 ? "" : "border-t border-[var(--border-hairline)]"
                }
              >
                <div className="flex items-center gap-3 px-[18px] py-3">
                  <span className="min-w-0 flex-1 truncate text-[13px] text-[var(--ink-700)]">
                    {invite.email}
                  </span>
                  <span className="text-[12px] text-[var(--ink-500)]">
                    {ROLE_LABEL[invite.role] ?? invite.role}
                  </span>
                  {/* Resend is the same call as invite: `create_program_invite`
                      upserts on the one-open-invite index, so it refreshes the
                      row and mints a fresh token rather than leaving two live
                      links into one program. */}
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() =>
                      start(async () => {
                        setError(null);
                        const result = await inviteMember({
                          email: invite.email,
                          role:
                            invite.role === "owner" ? "player" : invite.role,
                        });
                        if (!result.ok) setError(result.error);
                        else if (result.warning) setError(result.warning);
                      })
                    }
                    className="text-[11px] text-[var(--blue)] transition-colors hover:text-[var(--blue-hover)] disabled:opacity-50"
                  >
                    Resend
                  </button>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() =>
                      start(async () => {
                        setError(null);
                        const result = await revokeInvite(invite.id);
                        if (!result.ok) setError(result.error);
                      })
                    }
                    className="text-[11px] text-[var(--ink-500)] transition-colors hover:text-[var(--danger)] disabled:opacity-50"
                  >
                    Withdraw
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
