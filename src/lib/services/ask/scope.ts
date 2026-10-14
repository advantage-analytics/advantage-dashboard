/**
 * Whose matches an Ask question is about.
 *
 *   personal — the asker's own matches, turned to the asker. The page at
 *              `/dashboard/ask`.
 *   team     — every match of one program, each turned to the program's own
 *              player. The page at `/dashboard/team/ask`, open to any member.
 *
 * The scope is chosen by the page a question is asked from and re-checked by
 * the route (`POST /api/ask` refuses a program the caller is not a member
 * of). In the database it is the transaction-local setting `ask.program_id`
 * (`20261012170339_ask_team_scope.sql`), which selects and never grants: the
 * views test membership themselves.
 *
 * The quota is not scoped. A team question spends the asker's own monthly
 * questions, the same count a personal one does.
 *
 * A leaf: no imports, so client components can read it.
 */

export type AskScope =
  | { kind: "personal" }
  | { kind: "team"; programId: string; programName: string };

export const PERSONAL_ASK_SCOPE: AskScope = { kind: "personal" };

/** The page a scope's questions are asked from, and where `?c=` links point. */
export function askBasePath(
  scope: AskScope,
): "/dashboard/ask" | "/dashboard/team/ask" {
  return scope.kind === "team" ? "/dashboard/team/ask" : "/dashboard/ask";
}

/** The program a scope reads, or null for a personal one: the loaders' argument. */
export function askScopeProgramId(scope: AskScope): string | null {
  return scope.kind === "team" ? scope.programId : null;
}
