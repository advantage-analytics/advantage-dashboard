/**
 * Whether an error says an RPC is not on this database: PostgREST's `PGRST202`
 * from its schema cache, or PostgreSQL's own `42883` (`undefined_function`)
 * when the cache is ahead of the database. By code only — a message match
 * would also catch a missing column or role. The table counterpart is
 * `isMissingTable` in `lib/data/season-points-cache.ts`.
 */
export function isMissingFunction(error: { code?: string }): boolean {
  return error.code === "PGRST202" || error.code === "42883";
}

/**
 * Whether an error says a column is not on this database: PostgreSQL's
 * `42703` (`undefined_column`), which PostgREST passes through for a column
 * a select names. By code only, like the two beside it.
 */
export function isMissingColumn(error: { code?: string }): boolean {
  return error.code === "42703";
}

/**
 * Run a window-keyed RPC and, if this database does not have it yet, the
 * month-keyed one instead — a meter then shows the month's figure rather than
 * an error. Any other error is the primary's, returned as is.
 */
export async function withMonthFallback<
  T extends { error: { code?: string } | null },
>(windowed: () => PromiseLike<T>, byMonth: () => PromiseLike<T>): Promise<T> {
  const result = await windowed();
  return result.error && isMissingFunction(result.error) ? byMonth() : result;
}
