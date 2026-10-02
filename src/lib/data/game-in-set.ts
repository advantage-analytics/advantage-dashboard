type GameRow = {
  set_number: number;
  game_number: number;
  game_score?: string | null;
};

/** "7-5" and "5-7" are the same game score; null when there is none. */
const scoreKey = (score: string | null | undefined) => {
  const parts = (score ?? "").split("-");
  if (parts.length !== 2 || parts.some((part) => part === "")) return null;
  return parts.sort().join("-");
};

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
 *
 * A tiebreak is ONE game. Both sources number it like any other game, so a new
 * number appears each time the server changes (every two points) while the
 * game score stays put — a tiebreak that read "Game 13" to "Game 17". The
 * score is written server-first, so it flips with the server ("7-5", "5-7",
 * "7-5"…): two adjacent games of a set whose game scores are the same pair,
 * read in either order, are one tiebreak. An ordinary game always moves the
 * score by one, so no pair of ordinary games can match — except in data whose
 * game score is not kept up to date, which repeats it across plain games. A
 * tiebreak changes server after the first point and then every two, so each of
 * its "games" is one or two points; an ordinary game is at least four. Only
 * games that short are folded. Rows are read in the order given, which must
 * be point order, and every point of the tiebreak takes the number of its
 * first.
 */
export function gameNumbersInSet(
  rows: readonly GameRow[],
): (row: GameRow) => number {
  const pointsIn = new Map<string, number>();
  for (const { set_number, game_number } of rows) {
    const id = `${set_number}:${game_number}`;
    pointsIn.set(id, (pointsIn.get(id) ?? 0) + 1);
  }
  const isChunk = (row: GameRow) =>
    (pointsIn.get(`${row.set_number}:${row.game_number}`) ?? 0) <= 2;

  const tiebreakStart = new Map<string, number>();
  let prev: GameRow | undefined;
  let prevKey: string | null = null;
  for (const row of rows) {
    const key = scoreKey(row.game_score);
    if (
      prev &&
      key !== null &&
      key === prevKey &&
      prev.set_number === row.set_number &&
      prev.game_number !== row.game_number &&
      isChunk(prev) &&
      isChunk(row)
    ) {
      const start =
        tiebreakStart.get(`${prev.set_number}:${prev.game_number}`) ??
        prev.game_number;
      tiebreakStart.set(`${row.set_number}:${row.game_number}`, start);
    }
    prev = row;
    prevKey = key;
  }

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

  return (row) =>
    (tiebreakStart.get(`${row.set_number}:${row.game_number}`) ??
      row.game_number) - (offsetOf.get(row.set_number) ?? 0);
}
