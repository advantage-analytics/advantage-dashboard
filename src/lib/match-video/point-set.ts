/**
 * A set of points named by NUMBER — the Video tab's `?pn=` parameter.
 *
 * `?point=` (film-tab.tsx) takes one point's uuid and is consumed on arrival.
 * `?pn=` is a cut: a list of `points.point_number` values that the point list
 * narrows to and the player walks in sequence, kept in the URL while applied
 * so a reload or a forwarded link opens the same points. Numbers rather than
 * ids because the `ask` views never expose a point's uuid — the "Show me"
 * action (`/api/ask/show`) can only name points the way `ask.points` does —
 * and because the number is the match's own, the same for every viewer
 * whatever seat the page gives them.
 *
 * Client-safe and import-free, so the route that writes a link, the tab that
 * reads it and the share popover that forwards it all spell it one way.
 */

export const POINT_SET_PARAM = "pn";

/**
 * The most points one set names. `ask.exec_query` returns at most 200 rows,
 * so a set the "Show me" action builds can never hold more; a hand-written
 * link beyond it is cut to the first 200, not refused.
 */
export const MAX_POINT_SET = 200;

/** Distinct positive integers, ascending, capped. */
function normalise(numbers: Iterable<number>): number[] {
  const seen = new Set<number>();
  for (const n of numbers) {
    if (Number.isInteger(n) && n > 0) seen.add(n);
  }
  return [...seen].sort((a, b) => a - b).slice(0, MAX_POINT_SET);
}

/**
 * `"12,15,40"` → `[12, 15, 40]`. Anything that is not a positive integer is
 * skipped rather than failing the whole set; duplicates fold; the result is
 * ascending (match order). Null when nothing usable is left — a `?pn=` that
 * names no point is no cut at all.
 */
export function parsePointSet(
  value: string | null | undefined,
): number[] | null {
  if (!value) return null;
  const numbers: number[] = [];
  for (const piece of value.split(",")) {
    const text = piece.trim();
    if (/^\d{1,6}$/.test(text)) numbers.push(Number(text));
  }
  const out = normalise(numbers);
  return out.length === 0 ? null : out;
}

/** The inverse of {@link parsePointSet}: normalised, comma-joined, `""` for none. */
export function serializePointSet(numbers: readonly number[]): string {
  return normalise(numbers).join(",");
}

/**
 * A query string with `?pn=` set to `numbers`, or removed for null/empty.
 * Every other parameter is carried through; `current` is never mutated.
 */
export function pointSetQuery(
  current: URLSearchParams | string,
  numbers: readonly number[] | null,
): string {
  const next = new URLSearchParams(current.toString());
  const value = numbers ? serializePointSet(numbers) : "";
  if (value) next.set(POINT_SET_PARAM, value);
  else next.delete(POINT_SET_PARAM);
  return next.toString();
}

/**
 * The match's Video tab, on these points: `?tab=film&pn=…`, with the shared
 * filters (`?f=`, already serialized) carried beside them when given — the
 * tab ANDs the two, so a figure's own cut narrows the set exactly as the
 * figure tile's link would.
 */
export function matchFilmPointsHref(
  matchId: string,
  numbers: readonly number[],
  filters?: string | null,
): string {
  const query = new URLSearchParams({ tab: "film" });
  if (filters) query.set("f", filters);
  const value = serializePointSet(numbers);
  if (value) query.set(POINT_SET_PARAM, value);
  return `/dashboard/matches/${encodeURIComponent(matchId)}?${query.toString()}`;
}
