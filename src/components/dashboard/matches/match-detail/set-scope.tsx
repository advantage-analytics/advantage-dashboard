"use client";

import { useMemo } from "react";

import { useMatchData } from "@/components/dashboard/matches/match-data-provider";
import { useMatchSides } from "@/components/dashboard/matches/match-detail/use-match-sides";
import type { ScoreLineSet } from "@/lib/ui/score-format";

/**
 * The Statistics view's set scope — the rule every point-derived card narrows
 * itself by.
 *
 * ── The scope is always the whole match, for now ────────────────────────────
 * The segmented control that wrote `?set=` (artboard 47f's chips, with their
 * "Whole match" reset) is not in the settled report (design 04, F1–F8) and was
 * retired with the old tab row. `useSetScope` therefore no longer reads the
 * parameter: with no control on the page, a `?set=2` left in a link shared
 * from the old report (Share copies the full URL) would narrow every card to
 * one set with no way back short of editing the address. The cards keep their
 * `activeSet` plumbing and the pure rules below stay tested
 * (`tests/set-scope.spec.ts`), so a future control re-enables scoping by
 * reading `parseSetParam` here again and writing through `setScopeQuery`.
 *
 * ── Why a set can be unselectable ───────────────────────────────────────────
 * The published `match_stats` numbers are whole-match only, so a scoped view is
 * recomputed from `points`; a set with no point rows behind it can therefore
 * only ever produce an empty view. So a hand-edited `?set=9`, or a `?set=2`
 * for a set with no rows, reads as the whole match. "Set 9 · 0 points" is a
 * worse answer than ignoring the param, and it is exactly what a filter that
 * matches nothing looks like.
 *
 * Sets come from `useMatchSides().sets`, never from player order
 * (docs/ui-revamp-guardrails.md §4).
 */

/** The query parameter, absent for the default whole-match view. */
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

export interface SetScope {
  /** The set the view is narrowed to, or `null` for the whole match. */
  activeSet: number | null;
  /**
   * The set numbers a reader may actually scope to — the same rule the `?set=`
   * parse used, handed back so a consumer reads it instead of recomputing it
   * and risking a drift from what the URL accepts.
   */
  selectable: ReadonlySet<number>;
}

/* ── Pure rules ─────────────────────────────────────────────────────────────
   Everything below this line is testable without a router or a DOM, which is
   what `tests/set-scope.spec.ts` exercises. */

/**
 * The set numbers a reader may actually scope to: present in the score AND
 * carrying point rows. One rule for the `?set=` parse and for any control that
 * writes the parameter, so a URL can never select what a control would refuse.
 */
export function selectableSets(
  sets: readonly ScoreLineSet[],
  points: readonly ScopedPoint[],
): Set<number> {
  const withRows = new Set<number>();
  for (const point of points) withRows.add(point.setNumber);
  const selectable = new Set<number>();
  for (let setNumber = 1; setNumber <= sets.length; setNumber += 1) {
    if (withRows.has(setNumber)) selectable.add(setNumber);
  }
  return selectable;
}

/**
 * `?set=` → `activeSet`. Anything that is not a selectable set number — a
 * word, a fraction, a set the match never played, a set with no rows — reads
 * as the whole match rather than as a filter matching nothing.
 */
export function parseSetParam(
  raw: string | null | undefined,
  selectable: ReadonlySet<number>,
): number | null {
  if (raw === null || raw === undefined || raw.trim() === "") return null;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed)) return null;
  return selectable.has(parsed) ? parsed : null;
}

/**
 * `activeSet` → query string, carrying every other parameter through so that
 * scoping a set cannot drop the `?tab=` the reader is looking at.
 */
export function setScopeQuery(
  current: URLSearchParams,
  next: number | null,
): string {
  const params = new URLSearchParams(current.toString());
  if (next === null) params.delete(SET_PARAM);
  else params.set(SET_PARAM, String(next));
  return params.toString();
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
 * What a scope is worth, for the label above the cards.
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

/* ── Hook ───────────────────────────────────────────────────────────────── */

/**
 * The scope, for any client component under `MatchDataProvider`. Always the
 * whole match while the report has no control to choose or clear a set (see
 * the note at the top of this file); it still says which sets could be
 * scoped to.
 */
export function useSetScope(): SetScope {
  const { points } = useMatchData();
  const sides = useMatchSides();

  const selectable = useMemo(
    () => selectableSets(sides.sets, points),
    [sides.sets, points],
  );

  return { activeSet: null, selectable };
}
