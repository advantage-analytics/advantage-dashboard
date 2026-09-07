"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  SettingsMenuSelect,
  type MenuOption,
} from "@/components/dashboard/settings/settings-menu-select";
import { setProgramMemberRole } from "@/components/dashboard/settings/team-actions";
import type { MemberRole } from "@/lib/data/team-settings-server";
import { capitalize } from "@/lib/utils";

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
 * `SettingsMenuSelect` in its pill form, narrowed to the row: options come
 * from the caller (an owner sees three, a coach two), owner is never among
 * them, and the menu ends on where ownership moves instead. Picking commits
 * at once; the row behind it re-renders from the server.
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
  const [isPending, startTransition] = useTransition();

  const menuOptions: MenuOption<AssignableRole>[] = options.map((option) => ({
    value: option,
    label: capitalize(option),
    description: ROLE_NOTE[option],
  }));

  return (
    <SettingsMenuSelect
      label={`Change role, currently ${capitalize(role)}`}
      // The owner's role is never assignable, so it is never `value` here —
      // rows that hold it draw as a pill, not this menu.
      value={role as AssignableRole}
      options={menuOptions}
      note="Ownership moves by transfer, not from this menu."
      disabled={isPending}
      className="h-7 w-[92px] px-2.5"
      onChange={(next) => {
        onError(null);
        startTransition(async () => {
          const result = await setProgramMemberRole({ programId, userId, role: next });
          if (!result.ok) {
            onError(result.error);
            return;
          }
          router.refresh();
        });
      }}
    />
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
