import type { ScoreLineSet } from "@/lib/ui/score-format";

/**
 * What is left of the Statistics view's set scope: the games-and-points
 * summary `report-facts.tsx` prints for the whole match.
 *
 * ── Replaced by the match filters ───────────────────────────────────────────
 * The point-derived Statistics cards no longer narrow themselves here. They
 * read `useMatchFilters().filteredPoints`
 * (`match-filters/provider.tsx`), whose Score › Set group supersedes the
 * one-set scope — so `useSetScope`, the `?set=` parse/write rules and the
 * selectable-set rule are gone with it. A set is now just one filter among
 * many, mirrored in `?f=` rather than `?set=`.
 *
 * Sets come from the score, never from player order
 * (docs/ui-revamp-guardrails.md §4).
 */

/**
 * The retired scope's query parameter. Nothing reads or writes it any more,
 * but links shared from the old report can still carry `?set=`, which is why
 * the Visualizations filters keep their own set value namespaced to `vset`
 * (`shots/viz-url.ts`) rather than claiming the bare key.
 */
export const SET_PARAM = "set";

/** The only field scoping reads off a point row — see `MatchPoint`. */
interface ScopedPoint {
  setNumber: number;
}

export interface SetScopeMeta {
  /** "Whole match" or "Set 2". */
  label: string;
  /** Points in the scoped rows. */
  points: number;
  /** Games in the scoped sets, from the score. */
  games: number;
}

/** The rows one scope covers. `null` is every row, not zero rows. */
export function scopePoints<T extends ScopedPoint>(
  points: readonly T[],
  activeSet: number | null,
): T[] {
  return activeSet === null
    ? [...points]
    : points.filter((point) => point.setNumber === activeSet);
}

/**
 * What a scope is worth, for a "N points · M games" line.
 *
 * Games come from the score, never from the point rows. A 7-6 set is 13 games
 * (guardrails §4.3 — the game count is what is stored, not the tiebreak
 * points), and counting distinct game numbers off `points` would both
 * undercount that set and report 0 games for a match whose stats are published
 * but whose points were never imported.
 */
export function scopeMeta(
  sets: readonly ScoreLineSet[],
  points: readonly ScopedPoint[],
  activeSet: number | null,
): SetScopeMeta {
  const scoped =
    activeSet === null
      ? sets
      : sets.filter((_, index) => index + 1 === activeSet);
  const games = scoped.reduce((sum, set) => sum + set.player1 + set.player2, 0);

  return {
    label: activeSet === null ? "Whole match" : `Set ${activeSet}`,
    points: scopePoints(points, activeSet).length,
    games,
  };
}
