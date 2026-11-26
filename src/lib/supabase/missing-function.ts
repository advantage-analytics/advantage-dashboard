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
