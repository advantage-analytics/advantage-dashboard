"use client";

import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { SettingsCard } from "@/components/dashboard/settings/settings-card";
import { SettingsButton } from "@/components/dashboard/settings/settings-button";
import { StatePill } from "@/components/ui/state-pill";
import { YouPill } from "@/components/ui/new-pill";
import { getInitials } from "@/lib/data/match-utils";
import type {
  TeamInvite,
  TeamMember,
} from "@/lib/data/team-settings-server";
import type { SeatUsage } from "@/lib/data/teams-server";
import { setActiveWorkspaceThen } from "@/lib/workspace/actions";
import { capitalize, cn } from "@/lib/utils";

const ROSTER_PATH = "/dashboard/team/roster";

/**
 * Who is on the program, and how many more there is room for.
 *
 * A summary, deliberately without an invite box. The roster's dialog can bind
 * an invitation to a player already listed so their matches stay put; a
 * thinner control here would mint orphan logins beside those rows. So this
 * card names everyone and hands off — one place to add people, one place to
 * change what they are. The exception is ownership, which is governance rather
 * than roster admin and starts from the person's row here.
 *
 * Seats are countable and few, so they are boxes rather than a bar: filled =
 * taken, outlined = held by an open invite, grey = free. The outlined box and
 * the outlined `Invited` pill are the same fact drawn twice on purpose.
 */
export function TeamMembersCard({
  programId,
  isActiveWorkspace,
  members,
  invites,
  seats,
  viewerId,
  isOwner,
  isStaff,
  onMakeOwner,
}: {
  programId: string;
  isActiveWorkspace: boolean;
  members: readonly TeamMember[];
  invites: readonly TeamInvite[];
  seats: SeatUsage;
  viewerId: string;
  isOwner: boolean;
  isStaff: boolean;
  onMakeOwner: (member: TeamMember) => void;
}) {
  const goToRoster = setActiveWorkspaceThen.bind(null, programId, ROSTER_PATH);

  return (
    <SettingsCard>
      <div className="flex items-center gap-2.5">
        <span className="text-[13px] font-medium text-[var(--ink-900)]">
          Members
        </span>
        {isStaff && (
          <div className="flex flex-1 items-center justify-end">
            {isActiveWorkspace ? (
              <Link
                href={ROSTER_PATH}
                className="inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-[6px] border border-[var(--border-field)] bg-[var(--surface-card)] px-3 text-[12px] font-medium text-[var(--ink-700)] transition-colors duration-200 hover:bg-[var(--surface-subtle)] focus-visible:outline-none"
              >
                Manage on Roster
                <ArrowUpRight className="size-3" strokeWidth={1.5} aria-hidden="true" />
              </Link>
            ) : (
              <form action={goToRoster}>
                <SettingsButton type="submit" variant="outline" size="sm">
                  Manage on Roster
                  <ArrowUpRight className="size-3" strokeWidth={1.5} aria-hidden="true" />
                </SettingsButton>
              </form>
            )}
          </div>
        )}
      </div>

      <SeatPips seats={seats} />

      <div className="pt-2">
        {members.map((member) => {
          const canReceive =
            isOwner &&
            member.userId !== viewerId &&
            (member.role === "coach" || member.role === "staff");
          return (
            <PersonRow key={member.userId}>
              <Avatar22>{getInitials(member.name)}</Avatar22>
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
              <StatePill className="w-[62px] justify-center">
                {capitalize(member.role)}
              </StatePill>
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
            <span className="text-[11px] text-[var(--ink-500)]">
              Sent {formatInviteDate(invite.createdAt)}
            </span>
            <StatePill outline className="w-[62px] justify-center">
              Invited
            </StatePill>
          </PersonRow>
        ))}

        {members.length === 0 && invites.length === 0 && (
          <p className="border-t border-[var(--border-hairline)] py-3 text-[12px] text-[var(--ink-500)]">
            Nobody on the roster yet.
          </p>
        )}
      </div>

      {/* No rule above the note: the last row already drew one. */}
      <span className="mt-3.5 text-[11px] leading-[1.5] text-[var(--ink-500)]">
        {isStaff
          ? "Inviting, roles and removals happen on the Roster, where an invitation can attach to a player already listed. Ownership is the exception and lives here."
          : "Only the coaching staff can invite people or change roles on this team."}
      </span>
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
        className="flex flex-wrap gap-1"
        role="img"
        aria-label={`${seats.used} of ${total} seats used, ${held} held by open invites`}
      >
        {Array.from({ length: total }, (_, index) => {
          const kind =
            index < seats.used ? "used" : index < seats.used + held ? "held" : "free";
          return (
            <span
              key={index}
              className={cn(
                "size-2 rounded-[2px]",
                kind === "used" && "bg-[var(--blue)]",
                kind === "held" && "shadow-[inset_0_0_0_1px_var(--blue)]",
                kind === "free" && "bg-[var(--ink-100)]"
              )}
            />
          );
        })}
      </span>
      <span className="text-[11px] text-[var(--ink-500)]">
        {seats.used} of {total} seats
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

/** The 22px mark the v3 person row leads with — smaller than a table's 26. */
function Avatar22({ children }: { children: React.ReactNode }) {
  return (
    <span
      aria-hidden="true"
      className="flex size-[22px] shrink-0 items-center justify-center rounded-full bg-[var(--surface-subtle)] text-[9px] font-medium text-[var(--ink-700)]"
    >
      {children}
    </span>
  );
}

/** `2026-08-04T…` → `Aug 4`. */
function formatInviteDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}
