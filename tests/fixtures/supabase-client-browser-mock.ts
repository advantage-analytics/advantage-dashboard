/**
 * `@/lib/supabase/client` for a browser harness.
 *
 * The real factory reads two `NEXT_PUBLIC_` variables that a plain webpack
 * bundle never substitutes, so importing it would throw before anything
 * rendered. Nothing under test here writes real rows: the only calls the
 * film tab makes are the bookmark insert and delete on `point_bookmarks`.
 *
 * By default both chains resolve `{ data: [], error: null }` — zero rows
 * back. That now counts as LANDED, not as a failure to revert: the toggle
 * asks for a desired state, and a delete matching nothing (a teammate
 * already removed the last row) or an insert with no error already leaves
 * the point in the state the caller asked for.
 *
 * A `?bookmarkOutcome=` query param on the harness URL lets a test drive the
 * other two outcomes an insert can land on:
 *   - `conflict` — the insert resolves `{ error: { code: "23505" } }`, the
 *     PK conflict from a double-click or a teammate saving first. Still
 *     landed.
 *   - `refused` — the insert resolves a different error code (an RLS
 *     refusal). Not landed — the component must revert.
 *
 * There is deliberately no `rpc` — the `set_point_saved` RPC is dropped, and
 * a regression to `supabase.rpc` must throw here.
 */
export function createClient() {
  const outcome =
    typeof window !== "undefined"
      ? new URLSearchParams(window.location.search).get("bookmarkOutcome")
      : null;

  const insertResult =
    outcome === "conflict"
      ? Promise.resolve({
          data: null,
          error: { code: "23505", message: "duplicate key value" },
        })
      : outcome === "refused"
        ? Promise.resolve({
            data: null,
            error: { code: "42501", message: "permission denied" },
          })
        : Promise.resolve({ data: [], error: null });

  const deleteResult = Promise.resolve({ data: [], error: null });

  const insertChain = {
    select: () => insertResult,
    then: insertResult.then.bind(insertResult),
  };
  const deleteChain = {
    eq: () => deleteChain,
    select: () => deleteResult,
    then: deleteResult.then.bind(deleteResult),
  };
  const chain = {
    insert: () => insertChain,
    delete: () => deleteChain,
  };
  return { from: () => chain } as never;
}
