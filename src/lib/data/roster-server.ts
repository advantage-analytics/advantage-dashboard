import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

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

interface DbRosterFullRow {
  player_id: string;
  display_name: string | null;
  email: string | null;
  role: string;
  lineup_spot: number | null;
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

  return ((data ?? []) as DbRosterFullRow[])
    .filter((row) => row.role === "player")
    .map((row) => ({
      userId: row.player_id,
      // `program_players` requires both names, so a player row always has one.
      // The fallback covers only the safety arm — a seat-holding player with no
      // profile row yet, who may never have filled in a profile either.
      name: row.display_name?.trim() || (row.email ?? "").split("@")[0] || "Unnamed player",
      ladderPosition: row.lineup_spot,
    }))
    .sort((a, b) => {
      if (a.ladderPosition === b.ladderPosition) return a.name.localeCompare(b.name);
      if (a.ladderPosition === null) return 1;
      if (b.ladderPosition === null) return -1;
      return a.ladderPosition - b.ladderPosition;
    });
});
