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
