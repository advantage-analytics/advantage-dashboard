/** `rows` in runs of at most `size`, in order — one request's worth each. */
export function chunksOf<T>(rows: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < rows.length; i += size) out.push(rows.slice(i, i + size));
  return out;
}

/**
 * `ids` in runs short enough for one request. An `.in()` filter travels in
 * the URL, a uuid is 37 characters of it, and a long cascade flips every
 * stroke of every point it moves: a few hundred ids is past what the gateway
 * takes, and the write is refused after the points before it have landed.
 */
const ID_CHUNK = 100;
export function idChunks(ids: readonly string[]): string[][] {
  return chunksOf(ids, ID_CHUNK);
}
