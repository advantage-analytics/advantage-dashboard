/**
 * Averaging that treats "not measured" and "zero" as different things.
 *
 * Every aggregate in this app used to coerce an absent statistic to 0 and then
 * average it in — `parseFloat(s.first_serve_pct ?? "0")`, `s.aces ?? 0`. That was
 * harmless while every match came from a file import that always filled every
 * column. It stopped being harmless the moment a video-derived match started
 * publishing some statistics and withholding others: a NULL ace count entered
 * the mean as a hard zero and dragged a player's career ace average down, on
 * every OTHER match's page, behind the "vs your average" deltas.
 *
 * The rule here is that an absent value is EXCLUDED from a mean rather than
 * counted as zero, and a mean over nothing is null rather than zero. A player
 * whose only measured matches lack a statistic has no average for it — which is
 * a different claim from an average of zero, and the only honest one.
 *
 * Legitimate zeros are preserved. An earlier helper filtered with `v > 0`, which
 * discarded absent values by accident and real zeros along with them, so a match
 * where a player genuinely converted no break points was dropped from their
 * conversion average instead of pulling it down.
 */

/** A numeric column that may be absent. */
export function num(value: number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  return Number.isFinite(value) ? value : null;
}

/** A percentage column, which the view returns as a numeric string. */
export function pct(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const parsed = typeof value === 'number' ? value : parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Mean of the values that are actually present, or null if none are. */
export function meanOfPresent(
  values: (number | null | undefined)[],
  decimals = 1
): number | null {
  const present = values.filter(
    (v): v is number => v !== null && v !== undefined && Number.isFinite(v)
  );
  if (present.length === 0) return null;
  const mean = present.reduce((a, b) => a + b, 0) / present.length;
  const factor = 10 ** decimals;
  return Math.round(mean * factor) / factor;
}

/**
 * Drop absent values while keeping a parallel array aligned.
 *
 * The KPI strip pairs each value with the match it came from, for the sparkline
 * tooltip. Filtering the values alone would shift that metadata by one for every
 * gap, silently attributing a number to the wrong match.
 */
export function presentPairs<T>(
  values: (number | null | undefined)[],
  meta: T[]
): { value: number; meta: T }[] {
  const out: { value: number; meta: T }[] = [];
  values.forEach((value, i) => {
    if (value === null || value === undefined || !Number.isFinite(value)) return;
    out.push({ value, meta: meta[i] });
  });
  return out;
}

/**
 * The `match_stats_with_percentages` natural key — one row per side of a match.
 *
 * Every reader of that view has to pair `match_id` with `is_player1` to pick
 * the side it means, and a reader that gets the pairing wrong reads the
 * OPPONENT's serve percentage under our player's name — a wrong number that
 * looks entirely plausible on screen. One spelling, so there is one thing to
 * check. Lives here rather than beside a loader because both the roster's
 * per-player read and Team Home's program-wide read need it, and neither
 * should import the other.
 */
export function statKey(matchId: string, isPlayer1: boolean): string {
  return `${matchId}:${isPlayer1 ? 1 : 0}`;
}
