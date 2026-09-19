/**
 * `@/lib/supabase/client` for a browser harness.
 *
 * The real factory reads two `NEXT_PUBLIC_` variables that a plain webpack
 * bundle never substitutes, so importing it would throw before anything
 * rendered. Nothing under test here writes: the only call the film tab makes
 * is the bookmark update, and a harness that silently succeeded would be
 * claiming a write landed. This answers "zero rows", which is the shape the
 * component treats as not-stored and reverts.
 */
export function createClient() {
  const result = Promise.resolve({ data: [], error: null });
  const chain = {
    update: () => chain,
    eq: () => chain,
    select: () => result,
    then: result.then.bind(result),
  };
  return { from: () => chain } as never;
}
