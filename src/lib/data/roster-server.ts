import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

export interface LadderPlayer {
  userId: string;
  name: string;
  /** Their rank, or null when the program has never set one. */
  ladderPosition: number | null;
}

interface DbRosterRow {
  user_id: string;
  display_name: string | null;
  email: string;
  role: string;
}

/**
 * The program's players, in ladder order.
 *
 * Names come from the `program_roster` RPC because `users` RLS is a blanket
 * `auth.uid() = id` — a coach cannot select their own squad's rows directly,
 * which is why that SECURITY DEFINER function exists.
 *
 * Ladder position is a second read against `program_members`, whose select
 * policy already lets staff see the roster. Unranked players sort last rather
 * than first: a null is "we have not decided", and floating those to S1 would
 * make the lineup form propose a ladder nobody set.
 */
export const getLadder = cache(async function getLadder(
  programId: string
): Promise<LadderPlayer[]> {
  const supabase = await createClient();

  const [{ data: roster }, { data: members }] = await Promise.all([
    supabase.rpc("program_roster", { p_program_id: programId }),
    supabase
      .from("program_members")
      .select("user_id, ladder_position")
      .eq("program_id", programId),
  ]);

  const ladder = new Map<string, number | null>();
  for (const row of (members ?? []) as {
    user_id: string;
    ladder_position: number | null;
  }[]) {
    ladder.set(row.user_id, row.ladder_position);
  }

  return ((roster ?? []) as DbRosterRow[])
    .filter((row) => row.role === "player")
    .map((row) => ({
      userId: row.user_id,
      name: row.display_name?.trim() || row.email.split("@")[0],
      ladderPosition: ladder.get(row.user_id) ?? null,
    }))
    .sort((a, b) => {
      if (a.ladderPosition === b.ladderPosition) return a.name.localeCompare(b.name);
      if (a.ladderPosition === null) return 1;
      if (b.ladderPosition === null) return -1;
      return a.ladderPosition - b.ladderPosition;
    });
});
