"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceContext } from "@/lib/workspace/active-workspace-server";
import {
  inviteMember,
  type InviteResult,
} from "@/components/dashboard/settings/team-actions";
import type { ActionResult } from "@/components/dashboard/settings/actions";
import type { DbJoinRequestRow } from "@/lib/data/join-requests-server";

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

/**
 * Approve a join request — the review dialog's one-click "Approve".
 *
 * Membership here is only ever self-created: `program_members.user_id` is NOT
 * NULL and every insert path keys on `auth.uid()`, so a join request — which
 * carries an email and no account — cannot be turned straight into a member.
 * Approving therefore does what a coach would otherwise do by hand: it sends the
 * requester a player invite, which reserves a seat now and mints the membership
 * when they accept, and then clears the request from the queue.
 *
 * `inviteMember` already owns the seat reservation, the mail, and the refusals
 * that must stop an approval — no free seat (`54000`), the tripwire onto a
 * coach-managed profile (`link_player`), an address already on the roster
 * (`23505`) — so this is those two existing steps in one action, in the order
 * that keeps them honest: the invite is the durable half and goes first, and the
 * request is only resolved once the invite is actually out.
 *
 * The address is read from the request's own row rather than taken from the
 * caller: `program_join_requests` is SECURITY DEFINER, staff-gated, and returns
 * only the active program's open requests, so looking the id up there both fixes
 * the email to the one the requester actually filed and confirms the request
 * belongs to the program the coach is in — the client passes only an id.
 */
export async function approveJoinRequest(
  requestId: string
): Promise<InviteResult> {
  const workspace = await getWorkspaceContext();
  if (!workspace || workspace.active.kind !== "team") {
    return {
      ok: false,
      error: "Switch to your team workspace to manage join requests.",
    };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("program_join_requests", {
    p_program_id: workspace.active.id,
  });
  if (error) {
    return { ok: false, error: "Couldn't load that request. Try again." };
  }

  const request = ((data ?? []) as DbJoinRequestRow[]).find(
    (row) => row.id === requestId
  );
  if (!request) {
    // Handled by someone else, declined already, or never this program's to
    // approve — the same generic answer the SQL gate gives, for the same reason.
    return { ok: false, error: "That request is no longer open." };
  }

  const invite = await inviteMember({ email: request.email, role: "player" });

  // A refusal leaves the request open on purpose: the coach has something to fix
  // before this person can be let in (a full program, a duplicate, a tripwire),
  // and a request resolved without an invite behind it would vanish from the one
  // list that still says they are waiting.
  if (!invite.ok) return invite;

  const resolved = await resolveJoinRequest(requestId);
  if (!resolved.ok) {
    // The invite is out and the seat is held; only closing the request failed.
    // Not a failure of the whole action — re-approving simply refreshes the same
    // invite, because `create_program_invite` upserts on the one-open-invite
    // index. Surface it as a note rather than a red error over a sent invite.
    return {
      ok: true,
      warning: `Invite sent, but the request stayed in the queue: ${resolved.error}`,
    };
  }

  // Carry any invite-level warning through — an invite that saved but whose mail
  // bounced — so "sent" is never claimed over an email that never left.
  return invite;
}
