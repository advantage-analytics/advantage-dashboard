import { expect, test } from '@playwright/test';

import { meanOfPresent, num, pct, presentPairs } from '@/lib/data/aggregate';

/**
 * Absent statistics must not be averaged as zero.
 *
 * The bug these guard against was invisible on screen: a video-derived match
 * withholding its ace count entered every career mean as a hard 0, dragging the
 * player's baseline down on every OTHER match's page, behind the "vs your
 * average" deltas. Nothing errored and no number looked obviously wrong.
 */

test.describe('meanOfPresent', () => {
  test('excludes absent values instead of counting them as zero', () => {
    // The whole point. [10, null, 20] is a mean of 15 over two measurements,
    // not 10 over three.
    expect(meanOfPresent([10, null, 20])).toBe(15);
    expect(meanOfPresent([10, undefined, 20])).toBe(15);
  });

  test('keeps legitimate zeros', () => {
    // A match where the player genuinely converted no break points belongs in
    // their conversion average, pulling it down. An earlier helper filtered on
    // `v > 0` and silently dropped exactly these.
    expect(meanOfPresent([0, 10])).toBe(5);
    expect(meanOfPresent([0, 0])).toBe(0);
  });

  test('a mean over nothing is null, not zero', () => {
    // "No average" and "an average of zero" are different claims about a player.
    expect(meanOfPresent([])).toBeNull();
    expect(meanOfPresent([null, undefined])).toBeNull();
  });

  test('ignores non-finite values', () => {
    expect(meanOfPresent([10, NaN, 20])).toBe(15);
    expect(meanOfPresent([Infinity])).toBeNull();
  });
});

test.describe('num and pct', () => {
  test('preserve absence rather than defaulting', () => {
    expect(num(null)).toBeNull();
    expect(num(undefined)).toBeNull();
    expect(num(0)).toBe(0);
    expect(pct(null)).toBeNull();
    expect(pct('68.5')).toBe(68.5);
    expect(pct('0')).toBe(0);
    expect(pct('not a number')).toBeNull();
  });
});

test.describe('presentPairs', () => {
  test('keeps metadata aligned when values are dropped', () => {
    // The KPI sparkline pairs each value with the match it came from. Filtering
    // the values alone shifts that metadata by one for every gap, attributing a
    // number to the wrong match in the tooltip.
    const out = presentPairs([5, null, 7, null, 9], ['a', 'b', 'c', 'd', 'e']);
    expect(out).toEqual([
      { value: 5, meta: 'a' },
      { value: 7, meta: 'c' },
      { value: 9, meta: 'e' },
    ]);
  });

  test('is empty when nothing was measured', () => {
    expect(presentPairs([null, undefined], ['a', 'b'])).toEqual([]);
  });
});
