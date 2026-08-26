/**
 * How much of a program's match data the viewer is actually being handed.
 *
 * Every program surface reads `matches` through RLS, and the policy has two
 * different answers for two different readers
 * (`20260822090400_match_access_by_player_identity.sql`):
 *
 * ```sql
 * (select auth.uid()) = created_by
 * or player1_id in (select public.my_player_ids())
 * or player2_id in (select public.my_player_ids())
 * or (program_id is not null and (
 *       public.is_program_staff(program_id)
 *       or (public.user_program_role(program_id) = 'player'
 *           and exists (select 1 from public.programs p
 *                        where p.id = program_id and p.roster_visible))))
 * ```
 *
 * Staff get the program. A player gets the program only where
 * `programs.roster_visible` is set — and it is `not null default false`
 * (`20260817073914_programs.sql:83`), so the narrow read is the ordinary case,
 * not an edge. Everything else a player gets is **their own rows**: the matches
 * they played, arriving through `my_player_ids()`.
 *
 * ── Why this has to be asked here, and not downstream ────────────────────────
 * A narrowed read does not announce itself. `program_event_entries` is visible
 * to every member of a program, so a player reads all nine lines of a dual with
 * names and opponents on them; the RESULT lives on `matches`, so exactly one of
 * those lines comes back with a match attached. Nothing about the shape of that
 * answer says "there were eight more" — `entryPlayed()` reads *"no match row I
 * can see"* and *"nobody has played this yet"* identically, because from a row's
 * point of view they are identical. A component handed the survivors cannot
 * recover the difference, and an aggregate computed over them is a confidently
 * wrong number under a program-wide label.
 *
 * So the question is answered where the two inputs are: the viewer's role and
 * the program's flag, the same two the policy itself reads. This is the same
 * rule as the database's, spelled once in TypeScript, and nothing derived from
 * a program read should be labelled as the program's until it has been asked.
 *
 * The Roster page has always gated on the same flag — *"Match results are
 * visible to coaches only"* — which is the sentence the surfaces that withhold
 * should say. It lives in `components/dashboard/team/roster-vocabulary.tsx`
 * with the rest of the roster's words, for the reason `line-status.ts` gives:
 * the rule is one file, the wording is another, and both are shared.
 */

import type { ProgramRole } from "@/lib/workspace/types";

export type ResultsScope =
  /** Every match the program recorded. Staff, or a roster-visible program. */
  | "program"
  /**
   * The viewer's own matches and nothing else.
   *
   * A figure computed over this read describes one player. It must not be
   * printed under a program-wide label, and a line that came back empty must
   * not be reported as unplayed — it may simply not be ours to read.
   */
  | "own";

/**
 * Which of the two a reader is getting.
 *
 * `rosterVisible` is `programs.roster_visible`. Both callers already hold it:
 * Team Home through `getTeamSettings()`, the Roster page through
 * `getRosterData()`. Neither has to add a read to ask this.
 *
 * Defaults are deliberately the closed ones — an unreadable `programs` row
 * should narrow the page, never widen it — so callers pass `false` when they
 * could not establish the flag.
 */
export function resultsScope(viewer: {
  role: ProgramRole;
  rosterVisible: boolean;
}): ResultsScope {
  if (viewer.role !== "player") return "program";
  return viewer.rosterVisible ? "program" : "own";
}

/**
 * Is this read a subset of the program, with no way to tell what is missing?
 *
 * The negative spelling of `resultsScope`, so call sites read as the refusal
 * they are performing rather than as a string comparison.
 */
export function isNarrowedToViewer(scope: ResultsScope): boolean {
  return scope === "own";
}
