/** Selections within a facet are alternatives; separate facets intersect. */
export function matchesFilterGroups<T, K extends string>(
  item: T,
  filters: { key: K; value: string }[],
  matches: (item: T, filter: { key: K; value: string }) => boolean,
): boolean {
  return [...new Set(filters.map((filter) => filter.key))].every((key) =>
    filters.some((filter) => filter.key === key && matches(item, filter)),
  );
}
