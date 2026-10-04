import type { ScoreLineSet } from "@/lib/ui/score-format";

/**
 * What is left of the Statistics view's set scope: the whole-match games
 * total `report-facts.tsx` prints.
 *
 * ── Retired ─────────────────────────────────────────────────────────────────
 * The point-derived Statistics cards no longer narrow themselves at all: they
 * are always the whole match (`useMatchData().points`). Narrowing to a set is
 * the Video tab's job now — its match filters (`match-filters/provider.tsx`)
 * carry a Score › Set group, mirrored in `?f=` rather than `?set=` — so
 * `useSetScope`, the `?set=` parse/write rules, the selectable-set rule and
 * the per-set `scopeMeta`/`scopePoints` reads are gone; only the whole-match
 * games total survives, since the facts line still prints one.
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

/**
 * The whole match's games, for the facts line's "N points · M games".
 *
 * Taken from the score, never from the point rows. A 7-6 set is 13 games
 * (guardrails §4.3 — the game count is what is stored, not the tiebreak
 * points), and counting distinct game numbers off point rows would both
 * undercount that set and report 0 games for a match whose stats are
 * published but whose points were never imported.
 */
export function totalGames(sets: readonly ScoreLineSet[]): number {
  return sets.reduce((sum, set) => sum + set.player1 + set.player2, 0);
}
