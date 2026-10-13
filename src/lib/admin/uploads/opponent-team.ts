/**
 * The opponent's team on a console upload — the wizard's optional "their
 * team" answer, carried by the two admin submission routes.
 *
 * `admin_submit_match_video` / `admin_submit_match_file` create the match and
 * know nothing about the team, so it is written afterwards, on that one match
 * and on `opponent_program_id` / `opponent_school` alone — the two columns the
 * wizard, the Edit Match dialog and `set_opponent_team` already write, and
 * neither is on the list the `preserve_admin_*` triggers hold while a file or
 * video is in flight. It lands only while the match has no team at all, so a
 * replay of the operation never rewrites one that was set or corrected since.
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
 * True when the program the request names exists. Asked before anything is
 * created, so a made-up or deleted id is a refusal the administrator reads —
 * not a foreign-key failure after the match is already saved.
 */
export async function adminOpponentProgramExists(
  admin: AdminClient,
  team: AdminOpponentTeam | null,
): Promise<boolean> {
  if (!team?.opponent_program_id) return true;
  const { data, error } = await admin
    .from("programs")
    .select("id")
    .eq("id", team.opponent_program_id)
    .maybeSingle();
  return !error && Boolean(data);
}

/**
 * Writes the team onto the match the submission just created. Scoped by
 * `program_id` as well as the id, so it can only land on a match of the
 * program the operation was admitted for, and only while both columns are
 * still null — the RPCs answer a replay with the same match, and a replay
 * must not undo a team set through Edit Match or the opponent drawer since.
 *
 * Returns false on an error. The match and its analysis are already saved by
 * then, so the submission still succeeds and the miss is logged here.
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
    .eq("program_id", programId)
    .is("opponent_program_id", null)
    .is("opponent_school", null);
  if (error) {
    console.error("[admin-uploads] opponent team not saved", {
      matchId,
      message: error.message,
    });
    return false;
  }
  return true;
}
