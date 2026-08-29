import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { rosterPlayerOptions, type RosterFullRow } from "@/lib/data/roster-shared";

export interface LadderPlayer {
  /**
   * The id this player's matches carry — a `program_players.id`. It is what
   * gets written to `matches.player1_id`, and it is stable across a claim.
   */
  userId: string;
  name: string;
  /** Their rank, or null when the program has never set one. */
  ladderPosition: number | null;
}

/**
 * The program's players, in ladder order.
 *
 * Reads `program_roster_full` rather than `program_roster`, and that is the
 * whole point: `program_roster` is the SEAT list, so a coach-managed player —
 * one with no login — is not in it. Feeding lineups from the seat list would
 * mean a coach could not put a freshman they added last week into a dual match,
 * which is most of what Add player exists for.
 *
 * The function is SECURITY DEFINER because `users` RLS is a blanket
 * `auth.uid() = id`: a coach cannot select their own squad's rows directly.
 *
 * Unranked players sort last rather than first: a null is "we have not decided",
 * and floating those to S1 would make the lineup form propose a ladder nobody
 * set.
 */
export const getLadder = cache(async function getLadder(
  programId: string
): Promise<LadderPlayer[]> {
  const supabase = await createClient();

  const { data } = await supabase.rpc("program_roster_full", {
    p_program_id: programId,
  });

  // The filter/name-fallback/sort rules live in roster-shared.ts, shared with
  // the upload wizard's who-played picker so the two RPC consumers cannot
  // drift. NOTE the field rename: this type's `userId` is the shared
  // `playerId` (a program_players.id) — historical naming, kept because the
  // lineup forms already read it.
  return rosterPlayerOptions((data ?? []) as RosterFullRow[]).map((row) => ({
    userId: row.playerId,
    name: row.name,
    ladderPosition: row.ladderPosition,
  }));
});
