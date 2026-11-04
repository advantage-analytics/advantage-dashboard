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
 * `select` answers the peek drawers' snapshot read with no row.
 *
 * `rpc` answers only the notes thread's reads (`point_note_authors`,
 * `point_in_my_workspace`, `point_workspace_id`). The
 * `set_point_saved` RPC is dropped, and a regression to it must throw here.
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
  // `useMatchSnapshot`'s read — `.select().eq().eq().maybeSingle()` — finds
  // no stats row, so a drawer's snapshot settles to nothing.
  const readResult = Promise.resolve({ data: null, error: null });
  // The film tab's notes and tags reads — `.select().in(...).order(...)` and
  // `.select().eq().order()` — find no rows: every point starts with no
  // notes and the workspace with no tags.
  const listResult = Promise.resolve({ data: [], error: null });
  const listChain = {
    eq: () => listChain,
    in: () => listChain,
    order: () => listResult,
    then: listResult.then.bind(listResult),
  };
  const readChain = {
    eq: () => ({
      ...listChain,
      eq: () => readChain,
      maybeSingle: () => readResult,
    }),
    in: () => listChain,
    maybeSingle: () => readResult,
  };
  const chain = {
    insert: () => insertChain,
    delete: () => deleteChain,
    select: () => readChain,
  };
  return {
    from: () => chain,
    auth: {
      getUser: () =>
        Promise.resolve({ data: { user: { id: "viewer" } }, error: null }),
    },
    // Only the notes thread's author-names read; anything else — say a
    // regression to the dropped `set_point_saved` — still throws.
    rpc: (name: string) => {
      if (name === "point_note_authors")
        return Promise.resolve({ data: [], error: null });
      // The viewer is in the match's workspace, and it is their own.
      if (name === "point_in_my_workspace")
        return Promise.resolve({ data: true, error: null });
      if (name === "point_workspace_id")
        return Promise.resolve({ data: "viewer", error: null });
      throw new Error(`unexpected rpc ${name}`);
    },
  } as never;
}
