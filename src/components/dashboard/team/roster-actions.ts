"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceContext } from "@/lib/workspace/active-workspace-server";
import type { ActionResult } from "@/components/dashboard/settings/actions";

/**
 * The one write the Roster page performs that Settings › Team does not.
 *
 * Everything else it needs — invite, resend, revoke, remove — already exists in
 * `settings/team-actions.ts` and is imported from there rather than copied. Two
 * implementations of "revoke an invitation" is how one of them quietly stops
 * revalidating the page the other one revalidates.
 *
 * `set_member_upload_enabled` has existed since the membership migration and
 * has never had a caller: there was no screen with a per-person control on it,
 * because there was no roster. This is that caller.
 */

const ROSTER_PATH = "/dashboard/team/roster";
const SETTINGS_PATH = "/dashboard/settings/team";
const TEAM_HOME_PATH = "/dashboard/team";

/**
 * Let one member spend the program's analysis budget, or stop them.
 *
 * Per-person, and deliberately not the same switch as the program-wide
 * "players can upload" default in settings. A coach wanting to hand the budget
 * to one senior without opening it to the whole squad is the ordinary case,
 * and a single program-level toggle cannot express it.
 *
 * No program id parameter. Which program is being edited is server state the
 * workspace context already resolves; accepting it from the form would mean
 * treating it as untrusted on arrival and re-checking it against exactly the
 * lookup happening here anyway.
 */
export async function setMemberUploadEnabled(
  userId: string,
  enabled: boolean
): Promise<ActionResult> {
  const workspace = await getWorkspaceContext();
  if (!workspace || workspace.active.kind !== "team") {
    return { ok: false, error: "Switch to your team workspace to change it." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("set_member_upload_enabled", {
    p_program_id: workspace.active.id,
    p_user_id: userId,
    p_enabled: enabled,
  });

  if (error) {
    // The RPC raises 42501 for a non-staff caller, and its message is written
    // for a person. Pass it through rather than replacing it with a guess.
    const raw = error.message?.trim();
    return {
      ok: false,
      error: raw && raw.length > 0 ? raw : "Couldn't change that permission.",
    };
  }

  revalidatePath(ROSTER_PATH);
  revalidatePath(SETTINGS_PATH);
  revalidatePath(TEAM_HOME_PATH);
  return { ok: true };
}
