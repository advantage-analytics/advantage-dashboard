/**
 * "No team · Add their team" on the team opponent drawer — who may press it,
 * what the line under the search says it will touch, what a pick saves as, and
 * the two ways it is written. No JSX, so a spec can import all of it.
 *
 * ── Two write paths, because the database has two doors ─────────────────────
 * - **staff** (owner, coach, staff): `set_opponent_team`, the SECURITY DEFINER
 *   function that lets them set a team on matches they did not record. It
 *   takes every match against the opponent.
 * - **creator** (a player): a plain update. `matches` UPDATE is
 *   `auth.uid() = created_by`, so a player reaches the matches they recorded
 *   and no others — which is why the line under the search counts those.
 *
 * Neither is the authorization — the function and the policy are. The gate
 * here only decides whether to offer a control that would work.
 *
 * The browser client is imported inside `applyOpponentTeam`, never at the top
 * of this file: everything else here is pure and has to load in Node.
 *
 * Design: Team Opponents → "Giving an opponent a team" → "Fixing old matches".
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  opponentTeamColumns,
  type OpponentTeamColumns,
} from "@/components/dashboard/matches/new-match-wizard/opponent-team";
import type { OpponentTeamChange } from "@/components/dashboard/matches/opponent-team-field";
import {
  isProgramStaff,
  type ProgramRole,
  type Workspace,
} from "@/lib/workspace/types";

/** Which door a viewer writes through. */
export type TeamWriteMode = "staff" | "creator";

/** `set_opponent_team` refuses more ids than this in one call. */
export const TEAM_WRITE_CHUNK = 200;

export const TEAM_WRITE_FORBIDDEN =
  "You can't change matches for this program.";
export const TEAM_WRITE_FAILED = "Couldn't set their team. Try again.";

/**
 * How the viewer would set an opponent's team in the active workspace, or
 * null when they cannot: staff write every match, anyone else only the ones
 * they recorded, and somebody who recorded none has nothing to write.
 *
 * "Staff" is `isProgramStaff` — the one predicate — so this cannot disagree
 * with the rail, the layout guard or the Schedule about who staff are.
 */
export function teamWriteMode(
  workspace: Pick<Workspace, "kind" | "role">,
  editableCount: number,
): TeamWriteMode | null {
  if (isProgramStaff(workspace)) return "staff";
  return editableCount > 0 ? "creator" : null;
}

/**
 * What the drawer's "Plays for" offers this viewer: "add" over no team,
 * "change" over one, or nothing.
 *
 * Adding reaches whatever the viewer can write — every match for staff, the
 * ones a player recorded otherwise — since any match that gains a team is the
 * one the loader reads. A change is narrower: the loader shows the team on the
 * newest match that carries one, so a player rewriting only some matches
 * could change nothing anyone sees. So a change is staff's, or a player's who
 * recorded every match against the opponent.
 */
export function teamAction(
  mode: TeamWriteMode | null,
  hasTeam: boolean,
  editable: number,
  total: number,
): "add" | "change" | null {
  if (!mode) return null;
  if (!hasTeam) return "add";
  return mode === "staff" || (editable > 0 && editable === total)
    ? "change"
    : null;
}

/** May a member with this role, having recorded this many, set the team? */
export function canAddTeam(role: ProgramRole, editableCount: number): boolean {
  return teamWriteMode({ kind: "team", role }, editableCount) !== null;
}

/**
 * The line under the search: how many matches a pick will change.
 *
 * Staff reach all of them; so does a player who happened to record every one.
 * A player who recorded some is told the share, so the Program cell changing
 * for only part of a history is not a surprise.
 *
 * `replacing` names the team already there, for a change rather than a first
 * pick: "Replaces University of San Diego on all 2 matches against Theo." A
 * change overwrites a fact somebody set, so the line says which one.
 */
export function describeApplies(
  mode: TeamWriteMode,
  editable: number,
  total: number,
  firstName: string,
  replacing?: string | null,
): string {
  const lead = replacing ? `Replaces ${replacing} on` : "Applies to";
  if (mode === "staff" || editable === total) {
    return total === 1
      ? `${lead} the 1 match against ${firstName}.`
      : `${lead} all ${total} matches against ${firstName}.`;
  }
  return `${lead} the ${editable} of ${total} matches you recorded.`;
}

/**
 * What the drawer can write: the picker's answer, or "unattached" — no school
 * or club, said on purpose. The wizard never offers the third, so it lives
 * here rather than in `OpponentTeamChange`.
 */
export type TeamChoice =
  OpponentTeamChange | { program: null; school: null; source: "unattached" };

export const UNATTACHED_CHOICE: TeamChoice = {
  program: null,
  school: null,
  source: "unattached",
};

/** The three `matches` columns a drawer pick writes. */
export interface TeamPatch extends OpponentTeamColumns {
  opponent_unattached: boolean;
}

/**
 * A pick as the three `matches` columns: a directory program nulls the school,
 * a typed school nulls the program — the wizard's own rule
 * (`opponentTeamColumns`), so a team set here and one set at upload cannot be
 * shaped differently — and "unattached" nulls both. The flag is written
 * either way, so a pick always says exactly one thing.
 */
export function buildTeamPatch(choice: TeamChoice): TeamPatch {
  if (choice.source === "unattached") {
    return {
      opponent_program_id: null,
      opponent_school: null,
      opponent_unattached: true,
    };
  }
  return {
    ...opponentTeamColumns({
      opponentTeamProgram: choice.program ?? undefined,
      opponentTeamSchool: choice.school ?? undefined,
      opponentTeamSource: choice.source,
    }),
    opponent_unattached: false,
  };
}

/** `ids` without repeats, in runs of at most `size`. */
export function chunkMatchIds(
  ids: readonly string[],
  size: number = TEAM_WRITE_CHUNK,
): string[][] {
  const unique = [...new Set(ids)];
  const chunks: string[][] = [];
  for (let start = 0; start < unique.length; start += size) {
    chunks.push(unique.slice(start, start + size));
  }
  return chunks;
}

/** "2 of 5 matches did not save." */
export function describeUnsaved(unsaved: number, total: number): string {
  return `${unsaved} of ${total} ${total === 1 ? "match" : "matches"} did not save.`;
}

export interface ApplyOpponentTeamInput {
  mode: TeamWriteMode;
  /** The active team workspace's id — the program the matches belong to. */
  programId: string;
  /** Every match against the opponent; what staff write. */
  matchIds: readonly string[];
  /** The ones the viewer recorded; what a creator writes. */
  editableMatchIds: readonly string[];
  choice: TeamChoice;
  /** Defaults to the browser client; a spec passes its own. */
  supabase?: SupabaseClient;
}

export interface ApplyOpponentTeamResult {
  /** Matches that now carry the team. Above zero means the page is stale. */
  saved: number;
  /** How many the write was meant to reach. */
  total: number;
  /** What to tell the viewer; null when every match saved. */
  error: string | null;
}

/**
 * Set an opponent's team on the matches the viewer can reach.
 *
 * One call in the ordinary case. Past `TEAM_WRITE_CHUNK` ids the write goes
 * out in runs, in order, and stops at the first failure — so the result can
 * be "some saved": `saved` is then above zero with an `error` that says how
 * many did not, never the blanket failure sentence over rows that did change.
 */
export async function applyOpponentTeam({
  mode,
  programId,
  matchIds,
  editableMatchIds,
  choice,
  supabase,
}: ApplyOpponentTeamInput): Promise<ApplyOpponentTeamResult> {
  const patch = buildTeamPatch(choice);
  const chunks = chunkMatchIds(mode === "staff" ? matchIds : editableMatchIds);
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  // Nothing to say or nothing to say it on: no request goes out.
  if (
    total === 0 ||
    (patch.opponent_program_id === null &&
      patch.opponent_school === null &&
      !patch.opponent_unattached)
  ) {
    return { saved: 0, total, error: TEAM_WRITE_FAILED };
  }

  let saved = 0;
  let refusal: string | null = null;
  try {
    const client =
      supabase ?? (await import("@/lib/supabase/client")).createClient();

    for (const chunk of chunks) {
      const { data, error } =
        mode === "staff"
          ? await client.rpc("set_opponent_team", {
              p_program_id: programId,
              p_match_ids: chunk,
              p_opponent_program_id: patch.opponent_program_id,
              p_opponent_school: patch.opponent_school,
              p_unattached: patch.opponent_unattached,
            })
          : await client
              .from("matches")
              .update(patch)
              .in("id", chunk)
              .select("id");
      if (error) {
        refusal =
          mode === "staff" && error.code === "42501"
            ? TEAM_WRITE_FORBIDDEN
            : TEAM_WRITE_FAILED;
        break;
      }
      saved += Array.isArray(data) ? data.length : 0;
    }
  } catch {
    // The network, or the client failing to load — the same sentence.
    refusal = TEAM_WRITE_FAILED;
  }

  if (saved >= total) return { saved, total, error: null };
  // Nothing changed: the refusal as it was given. A creator's update that
  // matched no row raises nothing, so it is counted instead.
  if (saved === 0) {
    return { saved, total, error: refusal ?? describeUnsaved(total, total) };
  }
  return { saved, total, error: describeUnsaved(total - saved, total) };
}
