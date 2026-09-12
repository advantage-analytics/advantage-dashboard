/**
 * A program's ELIGIBLE roster, read the way `uploadEligibility()` wants it.
 *
 * Lifted verbatim from the `loadRoster` dep in
 * `app/api/splitstep/upload-url/route.ts` (T15) when `/api/splitstep/jobs`
 * (T16) needed the same read. One roster read for both video seams, so the
 * two cannot disagree about who is on the roster — the failure mode the
 * upload-eligibility chain exists to prevent.
 *
 * The session client, as `getRosterPlayerOptions()` reads it: the RPC is
 * SECURITY DEFINER and answers only for a program the caller is in, which
 * `billingWorkspaceFor()` has already established by the time either route
 * calls this. The own-profile read mirrors `claimedProfilesByProgram()` in
 * `active-workspace-server.ts` — live, bound to this login, this program —
 * because the RPC's player arm drops a profile claimed by staff, and an owner
 * who genuinely plays would otherwise be refused for their own match.
 * `eligibleRosterOptions()` is the wizard's merge of the two, reused so the
 * routes and the picker cannot disagree about who is on the roster.
 *
 * Returns `null` when either read failed, which the contract refuses with a
 * retry rather than passing on a list nobody has.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { eligibleRosterOptions } from "@/components/dashboard/matches/new-match-wizard/subject-eligibility";
import type { RosterFullRow } from "@/lib/data/roster-shared";
import type { RosterIdentity } from "@/lib/workspace/upload-eligibility";

export async function loadEligibleRoster(params: {
  /** The caller's SESSION client — never the service-role one. */
  supabase: SupabaseClient;
  programId: string;
  /** The signed-in login; `null` when the caller has none. */
  userId: string | null;
  /** The calling route's log prefix, so a failed read names its seam. */
  log: string;
}): Promise<readonly RosterIdentity[] | null> {
  const { supabase, programId, userId, log } = params;
  const [rows, own] = await Promise.all([
    supabase.rpc("program_roster_full", { p_program_id: programId }),
    supabase
      .from("program_players")
      .select(
        "id, program_id, first_name, last_name, email, class_year, lineup_spot, claimed_by_user_id",
      )
      .eq("program_id", programId)
      .eq("claimed_by_user_id", userId ?? "")
      .is("archived_at", null)
      .is("merged_into_id", null)
      .limit(1),
  ]);
  if (rows.error || own.error) {
    console.error(`${log} could not load roster`, {
      programId,
      error: rows.error?.message ?? own.error?.message,
    });
    return null;
  }
  return eligibleRosterOptions(
    (rows.data ?? []) as RosterFullRow[],
    own.data?.[0] ?? null,
    programId,
    userId ?? "",
  );
}
