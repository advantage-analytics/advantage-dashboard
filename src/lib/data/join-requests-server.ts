import { createClient } from "@/lib/supabase/server";
import { shortDate } from "@/lib/data/match-utils";

/**
 * Pending join requests — the people who clicked "Request an invite" on
 * /claim/[programKey]/request and are waiting for someone on the program to
 * notice.
 *
 * "Join request" here is `program_requests` kind `invite_request`. The word
 * "invite" alone is already taken by the outbound direction —
 * `create_program_invite` is staff mailing a player — and one word meaning
 * both directions is how the wrong list gets wired to the wrong button.
 *
 * ── Access ──────────────────────────────────────────────────────────────────
 * Nothing here filters on who may see what, and nothing here touches the
 * admin client. `program_requests` has no policies and no anon/authenticated
 * grants — deliberately, because the same table holds `ownership_dispute`
 * rows that program staff must never read (migration 20260818041110, and the
 * comment in 20260829222046). `program_join_requests` is SECURITY DEFINER,
 * carries the owner/coach/staff check, and hard-codes the
 * `kind = 'invite_request'` / `status = 'open'` slice in its own body. So a
 * non-member, a player, and staff of some other program all get the same
 * empty array a program with no requests gets — withheld and absent are
 * deliberately indistinguishable.
 */

/** What `program_join_requests` returns, column for column. Exported so the
 *  live-DB spec asserts against this same declaration — one place to drift. */
export interface DbJoinRequestRow {
  id: string;
  email: string;
  name: string | null;
  note: string | null;
  created_at: string;
}

export interface JoinRequest {
  id: string;
  email: string;
  /** They may not have given one — the form only requires the address. */
  name: string | null;
  note: string | null;
  /**
   * When they asked, as "Aug 29". Rows arrive oldest first, queue order.
   *
   * Formatted here rather than in the card, the way `getRosterData` formats
   * `invitedOn`: `toLocaleDateString` reads the runtime's own time zone, so a
   * client component formatting an ISO string renders one date on the server
   * and can render its neighbour in the browser. The raw timestamp deliberately
   * stays out of this type — a client-crossing ISO field is an invitation to
   * re-format it in the browser.
   */
  requestedOn: string;
}

export async function getPendingJoinRequests(
  programId: string
): Promise<JoinRequest[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("program_join_requests", {
    p_program_id: programId,
  });

  if (error) {
    // Never fatal: a roster page that cannot load this list should render
    // without it rather than break — same posture as the workspace lookup.
    console.error("[join-requests] could not load pending join requests", {
      error: error.message,
    });
    return [];
  }

  return ((data ?? []) as DbJoinRequestRow[]).map((row) => ({
    id: row.id,
    email: row.email,
    name: row.name,
    note: row.note,
    requestedOn: shortDate(row.created_at),
  }));
}
