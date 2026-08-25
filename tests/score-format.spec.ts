import { expect, test } from '@playwright/test';

import { tiebreakOf, type ScoreLineSet } from '@/lib/ui/score-format';

/**
 * Which sets are allowed to carry a superscript at all.
 *
 * Both ways of getting this wrong are silent, and both have been live. A
 * census of production found 41 of the 47 sets carrying a non-null tiebreak
 * are zero-fill — a stored `0`/`0` on shapes no tiebreak can decide — and
 * `0 ?? null` is `0`, so 40 of them printed "6-3⁰": a tiebreak nobody played,
 * on a score that otherwise looks right. Guarding on the VALUE instead fails
 * the other way round and just as quietly, erasing the digit from a genuine
 * `7-6` won 7-0 in points. The rule is the set's shape — a one-game margin —
 * and nothing else.
 *
 * Every fixture here is a shape from that census: the three real tiebreaks
 * (`1-0` 10-5, `0-1` 11-9, `8-9` 7-3) and the zero-fill shapes by frequency.
 */

/** One set, in the storage the data actually uses: each side's OWN points. */
function set(
  player1: number,
  player2: number,
  player1Tiebreak: number | null,
  player2Tiebreak: number | null,
): ScoreLineSet {
  return { player1, player2, player1Tiebreak, player2Tiebreak };
}

test.describe('tiebreakOf on a one-game margin', () => {
  test('a 7-6 set raises the loser\'s points', () => {
    expect(tiebreakOf(set(7, 6, 7, 3))).toBe(3);
    expect(tiebreakOf(set(6, 7, 3, 7))).toBe(3);
  });

  test('a super-tiebreak stored as 1-0 renders', () => {
    // Production row: player1 took it 10-5. Stored as a one-game "set", which
    // is why the guard cannot be `mine === 7 && theirs === 6`.
    expect(tiebreakOf(set(1, 0, 10, 5))).toBe(5);
  });

  test('a super-tiebreak stored as 0-1 renders', () => {
    // Production row: player2 took it 11-9.
    expect(tiebreakOf(set(0, 1, 9, 11))).toBe(9);
  });

  test('a set played out to 8-8 renders', () => {
    // Production row: 8-9, the breaker at 8-8 going 7-3 to player2. The margin
    // rule covers a pro-set without anyone revisiting it, so 9-8 too.
    expect(tiebreakOf(set(8, 9, 3, 7))).toBe(3);
    expect(tiebreakOf(set(9, 8, 7, 3))).toBe(3);
  });
});

test.describe('tiebreakOf on every other shape', () => {
  test('a 6-3 carrying a stored 0 renders nothing', () => {
    // The single commonest zero-fill row (9 of the 47) and the one that made
    // this guard necessary: before it, `0 ?? null` left a 0 for every consumer
    // to raise.
    expect(tiebreakOf(set(6, 3, 0, 0))).toBeNull();
  });

  test('no zero-fill shape in the census renders', () => {
    const zeroFill: [number, number][] = [
      [6, 3], [6, 4], [6, 2], [2, 6], [3, 6], [6, 1],
      [0, 6], [7, 5], [1, 6], [6, 0], [4, 6],
    ];
    for (const [games1, games2] of zeroFill) {
      expect(tiebreakOf(set(games1, games2, 0, 0)), `${games1}-${games2}`).toBeNull();
    }
  });

  test('a 7-5 does not render even with real points stored', () => {
    // A margin of two means the set ended on an ordinary game. A number filed
    // against it is misfiled, and printing it would be a wrong score that
    // looks like a right one.
    expect(tiebreakOf(set(7, 5, 7, 4))).toBeNull();
  });

  test('an unfinished 3-3 renders nothing', () => {
    // A regression guard, not a new refusal: equal games already returned null
    // before the shape guard existed, and a margin of 0 is not 1 either.
    expect(tiebreakOf(set(3, 3, 0, 0))).toBeNull();
  });
});

test.describe('tiebreakOf guards shape, never value', () => {
  test('a stored 0 on a one-game margin still renders', () => {
    // A tiebreak won 7-0 in points is real. The `tiebreak > 0` guard this
    // codebase once carried in `matches-list-types.ts` would hide it.
    expect(tiebreakOf(set(7, 6, 7, 0))).toBe(0);
    expect(tiebreakOf(set(6, 7, 0, 7))).toBe(0);
  });

  test('a missing tiebreak on a 7-6 is still nothing', () => {
    // Shape alone does not invent a digit: an unrecorded breaker renders
    // nothing rather than a plausible 0.
    expect(tiebreakOf(set(7, 6, null, null))).toBeNull();
    expect(tiebreakOf({ player1: 7, player2: 6 })).toBeNull();
  });

  test('a value filed against the set WINNER is not printed', () => {
    // Unchanged by the guard, and load-bearing: the notation prints the
    // loser's points, so a number sitting only on the winner renders nothing.
    expect(tiebreakOf(set(7, 6, 7, null))).toBeNull();
  });
});
