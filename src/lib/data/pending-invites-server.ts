import type { SupabaseClient } from "@supabase/supabase-js";
import { programDisplayName } from "@/lib/data/programs-server";
import {
  displayName,
  type InviterName,
  type JoinRole,
} from "@/lib/services/programs/invite-acceptance";
import type { ProgramOrgType } from "@/lib/workspace/types";

/**
 * The invitations waiting for the person who is signed in.
 *
 * The link flow proves who you are by what you hold: `/join/[token]` reads the
 * row through the service-role client because the invitee cannot. This is the
 * other door — the person who made an account first and opened the link
 * second, or never — and there is no token to hold up. So the proof is the
 * session's confirmed address, and the read runs AS THE CALLER through
 * `pending_program_invites()`: SECURITY DEFINER, gated on
 * `auth.users.email_confirmed_at`, projecting exactly what a "you have been
 * invited to <school>" card needs and never `token_hash`. `program_invites`
 * itself stays staff-read only. There is no policy behind this and there must
 * not be one, because RLS hides rows, never columns.
 *
 * ── Which client ────────────────────────────────────────────────────────────
 * The caller's session client, never the admin one. The function reads
 * `auth.uid()`, so the service role — which has no uid — gets an empty list,
 * not everybody's. Wrong client, wrong answer, nothing disclosed.
 *
 * Same posture as `getPendingJoinRequests`: a failure to load is an empty
 * list, and withheld, absent and unconfirmed are deliberately one and the same.
 */

/**
 * What `pending_program_invites` returns, column for column. Exported so the
 * live-DB spec asserts against this same declaration — one place to drift.
 */
export interface DbPendingInviteRow {
  invite_id: string;
  program_id: string;
  school_name: string;
  team: string | null;
  org_type: string;
  role: string;
  invited_by: string | null;
  inviter_first_name: string | null;
  inviter_last_name: string | null;
  expires_at: string;
}

export interface PendingInvite {
  /** `program_invites.id` — what `acceptPendingInvite()` takes. Not a secret. */
  id: string;
  programId: string;
  programName: string;
  programOrgType: ProgramOrgType;
  role: JoinRole;
  /** The coach who sent it, as far as a screen may say. See `InviterName`. */
  inviterName: InviterName;
  /** ISO timestamp, as stored. Rows arrive newest first. */
  expiresAt: string;
}

export async function getPendingInvites(
  supabase: SupabaseClient
): Promise<PendingInvite[]> {
  const { data, error } = await supabase.rpc("pending_program_invites");

  if (error) {
    // Never fatal: the dashboard renders without the intercept rather than
    // not at all. The message only — never an address, never an id.
    console.error("[invites] could not load pending invitations", {
      message: error.message,
    });
    return [];
  }

  return ((data ?? []) as DbPendingInviteRow[]).map((row) => ({
    id: row.invite_id,
    programId: row.program_id,
    programName: programDisplayName(row.school_name, row.team),
    programOrgType: row.org_type as ProgramOrgType,
    role: row.role as JoinRole,
    inviterName: displayName(row.inviter_first_name, row.inviter_last_name),
    expiresAt: row.expires_at,
  }));
}
