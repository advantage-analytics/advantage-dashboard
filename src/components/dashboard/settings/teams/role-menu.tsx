"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronDown } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { setProgramMemberRole } from "@/components/dashboard/settings/team-actions";
import type { MemberRole } from "@/lib/data/team-settings-server";
import { capitalize, cn } from "@/lib/utils";

export type AssignableRole = Exclude<MemberRole, "owner">;

/** What each standing lets you do, in one line — the menu says it so the pill needn't. */
const ROLE_NOTE: Record<AssignableRole, string> = {
  coach: "Runs the roster and the schedule",
  staff: "Uploads and reads; no roster changes",
  player: "Their own matches, plus what the team shares",
};

/**
 * The role, as a menu, on a member row the viewer may change.
 *
 * A float menu rather than a native select because each option carries a
 * line saying what it means — "Staff" tells a coach nothing on its own — and
 * because the menu has to end on the one thing it deliberately cannot do:
 * owner is never in the list, and the note says where ownership moves
 * instead. Picking commits at once; the row behind it re-renders from the
 * server. Options come from the caller: an owner sees three, a coach two.
 */
export function RoleMenu({
  programId,
  userId,
  role,
  options,
  onError,
}: {
  programId: string;
  userId: string;
  role: MemberRole;
  options: readonly AssignableRole[];
  onError: (message: string | null) => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const pick = (next: AssignableRole) => {
    setOpen(false);
    if (next === role) return;
    onError(null);
    startTransition(async () => {
      const result = await setProgramMemberRole({ programId, userId, role: next });
      if (!result.ok) {
        onError(result.error);
        return;
      }
      router.refresh();
    });
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={isPending}
          aria-label={`Change role, currently ${capitalize(role)}`}
          className={cn(
            "flex h-7 w-[92px] cursor-pointer items-center justify-between gap-2 rounded-[6px] border bg-[var(--surface-card)] px-2.5 text-[12px] text-[var(--ink-900)] transition-colors duration-150",
            "hover:bg-[var(--surface-subtle)] focus-visible:outline-none",
            "disabled:cursor-wait disabled:opacity-60",
            open ? "border-[var(--blue)]" : "border-[var(--border-field)]"
          )}
        >
          {capitalize(role)}
          <ChevronDown className="size-[11px] shrink-0 text-[var(--ink-500)]" strokeWidth={1.5} aria-hidden="true" />
        </button>
      </PopoverTrigger>

      <PopoverContent
        align="end"
        sideOffset={4}
        className="w-[212px] rounded-[10px] p-[5px] shadow-[0px_6px_20px_0px_rgba(0,0,0,0.12)]"
      >
        <div role="menu" aria-label="Role" className="flex flex-col">
          {options.map((option) => {
            const current = option === role;
            return (
              <button
                key={option}
                type="button"
                role="menuitemradio"
                aria-checked={current}
                onClick={() => pick(option)}
                className={cn(
                  "flex cursor-pointer items-start gap-2.5 rounded-[7px] px-2.5 py-[7px] text-left transition-colors duration-100",
                  "hover:bg-[var(--surface-subtle)] focus-visible:bg-[var(--surface-subtle)] focus-visible:outline-none",
                  current && "bg-[var(--surface-subtle)]"
                )}
              >
                <span className="mt-[3px] w-3 shrink-0 text-[var(--blue)]">
                  {current && <Check className="size-3" strokeWidth={2.5} aria-hidden="true" />}
                </span>
                <span className="flex min-w-0 flex-col">
                  <span className="text-[12px] text-[var(--ink-900)]">{capitalize(option)}</span>
                  <span className="mt-0.5 text-[11px] leading-[1.4] text-[var(--ink-500)]">
                    {ROLE_NOTE[option]}
                  </span>
                </span>
              </button>
            );
          })}
          <p className="mx-1 mt-1 border-t border-[var(--border-hairline)] px-1.5 pb-1 pt-2 text-[11px] leading-[1.5] text-[var(--ink-400)]">
            Ownership moves by transfer, not from this menu.
          </p>
        </div>
      </PopoverContent>
    </Popover>
  );
}

/**
 * Which roles the viewer may set on one row. Empty means the row is not
 * theirs to change and draws as a pill. Mirrors `set_program_member_role`,
 * which is the rule; this is what stops a menu opening on a refusal.
 */
export function assignableRoles(
  viewerRole: MemberRole,
  viewerId: string,
  member: { userId: string; role: MemberRole }
): readonly AssignableRole[] {
  if (member.userId === viewerId || member.role === "owner") return [];
  if (viewerRole === "owner") return ["coach", "staff", "player"];
  if (viewerRole === "coach" && (member.role === "staff" || member.role === "player")) {
    return ["staff", "player"];
  }
  return [];
}
