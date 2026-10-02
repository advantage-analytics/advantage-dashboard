/**
 * Read every row of a query that PostgREST would otherwise truncate.
 *
 * PostgREST caps a response at 1000 rows, and a full three-set match passes
 * that for shots — a single request silently drops the tail of the match. This
 * walks `.range()` pages until one comes back short and returns every row in
 * order.
 *
 * FAIL-CLOSED: an error on ANY page returns `null`, never the rows gathered so
 * far. Half a timeline is a wrong answer that looks like a right one — a
 * reader cannot tell a truncated list from a short match — so the caller must
 * treat `null` as "no answer" and say so, not render what arrived.
 *
 * `page(from, to)` is the caller's whole query ending in `.range(from, to)`
 * (both bounds inclusive, as PostgREST takes them). That query MUST carry a
 * total order — ending on a unique column such as `id` — or rows with equal
 * sort keys can move between requests and pages overlap or skip.
 *
 * Deliberately dependency-free: the page is any thenable of the structural
 * `{ data, error }` shape, so a Supabase builder chain, a fake in a spec and a
 * server loader all fit without importing Supabase types. Log the error inside
 * the closure if the message matters — the helper stops at the first one, so
 * a closure that logs logs exactly once.
 */
export async function fetchAllPages<T>(
  page: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  pageSize = 1000,
): Promise<T[] | null> {
  if (!Number.isInteger(pageSize) || pageSize < 1) {
    throw new RangeError(`fetchAllPages: pageSize must be a positive integer`);
  }
  const rows: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await page(from, from + pageSize - 1);
    if (error) return null;
    const batch = data ?? [];
    for (const row of batch) rows.push(row);
    if (batch.length < pageSize) return rows;
  }
}
