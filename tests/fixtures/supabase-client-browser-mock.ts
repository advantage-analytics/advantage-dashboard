/**
 * `@/lib/supabase/client` for a browser harness.
 *
 * The real factory reads two `NEXT_PUBLIC_` variables that a plain webpack
 * bundle never substitutes, so importing it would throw before anything
 * rendered. Nothing under test here writes: the only calls the film tab makes
 * are the bookmark insert and delete on `point_bookmarks`, and a harness that
 * silently succeeded would be claiming a write landed. Both chains answer
 * "zero rows", which is the shape the component treats as not-stored and
 * reverts. There is deliberately no `rpc` — the `set_point_saved` RPC is
 * dropped, and a regression to `supabase.rpc` must throw here.
 */
export function createClient() {
  const result = Promise.resolve({ data: [], error: null });
  const chain = {
    insert: () => chain,
    delete: () => chain,
    eq: () => chain,
    select: () => result,
    then: result.then.bind(result),
  };
  return { from: () => chain } as never;
}
