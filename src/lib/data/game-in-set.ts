/**
 * Game numbers as tennis counts them: from 1 again in every set.
 *
 * `points.game_number` runs on across the whole match on both sources — the
 * Advantage Intelligence derivation numbers every game in stream order
 * (`derivation/transcript.ts`) and SwingVision's `Game` column does the same —
 * so the first game of set 2 was stored as game 13 while its own game score
 * read 0-0.
 *
 * Each set is shifted by the highest game number of the sets before it, never
 * by its own lowest: a video trimmed into a set's middle still numbers that
 * set's surviving games correctly. A set whose numbers already start at or
 * below that offset is taken to be counted per set already and left alone, so
 * the result is never 0 or negative.
 */
export function gameNumbersInSet(
  rows: readonly { set_number: number; game_number: number }[],
): (row: { set_number: number; game_number: number }) => number {
  const bySet = new Map<number, { min: number; max: number }>();
  for (const { set_number, game_number } of rows) {
    const seen = bySet.get(set_number);
    if (!seen) bySet.set(set_number, { min: game_number, max: game_number });
    else {
      seen.min = Math.min(seen.min, game_number);
      seen.max = Math.max(seen.max, game_number);
    }
  }

  const offsetOf = new Map<number, number>();
  let before = 0;
  for (const set of [...bySet.keys()].sort((a, b) => a - b)) {
    const { min, max } = bySet.get(set)!;
    offsetOf.set(set, min > before ? before : 0);
    before = Math.max(before, max);
  }

  return (row) => row.game_number - (offsetOf.get(row.set_number) ?? 0);
}
