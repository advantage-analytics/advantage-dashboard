/**
 * How much of a program's match data the viewer is being handed.
 *
 * Every program surface reads `matches` through RLS, and since
 * `20260830120000_matches_visible_to_members.sql` the policy has one answer
 * for every member of a program:
 *
 * ```sql
 * (select auth.uid()) = created_by
 * or player1_id in (select public.my_player_ids())
 * or player2_id in (select public.my_player_ids())
 * or (program_id is not null
 *     and public.user_program_role(program_id) is not null)
 * ```
 *
 * Any member — staff and player alike — reads the program's matches. A player
 * seeing their teammates' results is the point of a team workspace, so it is
 * not a setting: the `roster_visible` gate that used to narrow a player's
 * program read is gone, and with it the coaches-only option.
 * (`programs.roster_visible` still exists as a column; it no longer gates the
 * match read.)
 *
 * That leaves this module answering a question that now has one answer.
 * `resultsScope()` returns `"program"` for every member, `isNarrowedToViewer()`
 * is never true, and the `"own"` scope is no longer produced. The vocabulary
 * survives because surfaces still branch on it — Team Home, the schedule
 * pages, and the withheld wording in `roster-vocabulary.tsx`. Retiring the
 * branches and this module's narrow-read language is its own sweep.
 */

import type { ProgramRole } from "@/lib/workspace/types";

export type ResultsScope =
  /** Every match the program recorded. Every member gets this. */
  | "program"
  /**
   * The viewer's own matches and nothing else.
   *
   * No longer produced: the membership-only read policy hands every member
   * the program scope. The variant remains only because call sites still
   * branch on it.
   */
  | "own";

/**
 * Which scope a reader is getting: `"program"`, for every member.
 *
 * The parameters are the two inputs the retired gate used to read. They are
 * kept so call sites — Team Home through `getTeamSettings()`, the schedule
 * loaders through `getRosterData()` and their own fetches — compile unchanged
 * until the scope branching is removed with the rest of this vocabulary.
 */
export function resultsScope(_viewer: {
  role: ProgramRole;
  rosterVisible: boolean;
}): ResultsScope {
  return "program";
}

/**
 * Is this read a subset of the program, with no way to tell what is missing?
 *
 * The negative spelling of `resultsScope`, so call sites read as the refusal
 * they are performing rather than as a string comparison. Never true under
 * the membership-only policy.
 */
export function isNarrowedToViewer(scope: ResultsScope): boolean {
  return scope === "own";
}
