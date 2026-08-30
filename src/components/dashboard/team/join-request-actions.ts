"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceContext } from "@/lib/workspace/active-workspace-server";
import type { ActionResult } from "@/components/dashboard/settings/actions";

/**
 * Resolving a join request — the staff side of "Request an invite".
 *
 * Not in `roster-actions.ts`: that file is about player profiles, and a join
 * request is somebody who has no profile yet. The read side lives in
 * `lib/data/join-requests-server.ts`, which also explains why "join request"
 * and not "invite" — invites are the outbound direction.
 *
 * The workspace check below is a courtesy for someone on the wrong screen,
 * not the gate. `resolve_program_join_request` is SECURITY DEFINER and checks
 * that the caller is owner/coach/staff of the program THE REQUEST belongs to
 * — so a forged request id from some other program refuses in the database
 * (42501) no matter what workspace cookie rode in with it. The function also
 * hard-codes `kind = 'invite_request'`, which is what keeps an
 * `ownership_dispute` id unresolvable through this path even by that
 * program's own staff.
 */

const ROSTER_PATH = "/dashboard/team/roster";

export async function resolveJoinRequest(
  requestId: string
): Promise<ActionResult> {
  const workspace = await getWorkspaceContext();
  if (!workspace || workspace.active.kind !== "team") {
    return {
      ok: false,
      error: "Switch to your team workspace to manage join requests.",
    };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("resolve_program_join_request", {
    p_request_id: requestId,
  });

  if (error) {
    // Two raises, two codes — same shape as `set_member_upload_enabled`.
    // `42501` is a caller who is not this request's program's staff (or an id
    // that does not name an open invite request at all); `P0002` is a request
    // somebody else already handled. Both messages are written for a person,
    // so pass them through; the fallbacks only cover an empty one.
    const raw = error.message?.trim();
    const fallback =
      error.code === "P0002"
        ? "That request has already been handled."
        : "Couldn't resolve that request.";
    return { ok: false, error: raw || fallback };
  }

  revalidatePath(ROSTER_PATH);
  return { ok: true };
}
