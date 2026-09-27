/**
 * Read every page of a `.range()` query: PostgREST caps each response, including
 * service-role reads. Shared by the admin upload context and history loaders,
 * which each paged through `program_players`/`program_members`/`users` and the
 * admin console's history tables the same way.
 */
export async function readAllPages<T>(
  query: {
    range: (
      from: number,
      to: number,
    ) => PromiseLike<{ data: T[] | null; error: unknown }>;
  },
  errorMessage: string,
): Promise<T[]> {
  const rows: T[] = [];
  const pageSize = 500;
  for (let offset = 0; ; offset += pageSize) {
    const result = await query.range(offset, offset + pageSize - 1);
    if (result.error || !result.data) throw new Error(errorMessage);
    rows.push(...result.data);
    if (result.data.length < pageSize) return rows;
  }
}
