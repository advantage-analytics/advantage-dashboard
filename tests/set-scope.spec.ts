import { expect, test } from '@playwright/test';

import {
  parseSetParam,
  scopeMeta,
  scopePoints,
  selectableSets,
  setScopeQuery,
} from '@/components/dashboard/matches/match-detail/set-scope';
import type { ScoreLineSet } from '@/lib/ui/score-format';

/**
 * The Statistics pane's set scope — the rules under `?set=`.
 *
 * Pure and offline: the control itself is a handful of chips, and none of what
 * can go wrong with it is visible. A scope that reads a set the match never
 * played renders a complete, confident, empty pane. A games count taken from
 * the point rows instead of the score is off by one on every tiebreak set and
 * by everything on a match whose points were never imported — and in both cases
 * the number beside it (points) is right, which is what makes the wrong one
 * believable.
 *
 * Nothing here renders React; the hook and the chips are the thin layer over
 * these functions.
 */

/** A set as `useMatchSides().sets` hands it over — already oriented you-first. */
function set(you: number, opp: number, tiebreak?: [number, number]): ScoreLineSet {
  return {
    player1: you,
    player2: opp,
    player1Tiebreak: tiebreak ? tiebreak[0] : null,
    player2Tiebreak: tiebreak ? tiebreak[1] : null,
  };
}

/** `n` point rows in one set — the only field scoping reads. */
function rows(setNumber: number, n: number): { setNumber: number }[] {
  return Array.from({ length: n }, () => ({ setNumber }));
}

/** 6-4, 3-6, 7-6(5): the third set is where the game count and the rows differ. */
const SETS = [set(6, 4), set(3, 6), set(7, 6, [7, 5])];

/* ------------------------------------------------------------------------- *
 * Which sets can be scoped to at all
 * ------------------------------------------------------------------------- */

test.describe('selectableSets', () => {
  test('a set with no point rows behind it cannot be scoped to', () => {
    // The published match_stats numbers are whole-match only, so a scoped view
    // is recomputed from `points`. A set with none can only ever produce an
    // empty card — hence the disabled chip, and hence this rule.
    const selectable = selectableSets(SETS, [...rows(1, 40), ...rows(3, 55)]);

    expect([...selectable].sort()).toEqual([1, 3]);
    expect(selectable.has(2)).toBe(false);
  });

  test('a match with no points at all offers no scope', () => {
    expect(selectableSets(SETS, []).size).toBe(0);
  });

  test('rows for a set the score does not have are ignored', () => {
    // A fourth set cannot be reached from the control, so it must not become
    // reachable from the URL either.
    const selectable = selectableSets(SETS, [...rows(1, 10), ...rows(4, 10)]);

    expect(selectable.has(4)).toBe(false);
    expect([...selectable]).toEqual([1]);
  });
});

/* ------------------------------------------------------------------------- *
 * `?set=` in
 * ------------------------------------------------------------------------- */

test.describe('parseSetParam', () => {
  const selectable = selectableSets(SETS, [
    ...rows(1, 40),
    ...rows(2, 38),
    ...rows(3, 55),
  ]);

  test('an absent parameter is the whole match', () => {
    expect(parseSetParam(null, selectable)).toBeNull();
    expect(parseSetParam(undefined, selectable)).toBeNull();
    expect(parseSetParam('', selectable)).toBeNull();
  });

  test('a set the match played reads as that set', () => {
    expect(parseSetParam('1', selectable)).toBe(1);
    expect(parseSetParam('3', selectable)).toBe(3);
  });

  test('anything that is not a set number reads as the whole match', () => {
    // Every one of these is a hand-edited or stale URL, and every one of them
    // would otherwise filter the pane down to nothing while looking exactly
    // like a match in which the player did none of these things.
    for (const raw of ['abc', '1.5', '0', '-1', '2abc', 'NaN', 'Infinity']) {
      expect(parseSetParam(raw, selectable)).toBeNull();
    }
  });

  test('a set past the end of the score reads as the whole match', () => {
    // "Set 9 · 0 points" is a worse answer than ignoring the parameter.
    expect(parseSetParam('4', selectable)).toBeNull();
    expect(parseSetParam('9', selectable)).toBeNull();
  });

  test('a set with no point rows reads as the whole match', () => {
    // The URL may not select what the control refuses to: the disabled chip
    // and the parse share one rule.
    const partial = selectableSets(SETS, rows(1, 40));

    expect(parseSetParam('1', partial)).toBe(1);
    expect(parseSetParam('2', partial)).toBeNull();
  });
});

/* ------------------------------------------------------------------------- *
 * `?set=` out
 * ------------------------------------------------------------------------- */

test.describe('setScopeQuery', () => {
  test('a set is written, and clearing removes the parameter entirely', () => {
    expect(setScopeQuery(new URLSearchParams(), 2)).toBe('set=2');
    // Not `set=`, and not `set=null` — absent is what the parse reads as the
    // whole match, and it is what the default URL looks like.
    expect(setScopeQuery(new URLSearchParams('set=2'), null)).toBe('');
  });

  test('every other parameter survives a scope change', () => {
    // `?tab=` is the one that matters: scoping a set must not throw the reader
    // back to the Statistics tab.
    expect(setScopeQuery(new URLSearchParams('tab=shots'), 3)).toBe('tab=shots&set=3');
    expect(setScopeQuery(new URLSearchParams('tab=film&set=1'), 2)).toBe('tab=film&set=2');
    expect(setScopeQuery(new URLSearchParams('tab=film&set=1'), null)).toBe('tab=film');
  });

  test('the caller is not mutated', () => {
    // The hook hands in a copy of the live search params; a helper that edited
    // them in place would be a trap for the next caller that does not.
    const current = new URLSearchParams('tab=shots');
    setScopeQuery(current, 2);
    expect(current.toString()).toBe('tab=shots');
  });
});

/* ------------------------------------------------------------------------- *
 * The rows one scope covers
 * ------------------------------------------------------------------------- */

test.describe('scopePoints', () => {
  const points = [...rows(1, 4), ...rows(2, 3), ...rows(3, 5)];

  test('no scope is every row, not zero rows', () => {
    expect(scopePoints(points, null)).toHaveLength(12);
  });

  test('a scope is that set alone', () => {
    expect(scopePoints(points, 2)).toHaveLength(3);
    expect(scopePoints(points, 2).every((p) => p.setNumber === 2)).toBe(true);
  });

  test('rows keep their order and their identity', () => {
    // Cards downstream read far more than `setNumber` off these rows, and the
    // tracker draws them in the order they arrive.
    const numbered = points.map((p, index) => ({ ...p, pointNumber: index + 1 }));
    expect(scopePoints(numbered, 3).map((p) => p.pointNumber)).toEqual([
      8, 9, 10, 11, 12,
    ]);
  });
});

/* ------------------------------------------------------------------------- *
 * What a scope is worth
 * ------------------------------------------------------------------------- */

test.describe('scopeMeta', () => {
  /** 6-4, 3-6, 7-6: 10 + 9 + 13 = 32 games. */
  const points = [...rows(1, 62), ...rows(2, 61), ...rows(3, 65)];

  test('the whole match counts every row and every game', () => {
    expect(scopeMeta(SETS, points, null)).toEqual({
      label: 'Whole match',
      points: 188,
      games: 32,
    });
  });

  test('a set counts its own rows and its own games', () => {
    expect(scopeMeta(SETS, points, 2)).toEqual({
      label: 'Set 2',
      points: 61,
      games: 9,
    });
  });

  test('a tiebreak set is thirteen games', () => {
    // 7-6 is 7 + 6 games played, and the score row stores the GAME count for a
    // tiebreak set, never the tiebreak points (guardrails §4.3). Counting
    // distinct game numbers off the point rows is the version of this that
    // reads 12 and looks entirely plausible.
    expect(scopeMeta(SETS, points, 3).games).toBe(13);
    expect(scopeMeta([set(7, 6, [7, 5])], rows(1, 65), 1).games).toBe(13);
  });

  test('games come from the score even when there are no point rows', () => {
    // A published match whose points were never imported: the pane still says
    // how long the match was. Games derived from `points` would say zero.
    expect(scopeMeta(SETS, [], null)).toEqual({
      label: 'Whole match',
      points: 0,
      games: 32,
    });
  });

  test('a scope past the end of the score claims no games', () => {
    // Unreachable through `parseSetParam`, which is the point: if it ever
    // becomes reachable, the label must not invent a set's worth of tennis.
    expect(scopeMeta(SETS, points, 9)).toEqual({
      label: 'Set 9',
      points: 0,
      games: 0,
    });
  });
});
