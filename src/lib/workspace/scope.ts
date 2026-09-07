import type { Workspace } from "./types";

/**
 * The one rule for "which matches belong to the workspace I am looking at".
 *
 * A team workspace owns every match filed under its `program_id`. A personal
 * workspace owns the matches its viewer created that belong to NO program —
 * both halves matter. `matches.program_id` is nullable precisely so "no
 * program" is a value: drop the `IS NULL` and a coach's team uploads reappear
 * in their personal list, one match in two workspaces, with nothing looking
 * broken on screen. RLS decides what a viewer MAY see; this decides which
 * workspace they are LOOKING at.
 *
 * The rule used to be spelled inline at every read that needed it — the
 * matches list, the search palette, the activity feed — each with a comment
 * pointing at one of the others as the authority. A rule kept in agreement
 * by comments is a rule that drifts. This is the authority now.
 *
 * `column` is the path to the match's `program_id` from the query's root:
 * `program_id` when the read is on `matches`, `matches.program_id` when the
 * match is embedded (the activity feed reads `processing_jobs`). `createdBy`
 * likewise names the creator column on the root table.
 *
 * `Q` is unconstrained on purpose. Constraining it to "has `.eq` and `.is`"
 * makes TypeScript unify supabase-js's deeply generic filter builder against
 * the constraint on every call, and it gives up (TS2589). The two calls are
 * made through a minimal structural view instead, and the builder comes back
 * as whatever it went in as. A leaf: no supabase import, client components
 * use it.
 */
interface Scopable {
  eq(column: string, value: string): unknown;
  is(column: string, value: null): unknown;
}

export function scopeToWorkspace<Q>(
  query: Q,
  workspace: Pick<Workspace, "id" | "kind">,
  viewerId: string,
  { column = "program_id", createdBy = "created_by" } = {}
): Q {
  const q = query as unknown as Scopable;
  const scoped =
    workspace.kind === "team"
      ? q.eq(column, workspace.id)
      : (q.eq(createdBy, viewerId) as Scopable).is(column, null);
  return scoped as Q;
}
