/**
 * The opponent's team on a console upload — the wizard's optional "their
 * team" answer, carried by the two admin submission routes.
 *
 * `admin_submit_match_video` / `admin_submit_match_file` create the match and
 * know nothing about the team, so it is written afterwards, on that one match
 * and on `opponent_program_id` / `opponent_school` alone — the two columns the
 * wizard, the Edit Match dialog and `set_opponent_team` already write, and
 * neither is on the list the `preserve_admin_*` triggers hold while a file or
 * video is in flight. A retry of the same operation writes the same answer.
 */

import type { createAdminClient } from "@/lib/supabase/admin";
import { OPPONENT_SCHOOL_MAX } from "@/lib/matches/patch-match";
import { UUID_RE } from "@/lib/admin/validation";

type AdminClient = ReturnType<typeof createAdminClient>;

/** The two `matches` columns, one of them set. */
export interface AdminOpponentTeam {
  opponent_program_id: string | null;
  opponent_school: string | null;
}

/**
 * Reads the two request values. `team: null` is the field left empty; `ok:
 * false` is a value the wizard could not have sent — a non-uuid program, a
 * school that is blank or too long, or both at once (the columns are
 * either/or, `matches_opponent_program_or_school_check`).
 */
export function readAdminOpponentTeam(
  programId: unknown,
  school: unknown,
): { ok: true; team: AdminOpponentTeam | null } | { ok: false } {
  const hasProgram = programId != null && programId !== "";
  const hasSchool = school != null && school !== "";
  if (!hasProgram && !hasSchool) return { ok: true, team: null };
  if (hasProgram && hasSchool) return { ok: false };
  if (hasProgram) {
    if (typeof programId !== "string" || !UUID_RE.test(programId))
      return { ok: false };
    return {
      ok: true,
      team: {
        opponent_program_id: programId.toLowerCase(),
        opponent_school: null,
      },
    };
  }
  const typed = typeof school === "string" ? school.trim() : "";
  if (!typed || typed.length > OPPONENT_SCHOOL_MAX) return { ok: false };
  return {
    ok: true,
    team: { opponent_program_id: null, opponent_school: typed },
  };
}

/**
 * Writes the team onto the match the submission just created. Scoped by
 * `program_id` as well as the id, so it can only land on a match of the
 * program the operation was admitted for.
 *
 * Returns false when it did not land (a program id that is not in the
 * directory fails the foreign key). The match and its analysis are already
 * saved by then, so callers report it rather than failing the submission.
 */
export async function saveAdminOpponentTeam(
  admin: AdminClient,
  matchId: string,
  programId: string,
  team: AdminOpponentTeam,
): Promise<boolean> {
  const { error } = await admin
    .from("matches")
    .update(team)
    .eq("id", matchId)
    .eq("program_id", programId);
  if (error) {
    console.error("[admin-uploads] opponent team not saved", {
      matchId,
      message: error.message,
    });
    return false;
  }
  return true;
}
